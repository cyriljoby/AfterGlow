# FrameJam — Product Requirements Document

> A human-verified shared photo album with AI-ranked photos and themed montages.

**Version:** 0.1 · Hackathon Draft
**Date:** April 25, 2026

---

## 1. Overview

**Product name:** FrameJam (working title).

**One-liner:** Group photo albums where Cloudinary auto-ranks photos by quality and stitches the best ones into themed montages, with World ID ensuring every account is a real human.

**Problem:** Group photo sharing today is a mess. Albums fill up with blurry duplicates, no one curates, and "best of" recaps require manual work. Public photo communities are also overrun with bot accounts and spam.

**Solution:** A mobile-first app where any group can spin up a shared album, drop in photos, and instantly get a quality-ranked gallery plus auto-generated themed montages. Public albums are protected from bots via World ID proof of personhood.

---

## 2. Goals & Non-Goals

### 2.1 Goals

- Frictionless group photo collection — anyone with a link can join and contribute in under 30 seconds.
- Automated curation — quality-ranked feed without manual effort from the album owner.
- Themed montages — face, location, and tag-based reels generated on demand.
- Bot-resistant explore page — every account on public surfaces is a verified unique human.
- Demo-ready by end of hackathon — full end-to-end flow on a phone browser.

### 2.2 Non-Goals

- Native iOS or Android apps. We ship a mobile-first PWA only.
- Long-term storage guarantees, paid tiers, or enterprise features.
- Comments, likes, follows, or other social-graph features.
- Photo editing tools beyond what Cloudinary auto-applies.
- Face recognition for arbitrary identification of strangers — only opt-in self-tagging within an album.

---

## 3. Target Users & Use Cases

Three primary personas, all on mobile during or right after a shared experience.

- **Album creator:** organizes a group event (trip, wedding, party, meetup) and wants a clean recap without doing curation work.
- **Contributor:** attended the event, has 30–200 photos on their phone, joins via link and bulk-uploads.
- **Explorer:** browses public albums on the explore page for inspiration or entertainment, like a low-stakes Instagram discover feed.

---

## 4. Tech Stack

| Layer | Choice |
|---|---|
| **Frontend** | Next.js 14 (App Router) + React + TypeScript, deployed as a mobile-first PWA. Tailwind for styling. |
| **Backend** | Next.js API routes (Node) on Vercel. Postgres via Supabase for albums/users/photo metadata. |
| **Auth** | World ID 4.0 via `@worldcoin/idkit` (web widget). Server-side proof verification with RP signatures. Session cookies after first verification. |
| **Media storage & AI** | Cloudinary — direct unsigned uploads from the client, with Quality Analysis, Google Auto-Tagging, and Face Detection add-ons enabled. Cloudinary URLs for delivery and transformations. |
| **Montages** | Cloudinary multi-image transformations for collages; Cloudinary video API for slideshow reels with transitions. |
| **Hosting** | Vercel for app, Supabase managed Postgres, Cloudinary for media. All free-tier compatible for the demo. |

### 4.1 Why World ID

Public albums and an explore page are catnip for spam — fake accounts uploading low-quality or off-brand photos to game discovery, or worse, posting harmful content. World ID's proof of personhood gives us Sybil resistance without collecting names, emails, or government IDs. Users prove they are a unique human via the IDKit widget; we store only the nullifier hash. One human = one account on the explore surface, with zero PII on our side.

### 4.2 Why Cloudinary

Cloudinary collapses three services we'd otherwise build separately: media storage and CDN, on-the-fly image transformations, and AI image analysis. The Quality Analysis add-on returns numeric scores for focus, exposure, lighting, contrast, and color out of the box. Auto-tagging gives us content labels for theme grouping. Face detection supplies the metadata for face-themed montages. And the transformation engine generates collages and slideshow videos from URL parameters alone, no extra infra needed.

---

## 5. Features

### 5.1 Account Creation

**Description:** Users sign up by completing World ID verification once. No email, password, or username required.

**User flow:**

