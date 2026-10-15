import User from "./models/user.js";
import Tweet from "./models/tweet.js";
import LoginSession from "./models/loginSession.js";
import Media from "./models/media.js";
import AdminAuditLog from "./models/adminAuditLog.js";
import { adminUserView, fail } from "./security.js";
import { cursorFilter, literalSearch, pageResult } from "./pagination.js";
import { transaction } from "./quota.js";

export async function listAdminUsers({ limit = 20, cursor, q }) {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const filter = { accountStatus: { $ne: "deleted" } };

  if (q && typeof q === "string" && q.trim()) {
    const rx = literalSearch(q.trim());
    filter.$or = [{ username: rx }, { displayName: rx }];
  }

  const pagination = cursorFilter(cursor, "joinedDate", true);
  const query = pagination.$or ? { $and: [filter, pagination] } : filter;

  const rows = await User.find(query)
    .sort({ joinedDate: -1, _id: -1 })
    .limit(safeLimit + 1);

  const { items, hasMore, nextCursor } = pageResult(rows, safeLimit, "joinedDate");
  return {
    users: items.map(adminUserView),
    hasMore,
    nextCursor,
  };
}

export async function getAdminUserDetail(targetId) {
  if (!targetId || typeof targetId !== "string" || !/^[a-f\d]{24}$/i.test(targetId)) {
    fail(400, "INVALID_USER_ID", "Invalid user ID format");
  }

  const user = await User.findById(targetId);
  if (!user || user.accountStatus === "deleted") {
    fail(404, "USER_NOT_FOUND", "User not found");
  }

  const [postCount, replyCount] = await Promise.all([
    Tweet.countDocuments({ author: user._id, parentId: null, deletedAt: null }),
    Tweet.countDocuments({ author: user._id, parentId: { $ne: null }, deletedAt: null }),
  ]);

  return {
    user: adminUserView(user),
    stats: {
      posts: postCount,
      replies: replyCount,
    },
  };
}

export async function setAdminUserStatus(adminId, targetId, status, reason = "") {
  if (String(adminId) === String(targetId)) {
    fail(400, "CANNOT_MODIFY_SELF", "Administrators cannot freeze or modify their own account status");
  }

  if (!["active", "frozen", "suspended"].includes(status)) {
    fail(400, "INVALID_STATUS", "Status must be 'active', 'frozen', or 'suspended'");
  }

  const targetUser = await User.findById(targetId);
  if (!targetUser || targetUser.accountStatus === "deleted") {
    fail(404, "USER_NOT_FOUND", "User not found");
  }

  if (targetUser.role === "admin") {
    fail(403, "CANNOT_MODIFY_ADMIN", "Cannot modify account status of another administrator");
  }

  const action = status === "active" ? "USER_RESUMED" : "USER_FROZEN";

  await User.updateOne({ _id: targetUser._id }, { $set: { accountStatus: status } });

  // If frozen or suspended, revoke active sessions immediately
  if (["frozen", "suspended"].includes(status)) {
    if (targetUser.firebaseUid) {
      await LoginSession.deleteMany({ uid: targetUser.firebaseUid });
    }
  }

  await AdminAuditLog.create({
    admin: adminId,
    action,
    targetType: "user",
    targetId: targetUser._id,
    reason: String(reason || "").trim(),
  });

  return {
    success: true,
    user: adminUserView({ ...(targetUser.toObject ? targetUser.toObject() : targetUser), accountStatus: status }),
    accountStatus: status,
    action,
  };
}

