import { Router } from "express";
import { db } from "@workspace/db";
import { filesTable, broadcastsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { streamTelegramFile } from "../lib/telegramStream.js";
import { streamVideoFast } from "../lib/ffmpegStream.js";
import { getProgress } from "../lib/videoCache.js";
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
    await db.update(filesTable).set({ accessCount: (file.accessCount || 0) + 1 }).where(eq(filesTable.id, file.id));
    await streamTelegramFile(req, res, file.chatId, file.messageId, file.mimeType, file.fileName, file.fileSize, true);
  } catch (err) {
    req.log.error({ err }, "Download error");
    if (!res.headersSent) res.status(500).send("Server error");
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
    await db.update(filesTable).set({ accessCount: (file.accessCount || 0) + 1 }).where(eq(filesTable.id, file.id));
    await streamTelegramFile(req, res, file.chatId, file.messageId, file.mimeType, file.fileName, file.fileSize, false);
  } catch (err) {
    req.log.error({ err }, "Stream error");
    if (!res.headersSent) res.status(500).send("Server error");
  }
});

// Fast video streaming — remuxes through ffmpeg to fragmented MP4 so the
// browser can start playing without waiting for the moov atom at the end
router.get("/stream-video/:id", async (req, res) => {
  try {
    const rows = await db.select().from(filesTable).where(eq(filesTable.id, req.params.id!)).limit(1);
    if (rows.length === 0) {
      res.status(404).send("File not found");
      return;
    }
    const file = rows[0]!;
    await streamVideoFast(req, res, file.id, file.chatId, file.messageId, file.mimeType, file.fileName, file.fileSize);
  } catch (err) {
    req.log.error({ err }, "Stream-video error");
    if (!res.headersSent) res.status(500).send("Server error");
  }
});

// Progress polling for the loading bar
router.get("/video-progress/:id", (req, res) => {
  const { progress, status } = getProgress(req.params.id!);
  res.json({ progress, status });
});