1. User opens the app and taps "Get started".
2. IDKit widget launches; user verifies via World App on their phone (orb-verified or device-level).
3. Frontend posts the proof to `/api/auth/verify` with the RP signature.
4. Backend verifies via `developer.world.org/api/v4/verify/{rp_id}` and creates a user row keyed on the nullifier hash.
5. Session cookie set; user lands on the home screen.
6. User picks a display handle (3–20 chars, unique). This is shown publicly on explore.

**Acceptance criteria:**

- Verification flow completes in under 60 seconds on a typical mobile connection.
- Same World ID can never create two accounts (nullifier collision returns existing account).
- No PII (name, email, phone) is collected or stored anywhere.
- Handle is editable from settings, but uniqueness is enforced.

### 5.2 Shared Photo Album (Private / Public)

**Description:** Logged-in users can create albums, set them private or public, and invite contributors. Albums are the unit of organization for everything else in the product.

**User flow:**

1. User taps `+` → "New album", enters a name (required) and optional description.
2. User picks visibility: Private (link-only) or Public (appears on explore).
3. Album created with a 6-character join code and a shareable URL like `/a/ABC123`.
4. Owner shares the link in iMessage / WhatsApp / Slack. Anyone with the link can join and upload.
5. Owner can promote private → public or demote public → private at any time.

**Acceptance criteria:**

- Album creator is the owner; owners can rename, change visibility, remove contributors, or delete the album.
- Contributors can upload to and view the album, but cannot rename or delete it.
- Private albums are accessible only via the join link; not enumerable in any API.
- Public albums require contributors to be World-ID-verified before uploading.
- Each album shows a count of photos and contributors on the home screen.

### 5.3 Photo Upload

**Description:** Mobile-first uploader supporting bulk selection, camera capture, drag-and-drop on desktop, and direct-to-Cloudinary uploads with progress.

**User flow:**

1. Inside an album, user taps the camera FAB.
2. Sheet opens with two options: "Take photo" (opens device camera) or "From library" (multi-select).
3. Selected photos are uploaded directly to Cloudinary using a signed upload preset, bypassing our server.
4. On upload, Cloudinary runs Quality Analysis, Google Auto-Tagging, and Face Detection in a single request.
5. Cloudinary's webhook hits our `/api/cloudinary/webhook` with the metadata.
6. Backend writes a photo row with `public_id`, scores, tags, face count, EXIF GPS, and uploader.
7. Album view updates in near-real-time via polling or Supabase Realtime.

**Acceptance criteria:**

- Supports JPEG, PNG, and HEIC (auto-converted by Cloudinary). 20 MB max per file.
- Bulk upload of 20 photos completes within 90 seconds on a 4G connection.
- Per-photo progress bar visible to the uploader; failed uploads can be retried.
- Photo metadata (quality scores, tags, faces) is queryable within 5 seconds of upload completing.
- Uploads from non-verified contributors to public albums are rejected with a clear prompt to verify.

### 5.4 Quality Ranking

**Description:** Every photo in an album gets a composite quality score, and the album view defaults to a quality-ranked sort.

**Scoring formula:** Composite score = weighted blend of three signals from Cloudinary metadata. Initial weights are tunable via env vars for fast iteration during the demo.

- **Technical quality (60%):** Cloudinary's `quality_analysis.aggregate` score, which combines focus, exposure, lighting, contrast, and color.
- **Content signal (30%):** Bonus for detected faces (capped at 3), bonus for "good" tags (people, food, landscape, animal), penalty for "bad" tags (screenshot, document, receipt, blur).
- **Duplicate penalty (10%):** Photos with a near-identical perceptual hash (Cloudinary phash, Hamming distance < 5) get the lower-quality one penalized.

**User flow:**

1. User opens an album.
2. Default view is grid sorted by composite score, descending.
3. Sort toggle in the header: "Best", "Newest", "Oldest".
4. Tapping a photo opens fullscreen view with score breakdown visible behind a tap (debug-y, but a fun demo touch).

**Acceptance criteria:**

