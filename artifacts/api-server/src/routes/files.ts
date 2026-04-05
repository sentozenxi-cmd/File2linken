import { Router } from "express";
import { db } from "@workspace/db";
import { filesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { streamTelegramFile } from "../lib/telegramStream.js";
import { formatFileSize, getFileTypeLabel } from "../lib/fileUtils.js";

const router = Router();

router.get("/download/:id", async (req, res) => {
  try {
    const rows = await db.select().from(filesTable).where(eq(filesTable.id, req.params.id!)).limit(1);
    if (rows.length === 0) {
      res.status(404).send("File not found");
      return;
    }
    const file = rows[0]!;
    await db.update(filesTable)
      .set({ accessCount: (file.accessCount || 0) + 1 })
      .where(eq(filesTable.id, file.id));

    await streamTelegramFile(req, res, file.fileId, file.mimeType, file.fileName, file.fileSize, true);
  } catch (err) {
    req.log.error({ err }, "Download error");
    res.status(500).send("Server error");
  }
});

router.get("/stream/:id", async (req, res) => {
  try {
    const rows = await db.select().from(filesTable).where(eq(filesTable.id, req.params.id!)).limit(1);
    if (rows.length === 0) {
      res.status(404).send("File not found");
      return;
    }
    const file = rows[0]!;
    await streamTelegramFile(req, res, file.fileId, file.mimeType, file.fileName, file.fileSize, false);
  } catch (err) {
    req.log.error({ err }, "Stream error");
    res.status(500).send("Server error");
  }
});

router.get("/stream-page/:id", async (req, res) => {
  try {
    const rows = await db.select().from(filesTable).where(eq(filesTable.id, req.params.id!)).limit(1);
    if (rows.length === 0) {
      res.status(404).send("File not found");
      return;
    }
    const file = rows[0]!;
    const baseUrl = req.protocol + "://" + req.get("host");
    const streamUrl = `/api/stream/${file.id}`;
    const downloadUrl = `/api/download/${file.id}`;
    const fileLabel = file.fileName || "Untitled File";
    const typeLabel = getFileTypeLabel(file.fileType, file.mimeType);
    const sizeLabel = formatFileSize(file.fileSize);
    const isVideo = file.mimeType?.startsWith("video/") || file.fileType === "video" || file.fileType === "animation" || file.fileType === "video_note";
    const isAudio = file.isAudio || file.mimeType?.startsWith("audio/") || file.fileType === "audio" || file.fileType === "voice";
    const isImage = file.mimeType?.startsWith("image/") || file.fileType === "photo" || file.fileType === "sticker";

    let mediaPlayer = "";
    if (isVideo) {
      mediaPlayer = `
        <div class="media-container">
          <video id="player" controls preload="metadata" controlsList="nodownload">
            <source src="${streamUrl}" type="${file.mimeType || "video/mp4"}">
            Your browser does not support video playback.
          </video>
        </div>`;
    } else if (isAudio) {
      mediaPlayer = `
        <div class="media-container audio-container">
          <div class="audio-icon">🎵</div>
          <audio id="player" controls preload="metadata">
            <source src="${streamUrl}" type="${file.mimeType || "audio/mpeg"}">
            Your browser does not support audio playback.
          </audio>
        </div>`;
    } else if (isImage) {
      mediaPlayer = `
        <div class="media-container image-container">
          <img src="${streamUrl}" alt="${fileLabel}" loading="lazy" />
        </div>`;
    } else {
      mediaPlayer = `
        <div class="media-container no-preview">
          <div class="no-preview-icon">📄</div>
          <p>No preview available for this file type.</p>
          <p>Use the download button below.</p>
        </div>`;
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${fileLabel} — File2Link BOT</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Rajdhani:wght@400;600;700&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --neon: #00ff41;
      --neon-dim: #00cc33;
      --neon-glow: rgba(0, 255, 65, 0.5);
      --neon-faint: rgba(0, 255, 65, 0.07);
      --bg: #010a01;
      --surface: #0a140a;
      --border: #003310;
      --text: #c8ffd4;
      --text-dim: #5a8a62;
    }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'Rajdhani', sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 0 16px 40px;
    }

    /* Scan line overlay */
    body::before {
      content: '';
      position: fixed;
      inset: 0;
      background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,65,0.015) 2px, rgba(0,255,65,0.015) 4px);
      pointer-events: none;
      z-index: 999;
    }

    header {
      width: 100%;
      max-width: 860px;
      padding: 24px 0 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--border);
      margin-bottom: 32px;
    }

    .logo {
      font-family: 'Share Tech Mono', monospace;
      font-size: 1.3rem;
      color: var(--neon);
      text-shadow: 0 0 10px var(--neon-glow);
      letter-spacing: 2px;
      text-decoration: none;
    }

    .logo span { color: #fff; }

    .header-tag {
      font-family: 'Share Tech Mono', monospace;
      font-size: 0.7rem;
      color: var(--neon-dim);
      border: 1px solid var(--border);
      padding: 4px 10px;
      letter-spacing: 1px;
    }

    .card {
      width: 100%;
      max-width: 860px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-top: 2px solid var(--neon-dim);
      padding: 28px;
      position: relative;
    }

    .card::before {
      content: '';
      position: absolute;
      inset: 0;
      background: radial-gradient(ellipse at top, rgba(0,255,65,0.04) 0%, transparent 70%);
      pointer-events: none;
    }

    .file-meta {
      margin-bottom: 24px;
    }

    .file-name {
      font-size: 1.5rem;
      font-weight: 700;
      color: #fff;
      word-break: break-all;
      line-height: 1.3;
      margin-bottom: 10px;
    }

    .file-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .tag {
      font-family: 'Share Tech Mono', monospace;
      font-size: 0.72rem;
      padding: 3px 10px;
      border: 1px solid var(--border);
      color: var(--neon-dim);
      letter-spacing: 1px;
    }

    .tag.highlight {
      border-color: var(--neon-dim);
      color: var(--neon);
      background: rgba(0,255,65,0.05);
    }

    .media-container {
      width: 100%;
      margin: 20px 0;
      background: #000;
      border: 1px solid var(--border);
      position: relative;
    }

    .media-container video,
    .media-container audio {
      width: 100%;
      display: block;
      outline: none;
    }

    .audio-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 32px 24px;
      gap: 20px;
      background: #000;
    }

    .audio-icon {
      font-size: 4rem;
      filter: drop-shadow(0 0 12px var(--neon-glow));
    }

    .audio-container audio {
      width: 100%;
    }

    .image-container {
      display: flex;
      justify-content: center;
      padding: 12px;
    }

    .image-container img {
      max-width: 100%;
      max-height: 600px;
      object-fit: contain;
    }

    .no-preview {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px 24px;
      gap: 12px;
      color: var(--text-dim);
      text-align: center;
    }

    .no-preview-icon { font-size: 3.5rem; }

    .actions {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin-top: 20px;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 12px 24px;
      font-family: 'Share Tech Mono', monospace;
      font-size: 0.9rem;
      letter-spacing: 1px;
      text-decoration: none;
      cursor: pointer;
      border: none;
      transition: all 0.15s;
    }

    .btn-primary {
      background: var(--neon);
      color: #000;
      font-weight: bold;
    }

    .btn-primary:hover {
      background: #fff;
      box-shadow: 0 0 20px var(--neon-glow);
    }

    .btn-outline {
      background: transparent;
      border: 1px solid var(--neon-dim);
      color: var(--neon);
    }

    .btn-outline:hover {
      background: var(--neon-faint);
      box-shadow: 0 0 14px var(--neon-glow);
    }

    footer {
      margin-top: 40px;
      font-family: 'Share Tech Mono', monospace;
      font-size: 0.7rem;
      color: var(--text-dim);
      letter-spacing: 1px;
      text-align: center;
    }

    footer a { color: var(--neon-dim); text-decoration: none; }
    footer a:hover { color: var(--neon); }

    /* Custom video controls glow */
    video::-webkit-media-controls-panel { background: #001a00; }

    @media (max-width: 600px) {
      .file-name { font-size: 1.15rem; }
      .actions { flex-direction: column; }
      .btn { justify-content: center; }
    }
  </style>
</head>
<body>
  <header>
    <a class="logo" href="#">File2Link<span>BOT</span></a>
    <div class="header-tag">[ STREAM PORTAL ]</div>
  </header>

  <div class="card">
    <div class="file-meta">
      <div class="file-name">${escHtml(fileLabel)}</div>
      <div class="file-tags">
        <span class="tag highlight">${escHtml(typeLabel)}</span>
        ${file.mimeType ? `<span class="tag">${escHtml(file.mimeType)}</span>` : ""}
        ${file.fileSize ? `<span class="tag">${escHtml(sizeLabel)}</span>` : ""}
        ${file.duration ? `<span class="tag">${formatDuration(file.duration)}</span>` : ""}
        ${(file.width && file.height) ? `<span class="tag">${file.width}×${file.height}</span>` : ""}
      </div>
    </div>

    ${mediaPlayer}

    <div class="actions">
      <a class="btn btn-primary" href="${downloadUrl}" download="${escHtml(fileLabel)}">
        ⬇ DOWNLOAD FILE
      </a>
      ${(isVideo || isAudio || isImage) ? `
      <a class="btn btn-outline" href="${streamUrl}" target="_blank">
        ▶ DIRECT LINK
      </a>` : ""}
    </div>
  </div>

  <footer>
    <p>Powered by <a href="#">File2Link BOT</a> &nbsp;|&nbsp; Fast CDN streaming</p>
  </footer>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=60");
    res.send(html);
  } catch (err) {
    req.log.error({ err }, "Stream page error");
    res.status(500).send("Server error");
  }
});

router.get("/file-info/:id", async (req, res) => {
  try {
    const rows = await db.select().from(filesTable).where(eq(filesTable.id, req.params.id!)).limit(1);
    if (rows.length === 0) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    const file = rows[0]!;
    res.json({
      id: file.id,
      fileName: file.fileName,
      mimeType: file.mimeType,
      fileSize: file.fileSize,
      fileType: file.fileType,
      isStreamable: file.isStreamable,
      isAudio: file.isAudio,
      duration: file.duration,
      width: file.width,
      height: file.height,
      createdAt: file.createdAt,
      accessCount: file.accessCount,
    });
  } catch (err) {
    req.log.error({ err }, "File info error");
    res.status(500).json({ error: "Server error" });
  }
});

function escHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default router;
