# Bloom — Product Requirements Document

> A human-verified shared photo album with AI-ranked photos, person-tagged montages, and themed reels.

**Version:** 0.3 · Hackathon Draft
**Date:** April 25, 2026

---

## 1. Overview

**Product name:** Bloom (working title).

**One-liner:** Group photo albums where Cloudinary auto-ranks photos by quality, AWS Rekognition tags people, and the app stitches the best shots into themed montages — with World ID ensuring every account is a real human.

**Problem:** Group photo sharing today is a mess. Albums fill up with blurry duplicates, no one curates, and "best of" recaps require manual work. Finding "all the photos of Mom from the trip" means scrolling for an hour. Public photo communities are also overrun with bot accounts and spam.

**Solution:** A cross-platform mobile app where any group can spin up a shared album, drop in photos, and instantly get a quality-ranked gallery, per-person face tagging, and auto-generated themed montages. Public albums are protected from bots via World ID proof of personhood. Face recognition is strictly opt-in and album-scoped — no cross-album face graph.

---

## 2. Goals & Non-Goals

### 2.1 Goals

- Frictionless group photo collection — anyone with a link can join and contribute in under 30 seconds.
- Automated curation — quality-ranked feed without manual effort from the album owner.
- **Person-tagged photos** — opt-in face recognition lets users see "all photos of [person]" within an album.
- Themed montages by person, tag, location, or face count.
- Bot-resistant explore page — every account on public surfaces is a verified unique human.
- One codebase shipping to both iOS and Android by demo time.

### 2.2 Non-Goals

- Web app or PWA. Mobile-only.
- **Cross-album face recognition.** A person enrolled in one album is not auto-recognized in another.
- Face recognition on non-consenting people. Identification only happens for users who self-enroll, or for clusters that an album member has explicitly named.
- Long-term storage guarantees, paid tiers, or enterprise features.
- Comments, likes, follows, or other social-graph features.
- Photo editing tools beyond what Cloudinary auto-applies.

---

## 3. Target Users & Use Cases

Three primary personas, all on mobile during or right after a shared experience.

- **Album creator:** organizes a group event (trip, wedding, party, meetup) and wants a clean recap without doing curation work.
- **Contributor:** attended the event, has 30–200 photos on their phone, joins via link, bulk-uploads, and self-enrolls so others can find their photos.
- **Explorer:** browses public albums on the explore page for inspiration or entertainment, like a low-stakes Instagram discover feed.

---

## 4. Tech Stack

| Layer | Choice |
|---|---|
| **Mobile app** | React Native via Expo (SDK 52+) with TypeScript. Single codebase ships to iOS and Android. EAS Build for binaries. |
| **Navigation** | Expo Router (file-based routing). Bottom tab nav for Home / Explore / Profile, stack nav inside each tab. |
| **State / data** | TanStack Query for server state, Zustand for local UI state, MMKV for persistent client storage (session, draft uploads). |
| **Camera & library** | `expo-image-picker` for multi-select from library, `expo-camera` for in-app capture, `expo-media-library` for HEIC/EXIF metadata. |
| **Backend** | Javascript + Express. Postgres via Supabase. Webhook handlers for Cloudinary and Rekognition callbacks. |
| **Auth** | World ID 4.0. Mobile flow uses universal/app links to hand off to the World App, which returns the proof to our app. Server verifies via `developer.world.org/api/v4/verify/{rp_id}`. Session = JWT in MMKV. |
| **Media storage & quality AI** | Cloudinary — direct uploads from the device using the unsigned upload preset, with Quality Analysis, Google Auto-Tagging, and Face Detection enabled. Cloudinary URLs for delivery and transformations. |
| **Face recognition** | **AWS Rekognition.** One face collection per album. `IndexFaces` on enrollment, `SearchFacesByImage` on each new upload. Faces tagged via cluster-and-name flow. |
| **Image delivery** | `expo-image` for cached, transformed Cloudinary URLs (`w_*,q_auto,f_auto,dpr_auto`). |
| **Montages** | Cloudinary multi-image transformations for static collages; Cloudinary video API for slideshow reels. Played in-app with `expo-video`. |
| **Push (optional)** | `expo-notifications` for "new photos in your album" and "your montage is ready". |

