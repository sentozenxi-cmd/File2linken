import { Router } from "express";
import { db } from "@workspace/db";
import { filesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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
    const typeLabel = getFileTypeLabel(file.fileType, file.mimeType);
    const sizeLabel = formatFileSize(file.fileSize);
    const isVideo = file.mimeType?.startsWith("video/") || file.fileType === "video" || file.fileType === "animation" || file.fileType === "video_note";
    const isAudio = file.isAudio || file.mimeType?.startsWith("audio/") || file.fileType === "audio" || file.fileType === "voice";
    const isImage = file.mimeType?.startsWith("image/") || file.fileType === "photo" || file.fileType === "sticker";

    const subSearchUrl = `https://www.opensubtitles.com/en/search-all/q-${encodeURIComponent(fileLabel || "")}`;
    let mediaPlayer = "";
    if (isVideo) {
      mediaPlayer = `
        <div class="media-container">
          <video id="player" playsinline>
            <source src="${videoStreamUrl}" type="video/mp4">
            <track id="sub-track" kind="subtitles" label="Subtitles" srclang="en">
          </video>
        </div>
        <div id="enjoy-banner" style="display:none;">
          <span class="enjoy-enjoy">Enjoy </span><span class="enjoy-video">the Content</span>
        </div>
        <div class="sub-row">
          <input type="file" id="sub-file" accept=".srt,.vtt" style="display:none;">
          <span class="sub-hint" id="sub-hint">No subtitles</span>
          <button class="sub-load-btn" id="sub-load-btn">📂 Load from disk</button>
          <button class="sub-clear-btn" id="sub-clear-btn" style="display:none;">✕ Clear</button>
          <a class="sub-search-link" href="${subSearchUrl}" target="_blank" rel="noopener">🔍 Find online</a>
        </div>
        <script>
          (function(){
            var plyr = new Plyr('#player', {
              captions: { active: false, language: 'en', update: true },
              settings: ['captions', 'speed'],
              speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 2] },
              keyboard: { focused: true, global: true },
            });

            var banner = document.getElementById('enjoy-banner');
            var played = false;
            plyr.on('playing', function(){
              if(played) return; played = true;
              banner.style.display = 'flex';
              setTimeout(function(){
                banner.style.opacity = '0';
                setTimeout(function(){ banner.style.display = 'none'; }, 600);
              }, 2000);
            });

            // ── Subtitle loader ────────────────────────────────────
            var subFile  = document.getElementById('sub-file');
            var loadBtn  = document.getElementById('sub-load-btn');
            var clearBtn = document.getElementById('sub-clear-btn');
            var hint     = document.getElementById('sub-hint');
            var track    = document.getElementById('sub-track');
            var blobUrl  = null;

            function srtToVtt(srt){
              return 'WEBVTT\\n\\n' + srt
                .replace(/\\r\\n/g,'\\n').replace(/\\r/g,'\\n')
                .replace(/(\\d{2}:\\d{2}:\\d{2}),(\\d{3})/g,'$1.$2')
                .trim();
            }

            loadBtn.addEventListener('click', function(){ subFile.click(); });

            subFile.addEventListener('change', function(){
              var f = this.files[0];
              if(!f) return;
              var reader = new FileReader();
              reader.onload = function(e){
                var text = e.target.result;
                if(!f.name.toLowerCase().endsWith('.vtt')) text = srtToVtt(text);
                if(blobUrl) URL.revokeObjectURL(blobUrl);
                blobUrl = URL.createObjectURL(new Blob([text], {type:'text/vtt'}));
                track.src = blobUrl;
                // Give browser a tick then enable the track
                setTimeout(function(){
                  var tracks = plyr.media.textTracks;
                  for(var i=0;i<tracks.length;i++) tracks[i].mode = 'showing';
                  plyr.currentTrack = 0;
                }, 150);
                hint.textContent = f.name;
                hint.style.color = 'var(--neon)';
                loadBtn.style.display  = 'none';
                clearBtn.style.display = 'inline-flex';
              };
              reader.readAsText(f, 'UTF-8');
              this.value = '';
            });

            clearBtn.addEventListener('click', function(){
              if(blobUrl){ URL.revokeObjectURL(blobUrl); blobUrl = null; }
              track.src = '';
              var tracks = plyr.media.textTracks;
              for(var i=0;i<tracks.length;i++) tracks[i].mode = 'disabled';
              plyr.currentTrack = -1;
              hint.textContent = 'No subtitles';
              hint.style.color = '';
              clearBtn.style.display = 'none';
              loadBtn.style.display  = 'inline-flex';
            });
          })();
        </script>`;
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
  <link rel="stylesheet" href="https://cdn.plyr.io/3.7.8/plyr.css">
  <script src="https://cdn.plyr.io/3.7.8/plyr.polyfilled.js"></script>
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
    #enjoy-banner {
      padding: 14px 0 4px; display: flex; align-items: center; justify-content: center;
      font-family: 'Manrope',sans-serif; font-size: 1.5rem; letter-spacing: .4px;
      transition: opacity .6s ease;
    }
    .enjoy-enjoy { color: #fff; font-weight: 700; }
    .enjoy-video { color: var(--neon); font-weight: 800; }
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
    /* Plyr theme overrides */
    :root {
      --plyr-color-main: #00ff6a;
      --plyr-video-background: #000;
      --plyr-range-fill-background: #00ff6a;
      --plyr-video-control-color: #fff;
      --plyr-video-control-color-hover: #001406;
      --plyr-video-control-background-hover: #00ff6a;
      --plyr-menu-background: rgba(8,16,10,.97);
      --plyr-menu-color: #effff3;
      --plyr-menu-border-color: rgba(0,255,106,.2);
    }
    .plyr--video { border-radius: 20px; overflow: hidden; }
    .plyr__captions { font-family: 'Manrope',sans-serif; font-weight: 700; }
    /* Subtitle row */
    .sub-row {
      display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
      margin: 6px 0 16px;
    }
    .sub-hint {
      font-family: 'Manrope',sans-serif; font-size: .78rem; font-weight: 600;
      color: var(--muted); flex: 1; min-width: 0;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      transition: color .2s;
    }
    .sub-load-btn, .sub-clear-btn {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 5px 13px; border-radius: 999px; cursor: pointer;
      font-family: 'Manrope',sans-serif; font-size: .76rem; font-weight: 700;
      transition: all .15s; white-space: nowrap;
    }
    .sub-load-btn {
      background: transparent; border: 1px solid rgba(0,255,106,.3); color: var(--muted);
    }
    .sub-load-btn:hover { border-color: var(--neon); color: var(--neon); background: rgba(0,255,106,.06); }
    .sub-clear-btn {
      background: rgba(255,107,107,.1); border: 1px solid rgba(255,107,107,.3); color: #ff6b6b;
    }
    .sub-clear-btn:hover { background: rgba(255,107,107,.2); border-color: #ff6b6b; }
    .sub-search-link {
      font-family: 'Manrope',sans-serif; font-size: .76rem; font-weight: 700;
      color: var(--muted); text-decoration: none; white-space: nowrap;
      transition: color .15s;
    }
    .sub-search-link:hover { color: var(--neon); }
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
  </div>
  <div class="watermark">
    <a href="https://t.me/takezo_5" target="_blank" rel="noopener noreferrer">tak<span>ezo_5</span></a>
  </div>
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
