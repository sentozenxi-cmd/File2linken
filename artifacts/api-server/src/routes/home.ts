import { Router } from "express";

const router = Router();

router.get("/", (req, res) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>File2Link BOT</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Manrope:wght@400;500;700;800&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --neon: #00ff6a;
      --neon-2: #b7ff00;
      --glow: rgba(0, 255, 106, 0.35);
      --bg: #030403;
      --panel: rgba(8, 16, 10, 0.9);
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
      overflow-x: hidden;
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
    header, .card, .live-feed, footer { position: relative; z-index: 1; }
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
    .chip {
      font-size: .72rem; letter-spacing: 2px; color: var(--neon);
      border: 1px solid var(--border); padding: 6px 10px; border-radius: 999px;
      background: rgba(0,255,106,.06);
    }
    .hero {
      width: 100%; max-width: 940px; padding: 52px 0 28px; text-align: center;
    }
    .hero-badge {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 8px 14px; border-radius: 999px; border: 1px solid rgba(0,255,106,.2);
      background: rgba(0,0,0,.25); color: var(--neon); font-size: .72rem; letter-spacing: 2px;
      box-shadow: 0 0 30px rgba(0,255,106,.08);
    }
    .hero h1 {
      margin-top: 18px; font-family: 'Manrope', sans-serif; font-size: clamp(2.8rem, 7vw, 5.5rem);
      line-height: .95; letter-spacing: -1px; color: #fff;
      text-shadow: 0 0 28px rgba(0,255,106,.18);
    }
    .hero h1 span {
      color: var(--neon);
      text-shadow: 0 0 18px rgba(0,255,106,.45), 0 0 34px rgba(183,255,0,.18);
    }
    .hero-sub { margin-top: 12px; color: var(--muted); letter-spacing: 2px; }
    .hero-desc {
      max-width: 640px; margin: 24px auto 0; color: var(--muted); line-height: 1.7; font-size: 1.03rem;
    }
    .cta-row { margin-top: 30px; display: flex; justify-content: center; gap: 14px; flex-wrap: wrap; }
    .cta-btn {
      display: inline-flex; align-items: center; gap: 10px; padding: 15px 28px; border-radius: 16px;
      font-family: 'Manrope', sans-serif; font-weight: 800; text-decoration: none; letter-spacing: .8px;
      color: #001406; background: linear-gradient(135deg, var(--neon), var(--neon-2));
      box-shadow: 0 0 0 1px rgba(255,255,255,.05), 0 0 28px rgba(0,255,106,.18);
    }
    .cta-btn.secondary {
      color: #e8fff0; background: rgba(255,255,255,.04); border: 1px solid rgba(0,255,106,.16);
    }
    /* Live Feed */
    .live-feed {
      width: 100%; max-width: 940px; margin-top: 32px;
    }
    .live-feed-header {
      display: flex; align-items: center; gap: 12px; margin-bottom: 14px;
    }
    .live-dot {
      width: 9px; height: 9px; border-radius: 50%;
      background: var(--neon); box-shadow: 0 0 10px var(--neon);
      animation: pulse 1.6s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: .45; transform: scale(.8); }
    }
    .live-feed-title {
      font-family: 'Manrope', sans-serif; font-weight: 800; font-size: 1rem;
      letter-spacing: 1.4px; color: #fff;
    }
    .live-feed-sub { font-size: .76rem; color: var(--muted); letter-spacing: 1px; }
    #feed-list { display: flex; flex-direction: column; gap: 10px; }
    .feed-empty {
      padding: 28px 20px; text-align: center;
      border: 1px dashed rgba(0,255,106,.18); border-radius: 18px;
      color: var(--muted); font-size: .9rem;
    }
    .feed-item {
      background: linear-gradient(180deg, rgba(8,16,10,.95), rgba(3,5,4,.92));
      border: 1px solid rgba(0,255,106,.14); border-radius: 18px;
      padding: 16px 20px;
      animation: slideIn .35s ease;
    }
    @keyframes slideIn {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .feed-item.text-item .feed-content {
      font-family: 'Manrope', sans-serif; font-size: 1rem; font-weight: 600;
      color: var(--neon);
      line-height: 1.6; white-space: pre-wrap; word-break: break-word;
    }
    .feed-item.file-item .feed-file-name {
      font-family: 'Manrope', sans-serif; font-weight: 700; font-size: .95rem;
      color: #fff; margin-bottom: 8px; word-break: break-word;
    }
    .feed-meta {
      font-size: .72rem; color: var(--muted); margin-top: 8px; letter-spacing: .5px;
    }
    .feed-actions { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
    .feed-btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 6px 14px; border-radius: 999px; text-decoration: none;
      font-family: 'Manrope', sans-serif; font-size: .76rem; font-weight: 700;
      border: 1px solid rgba(0,255,106,.28); color: var(--muted);
      transition: all .15s;
    }
    .feed-btn:hover { border-color: var(--neon); color: var(--neon); background: rgba(0,255,106,.06); }
    .feed-btn.primary {
      background: linear-gradient(135deg, var(--neon), var(--neon-2));
      color: #001406; border-color: transparent;
    }
    .feed-btn.primary:hover { opacity: .88; color: #001406; }
    .feed-tag {
      display: inline-block; font-size: .66rem; letter-spacing: 1.2px;
      padding: 3px 9px; border-radius: 999px;
      border: 1px solid rgba(0,255,106,.2); color: var(--muted);
      background: rgba(0,0,0,.25); margin-right: 6px;
    }
    /* Main card */
    .card {
      width: 100%; max-width: 940px; margin-top: 30px;
      background: linear-gradient(180deg, rgba(8,16,10,.92), rgba(3,5,4,.9));
      border: 1px solid rgba(0,255,106,.14); border-radius: 28px; padding: 24px;
      box-shadow: 0 20px 80px rgba(0,0,0,.5), 0 0 40px rgba(0,255,106,.08);
      backdrop-filter: blur(18px);
    }
    .terminal {
      background: rgba(0,0,0,.55); border: 1px solid rgba(0,255,106,.14); border-radius: 22px; padding: 18px 20px;
      font-family: 'Manrope', sans-serif; color: #d9ffe2;
    }
    .terminal-bar { display: flex; gap: 8px; align-items: center; margin-bottom: 16px; }
    .dot { width: 10px; height: 10px; border-radius: 50%; }
    .dot-r { background: #ff5b5b; } .dot-y { background: #ffd24d; } .dot-g { background: var(--neon); box-shadow: 0 0 10px rgba(0,255,106,.4); }
    .terminal-title { margin-left: auto; font-size: .7rem; letter-spacing: 1.8px; color: var(--muted); }
    .t-line { display: flex; gap: 10px; margin: 8px 0; flex-wrap: wrap; }
    .t-prompt { color: var(--neon); }
    .t-cmd { color: #fff; }
    .t-out { color: var(--muted); }
    .sections { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; margin-top: 22px; }
    .section {
      padding: 20px; border-radius: 22px; background: rgba(255,255,255,.03);
      border: 1px solid rgba(0,255,106,.12);
    }
    .section h3 { font-family: 'Manrope', sans-serif; font-size: 1.02rem; margin-bottom: 8px; }
    .section p { color: var(--muted); line-height: 1.6; font-size: .94rem; }
    footer { margin-top: 28px; color: var(--muted); font-size: .76rem; letter-spacing: 1.2px; }
    @media (max-width: 640px) {
      .card { padding: 18px; border-radius: 22px; }
      .cta-row { flex-direction: column; }
      .cta-btn { width: 100%; justify-content: center; }
    }
  </style>
</head>
<body>
  <header>
    <a class="logo" href="#">File2Link<span>BOT</span></a>
    <div class="chip">NEON STREAMING</div>
  </header>
  <section class="hero">
    <div class="hero-badge">💚 LIVE · FAST · PRIVATE</div>
    <h1>File2Link<br><span>BOT</span></h1>
    <div class="hero-sub">Telegram file links with premium browser playback</div>
    <p class="hero-desc">Forward a file and get a polished download page plus a smooth stream page for video and audio — built for fast access, elegant viewing, and easy sharing.</p>
    <div class="cta-row">
      <a class="cta-btn" href="https://t.me/filetolink_05bot" target="_blank">💌 OPEN BOT</a>
      <a class="cta-btn secondary" href="#features">✨ SEE FEATURES</a>
    </div>
  </section>

  <!-- Live Feed Section -->
  <div class="live-feed">
    <div class="live-feed-header">
      <div class="live-dot"></div>
      <div>
        <div class="live-feed-title">LIVE FROM TELEGRAM</div>
        <div class="live-feed-sub">Messages and files pushed in real-time</div>
      </div>
    </div>
    <div id="feed-list">
      <div class="feed-empty">No messages yet — waiting for broadcast...</div>
    </div>
  </div>

  <div class="card" id="features">
    <div class="terminal">
      <div class="terminal-bar"><div class="dot dot-r"></div><div class="dot dot-y"></div><div class="dot dot-g"></div><div class="terminal-title">FILE2LINK SESSION</div></div>
      <div class="t-line"><span class="t-prompt">›</span><span class="t-cmd">forwarded: concert.mp4</span></div>
      <div class="t-line"><span class="t-out">⬇ download link created</span></div>
      <div class="t-line"><span class="t-out">💚 stream page ready for browser playback</span></div>
      <div class="t-line"><span class="t-out">🎧 audio files get instant play support too</span></div>
    </div>
    <div class="sections">
      <div class="section"><h3>💌 Loving Buttons</h3><p>Warm emoji buttons and polished interactions make the bot feel friendlier and more premium.</p></div>
      <div class="section"><h3>⚡ Fast Delivery</h3><p>Files stream with caching and range support for quick loading and smooth seeking.</p></div>
      <div class="section"><h3>🎬 Media Ready</h3><p>Video, audio, images, and documents get the right browser experience automatically.</p></div>
    </div>
  </div>
  <footer>File2Link BOT · Fast Telegram CDN Streaming</footer>

  <script>
    (function () {
      var list = document.getElementById('feed-list');
      var items = [];

      function escHtml(s) {
        return String(s)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      }

      function timeAgo(iso) {
        var diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
        if (diff < 5) return 'just now';
        if (diff < 60) return diff + 's ago';
        if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
        if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
        return Math.floor(diff / 86400) + 'd ago';
      }

      function fileTypeLabel(ft, mt) {
        if (!ft && !mt) return 'FILE';
        if (ft === 'video' || ft === 'animation' || ft === 'video_note') return 'VIDEO';
        if (ft === 'audio' || ft === 'voice') return 'AUDIO';
        if (ft === 'photo') return 'IMAGE';
        if (mt && mt.startsWith('video/')) return 'VIDEO';
        if (mt && mt.startsWith('audio/')) return 'AUDIO';
        if (mt && mt.startsWith('image/')) return 'IMAGE';
        return 'FILE';
      }

      function renderItem(b) {
        var el = document.createElement('div');
        if (b.type === 'text') {
          el.className = 'feed-item text-item';
          el.innerHTML =
            '<div class="feed-content">' + escHtml(b.content) + '</div>' +
            '<div class="feed-meta">' + timeAgo(b.createdAt) + '</div>';
        } else {
          var label = fileTypeLabel(b.fileType, b.mimeType);
          var streamBtn = b.canStream && b.streamUrl
            ? '<a class="feed-btn primary" href="' + escHtml(b.streamUrl) + '" target="_blank">▶ Stream</a>'
            : '';
          var dlBtn = b.downloadUrl
            ? '<a class="feed-btn" href="' + escHtml(b.downloadUrl) + '" target="_blank">⬇ Download</a>'
            : '';
          el.className = 'feed-item file-item';
          el.innerHTML =
            '<span class="feed-tag">' + label + '</span>' +
            '<div class="feed-file-name">' + escHtml(b.fileName || 'File') + '</div>' +
            (b.mimeType ? '<div class="feed-meta">' + escHtml(b.mimeType) + '</div>' : '') +
            '<div class="feed-actions">' + streamBtn + dlBtn + '</div>' +
            '<div class="feed-meta">' + timeAgo(b.createdAt) + '</div>';
        }
        return el;
      }

      function render() {
        list.innerHTML = '';
        if (items.length === 0) {
          list.innerHTML = '<div class="feed-empty">No messages yet — waiting for broadcast...</div>';
          return;
        }
        items.slice().reverse().forEach(function (b) {
          list.appendChild(renderItem(b));
        });
      }

      // Load existing broadcasts
      fetch('/api/broadcasts')
        .then(function (r) { return r.json(); })
        .then(function (data) {
          items = Array.isArray(data) ? data : [];
          render();
        })
        .catch(function () {});

      // SSE for real-time updates
      function connectSse() {
        var es = new EventSource('/api/broadcasts/sse');
        es.onmessage = function (e) {
          try {
            var b = JSON.parse(e.data);
            items.push(b);
            if (items.length > 50) items.shift();
            render();
          } catch (err) {}
        };
        es.onerror = function () {
          es.close();
          setTimeout(connectSse, 4000);
        };
      }
      connectSse();

      // Refresh time-ago labels every minute
      setInterval(render, 60000);
    })();
  </script>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

export default router;