### 4.1 Why React Native (Expo)

A cross-functional mobile app needs first-class access to the camera, photo library, and EXIF metadata — all limited or awkward in a browser. Expo gives us a single TypeScript codebase that ships to both iOS and Android, with managed config for camera permissions, deep linking (needed for the World ID handoff), and over-the-air updates during the hackathon. EAS Build means we can hand a TestFlight or APK to judges instead of asking them to scan a QR code.

### 4.2 Why World ID

Public albums and an explore page are catnip for spam — fake accounts uploading low-quality content to game discovery, or worse, posting harmful material. World ID's proof of personhood gives us Sybil resistance without collecting names, emails, or government IDs. Users prove they are a unique human via the World App handoff; we store only the nullifier hash. One human = one account.

### 4.3 Why Cloudinary

Cloudinary collapses three services we'd otherwise build separately: media storage and CDN, on-the-fly image transformations, and AI image analysis. Quality Analysis returns numeric scores for focus, exposure, lighting, contrast, and color. Auto-tagging gives us content labels for theme grouping. Face *detection* (count and bounding boxes, not identity) supplies the metadata for "group shots" themes. Direct-from-device uploads mean photos never touch our backend.

### 4.4 Why AWS Rekognition (separate from Cloudinary face detection)

Cloudinary tells us *that* faces exist; Rekognition tells us *who they are*. Rekognition's per-collection model is a clean fit for our album-scoped privacy boundary: we create one collection per album, and `IndexFaces` / `SearchFacesByImage` both operate within that collection only. Pricing is roughly $1 per 1,000 faces indexed and $1 per 1,000 searches, which fits the hackathon budget. The alternative — running embedding models on-device with face-api.js — is feasible but adds bundle weight and complicates the React Native build, and we'd rebuild what AWS already provides.

---

## 5. Features

### 5.1 Account Creation

**Description:** Users sign up by completing World ID verification once. No email, password, or username required.

**User flow:**

1. User opens the app and taps "Get started".
2. App opens the World App via universal link, passing `rp_id`, `action`, and the RP signature fetched from our backend.
3. User verifies in World App (orb-verified or device-level).
4. World App returns to our app via deep link with the proof payload.
5. App posts the proof to `POST /auth/verify` on our backend.
6. Backend verifies via `developer.world.org/api/v4/verify/{rp_id}` and creates a user row keyed on the nullifier hash.
7. Backend returns a JWT; app stores it in MMKV.
8. User picks a display handle (3–20 chars, unique). This is shown publicly on explore.

**Acceptance criteria:**

- Verification round-trip completes in under 60 seconds on a typical mobile connection.
- Same World ID can never create two accounts (nullifier collision returns existing account).
- No PII (name, email, phone) is collected or stored anywhere.
- Handle is editable from settings, but uniqueness is enforced.
- Fallback when World App is not installed: deep link surfaces an install prompt with App Store / Play Store links.

### 5.2 Shared Photo Album (Private / Public)

**Description:** Logged-in users can create albums, set them private or public, and invite contributors. Albums are the unit of organization for everything else in the product, including face recognition scope.

**User flow:**

1. User taps `+` on Home tab → "New album", enters a name and optional description.
2. User picks visibility: Private (link-only) or Public (appears on explore).
3. Album created with a 6-character join code, a deep link `Bloom://a/ABC123`, and a universal link `https://Bloom.app/a/ABC123` for sharing.
4. Backend creates a per-album Rekognition face collection (`Bloom_album_{album_id}`) at the same time. This collection is deleted if the album is deleted.
5. Owner shares the link via the native share sheet.
6. Recipient taps the link → app opens to a "Join album?" screen → confirms → becomes a contributor.