- Composite score is computed on photo metadata write and stored on the row (not recomputed at read time).
- Score is a float between 0 and 100, deterministic for the same inputs.
- Album view loads first 20 ranked photos in under 1.5 seconds on 4G.
- Reranking on weight change is a single SQL update, not a re-fetch from Cloudinary.

### 5.5 Themed Montages

**Description:** Users tap a chip representing a theme, and the app generates a montage from the matching subset of high-quality photos in the album.

**Theme types:**

- **By tag:** Auto-generated chips from the most common tags in the album (e.g., "Food", "Outdoors", "Beach", "City"). Filter where `photo.tags` includes the theme tag.
- **By location:** Reverse-geocoded place names from EXIF GPS. Chips like "Santa Monica", "Downtown", "Yosemite". Filter where photo geocluster matches.
- **By face:** "Group shots" chip = photos with 3+ detected faces. "Selfies" chip = photos with 1 face that fills > 25% of the frame. Per-person face recognition is out of scope for v1.

**Generation:** For each theme query, take the top 12 photos by composite score from the matching subset. Generate two outputs in parallel:

1. **Static collage:** 3x4 grid via Cloudinary multi-image transformation, returned as a single JPEG URL.
2. **Slideshow video:** 12 photos at 1.5s each with cross-fade transitions, generated via Cloudinary video API, returned as an MP4 URL.

**User flow:**

1. User taps "Make montage" button on album page.
2. Sheet slides up showing chips: tag chips, location chips, face chips.
3. User taps a chip; spinner appears with playful loading copy.
4. Result screen shows the slideshow video with a "Save grid" option for the static collage.
5. Share button generates a public link to the montage (does not expose the album).

**Acceptance criteria:**

- Montage generation completes in under 15 seconds for an album of 100 photos.
- Themes with fewer than 4 matching photos are hidden from the chip list.
- Generated montages are cached by `(album_id, theme)` so repeat taps are instant.
- Montage links are shareable without requiring login on the recipient side.

### 5.6 Explore Page

**Description:** A discovery feed of public albums from the broader community. Every album shown was created by a World-ID-verified human.

**User flow:**