export async function deleteAdminUser(adminId, targetId, reason = "") {
  if (String(adminId) === String(targetId)) {
    fail(400, "CANNOT_DELETE_SELF", "Administrators cannot delete their own account");
  }

  const targetUser = await User.findById(targetId);
  if (!targetUser || targetUser.accountStatus === "deleted") {
    fail(404, "USER_NOT_FOUND", "User not found");
  }

  if (targetUser.role === "admin") {
    fail(403, "CANNOT_DELETE_ADMIN", "Cannot delete another administrator account");
  }

  // 1. Revoke all active login sessions
  if (targetUser.firebaseUid) {
    await LoginSession.deleteMany({ uid: targetUser.firebaseUid });
  }

  // 2. Clean up social graph (pull from following/followers of other users)
  await Promise.all([
    User.updateMany({ following: targetUser._id }, { $pull: { following: targetUser._id } }),
    User.updateMany({ followers: targetUser._id }, { $pull: { followers: targetUser._id } }),
  ]);

  // 3. Handle posts: tombstone posts with replies, delete leaf posts
  const userPosts = await Tweet.find({ author: targetUser._id });
  for (const post of userPosts) {
    const hasReplies = await Tweet.exists({ parentId: post._id });
    if (hasReplies) {
      await Tweet.updateOne(
        { _id: post._id },
        {
          $set: {
            deletedAt: new Date(),
            content: "",
            image: null,
            audio: null,
            likes: 0,
            retweets: 0,
            likedBy: [],
            retweetedBy: [],
          },
        }
      );
    } else {
      await Tweet.deleteOne({ _id: post._id });
      if (post.parentId) {
        await Tweet.updateOne({ _id: post.parentId, comments: { $gt: 0 } }, { $inc: { comments: -1 } });
      }
    }
  }

  // 4. Dereference user uploads
  await Media.updateMany({ owner: targetUser._id }, { $set: { published: false } });

  // 5. Mark user as deleted and release unique constraints safely
  const tombstoneUsername = `deleted_${Date.now()}_${targetUser.username.slice(0, 15)}`;
  const tombstoneEmail = `deleted_${Date.now()}_${targetUser.email}`;

  await User.updateOne(
    { _id: targetUser._id },
    {
      $set: {
        accountStatus: "deleted",
        username: tombstoneUsername,
        email: tombstoneEmail,
        bio: "",
        avatar: "",
        website: "",
        location: "",
        phoneNumber: "",
        followers: [],
        following: [],
        bookmarks: [],
      },
      $unset: { firebaseUid: 1 },
    }
  );

  // 6. Record audit log
  await AdminAuditLog.create({
    admin: adminId,
    action: "USER_DELETED",
    targetType: "user",
    targetId: targetUser._id,
    reason: String(reason || "").trim(),
  });

  return {
    success: true,
    message: "User account deleted successfully",
    targetId: String(targetUser._id),
  };
}

export async function deleteAdminPost(adminId, postId, reason) {
  if (!postId || typeof postId !== "string" || !/^[a-f\d]{24}$/i.test(postId)) {
    fail(400, "INVALID_POST_ID", "Invalid post ID format");
  }

  await transaction(async session => {
    const post = await Tweet.findById(postId).session(session);
    if (!post || post.deletedAt) {
      fail(404, "POST_NOT_FOUND", "Post not found or already deleted");
    }

    const children = await Tweet.exists({ parentId: postId }).session(session);
    if (children) {
      await Tweet.updateOne(
        { _id: postId },
        {
          $set: {
            deletedAt: new Date(),
            content: "",
            image: null,
            audio: null,
            likes: 0,
            retweets: 0,
            likedBy: [],
            retweetedBy: [],
          },
        },
        { session }
      );
    } else {
      await Tweet.deleteOne({ _id: postId }, { session });
    }

    if (post.parentId) {
      await Tweet.updateOne(
        { _id: post.parentId, comments: { $gt: 0 } },
        { $inc: { comments: -1 } },
        { session }
      );
    }

    await User.updateMany({ bookmarks: postId }, { $pull: { bookmarks: postId } }, { session });

    for (const url of [post.image, post.audio].filter(Boolean)) {
      const base = process.env.MEDIA_PUBLIC_BASE_URL || "http://localhost:5000";
      const mediaId = typeof url === "string" && url.startsWith(base + "/media/") ? url.slice((base + "/media/").length) : "";
      if (!/^[a-f\d]{24}$/i.test(mediaId)) continue;
      const stillReferenced = await Tweet.exists({ _id: { $ne: postId }, $or: [{ image: url }, { audio: url }] }).session(session);
      if (!stillReferenced) {
        await Media.updateOne({ _id: mediaId }, { $set: { published: false } }, { session });
      }
    }

    await AdminAuditLog.create(
      [
        {
          admin: adminId,
          action: "POST_REMOVED",
          targetType: "post",
          targetId: post._id,
          reason: String(reason || "").trim(),
        },
      ],
      { session }
    );
  });

  return {
    success: true,
    message: "Post removed by admin",
    targetId: postId,
  };
}