**Acceptance criteria:**

- Album creator is the owner; owners can rename, change visibility, remove contributors, or delete the album.
- Deleting an album wipes the Rekognition collection for that album. Faces do not persist post-deletion.
- Private albums are accessible only via the join link; not enumerable in any API.
- Public albums require contributors to be World-ID-verified before uploading.
- Each album shows photo count, contributor count, and "people tagged" count on the home screen.
- Join links work via universal links on both iOS and Android.

### 5.3 Photo Upload

**Description:** Native multi-select from the photo library, in-app camera capture, and direct-to-Cloudinary uploads with progress.

**User flow:**

1. Inside an album, user taps the camera FAB.
2. Action sheet: "Take photo" (`expo-camera`) or "From library" (`expo-image-picker` with `allowsMultipleSelection: true`).
3. After permission, user picks up to 50 photos at once.
4. Photos uploaded directly to Cloudinary using the unsigned upload preset, bypassing our backend. Upload runs in a background task so the user can keep browsing.
5. Cloudinary runs Quality Analysis, Google Auto-Tagging, and Face Detection in a single request.
6. Cloudinary's webhook hits our `POST /webhooks/cloudinary`. Backend writes a `photos` row.
7. **For each detected face**, backend kicks off `IndexFaces` on the album's Rekognition collection, then `SearchFacesByImage` to see if the face matches any known person in this album. Results written to `photo_faces` rows.
8. Album view updates in near-real-time via Supabase Realtime subscription.

**Acceptance criteria:**

- Supports JPEG, PNG, and HEIC. HEIC is uploaded as-is and Cloudinary auto-converts. 20 MB max per file.
- Bulk upload of 20 photos completes within 90 seconds on a 4G connection.
- Per-photo progress visible in a sticky upload tray at the bottom of the album view.
- Failed uploads show an inline retry button; queue persists across app restarts via MMKV.
- Photo metadata (quality scores, tags, face boxes, person matches) queryable within 10 seconds of upload.
- Uploads from non-verified contributors to public albums rejected with a verify prompt.
- Camera permission denial shows an explainer with a deep link to system settings.

### 5.4 Quality Ranking

**Description:** Every photo in an album gets a composite quality score, and the album view defaults to a quality-ranked sort.

**Scoring formula:** Composite score = weighted blend of three signals. Weights tunable via env vars for fast iteration during the demo.

- **Technical quality (60%):** Cloudinary's `quality_analysis.aggregate` score (focus, exposure, lighting, contrast, color).
- **Content signal (30%):** Bonus for detected faces (capped at 3), bonus for "good" tags (people, food, landscape, animal), penalty for "bad" tags (screenshot, document, receipt, blur).
- **Duplicate penalty (10%):** Photos with a near-identical perceptual hash (Cloudinary phash, Hamming distance < 5) get the lower-quality one penalized.

**User flow:**

1. User opens an album.
2. Default view is grid sorted by composite score, descending. Three columns on phones, four on tablets.
3. Sort toggle in the header: "Best", "Newest", "Oldest".
4. Tapping a photo opens a fullscreen pager (`expo-image` with pinch zoom and swipe between photos).
5. **In fullscreen, detected faces show subtle outlines.** Tapping an outline shows the person's name (if tagged) or a "Tag this person" prompt.
6. Long-pressing a photo shows a debug overlay with the score breakdown — fun demo touch.

**Acceptance criteria:**

- Composite score computed on photo metadata write; stored on the row (not recomputed at read).
- Score is a float between 0 and 100, deterministic for the same inputs.
- Album view loads first 20 ranked photos in under 1.5 seconds on 4G; uses `FlashList` (Shopify) for smooth scrolling.
- Reranking on weight change is a single SQL update, not a re-fetch from Cloudinary.

### 5.5 People & Face Recognition (NEW)

**Description:** Within an album, users can be identified across photos. Identification is opt-in and album-scoped: a "person" entity exists only inside the album where they were enrolled or named.