1. User taps "Explore" tab in bottom nav.
2. Feed shows a vertical scroll of album cards, each with cover image (highest-scored photo), title, contributor count, photo count, and creator handle.
3. Tapping a card opens the album in read-only mode (can view photos and montages, can't upload unless they join).
4. "Join album" button on read-only view promotes the user to contributor.

**Ranking on explore:** Albums are ordered by a freshness-and-quality score: recent activity (last upload time) blended with average composite quality of the album's top 10 photos. Albums with fewer than 10 photos are deprioritized to avoid empty cards.

**Acceptance criteria:**

- Only public albums appear; private albums are never indexed.
- Only albums whose creator is World-ID-verified appear. (Automatic since verification is required to create an account, but stated explicitly for moderation.)
- Initial load shows 20 albums; infinite scroll loads more in batches of 20.
- Owner of any album can hide it from explore via a "don't surface" toggle without making it private.
- Basic content moderation: any album with a photo flagged by Cloudinary's moderation add-on is auto-hidden from explore until reviewed.

---

## 6. Data Model

Postgres schema. World ID nullifier is the primary user key — no email or phone column anywhere.

| Table | Fields | Notes |
|---|---|---|
| `users` | `id`, `nullifier_hash`, `handle`, `created_at` | `nullifier_hash` from World ID proof; unique. `handle` is user-chosen, unique. |
| `albums` | `id`, `owner_id`, `name`, `description`, `visibility`, `join_code`, `hidden_from_explore`, `created_at` | `visibility` ENUM(`private`, `public`). `join_code` is 6-char URL-safe. |
| `album_members` | `album_id`, `user_id`, `role`, `joined_at` | `role` ENUM(`owner`, `contributor`). Composite PK. |
| `photos` | `id`, `album_id`, `uploader_id`, `cloudinary_public_id`, `width`, `height`, `phash`, `score_quality`, `score_content`, `score_dup_penalty`, `score_composite`, `tags`, `face_count`, `gps_lat`, `gps_lng`, `place_name`, `created_at` | `tags` is `text[]`. Composite score precomputed and indexed for fast sort. |
| `montages` | `id`, `album_id`, `theme_type`, `theme_value`, `photo_ids`, `collage_url`, `video_url`, `created_at` | Cached. `theme_type` ENUM(`tag`, `location`, `face`). `photo_ids` is `int[]`. |

---

## 7. Cloudinary Integration Notes

### 7.1 Upload preset

Single unsigned upload preset configured with:

- Quality Analysis on
- Google Auto-Tagging on (confidence threshold `0.6`)
- Face Detection on
- EXIF extraction on
- Perceptual hash on
- Eager transformations: thumbnail (`w_400,c_fill,g_auto,q_auto,f_auto`) and full (`w_1600,q_auto,f_auto`)

### 7.2 Webhook

Cloudinary notification URL points to `/api/cloudinary/webhook`. We verify the signature, then write the photo row with all metadata in one transaction. This is more reliable than reading the upload response on the client, which can be lost if the user backgrounds the app.

### 7.3 Montage transformations

Static collage URL pattern uses Cloudinary's `l_` (overlay) chained transformations to compose 12 photos into a single 3x4 grid output. Slideshow video uses the multi-resource video API: `POST` to `/video/multi` with the 12 `public_id`s, `transition=fade`, `delay=1500ms`. Result is an `mp4` served from Cloudinary CDN.

---

## 8. Hackathon Milestones

Roughly 36 hours of build time. Two builders. Suggested cuts in priority order if time is short.

| Hour | Milestone | Cut if needed |
|---|---|---|
| 0–4 | Project skeleton, Cloudinary account, World ID app registered, Supabase schema applied, Vercel deploy. | — |
| 4–10 | World ID auth flow end-to-end. User can sign in and pick a handle. | Demo with mocked auth if IDKit integration stalls. Re-enable for final demo. |
| 10–18 | Album create/join, direct-to-Cloudinary upload, webhook → `photos` row, basic gallery view. | Drop HEIC support; require JPEG/PNG only. |
| 18–26 | Composite scoring, ranked album view, sort toggles. Tunable weights via env. | Skip duplicate penalty; use raw Cloudinary aggregate score as a baseline. |
| 26–32 | Themed montage generation: tag and face themes first, then location. | Ship static collages only; defer slideshow videos to v1.1. |
| 32–36 | Explore page, polish, demo script, fallback recordings of every flow. | Hard-code 3 seed public albums on explore if user count is too low to feel populated. |

---

## 9. Open Questions & Risks

- **World ID friction:** Device-level verification is fast, but orb-only would lock out most hackathon judges. Plan: accept device-level proofs by default, with `allow_legacy_proofs=true` for older verifications.
- **Cloudinary credit burn:** AI add-ons consume credits per call. A demo with heavy upload spam could exhaust the free tier. Mitigation: rate-limit uploads to 50/user/day during the demo window.
- **Face recognition scope creep:** Per-person "photos of Sarah" montages are tempting but require a face embedding pipeline. Explicitly out of scope for v1; revisit only if everything else ships early.
- **Moderation on explore:** Cloudinary's moderation add-on auto-flags adult/violent content but is imperfect. Manual review queue is out of scope; we accept the risk for the demo and rely on World ID making bad actors traceable to a unique human.
- **Latency on montage generation:** Cloudinary slideshow video generation can take 10–30 seconds for 12 photos. Plan: optimistic UI showing the static collage first, then swap in the video when ready.

---

## 10. Out of Scope (Post-Hackathon)

- Native iOS / Android apps.
- Per-person face recognition and "photos of X" montages.
- Comments, reactions, or any social-graph features.
- Album monetization, paid tiers, or watermark removal.
- Web3 / on-chain features beyond World ID. Tempting given the World Chain ecosystem, but out of scope.
- Custom user-trained quality models. We use Cloudinary's defaults.