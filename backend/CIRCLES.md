# Interest Circles (Phase 6.5 Batch 3)

Circles are public interest communities. A creator is the owner and first member. Any verified Twiller account can join or leave; an owner cannot leave because ownership transfer and Circle deletion are outside this batch. A member may assign **one** Circle to a top-level post. The post remains a canonical Tweet visible through normal public reads and its Circle feed. It may also have up to three active Topics. Replies are not assigned to Circles. Leaving prevents future Circle posting and does not remove existing posts. Existing quota, media, post deletion, reply, reaction, block/privacy, and authentication rules still apply. No Circle-wide notifications are generated.

## Contracts

| Endpoint | Auth | Result |
| --- | --- | --- |
| `GET /circles?q=&limit=20&cursor=` | Public, optional verified identity | `{ circles, hasMore, nextCursor }`; newest creation first. When signed in, each Circle has `membershipRole`. |
| `POST /circles` | Verified principal and OTP session | `{ name, description, relatedTopicIds?: string[] }` → `201` canonical Circle. Slug is derived from name. Duplicate slug → `409`. At most five create attempts per account per day. |
| `GET /me/circles?limit=20&cursor=` | Verified principal and OTP session | Joined Circles, newest membership first. |
| `GET /circles/:slug` | Public, optional verified identity | Canonical Circle with safe owner and active Topic projections, real `memberCount`, and principal-derived membership role. |
| `GET /circles/:slug/feed?limit=20&cursor=` | Public | Canonical top-level, nondeleted Tweets, newest first. |
| `GET /circles/:slug/members?limit=20&cursor=` | Public | `{ members: [{ user, role, joinedAt }], hasMore, nextCursor }`; public user fields only. |
| `PUT /circles/:id/membership` | Verified principal and OTP session | Idempotent join; `{ circleId, membershipRole, memberCount }`. |
| `DELETE /circles/:id/membership` | Verified principal and OTP session | Idempotent leave; owner receives `403`. |
| `POST /post` | Existing verified post contract | Optional `circleId`; active public Circle and authenticated membership checked inside the quota transaction. |

All unknown fields, malformed IDs, invalid slugs, oversized queries, and invalid cursors fail at the existing request boundary before database access. Callers cannot supply owner/user IDs to create or change memberships. Invalid or disabled Circles reject new posts. Public and private API responses use safe projections, never raw user documents. Circle search is a bounded literal name search on `/circles`, separate from the existing global people/post search contract.

## Local-only seed and cleanup

The utility never reads `.env`, accepts no URI argument, and connects only to `mongodb://127.0.0.1:27017/twiller_phase3_acceptance?replicaSet=phase1`. It verifies PRIMARY and an existing disposable owner account. From the repository root with Node on `PATH`, replace `test_owner` with that account's handle:

```powershell
node backend/scripts/circles-seed.mjs seed test_owner
node backend/scripts/circles-seed.mjs pagination test_owner ai-builders
node backend/scripts/circles-seed.mjs pagination-cleanup test_owner
node backend/scripts/circles-seed.mjs cleanup
```

Seeding is repeatable. Fixtures are marked and are **not** loaded at application startup. Cleanup refuses to remove a seeded Circle that still contains posts or unmarked memberships. Remove disposable Circle posts through the product and have test members leave before Circle cleanup. The seed owner membership is removed together with the marked Circle; normal users cannot leave an owned Circle.

If both disposable users have exhausted their free posting allowance, `quota-open <username>` temporarily assigns a one-hour **test-only** Gold allowance to that local account, preserving its previous quota fields in a private marker. `quota-close <username>` restores the previous free plan and retains the new post count. Run close immediately after the browser posting check; this fixture is unrelated to Razorpay and must never be run against anything but the fixed loopback database. It changes no application quota behavior or payment records.

## Indexes and production readiness

Required new indexes: unique `Circle.slug`; `Circle(status,createdAt desc,_id desc)`; `Circle.owner`; unique `CircleMembership(circle,user)`; `CircleMembership(user,joinedAt desc,_id desc)`; `CircleMembership(circle,joinedAt desc,_id desc)`; `Tweet(circle,parentId,deletedAt,timestamp desc,_id desc)`. These are additive; existing Tweets need no Circle backfill. Production startup checks for the indexes and rejects missing Circle uniqueness constraints. **Do not run production migrations from the local acceptance task.**

Before any production rollout: back up `circles`, `circlememberships`, and `tweets` alongside the existing Phase 1–4 backup set. Audit duplicate Circle slugs and duplicate `(circle,user)` pairs, orphan owner memberships, and existing index option compatibility. Create indexes in a reviewed migration against a transaction-capable replica set, verify `getIndexes()` and new read/write smoke tests, then deploy the backend and frontend together. Older generic index utilities do not include Circle or Topic models and are **not** a Batch 3 migration plan. Stop deployment if audit conflicts, missing replica-set transactions, index failures, or mismatched frontend/backend contracts are found.

The following inspection queries are read-only; review their output before creating production indexes. They should all return no conflicts:

```javascript
db.circles.aggregate([{ $group: { _id: "$slug", n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }]);
db.circlememberships.aggregate([{ $group: { _id: { circle: "$circle", user: "$user" }, n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }]);
db.circles.aggregate([{ $lookup: { from: "circlememberships", let: { cid: "$_id", oid: "$owner" }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ["$circle", "$$cid"] }, { $eq: ["$user", "$$oid"] }, { $eq: ["$role", "owner"] }] } } }], as: "ownerRows" } }, { $match: { "ownerRows.0": { $exists: false } } }, { $project: { slug: 1, owner: 1 } }]);
db.circlememberships.aggregate([{ $lookup: { from: "circles", localField: "circle", foreignField: "_id", as: "circleRows" } }, { $match: { "circleRows.0": { $exists: false } } }, { $project: { circle: 1, user: 1 } }]);
db.tweets.aggregate([{ $match: { circle: { $type: "objectId" } } }, { $lookup: { from: "circles", localField: "circle", foreignField: "_id", as: "circleRows" } }, { $match: { "circleRows.0": { $exists: false } } }, { $project: { circle: 1 } }]);
db.circles.getIndexes(); db.circlememberships.getIndexes(); db.tweets.getIndexes();
```

Deletion, ownership transfer, private/invite Circles, moderation, Circle notifications, Feed Modes/Rules, and recommendation intelligence are deferred. This avoids orphaning posts or memberships through a partial lifecycle implementation.
