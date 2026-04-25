const { Router } = require("express");
const jwt = require("jsonwebtoken");
const env = require("../config/env");
const supabase = require("../config/supabase");
const { createSignedNonce, verifyWorldIdProof } = require("../lib/worldid");
const requireAuth = require("../middleware/auth");

const router = Router();

// GET /auth/nonce — returns signed request for World App handoff
router.get("/nonce", async (_req, res, next) => {
  try {
    const payload = await createSignedNonce();
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

// POST /auth/verify — verify World ID proof, upsert user, return JWT
router.post("/verify", async (req, res, next) => {
  try {
    const result = await verifyWorldIdProof(req.body);
    const nullifierHash = result.nullifier;

    // Try to find existing user
    let { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("nullifier_hash", nullifierHash)
      .single();

    if (!user) {
      // Create new user
      const { data: newUser, error } = await supabase
        .from("users")
        .insert({ nullifier_hash: nullifierHash })
        .select()
        .single();

      if (error) {
        // Handle race condition: another request inserted the same nullifier
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
