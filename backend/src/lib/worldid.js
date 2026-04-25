const env = require("../config/env");

let signRequest;

async function loadSignRequest() {
  if (!signRequest) {
    const mod = await import("@worldcoin/idkit-core/signing");
    signRequest = mod.signRequest;
  }
  return signRequest;
}

async function createSignedNonce() {
  const sign = await loadSignRequest();
  const result = await sign({
    signingKeyHex: env.worldRpSigningKey,
    action: env.worldAction,
  });
  return {
    rp_id: env.worldRpId,
    action: env.worldAction,
    ...result,
  };
}

async function verifyWorldIdProof(proof) {
  const res = await fetch(
    `https://developer.world.org/api/v4/verify/${env.worldRpId}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(proof),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`World ID verification failed: ${body}`);
    err.status = 400;
    throw err;
  }

  return res.json();
}

module.exports = { createSignedNonce, verifyWorldIdProof };