router.get("/stream-page/:id", async (req, res) => {
  try {
    const rows = await db.select().from(filesTable).where(eq(filesTable.id, req.params.id!)).limit(1);
    if (rows.length === 0) {
      res.status(404).send("File not found");
      return;
    }
    const file = rows[0]!;
    const streamUrl = `/api/stream/${file.id}`;
    const videoStreamUrl = `/api/stream-video/${file.id}`;
    const downloadUrl = `/api/download/${file.id}`;
    const fileLabel = file.fileName || "Untitled File";

    const broadcasts = await db
      .select()
      .from(broadcastsTable)
      .where(eq(broadcastsTable.type, "text"))
      .orderBy(desc(broadcastsTable.createdAt))
      .limit(10);
    broadcasts.reverse();
    const noticesInitial = JSON.stringify(broadcasts.map(b => ({
      id: b.id,
      content: b.content,
      createdAt: b.createdAt instanceof Date ? b.createdAt.toISOString() : String(b.createdAt),
    })));
    const typeLabel = getFileTypeLabel(file.fileType, file.mimeType);
    const sizeLabel = formatFileSize(file.fileSize);
    const isVideo = file.mimeType?.startsWith("video/") || file.fileType === "video" || file.fileType === "animation" || file.fileType === "video_note";
    const isAudio = file.isAudio || file.mimeType?.startsWith("audio/") || file.fileType === "audio" || file.fileType === "voice";
    const isImage = file.mimeType?.startsWith("image/") || file.fileType === "photo" || file.fileType === "sticker";

    let mediaPlayer = "";
    if (isVideo) {
      mediaPlayer = `
        <div class="media-container">
          <video controls playsinline preload="metadata" style="width:100%;display:block;border-radius:20px;background:#000;">
            <source src="${videoStreamUrl}" type="video/mp4">
          </video>
        </div>`;
    } else if (isAudio) {
      const unsupportedAudio = ["audio/ac3", "audio/eac3", "audio/x-ac3", "audio/truehd", "audio/dts", "audio/x-dts"];
      const canPlayInBrowser = !unsupportedAudio.includes(file.mimeType || "");
      mediaPlayer = canPlayInBrowser
        ? `<div class="media-container audio-container">
            <div class="audio-icon">🎵</div>
            <audio id="player" controls preload="metadata" style="width:100%;">
              <source src="${streamUrl}" type="${file.mimeType || "audio/mpeg"}">
              Your browser does not support audio playback.
            </audio>
          </div>`
        : `<div class="media-container no-preview">
            <div class="no-preview-icon">🔊</div>
            <p style="color:var(--muted);font-size:.9rem;margin-bottom:6px;">This audio format (<code>${escHtml(file.mimeType || "unknown")}</code>) cannot play directly in the browser.</p>
            <p style="color:var(--muted);font-size:.85rem;">Use the Download button below to play it in a media player like VLC.</p>
          </div>`;
    } else if (isImage) {
      mediaPlayer = `
        <div class="media-container image-container">
          <img src="${streamUrl}" alt="${escHtml(fileLabel)}" loading="lazy" />
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
  <title>${escHtml(fileLabel)} — File2Link BOT</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Manrope:wght@400;500;700;800&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --neon: #00ff6a;
      --neon-2: #b7ff00;
      --glow: rgba(0, 255, 106, 0.35);
      --bg: #030403;
      --border: rgba(0, 255, 106, 0.18);
      --text: #effff3;
      --muted: #9ac8a4;
    }
    body {
      min-height: 100vh;
      color: var(--text);
      font-family: 'Inter', sans-serif;
      background:
        radial-gradient(circle at top, rgba(0,255,106,.2), transparent 34%),
        radial-gradient(circle at bottom right, rgba(183,255,0,.08), transparent 24%),
        linear-gradient(135deg, #010201 0%, #07100a 42%, #020202 100%);
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 0 16px 40px;
    }
    body::before {
      content: '';
      position: fixed;
      inset: 0;
      background:
        linear-gradient(120deg, rgba(0,255,106,0.05), transparent 36%),
        repeating-linear-gradient(180deg, transparent 0 4px, rgba(255,255,255,0.015) 4px 8px);
      pointer-events: none;
    }
    header, .card, footer { position: relative; z-index: 1; }
    header {
      width: 100%; max-width: 940px; padding: 24px 0 18px;
      display: flex; justify-content: space-between; align-items: center;
      border-bottom: 1px solid var(--border); margin-bottom: 26px;
    }
    .logo {
      font-family: 'Manrope', sans-serif; font-weight: 800; font-size: 1.2rem;
      letter-spacing: 1.6px; color: #fff; text-decoration: none;
      text-shadow: 0 0 18px var(--glow);
    }
    .logo span { color: var(--neon); }
    .card {
      width: 100%; max-width: 940px; padding: 30px;
      background: linear-gradient(180deg, rgba(8,16,10,.95), rgba(3,5,4,.92));
      border: 1px solid rgba(0,255,106,.16);
      border-radius: 28px;
      box-shadow: 0 0 0 1px rgba(255,255,255,.02), 0 24px 80px rgba(0,0,0,.55), 0 0 50px rgba(0,255,106,.12);
      backdrop-filter: blur(18px);
    }
    .meta { margin-bottom: 24px; }
    .file-name {
      font-family: 'Manrope', sans-serif; font-size: 1.55rem; font-weight: 800;
      color: #fff; line-height: 1.2; word-break: break-word; margin-bottom: 12px;
    }
    .tags { display: flex; flex-wrap: wrap; gap: 10px; }
    .tag {
      font-size: .76rem; letter-spacing: 1px; color: var(--muted);
      border: 1px solid rgba(0,255,106,.18); background: rgba(0,0,0,.28);
      padding: 6px 10px; border-radius: 999px;
    }
    .tag.hot { color: #001406; background: linear-gradient(135deg, var(--neon), var(--neon-2)); border-color: transparent; }
    .media-container { margin: 22px 0; border-radius: 22px; overflow: hidden; border: 1px solid rgba(0,255,106,.14); background: #000; position: relative; }
    .bot-cta {
      display: flex; align-items: center; gap: 10px;
      margin-top: 22px; padding: 14px 20px;
      background: rgba(0,255,106,.06);
      border: 1px solid rgba(0,255,106,.22);
      border-radius: 14px;
      text-decoration: none;
      color: var(--muted);
      font-family: 'Manrope',sans-serif; font-size: .88rem; font-weight: 600;
      letter-spacing: .3px;
      transition: background .2s, border-color .2s, color .2s;
    }
    .bot-cta:hover {
      background: rgba(0,255,106,.13);
      border-color: var(--neon);
      color: #fff;
    }
    .bot-cta-icon { font-size: 1.2rem; flex-shrink: 0; }
    video::-webkit-media-controls { color-scheme: dark; }
    .notices {
      margin-top: 16px; display: flex; flex-direction: column; gap: 8px;
    }
    .notice-item {
      padding: 12px 18px; border-radius: 14px;
      background: rgba(0,255,106,.06); border: 1px solid rgba(0,255,106,.25);
      font-family: 'Manrope',sans-serif; font-size: .97rem; font-weight: 600;
      color: var(--neon); line-height: 1.6; word-break: break-word; white-space: pre-wrap;
      animation: noticeIn .35s ease;
    }
    @keyframes noticeIn {
      from { opacity: 0; transform: translateY(-8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .bot-cta-btn {
      flex-shrink: 0;
      padding: 5px 13px;
      background: var(--neon);
      color: #001406;
      font-family: 'Manrope',sans-serif; font-weight: 800; font-size: .75rem;
      border-radius: 999px; letter-spacing: .4px;
      white-space: nowrap;
    }
    video, audio { width: 100%; display: block; }
    .audio-container { padding: 28px; display: grid; place-items: center; gap: 18px; background: linear-gradient(180deg, rgba(2,8,3,.95), rgba(0,0,0,.95)); }
    .audio-icon { font-size: 3.6rem; filter: drop-shadow(0 0 18px var(--glow)); }
    .audio-container audio { width: 100%; }
    .image-container { padding: 10px; display: flex; justify-content: center; }
    .image-container img { max-width: 100%; max-height: 700px; object-fit: contain; }
    .no-preview { padding: 54px 20px; text-align: center; color: var(--muted); display: flex; flex-direction: column; align-items: center; gap: 12px; }
    .no-preview-icon { font-size: 3.5rem; }
    .actions { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 20px; }
    .btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 10px;
      padding: 14px 22px; border-radius: 16px; text-decoration: none;
      font-family: 'Manrope', sans-serif; font-weight: 800; letter-spacing: .8px;
      border: 1px solid transparent; transition: transform .15s ease, box-shadow .15s ease;
    }
    .btn:hover { transform: translateY(-1px); }
    .btn-primary {
      color: #001406;
      background: linear-gradient(135deg, var(--neon), var(--neon-2));
      box-shadow: 0 0 0 1px rgba(255,255,255,.05), 0 0 26px rgba(0,255,106,.22);
    }
    .btn-primary:hover { box-shadow: 0 0 34px rgba(0,255,106,.38); }
    footer { margin-top: 28px; color: var(--muted); font-size: .76rem; letter-spacing: 1.2px; }
    .watermark {
      margin-top: 36px; margin-bottom: 10px;
      display: flex; justify-content: center;
    }
    .watermark a {
      font-family: 'Manrope', sans-serif; font-size: 1.15rem; font-weight: 800;
      letter-spacing: 1px; text-decoration: none;
      color: #fff; text-shadow: 0 0 18px var(--glow);
      transition: opacity .2s;
    }
    .watermark a:hover { opacity: .78; }
    .watermark a span { color: var(--neon); }
    @media (max-width: 640px) {
      .card { padding: 20px; border-radius: 22px; }
      .file-name { font-size: 1.18rem; }
      .actions { flex-direction: column; }
      .btn { width: 100%; }
    }
  </style>
</head>
<body>
  <header>
    <div class="logo">File2Link<span>BOT</span></div>
  </header>
  <div class="card">
    <div class="meta">
      <div class="file-name">${escHtml(fileLabel)}</div>
      <div class="tags">
        <span class="tag hot">${escHtml(typeLabel)}</span>
        ${file.mimeType ? `<span class="tag">${escHtml(file.mimeType)}</span>` : ""}
        ${file.fileSize ? `<span class="tag">${escHtml(sizeLabel)}</span>` : ""}
        ${file.duration ? `<span class="tag">${formatDuration(file.duration)}</span>` : ""}
        ${(file.width && file.height) ? `<span class="tag">${file.width}×${file.height}</span>` : ""}
      </div>
    </div>
    ${mediaPlayer}
    <div class="actions">
      <a class="btn btn-primary" href="${downloadUrl}" download="${escHtml(fileLabel)}">⬇️ Download</a>
    </div>
    <a class="bot-cta" href="https://t.me/filetolink_05bot" target="_blank" rel="noopener noreferrer">
      <span class="bot-cta-icon">⚡</span>
      <span style="flex:1;">Convert Telegram files into instant download &amp; streaming links</span>
      <span class="bot-cta-btn">Open Bot</span>
    </a>
    <div id="notices" class="notices"></div>
  </div>
  <div class="watermark">
    <a href="https://t.me/takezo_5" target="_blank" rel="noopener noreferrer">tak<span>ezo_5</span></a>
  </div>
  <script>
    (function () {
      var noticesEl = document.getElementById('notices');
      var seenIds = new Set();

      function escHtml(s) {
        return String(s)
          .replace(/&/g, '&amp;').replace(/</g, '&lt;')
          .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      }

      function addNotice(b) {
        if (seenIds.has(b.id)) return;
        seenIds.add(b.id);
        var el = document.createElement('div');
        el.className = 'notice-item';
        el.dataset.id = b.id;
        el.textContent = b.content || '';
        noticesEl.appendChild(el);
      }

      function removeNotice(id) {
        var el = noticesEl.querySelector('[data-id="' + id + '"]');
        if (el) el.remove();
        seenIds.delete(id);
      }

      var initial = ${noticesInitial};
      initial.forEach(addNotice);

      function connectSse() {
        var es = new EventSource('/api/broadcasts/sse');
        es.onmessage = function (e) {
          try {
            var b = JSON.parse(e.data);
            if (b.type === 'text') addNotice(b);
            else if (b.type === 'delete') removeNotice(b.id);
          } catch (_) {}
        };
        es.onerror = function () {
          es.close();
          setTimeout(connectSse, 4000);
        };
      }
      connectSse();
    })();
  </script>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.send(html);
  } catch (err) {
    req.log.error({ err }, "Stream page error");
    if (!res.headersSent) res.status(500).send("Server error");
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