#### 5.5.1 Self-enrollment (preferred path)

The cleanest way to get tagged: tag yourself.

**User flow:**

1. Inside an album, user taps "Tag me in photos" on the people screen.
2. Consent screen explains: "Your face data will be used to find you in this album only. It is deleted when the album is deleted or when you leave the album. It is not shared across other Bloom albums."
3. User taps "I agree" and takes a selfie via `expo-camera` (or picks one from library).
4. Selfie uploaded to Cloudinary, then sent to AWS Rekognition `IndexFaces` on the album's collection with `ExternalImageId = person:{user_id}`.
5. Backend creates a `people` row: `(album_id, user_id, display_name = handle, is_self = true)`.
6. Backend runs `SearchFacesByImage` against every existing photo in the album. Matches are written to `photo_faces` and shown in the user's "my photos" view.
7. Going forward, any new upload that contains a face matching this person is auto-tagged.

**Acceptance criteria:**

- Self-enrollment requires explicit consent click; no dark-pattern flow.
- Selfie is stored in Cloudinary with `access_mode: authenticated` so it is not publicly fetchable.
- User can revoke at any time via "Remove me from this album", which deletes their face from the Rekognition collection and removes all face tags pointing to them in this album.
- Match confidence threshold is `≥ 90` for auto-tagging. Matches between 80 and 90 are flagged as "maybe" and require manual confirmation.

#### 5.5.2 Cluster-and-name (for non-self-enrolled people)

For people who attended but did not install the app — the bride's grandma, the friend who just sends photos in the group chat — any album member can name a cluster after the fact.

**User flow:**

1. Backend continuously clusters all unidentified detected faces in the album using Rekognition's similarity scores.
2. People screen shows clusters as cards: "Person A (12 photos)", "Person B (7 photos)", each represented by 3 thumbnail crops.
3. Any album member taps a card → "Name this person" → enters a name (e.g., "Grandma Rose").
4. Cluster is promoted to a `people` row: `(album_id, user_id = null, display_name = "Grandma Rose", is_self = false, named_by = current_user_id)`.
5. The named person now appears in the people list and gets their own filtered view and montage chip.
6. Anyone can correct the name, but corrections are logged.

**Acceptance criteria:**

- Naming a cluster requires the actor to be a confirmed album member.
- A person row created from a cluster includes a `named_by` field for accountability.
- A person can be renamed by any member, but the most recent rename wins. Edit history is stored on the row for the demo (could become a moderation tool later).
- Naming a cluster does not notify the named person — they are not necessarily a Bloom user. The cluster lives only in the album.

#### 5.5.3 People view

A new "People" tab inside an album.

- Header: count of people tagged, count of unidentified clusters.
- Grid of person cards, each showing display name, thumbnail, and photo count.
- Tapping a person card opens a filtered photo grid: every photo in this album containing this person, sorted by composite score.
- "Make a montage of this person" button on the filtered view (see 5.6).

**Acceptance criteria:**

- People view loads in under 2 seconds for an album with up to 50 people.
- Filtering by person uses an indexed join on `photo_faces.person_id`.
- The same person can appear in multiple albums but their `people` row is per-album. They are not auto-recognized across albums (privacy boundary).

#### 5.5.4 Privacy boundaries (mandatory)

Stated explicitly because face recognition is not optional to think carefully about:

- Face data is **album-scoped**. Rekognition collections are per-album. Nothing is shared across albums.
- A user's enrolled face from Album A is **never** searched against photos in Album B, even if they joined both.
- Deleting an album wipes the Rekognition collection.
- A user removing themselves from an album wipes their face from that collection.
- A user can audit, in their profile, every album they are enrolled in and revoke from each.
- We do not run face recognition on photos in albums where no one has self-enrolled or named a cluster — there is nothing to match against, so nothing happens beyond Cloudinary's bounding-box detection.

### 5.6 Themed Montages

