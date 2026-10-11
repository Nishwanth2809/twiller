# Phase 6.5 Batch 2 — Topics

Topics are independent of hashtags and people-follow relationships. They are curated data, not created by application startup. No Circles, feed rules, recommendation ranking, or topic-post notifications are included.

## Models and compatibility

- `Topic` (`topics`): `_id`, unique normalized `slug`, `name`, `description`, `status` (`active`/`disabled`), `createdAt`, `updatedAt`.
- `TopicFollow` (`topicfollows`): authenticated `user`, `topic`, immutable-on-retry `createdAt`. A unique `(user, topic)` constraint prevents duplicate follows.
- `Tweet.topics`: zero to three distinct Topic ObjectId references. Older posts with no field remain untagged. Replies reject topic assignment and do not inherit topics.
- `POST /post` accepts optional `topicIds: string[]`. IDs are validated before database access, and existence/active status is checked inside the normal quota/media/post transaction before quota consumption.
- All post response surfaces now include `topics: TopicSummary[]`, default `[]`. Existing endpoints, media, counts, authors, deletion, and pagination fields remain unchanged. Topic summaries expose only the seven Topic fields above. Disabled/missing topics and deleted-post topic chips are omitted.
- User documents and private user response shapes are unchanged; followed topics are read through their own authenticated endpoint.

## API contracts

| Method | Path | Access | Result |
| --- | --- | --- | --- |
| GET | `/topics?limit=20&cursor=...&q=...` | Public; verified bearer session if supplied | `{ topics, hasMore, nextCursor }` |
| GET | `/topics/:slug` | Public; verified bearer session if supplied | Topic summary plus `following` |
| GET | `/topics/:slug/feed?limit=20&cursor=...` | Public | `{ tweets, hasMore, nextCursor }` |
| GET | `/me/topics?limit=20&cursor=...` | Verified Firebase + application login session | `{ topics, hasMore, nextCursor }` |
| PUT | `/topics/:id/follow` | Verified owner | `{ topicId, following: true }` |
| DELETE | `/topics/:id/follow` | Verified owner | `{ topicId, following: false }` |

Mutations accept no caller identity or other body/query fields. Repeated follow/unfollow requests are harmless. Unfollow permits cleanup of disabled/missing-topic relationships. `following` on public anonymous reads is false; an invalid supplied token is rejected rather than silently treated as anonymous.

Topic collection limits default to 20 and cap at 50. Query text caps at 80 characters and is parsed literally. Topics sort by `(createdAt DESC, _id DESC)`; followed topics sort by relationship creation date/ID; topic posts sort by the existing `(timestamp DESC, _id DESC)`. All use `pagination.js` cursors. Feeds include live top-level posts only. Deleted parents with surviving replies remain accessible under the existing status/reply contract but do not appear in the topic feed.

Malformed fields/cursors return 400; absent/invalid auth returns 401; unverified application sessions return 403; absent/disabled topics return 404. Errors use the existing `{ error, code }` contract. Topic assignment failures return 400 and consume no quota. Existing post validation and ownership checks still apply.

Topic search is a separate `/topics?q=` request displayed as a distinguishable Topics section. Existing `/search` People/Posts semantics are preserved. Discover includes All topics and My topics; the composer has optional searchable, removable selections capped at three. `/topic/[slug]` reuses `TweetCard` and shared skeletons. Errors preserve existing rows/cursors and expose retry. No private topic-follow snapshot is written to browser storage.

## Required indexes and deployment review

1. `topics`: `{ slug: 1 }` unique.
2. `topics`: `{ status: 1, createdAt: -1, _id: -1 }`.
3. `topicfollows`: `{ user: 1, topic: 1 }` unique.
4. `topicfollows`: `{ user: 1, createdAt: -1, _id: -1 }`.
5. `topicfollows`: `{ topic: 1 }`.
6. `tweets`: `{ topics: 1, parentId: 1, deletedAt: 1, timestamp: -1, _id: -1 }` (bounded multikey topic query).

Development/test readiness creates schema indexes. Production readiness only verifies them and blocks missing Topics uniqueness constraints. **No production index/migration was executed.** The existing general migration utility is not modified by this batch; use a reviewed deployment migration for these explicit indexes rather than assuming its model list includes Topics.

Before a future production rollout, back up `tweets`, `topics`, and `topicfollows` (plus existing normal deployment backup). Verify transaction support, available index/storage capacity, duplicate/malformed data and reference integrity. No bulk backfill is required for old untagged posts or User records. Resolve any existing same-slug/pair conflicts before enabling constraints. Creation order is Topic collections/indexes, follow indexes, Tweet index, then backend and frontend deployment. Keep curated production topic creation as a separately authorized operation.

Read-only review queries for an already-approved database connection (do not run automatically):

