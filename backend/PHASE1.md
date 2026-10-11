# Phase 1 security contracts and rollout

Scope: TW-001–007, TW-017, TW-018; only purchase atomicity from TW-016 and the required regression coverage from TW-053. Later-phase quotas, media storage, routing, polling, search semantics, layout and general cleanup are unchanged.

## Authentication and ownership

Protected requests require `Authorization: Bearer <Firebase ID token>`. Firebase Admin verifies tokens with revocation checking. Missing/invalid/expired credentials return 401. Unauthorized account or conversation access returns 403. Validation runs before database access and returns 400 for malformed IDs, operator-shaped values, unsupported fields, lengths, enums and query bounds.

Public reads: `GET /`, `/post`, `/post/:id`, `/post/:id/replies`, `/users/:username`, `/users/:username/posts`, `/search`, `/feed` with `type=foryou`, and unpersonalized `/suggested-users`. Following feeds and personalized suggestions require authentication. All other application operations require authentication, except recovery-link requests.

Registration, login challenge, challenge verification and logout require the Firebase credential but do not require a previously completed application OTP. Other protected operations require a verified application session. IDs/emails retained in existing payloads/paths are checked compatibility hints; they cannot choose another principal. Owners and senders come from verified identity. Message reads/writes/read receipts additionally enforce conversation membership.

`firebaseUid` is the durable identity. New registration uses the token's email/UID. Existing email-only profiles can link only when the token's email is verified and no UID is already bound. Conflicts fail closed. An unverified legacy account receives an email-verification instruction on the frontend; retry sign-in after verification. Email changes/account merging need a separate future design.

## Changed request and response contracts

| Operation | Allowed inputs / result |
|---|---|
| POST /register | Required username (3–50 letters/digits/underscore) and displayName (1–50); optional avatar HTTP(S) URL or empty string. Optional email must match the token. Idempotent for the authenticated profile. Returns public user fields. |
| GET /loggedinuser | Optional email compatibility hint; returns the caller's safe private profile only after OTP. |
| PATCH /userupdate/:email | Only displayName, avatar, bio (160), location (30), website (100, HTTP(S) or empty), notificationsEnabled (boolean). No identity, entitlement, OTP, counters or relationship fields. Returns canonical safe private profile. |
| POST /log-session | Empty body or matching email. Returns `{requiresOtp:boolean}`. Creates/reuses the caller's application challenge. |
| POST /verify-login-otp | Six-digit string `otp`; optional matching email. Consumes a matching unexpired challenge once; returns `{success:true}`. |
| POST /logout | Empty body; revokes the application session. Firebase client sign-out follows. |
| POST /forgot-password | Email address or registered phone locator. Returns a generic success message for known/unknown accounts. Sends a Firebase hosted reset link; never returns proof/password, changes a password, or creates an account. A phone number only locates the legacy profile; the proof link goes to its registered email, which is never disclosed to the caller. There is no SMS or phone-based ownership proof. Delivery/provider failures return 503. |
| POST /create-order | Paid `plan` enum; optional matching email. Server persists owner, plan, amount, currency, order ID. Existing payment time window remains. |
| POST /verify-payment | Provider order ID, payment ID and 64-character hex signature. Optional plan/email are compatibility hints and must match the stored purchase/principal. Returns success, authoritative plan/expiry, and `alreadyProcessed`. Same purchase retries do not reset quota/expiry. |
| POST /post; POST /post/:id/reply | Content string (1–200 nonblank characters). Post accepts image/audio/audioDuration/audioOtp as before, with type/format validation. Ownership derives from the principal; sensitive model fields are rejected. Author responses use the same safe public representation on creation/like/repost/reply and reads. |
| Feed / message query inputs | Positive integer page ≤100000; limit ≤100. Feed type `foryou` or `following`. Message `before` must be a valid date string. Ordering/pagination redesign stays in Phase 2. |
| Language verification | Existing enums: en, es, hi, pt, zh-CN, fr. Translation and challenge-target behavior stay in their later phase. |

Public user representation: `_id, username, displayName, avatar, bio, location, website, joinedDate, followers, following`. Safe private representation adds email, phoneNumber, plan/usage/expiry/activation, notificationsEnabled, language, loginHistory and bookmarks. Neither includes Firebase UID, OTPs/expiry fields, reset bookkeeping or model internals. All populated post authors use the public projection. Existing local snapshots are cleared to remove previously exposed fields; AuthContext does not republish users while pending and ignores stale async responses after logout.