**Description:** Users tap a chip representing a theme, and the app generates a montage from the matching subset of high-quality photos.

**Theme types:**

- **By person:** The headline new theme. Chips like "Sarah (24 photos)", "Mom (18 photos)". Filter where `photo_faces.person_id` matches.
- **By tag:** Auto-generated chips from the most common Cloudinary tags ("Food", "Outdoors", "Beach", "City"). Filter where `photo.tags` includes the theme tag.
- **By location:** Reverse-geocoded place names from EXIF GPS. Chips like "Santa Monica", "Yosemite".
- **By group size:** "Group shots" (3+ detected faces). "Selfies" (1 face filling > 25% of frame).

**Generation:** Take the top 12 photos by composite score from the matching subset. Generate two outputs in parallel:

1. **Static collage:** 3x4 grid via Cloudinary multi-image transformation, single JPEG URL.
2. **Slideshow video:** 12 photos at 1.5s each with cross-fade transitions, via Cloudinary video API, returned as MP4.

**User flow:**

1. User taps "Make montage" button on album page.
2. Bottom sheet shows chips grouped by theme type — people first, then tags, locations, group size.
3. User taps a chip; spinner with playful loading copy.
4. Result screen plays the slideshow video (`expo-video`) with "Save grid" and "Share" buttons.
5. Share button uses native share sheet to send a public montage link (does not expose the underlying album).
6. "Save to camera roll" via `expo-media-library`.

**Acceptance criteria:**

- Montage generation completes in under 15 seconds for an album of 100 photos.
- Themes with fewer than 4 matching photos are hidden.
- Generated montages cached by `(album_id, theme_type, theme_value)` so repeat taps are instant.
- Person-themed montages can only be generated by album members (consistent with the album-scoped privacy boundary). Recipients of the share link can view but cannot generate new ones.
- Save-to-camera-roll requires media library permission; denial shows an explainer.

### 5.7 Explore Page

**Description:** A discovery feed of public albums. Every album shown was created by a World-ID-verified human.

**User flow:**

1. User taps "Explore" tab.
2. `FlashList` of album cards: cover image (highest-scored photo), title, contributor count, photo count, creator handle.
3. Tapping a card opens the album in read-only mode.
4. "Join album" promotes the user to contributor.
5. Pull-to-refresh re-fetches the feed.

**Ranking:** Freshness blended with quality — recent activity (last upload) plus average composite quality of the album's top 10 photos. Albums with fewer than 10 photos deprioritized.

**Acceptance criteria:**

- Only public albums appear; private albums never indexed.
- Only albums whose creator is World-ID-verified appear.
- Initial load shows 20 albums; infinite scroll loads more in batches of 20.
- Owner of any album can hide it from explore via a "don't surface" toggle without making it private.
- **Person-tagged thumbnails are blurred on explore.** A non-member should never see named-person tags from a public album. The cover image is shown raw, but the people view is hidden until the viewer joins.
- Cloudinary moderation flags auto-hide an album from explore until reviewed.

---

## 6. Data Model

Postgres schema. World ID nullifier is the primary user key — no email or phone column anywhere.

