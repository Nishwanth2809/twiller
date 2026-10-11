# Twiller brand assets — Batch 1

The app showcase supplies the light/dark layout direction. The separately supplied folded-T brand reference is now approved for the shared logo; generated names, counts and future-feature controls are not used.

`src/components/BrandLogo.tsx` owns the shared brand mark and wordmark. `public/brand/twiller-mark.svg` is a scalable vector adaptation of the supplied folded-T artwork with indigo/violet folds and cyan tips. It replaces the temporary plain T. Preserve the outer accessible Twiller name and decorative option when updating artwork. Existing `Twitterlogo.tsx` is a compatibility adapter for older callers.

`src/app/icon.svg` and `src/app/favicon.ico` use the same folded-T mark. Root metadata uses the SVG integration point; the ICO preserves the legacy favicon URL. Auth, landing, and initialization/loading use the shared BrandLogo component.

Palette: primary #4F46E5, accent #8B5CF6, cyan #22D3EE reserved for small highlights. Global CSS owns light/dark semantic tokens and compatibility mappings for existing utilities. Theme preference/bootstrap logic is unchanged.

Only labels changed: Discover (`/explore`), Activity (`notifications`), Saved (`bookmarks`), Echo (`repost`/`retweets`), and Pulse (`/trending`). No backend route/field, entitlement, cursor, or session contract is renamed. Echo remains a count-only action; it does not distribute posts to followers.

Discover/Pulse use existing hashtag activity and suggested-user data. Topics, Circles, feed rules, AI, and recommendation reasons are deferred. No placeholder counts or memberships are displayed.
