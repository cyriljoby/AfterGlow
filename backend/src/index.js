const express = require("express");
const cors = require("cors");
const env = require("./config/env");
const authRoutes = require("./routes/auth");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/health/cloudinary", async (_req, res, next) => {
  try {
    const auth = Buffer.from(
      `${env.cloudinaryApiKey}:${env.cloudinaryApiSecret}`
    ).toString("base64");
    const r = await fetch(
      `https://api.cloudinary.com/v1_1/${env.cloudinaryCloudName}/usage`,
      { headers: { Authorization: `Basic ${auth}` } }
    );
    if (!r.ok) {
      const body = await r.text();
      return res
        .status(502)
        .json({ ok: false, status: r.status, statusText: r.statusText, body });
    }
    const d = await r.json();
    res.json({
      ok: true,
      cloud_name: d.cloud_name,
      plan: d.plan,
      last_updated: d.last_updated,
      credits: d.credits,
      objects: d.objects?.usage,
      bandwidth_gb: d.bandwidth?.usage
        ? +(d.bandwidth.usage / 1e9).toFixed(3)
        : undefined,
      storage_gb: d.storage?.usage
        ? +(d.storage.usage / 1e9).toFixed(3)
        : undefined,
      transformations: d.transformations?.usage,
      requests: d.requests,
    });
  } catch (err) {
    next(err);
  }
});

app.use("/auth", authRoutes);

// Global error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

app.listen(env.port, () => {
  console.log(`Bloom backend listening on port ${env.port}`);
});
