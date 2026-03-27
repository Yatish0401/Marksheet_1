import open from "open";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
import { v2 as cloudinary } from "cloudinary";

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const app = express();

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "DELETE"],
}));

app.use(express.json());

// ── Helper: fetch all resources by type ────────────────────
const fetchAll = async (resourceType) => {
  const results = [];
  let nextCursor = null;
  do {
    const options = {
      resource_type: resourceType,
      max_results: 500,
      context: true,
      tags: true,
    };
    if (nextCursor) options.next_cursor = nextCursor;
    const res = await cloudinary.api.resources(options);
    results.push(...res.resources);
    nextCursor = res.next_cursor || null;
  } while (nextCursor);
  return results;
};

// ── Fetch all uploaded files ────────────────────────────────
app.get("/api/files", async (req, res) => {
  try {
    const [images, raw, videos] = await Promise.all([
      fetchAll("image"),
      fetchAll("raw"),
      fetchAll("video"),
    ]);

    const allFiles = [...images, ...raw, ...videos]
     .filter(r => !deletedIds.has(r.public_id))
    .map(r => {
      const ctx = r.context?.custom || {};
      return {
        id: r.public_id,
        publicId: r.public_id,
        name: ctx.student || r.tags?.[0] || "Unknown",
        className: ctx.class || r.tags?.[1] || "",
        board: ctx.board || r.tags?.[2] || "",
        originalName: ctx.origName || r.public_id,
        size: r.bytes || 0,
        date: new Date(r.created_at).getTime(),
        url: r.secure_url,
        resourceType: r.resource_type,
        format: r.format,
      };
    });

    allFiles.sort((a, b) => b.date - a.date);
    res.json({ success: true, files: allFiles });
  } catch (err) {
    console.error("❌ Fetch error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Proxy PDF ───────────────────────────────────────────────
app.get("/api/proxy-pdf", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "URL required" });
  try {
    const response = await axios.get(url, { responseType: "arraybuffer" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Disposition", "inline");
    res.send(response.data);
  } catch (err) {
    console.error("❌ Proxy error:", err.message);
    res.status(500).json({ error: "Failed to fetch PDF" });
  }
});


// ── Delete single file ──────────────────────────────────────
app.delete("/api/delete", async (req, res) => {
  try {
    const { publicId, resourceType = "image" } = req.query;
    if (!publicId) return res.status(400).json({ success: false, error: "publicId is required" });

    console.log(`🗑️ Deleting: "${publicId}" as resourceType: "${resourceType}"`);

    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
      invalidate: true,
    });

    console.log(`✅ Cloudinary delete result:`, result);

    // "not found" bhi success maano — already deleted
    if (result.result === "ok" || result.result === "not found") {
       deletedIds.add(publicId);
      res.json({ success: true, result });
    } else {
      res.status(400).json({ success: false, error: result.result });
    }
  } catch (err) {
    console.error("❌ Delete error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Delete multiple files ───────────────────────────────────
app.post("/api/delete-many", async (req, res) => {
  try {
    const { publicIds, resourceType = "image" } = req.body;
    if (!publicIds || publicIds.length === 0) {
      return res.status(400).json({ success: false, error: "No publicIds provided" });
    }

    console.log(`🗑️ Bulk deleting ${publicIds.length} files as "${resourceType}"`);

    const results = await Promise.allSettled(
      publicIds.map(id =>
        cloudinary.uploader.destroy(id, { resource_type: resourceType, invalidate: true })
      )
    );
     results.forEach((r, i) => {
      if (r.status === "fulfilled" && 
         (r.value.result === "ok" || r.value.result === "not found")) {
        deletedIds.add(publicIds[i]); // ← deleted IDs yaad rakho
      }
    });

    console.log(`✅ Bulk delete results:`, results.map(r => r.value || r.reason?.message));

    res.json({
      success: true,
      results: results.map((r, i) => ({
        publicId: publicIds[i],
        status: r.status,
        result: r.value || r.reason?.message,
      })),
    });
  } catch (err) {
    console.error("❌ Bulk delete error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});
// ── Health check ────────────────────────────────────────────
app.get("/api/health", (_, res) => res.json({ status: "ok" }));

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  setTimeout(() => open("http://localhost:5173"), 3000);
});