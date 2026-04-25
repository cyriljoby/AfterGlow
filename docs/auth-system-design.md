# Auth System Design

## Overview

Bloom uses **World ID** for proof-of-personhood authentication and **self-issued JWTs** for session management. There are no passwords, emails, or phone numbers anywhere in the system. A user's identity is their World ID nullifier hash.

---

## Architecture Diagram

```
Mobile App (Expo)                    Backend (Express)                 External
==================                   =================                ========

1. Tap "Get Started"
        |
        v
2. GET /auth/nonce  ──────────>  createSignedNonce()
                                  - signs {action} with
                                    WORLD_RP_SIGNING_KEY
                                  - returns {rp_id, action,
                                    signature, nonce}
        <─────────────────────  payload returned
        |
3. Open World App
   via universal link
   (passes rp_id, action,
    signature)
        |
        v
   User verifies in  ─────────────────────────────────>  World App
   World App (orb or                                     verifies
   device-level)                                         identity
        <──────────────────────────────────────────────  returns proof
        |                                                via deep link
        v
4. POST /auth/verify ─────────>  verifyWorldIdProof()
   {proof payload}                - POST to World ID API
                                    developer.world.org
                                    /api/v4/verify/{rp_id}  ────────>  World ID API
                                  - validates proof                    verifies proof
                                  - extracts nullifier_hash  <───────  returns {nullifier}
                                        |
                                        v
                                  Upsert user in Supabase
                                  (keyed on nullifier_hash)
                                        |
                                        v
                                  Sign JWT {sub, nullifier_hash}
                                  with JWT_SECRET, 7d expiry
        <─────────────────────  {token, user}
        |
5. Store JWT in MMKV
        |
        v
6. All subsequent requests
   include header:
   Authorization: Bearer <jwt>
        |
        v
   Protected routes  ─────────>  requireAuth middleware
   (e.g. GET /auth/me,            - extracts Bearer token
    PATCH /auth/handle)            - jwt.verify(token, secret)
                                   - attaches decoded payload
                                     to req.user
                                   - 401 if missing/invalid
```

---

## Components

### 1. Config (`src/config/env.js`)

Loads and validates required environment variables at startup:

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service-role key (server-side, bypasses RLS) |
| `WORLD_RP_ID` | Relying Party ID registered with World ID |
| `WORLD_RP_SIGNING_KEY` | Hex-encoded key for signing World ID requests |
| `WORLD_ACTION` | Action identifier for this World ID integration |
| `JWT_SECRET` | HMAC secret for signing/verifying JWTs |
| `JWT_EXPIRES_IN` | Token lifetime (default: `7d`) |

The server refuses to start if any required var is missing.

### 2. World ID Library (`src/lib/worldid.js`)

Two functions that encapsulate all World ID interaction:

- **`createSignedNonce()`** — Uses `@worldcoin/idkit-core/signing` to produce a signed request payload containing `rp_id`, `action`, and cryptographic signature. This is sent to the mobile app so it can open the World App with a valid, tamper-proof request.

- **`verifyWorldIdProof(proof)`** — Takes the proof payload returned by the World App and POSTs it to `https://developer.world.org/api/v4/verify/{rp_id}`. Returns the verified result (including the nullifier hash) or throws a 400 error.

Note: `@worldcoin/idkit-core` is ESM-only, so `signRequest` is loaded via dynamic `import()` inside a CommonJS module.

### 3. Auth Routes (`src/routes/auth.js`)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/auth/nonce` | Public | Returns signed nonce for World App handoff |
| `POST` | `/auth/verify` | Public | Verifies World ID proof, upserts user, returns JWT |
| `GET` | `/auth/me` | Protected | Returns current user's profile |
| `PATCH` | `/auth/handle` | Protected | Sets or updates display handle (3-20 chars, `[a-z0-9_]`) |

#### Verify flow in detail

1. Call `verifyWorldIdProof()` with the raw proof from the client.
2. Extract `nullifier` from the verified result.
3. Query Supabase `users` table for a row matching `nullifier_hash`.
4. If no user exists, insert a new row. If insert races with a concurrent request (unique constraint violation `23505`), fall back to selecting the existing row.
5. Sign a JWT with `{ sub: user.id, nullifier_hash }` and return it alongside the user object.

### 4. Auth Middleware (`src/middleware/auth.js`)

`requireAuth` is a standard Express middleware:

1. Checks for `Authorization: Bearer <token>` header.
2. Verifies the JWT using `jwt.verify(token, jwtSecret)`.
3. Attaches the decoded payload to `req.user` (providing `req.user.sub` as the user ID).
4. Returns `401` if the header is missing, malformed, or the token is invalid/expired.

### 5. Database (`users` table in Supabase/Postgres)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | Auto-generated |
| `nullifier_hash` | text (unique) | From World ID proof; the only identity anchor |
| `handle` | text (unique, nullable) | User-chosen display name, set after first login |
| `created_at` | timestamptz | Auto-set |

No email, phone, or password columns exist anywhere in the schema.

---

## Security Properties

- **Sybil resistance**: One human = one account, enforced by World ID's proof of personhood. The nullifier hash is deterministic per (person, action) pair, so re-verifying returns the same hash and maps to the same account.

- **No PII stored**: The nullifier hash is a one-way derivative. The backend stores no biometric data, name, email, or phone number.

- **Stateless sessions**: JWTs are self-contained. The backend does not maintain a session store. Token expiry is the only revocation mechanism (no token blocklist).

- **Race condition handling**: The upsert in `/auth/verify` handles concurrent first-login attempts via unique constraint catch-and-retry.

- **Service-role Supabase client**: The backend uses the service-role key to bypass Row Level Security, since all access control is handled at the Express layer via `requireAuth`.

---

## Token Lifecycle

```
[World App proof] ──> POST /auth/verify ──> JWT issued (7d TTL)
                                                |
                                                v
                                        Stored in MMKV on device
                                                |
                                                v
                                        Sent as Bearer token
                                        on every API request
                                                |
                                                v
                                        Expires after 7 days
                                        ──> user re-verifies
```

There is no refresh token mechanism. When the JWT expires, the user goes through the World ID verification flow again.

---

## Limitations and Future Considerations

- **No token revocation**: Since there's no blocklist or refresh token rotation, a compromised JWT is valid until expiry. For a hackathon this is acceptable; production would need a revocation strategy.
- **Single JWT secret**: All tokens are signed with the same HMAC key. Key rotation would invalidate all active sessions.
- **No rate limiting**: The auth endpoints have no rate limiting. Production should add per-IP throttling on `/auth/nonce` and `/auth/verify`.
- **Handle validation is basic**: Only lowercase alphanumeric and underscore, 3-20 chars. No profanity filter or reserved-word list.
