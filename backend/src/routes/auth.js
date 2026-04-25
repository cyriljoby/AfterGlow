const { Router } = require("express");
const jwt = require("jsonwebtoken");
const env = require("../config/env");
const requireAuth = require("../middleware/auth");

const isDev = process.env.NODE_ENV === "development";
const supabase = isDev ? null : require("../config/supabase");
const worldid = isDev ? null : require("../lib/worldid");

const router = Router();

// In-memory dev user store (resets on restart)
const devUsers = new Map();

// GET /auth/nonce — returns signed request for World App handoff
router.get("/nonce", async (_req, res, next) => {
  try {
    const payload = await worldid.createSignedNonce();
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

// POST /auth/verify — verify World ID proof, upsert user, return JWT
router.post("/verify", async (req, res, next) => {
  try {
    // --- Dev-only shortcut: mock user, no Supabase needed ---
    if (req.body.dev === true && isDev) {
      const id = "dev-user-001";
      if (!devUsers.has(id)) {
        devUsers.set(id, {
          id,
          nullifier_hash: "dev_nullifier_default",
          handle: null,
          created_at: new Date().toISOString(),
        });
      }
      const user = devUsers.get(id);
      const token = jwt.sign(
        { sub: user.id, nullifier_hash: user.nullifier_hash },
        env.jwtSecret,
        { expiresIn: env.jwtExpiresIn }
      );
      return res.json({ token, user });
    }

    // --- Production flow ---
    const result = await worldid.verifyWorldIdProof(req.body);
    const nullifierHash = result.nullifier;

    let { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("nullifier_hash", nullifierHash)
      .single();

    if (!user) {
      const { data: newUser, error } = await supabase
        .from("users")
        .insert({ nullifier_hash: nullifierHash })
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          const { data: existing } = await supabase
            .from("users")
            .select("*")
            .eq("nullifier_hash", nullifierHash)
            .single();
          user = existing;
        } else {
          throw error;
        }
      } else {
        user = newUser;
      }
    }

    const token = jwt.sign(
      { sub: user.id, nullifier_hash: user.nullifier_hash },
      env.jwtSecret,
      { expiresIn: env.jwtExpiresIn }
    );

    res.json({ token, user });
  } catch (err) {
    next(err);
  }
});

// GET /auth/me — return current user profile
router.get("/me", requireAuth, async (req, res, next) => {
  try {
    if (isDev && devUsers.has(req.user.sub)) {
      return res.json(devUsers.get(req.user.sub));
    }

    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", req.user.sub)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(user);
  } catch (err) {
    next(err);
  }
});

// PATCH /auth/handle — set or update display handle
const HANDLE_RE = /^[a-z0-9_]{3,20}$/;

router.patch("/handle", requireAuth, async (req, res, next) => {
  try {
    const handle = String(req.body.handle || "").toLowerCase();

    if (!HANDLE_RE.test(handle)) {
      return res.status(400).json({
        error: "Handle must be 3-20 characters, lowercase alphanumeric or underscore",
      });
    }

    if (isDev && devUsers.has(req.user.sub)) {
      const user = devUsers.get(req.user.sub);
      user.handle = handle;
      return res.json(user);
    }

    const { data: user, error } = await supabase
      .from("users")
      .update({ handle })
      .eq("id", req.user.sub)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return res.status(409).json({ error: "Handle already taken" });
      }
      throw error;
    }

    res.json(user);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