| Table | Fields | Notes |
|---|---|---|
| `users` | `id`, `nullifier_hash`, `handle`, `created_at` | `nullifier_hash` from World ID proof; unique. |
| `albums` | `id`, `owner_id`, `name`, `description`, `visibility`, `join_code`, `hidden_from_explore`, `rekognition_collection_id`, `created_at` | `visibility` ENUM(`private`, `public`). |
| `album_members` | `album_id`, `user_id`, `role`, `joined_at` | `role` ENUM(`owner`, `contributor`). Composite PK. |
| `photos` | `id`, `album_id`, `uploader_id`, `cloudinary_public_id`, `width`, `height`, `phash`, `score_quality`, `score_content`, `score_dup_penalty`, `score_composite`, `tags`, `face_count`, `gps_lat`, `gps_lng`, `place_name`, `created_at` | `tags` is `text[]`. Composite score precomputed and indexed. |
| **`people`** | `id`, `album_id`, `user_id` (nullable), `display_name`, `is_self`, `named_by`, `rekognition_face_id`, `enrollment_image_public_id`, `created_at`, `updated_at` | One row per identified person per album. `user_id` set only for self-enrolled. |
| **`photo_faces`** | `id`, `photo_id`, `person_id` (nullable), `cluster_id` (nullable), `bbox_x`, `bbox_y`, `bbox_w`, `bbox_h`, `confidence`, `rekognition_face_id` | One row per detected face. Either `person_id` (identified) or `cluster_id` (unidentified) is set, never both. |
| **`face_clusters`** | `id`, `album_id`, `centroid_face_id`, `face_count`, `created_at` | Derived from Rekognition similarity. Promoted to a `people` row on naming. |
| `montages` | `id`, `album_id`, `theme_type`, `theme_value`, `photo_ids`, `collage_url`, `video_url`, `created_at` | `theme_type` ENUM(`person`, `tag`, `location`, `face_count`). |

---

## 7. Cloudinary Integration Notes

### 7.1 Upload preset

Single unsigned upload preset configured with: Quality Analysis on, Google Auto-Tagging on (confidence threshold `0.6`), Face Detection on, EXIF extraction on, perceptual hash on. Eager transformations: thumbnail (`w_400,c_fill,g_auto,q_auto,f_auto`) and full (`w_1600,q_auto,f_auto`).

### 7.2 Direct upload from device

React Native uploads use `POST https://api.cloudinary.com/v1_1/{cloud}/image/upload` with `multipart/form-data`. The unsigned preset name is in the body, plus a `context` field carrying `album_id` and `uploader_id` so the webhook can route the result without a separate lookup. Files over 5 MB use the chunked upload protocol.

### 7.3 Webhook

Cloudinary notification URL points to `POST /webhooks/cloudinary`. We verify the signature, then write the photo row with all metadata in one transaction, and enqueue a Rekognition job for each detected face.

### 7.4 Montage transformations

Static collage uses Cloudinary's `l_` (overlay) chained transformations to compose 12 photos into a 3x4 grid. Slideshow video: `POST` to the multi-resource video endpoint with the 12 `public_id`s, `transition=fade`, `delay=1500ms`. Result is an `mp4` served from Cloudinary CDN.

---

## 8. AWS Rekognition Integration Notes

### 8.1 Collections

One face collection per album, named `Bloom_album_{album_id}`. Created on album create, deleted on album delete. AWS limits collections to 20 million faces, far above hackathon scale.

### 8.2 IndexFaces

Called when:
- A user self-enrolls (selfie → one face indexed with `ExternalImageId = person:{user_id}`).
- A new photo is uploaded with detected faces (each face indexed with `ExternalImageId = photo:{photo_id}:{face_idx}`).

### 8.3 SearchFacesByImage

Called on each newly indexed face from an upload. Threshold 90 for auto-match, 80–90 for "maybe" requiring manual confirmation. Matches written to `photo_faces.person_id` if confident, otherwise to a `face_clusters` row via a nightly clustering job (or on-demand for the demo).

### 8.4 Cost guard

Wrap all Rekognition calls in a per-album rate limiter (max 200 face operations per hour during demo). Emergency kill switch via env var if costs spike.

### 8.5 Deletion

Album delete → `DeleteCollection`. User leaves album → `DeleteFaces` for all faces with that user's `ExternalImageId`. User deletes their Bloom account → cascade across every album they were enrolled in.

---

## 9. Mobile-Specific Concerns