Login OTP applies to every browser because user-agent headers cannot establish a secure Chrome-only policy. Challenges are bound to signed Firebase UID/auth_time, stored hashed, expire after ten minutes and cannot be reused. Verified/revoked application session records expire after 24 hours. Refresh reuses a pending/verified session. Existing mobile login hours remain; OTP attempt/resend throttling and broader email reliability work remain TW-039/TW-043 in Phase 2.

Errors introduced at the boundary use `{error:string, code:string}`. Legacy handler messages are sanitized but retain their existing HTTP conventions. Existing unsupported profile fields now fail explicitly. Deploy the updated Axios client and backend enforcement together; old unauthenticated clients will be rejected.

## Database changes and migration prerequisites

Mail delivery acknowledgement: the Apps Script endpoint must return HTTP 2xx with a JSON object containing boolean `success: true` only after its send operation succeeds. HTTP errors, negative/malformed bodies, network failures and a ten-second request/body deadline trigger the existing SMTP fallback. SMTP must acknowledge acceptance (nonempty accepted recipients, no rejected recipients). If both attempts fail, routes retain their existing safe failure responses; no provider URL/body/message content/raw error is logged or returned. Logs identify provider, failure category and HTTP status only. Confirm the deployed Apps Script response contract before enabling it; unknown responses fail closed to fallback. A timeout can occur after a remote send, so fallback can duplicate an email; it never constitutes an ownership or entitlement grant. Inbox delivery still requires manual verification. No recovery, OTP or invoice business flow was changed.

- User avatar becomes optional with an empty-string default; no avatar backfill is needed.
- User adds firebaseUid with a partial unique string index. Existing rows remain unbound until verified-email linking. Inspect duplicate/mismatched legacy emails, prior privileged-field tampering and Firebase-only incomplete accounts before rollout. Do not guess UID ownership or auto-merge conflicts.
- New LoginSession collection stores hashed verification evidence, status, expiration and private login metadata, with a TTL index. Old User loginOtp fields are no longer authorization evidence; no old session is grandfathered in. Existing login history remains private and successful verifications continue recording it.
- Subscription adds INR currency and fulfillmentExpiresAt; order ID is unique and payment ID has a partial unique string index. Inspect duplicate order IDs/payment IDs and ambiguous existing paid records before building indexes. Reconcile duplicates against provider records without regranting entitlements. Legacy missing currency is treated as INR; missing historical fulfillment expiry cannot be reconstructed safely without reconciliation.
- Payment fulfillment requires MongoDB transactions (replica set or sharded topology). Subscription transition and User entitlement update commit together; failures roll back. Startup awaits critical model index initialization. Duplicate data/index failures prevent readiness rather than disabling constraints.
- No production migration or cleanup was executed. Index creation and UID linking are database writes during actual rollout. Take a backup, inspect conflicts, establish required indexes, verify provider orders, and coordinate frontend/backend release before accepting protected traffic.

## Verification

`npm test` in backend runs Node's built-in tests, including compiled frontend state/component regressions. No new package dependency is needed. For real Mongo integration set `PHASE1_TEST_MONGODB_URI=mongodb://127.0.0.1:<port>/twiller_phase1_test?replicaSet=phase1`; tests refuse remote/other database names and create/drop only this disposable test database. Without it, database-specific tests explicitly skip.

Coverage includes anonymous/invalid/expired/revoked requests, cross-user/participant denial, public/private fields, avatar-free registration, failed registration retry, pending/invalid/expired/refreshed OTP, logout during deferred fetch, malformed/unknown/enum inputs, reset-link request safety, provider purchase mismatches, duplicate/concurrent payment fulfillment, unique indexes, transaction rollback, auth-modal errors, and composer non-submit semantics.

External credentials and provider operations are controlled doubles in automated tests. Real Firebase email delivery/hosted proof expiry and reuse, successful new-password login, Google-linked recovery behavior, mobile login hours and live Razorpay capture/order reconciliation must be verified with dedicated test accounts/provider test mode before deployment. Do not infer those results from mocks. Never reset a real password or charge a live account just to test this patch.

Full repository lint remains blocked by existing later-phase defects (including ProfilePage conditional hooks, broad any types, unescaped entities and legacy links). Focused auth-foundation lint, TypeScript and frontend production build are checked separately; existing build configuration still skips lint, so a successful build is not a lint result.