```javascript
db.topics.aggregate([{ $group: { _id: "$slug", n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }])
db.topics.countDocuments({ $or: [ { slug: { $not: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ } }, { status: { $nin: ["active", "disabled"] } } ] })
db.topicfollows.aggregate([{ $group: { _id: { user: "$user", topic: "$topic" }, n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }])
db.topicfollows.aggregate([{ $lookup: { from: "topics", localField: "topic", foreignField: "_id", as: "target" } }, { $match: { target: { $size: 0 } } }, { $count: "orphanTopics" }])
db.topicfollows.aggregate([{ $lookup: { from: "users", localField: "user", foreignField: "_id", as: "owner" } }, { $match: { owner: { $size: 0 } } }, { $count: "orphanUsers" }])
db.tweets.aggregate([{ $match: { topics: { $exists: true } } }, { $project: { valid: { $cond: [{ $isArray: "$topics" }, { $and: [{ $lte: [{ $size: "$topics" }, 3] }, { $eq: [{ $size: "$topics" }, { $size: { $setUnion: ["$topics", []] } }] }] }, false] } } }, { $match: { valid: false } }, { $count: "malformedTopics" }])
db.topics.getIndexes()
db.topicfollows.getIndexes()
db.tweets.getIndexes()
```

Rollback the Topics frontend/backend together while preserving collections and reference fields; do not delete real follows/posts to make rollback work. Restore from the verified backup only if data corruption occurred. Missing/incorrect unique indexes, invalid references, failed transaction tests, unsafe projections, or failed owner isolation should stop deployment.

## Disposable local setup

The seed utility uses exactly `mongodb://127.0.0.1:27017/twiller_phase3_acceptance?replicaSet=phase1`, checks PRIMARY/name, never loads `.env`, never accepts a URI, and tags owned records. Runtime startup does not seed topics. `scripts/topics.dev.json` contains editable example data outside application logic.

In normal PowerShell, from the repository root with Node on `PATH`:

```powershell
node backend/scripts/topics-seed.mjs seed
# Replace test_username with the existing disposable emulator user's handle.
node backend/scripts/topics-seed.mjs pagination test_username ai-ml
node backend/scripts/topics-seed.mjs pagination-cleanup test_username
# Optional: removes seeded topics/follows only after tagged live posts are gone.
node backend/scripts/topics-seed.mjs cleanup
```

Pagination creates 32 identifiable records, repeats safely, and does not change the user's quota/entitlement. Cleanup uses normal post deletion, including bookmark cleanup and reply-parent tombstones. Same-slug existing topics are reused/preserved; deterministic ID collisions stop writes. Final topic cleanup refuses to erase topics referenced by live posts. Seed topics may remain for development after temporary pagination posts are cleaned up.

## Verification commands

From the repository root with Node on `PATH`:

```powershell
node --test backend/tests/topics.test.js backend/tests/frontend.test.js backend/tests/security.test.js backend/tests/phase2.test.js backend/tests/api.test.js backend/tests/notification.test.js backend/tests/payment.test.js backend/tests/mail.test.js
$env:TWILLER_TOPICS_TEST_MONGODB_URI = 'mongodb://127.0.0.1:27017/twiller_topics_test?replicaSet=phase1'
node --test backend/tests/topics.mongo.test.js
Remove-Item Env:TWILLER_TOPICS_TEST_MONGODB_URI
```

The real MongoDB suite creates/drops **only** `twiller_topics_test`, exercises duplicate constraints/concurrent follow retries, post transaction validation/quota rollback, canonical safe projections, ordering/cursors and tombstone exclusion. It uses controlled token verification, not real Firebase provider acceptance. The existing `mongo.test.js` separately uses `PHASE1_TEST_MONGODB_URI` restricted to `twiller_phase1_test`; run it independently to avoid test-database lifecycle overlap.

## Pending local browser acceptance

Use only backend 5055, mailbox 5056, frontend 3001 and Auth Emulator 9099. Restart the harness after backend changes. Confirm requests actually reach 5055 before writes.

1. A opens Discover, searches/selects AI & ML and React, follows both; My topics shows both. Refresh retains their state.
2. B creates one ordinary top-level post with AI & ML, within the user's normal quota. Confirm canonical response/chip; leave replies untagged.
3. A opens AI & ML and sees B's post; unfollow/re-follow and refresh are correct. B's follows remain independent.
4. Use the pagination command with an existing disposable author, load 20 then remaining records, verify no duplicates and stable order. Switch topic route while a request is pending; the previous result must not overwrite the current topic. Cleanup only the pagination data afterward.
5. In composer choose/remove topics, enforce maximum three, keyboard-search/select, Escape closes selector and restores its trigger, and submit one untagged post if quota allows. A failed submit keeps draft/topics recoverable.
6. Verify loading/content, genuine empty topic, failed request/retry, mobile 390/360px and light/dark readability. A failed request must not look like an empty topic/list. Capture status/URL and UI evidence without bearer tokens or OTPs.

Phase 6 manual acceptance remains separate. Circles, Feed Rules, expanded Pulse ranking, recommendations and AI Conversation Intelligence remain deferred.