- **Permissions:** Camera, photo library, and (optionally) location. Each has a pre-prompt explainer screen. **Face recognition consent is its own screen, separate from camera permission.** The OS camera permission is not consent for face recognition.
- **Deep linking:** `Bloom://a/{code}` for in-app routing. `https://Bloom.app/a/{code}` as a universal link with App Site Association (iOS) and asset links (Android).
- **Background uploads:** `expo-task-manager` so an upload doesn't die when the user backgrounds the app mid-trip.
- **Offline:** Album views cached via TanStack Query persistence to MMKV. Uploads queued when offline.
- **HEIC handling:** Don't transcode on device. Upload raw HEIC; let Cloudinary deliver `f_auto` JPEG/WebP/AVIF.
- **Image memory:** `expo-image` with explicit `width`/`height` and `cachePolicy: 'memory-disk'`. Never load originals in the gallery.

---

## 10. Hackathon Milestones

Roughly 36 hours of build time. Two builders. Suggested cuts in priority order if time is short.

| Hour | Milestone | Cut if needed |
|---|---|---|
| 0–4 | Expo project init, Cloudinary account, AWS account with Rekognition enabled, World ID app registered, Supabase schema applied, backend deployed. EAS Build configured. | — |
| 4–10 | World ID auth flow end-to-end (deep link handoff). User can sign in and pick a handle. | Mock auth if World App handoff stalls. Re-enable for final demo. |
| 10–18 | Album create/join, native multi-select upload, direct-to-Cloudinary, webhook → `photos` row, basic gallery view with `FlashList`. | Drop background upload task. |
| 18–24 | Composite scoring, ranked album view, sort toggles, fullscreen pager with face outlines. | Skip duplicate penalty; use raw Cloudinary aggregate. |
| 24–30 | **Face recognition: self-enrollment flow + auto-tag on upload via Rekognition. People view with filtered photo grid.** | Ship self-enrollment only; skip cluster-and-name for demo. |
| 30–34 | Themed montages: person, tag, face count themes. `expo-video` playback. | Ship static collages only; defer slideshow videos. |
| 34–36 | Explore page, polish, demo script. TestFlight build for iOS judges, APK for Android. Fallback screen recordings of every flow. | Hard-code 3 seed public albums on explore if user count is too low. |

---

## 11. Open Questions & Risks

- **World ID handoff on simulators:** Real device required (iOS Simulator and Android Emulator can't run World App). Mitigation: build for real devices from hour 1, distribute via Expo Go for in-team testing and TestFlight/APK for judges.
- **Cloudinary credit burn:** AI add-ons consume credits per call. Mitigation: rate-limit uploads to 50/user/day during the demo window.
- **Rekognition cost surprises:** Indexing and searching adds up if a contributor uploads 500 photos. Mitigation: per-album rate limit (8.4) and an env-based kill switch.
- **Face recognition consent:** The single biggest risk to a clean demo is a judge asking "what about people in the photos who didn't consent?" Mitigation: be loud and explicit about the album-scoped boundary, lead with self-enrollment, and ensure cluster-and-name only happens when an album member acts.
- **Match accuracy on diverse faces:** Rekognition has known accuracy gaps across demographics. Mitigation: surface confidence scores in the UI, require manual confirmation for matches under 90, and allow easy "this isn't me" correction.
- **Expo native module gaps:** If something requires a custom native module, we'd need to eject mid-hackathon. Mitigation: stay strictly within Expo SDK modules.
- **App store submission:** Real submission takes days; out of scope. Distribute via TestFlight (iOS) and direct APK (Android).
- **Latency on montage generation:** Cloudinary slideshow video can take 10–30 seconds for 12 photos. Plan: optimistic UI showing the static collage first, then swap in the video.

---

## 12. Out of Scope (Post-Hackathon)

- Web or PWA version.
- **Cross-album face recognition.** Hard architectural boundary; not just deferred.
- Comments, reactions, or any social-graph features.
- Album monetization, paid tiers, or watermark removal.
- Web3 / on-chain features beyond World ID. Tempting given the World Chain ecosystem, but out of scope.
- Custom user-trained quality models. We use Cloudinary's defaults.
- Real App Store / Play Store submission and review.
- On-device face recognition (face-api.js / TF.js) as an alternative to Rekognition.