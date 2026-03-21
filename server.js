import open from "open";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
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

// ── Fetch all uploaded files ────────────────────────────────
app.get("/api/files", async (req, res) => {
  try {
    const fetchAll = async (resourceType) => {
      let results = [];
      let nextCursor = null;
      do {
        const options = { max_results: 500, context: true, tags: true };
        if (nextCursor) options.next_cursor = nextCursor;
        const response = await cloudinary.api.resources({ ...options, resource_type: resourceType });
        results = results.concat(response.resources);
        nextCursor = response.next_cursor;
      } while (nextCursor);
      return results;
    };

    const [images, raw, videos] = await Promise.all([
      fetchAll("image"),
      fetchAll("raw"),
      fetchAll("video"),
    ]);

    const allFiles = [...images, ...raw, ...videos].map(r => {
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

    // Sort newest first
    allFiles.sort((a, b) => b.date - a.date);
    res.json({ success: true, files: allFiles });
  } catch (err) {
    console.error("❌ Fetch error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Delete single file ──────────────────────────────────────
app.delete("/api/delete", async (req, res) => {
  try {
    const { publicId, resourceType = "image" } = req.query;
    if (!publicId) return res.status(400).json({ success: false, error: "publicId is required" });

    console.log(`🗑️ Deleting: ${publicId} (${resourceType})`);
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
      invalidate: true,
    });
    console.log(`✅ Cloudinary result:`, result);

    if (result.result === "ok" || result.result === "not found") {
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
    console.log(`🗑️ Bulk deleting ${publicIds.length} files`);
    const results = await Promise.allSettled(
      publicIds.map(id =>
        cloudinary.uploader.destroy(id, { resource_type: resourceType, invalidate: true })
      )
    );
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