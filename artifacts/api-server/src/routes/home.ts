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
      overflow-x: hidden;
    }

    /* Scan lines */
    body::before {
      content: '';
      position: fixed;
      inset: 0;
      background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,65,0.012) 2px, rgba(0,255,65,0.012) 4px);
      pointer-events: none;
      z-index: 999;
    }

    /* Grid bg */
    body::after {
      content: '';
      position: fixed;
      inset: 0;
      background-image:
        linear-gradient(rgba(0,255,65,0.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(0,255,65,0.04) 1px, transparent 1px);
      background-size: 40px 40px;
      pointer-events: none;
      z-index: 0;
    }

    main {
      position: relative;
      z-index: 1;
      width: 100%;
      max-width: 900px;
      padding: 0 20px 80px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    nav {
      width: 100%;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 24px 0;
      border-bottom: 1px solid var(--border);
      margin-bottom: 0;
      position: relative;
      z-index: 1;
    }

    .logo {
      font-family: 'Share Tech Mono', monospace;
      font-size: 1.2rem;
      color: var(--neon);
      text-shadow: 0 0 14px var(--neon-glow);
      letter-spacing: 2px;
    }

    .logo span { color: #fff; }

    .nav-tag {
      font-family: 'Share Tech Mono', monospace;
      font-size: 0.68rem;
      color: var(--text-dim);
      letter-spacing: 2px;
    }

    /* Hero */
    .hero {
      text-align: center;
      padding: 80px 0 60px;
    }

    .hero-badge {
      display: inline-block;
      font-family: 'Share Tech Mono', monospace;
      font-size: 0.7rem;
      color: var(--neon);
      border: 1px solid var(--neon-dim);
      padding: 5px 14px;
      letter-spacing: 2px;
      margin-bottom: 28px;
      animation: pulse-border 2.5s infinite;
    }

    @keyframes pulse-border {
      0%, 100% { border-color: var(--neon-dim); box-shadow: none; }
      50% { border-color: var(--neon); box-shadow: 0 0 12px var(--neon-glow); }
    }

    .hero h1 {
      font-size: clamp(2.5rem, 7vw, 5rem);
      font-weight: 700;
      line-height: 1.0;
      color: #fff;
      margin-bottom: 6px;
    }

    .hero h1 span {
      color: var(--neon);
      text-shadow: 0 0 20px var(--neon-glow), 0 0 40px rgba(0,255,65,0.2);
    }

    .hero-sub {
      font-family: 'Share Tech Mono', monospace;
      font-size: 1rem;
      color: var(--neon-dim);
      letter-spacing: 2px;
      margin-bottom: 36px;
    }

    .hero-desc {
      max-width: 560px;
      margin: 0 auto 40px;
      font-size: 1.1rem;
      color: var(--text-dim);
      line-height: 1.7;
    }

    .cta-btn {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 16px 36px;
      background: var(--neon);
      color: #000;
      font-family: 'Share Tech Mono', monospace;
      font-size: 1rem;
      letter-spacing: 2px;
      font-weight: bold;
      text-decoration: none;
      transition: all 0.2s;
      position: relative;
    }

    .cta-btn::after {
      content: '';
      position: absolute;
      inset: -1px;
      border: 1px solid var(--neon);
      opacity: 0;
      transition: opacity 0.2s;
    }

    .cta-btn:hover {
      background: #fff;
      box-shadow: 0 0 30px var(--neon-glow), 0 0 60px rgba(0,255,65,0.15);
    }

    .cta-btn:hover::after { opacity: 1; }

    /* Terminal demo */
    .terminal {
      width: 100%;
      background: #000;
      border: 1px solid var(--border);
      border-top: 2px solid var(--neon-dim);
      padding: 20px 24px;
      font-family: 'Share Tech Mono', monospace;
      font-size: 0.85rem;
      margin: 48px 0;
      position: relative;
    }

    .terminal-bar {
      display: flex;
      gap: 6px;
      margin-bottom: 14px;
      align-items: center;
    }

    .dot {
      width: 10px; height: 10px;
      border-radius: 50%;
    }
    .dot-r { background: #ff3b3b; }
    .dot-y { background: #ffb700; }
    .dot-g { background: var(--neon); box-shadow: 0 0 6px var(--neon-glow); }

    .terminal-title {
      font-size: 0.65rem;
      color: var(--text-dim);
      letter-spacing: 1px;
      margin-left: auto;
    }

    .t-line {
      margin: 5px 0;
      display: flex;
      gap: 8px;
      align-items: flex-start;
    }

    .t-prompt { color: var(--neon); }
    .t-cmd { color: #fff; }
    .t-out { color: var(--text-dim); padding-left: 16px; }
    .t-link { color: var(--neon-dim); text-decoration: underline; }
    .t-success { color: var(--neon); }
    .t-cursor {
      display: inline-block;
      width: 9px; height: 1.1em;
      background: var(--neon);
      animation: blink 1s step-end infinite;
      vertical-align: middle;
    }

    @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }

    /* Features */
    .section-title {
      font-family: 'Share Tech Mono', monospace;
      font-size: 0.75rem;
      color: var(--neon-dim);
      letter-spacing: 3px;
      text-align: center;
      margin-bottom: 32px;
    }

    .features {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 1px;
      width: 100%;
      background: var(--border);
      border: 1px solid var(--border);
      margin-bottom: 64px;
    }

    .feature {
      background: var(--surface);
      padding: 28px 24px;
      position: relative;
      overflow: hidden;
      transition: background 0.2s;
    }

    .feature:hover { background: #0e1f0e; }

    .feature::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 1px;
      background: linear-gradient(90deg, transparent, var(--neon-dim), transparent);
      opacity: 0;
      transition: opacity 0.2s;
    }

    .feature:hover::before { opacity: 1; }

    .feat-icon {
      font-size: 1.8rem;
      margin-bottom: 14px;
      display: block;
    }

    .feat-title {
      font-size: 1.1rem;
      font-weight: 700;
      color: var(--neon);
      margin-bottom: 8px;
    }

    .feat-desc {
      font-size: 0.9rem;
      color: var(--text-dim);
      line-height: 1.6;
    }

    /* How it works */
    .steps {
      width: 100%;
      margin-bottom: 64px;
    }

    .step {
      display: flex;
      gap: 20px;
      align-items: flex-start;
      padding: 20px 0;
      border-bottom: 1px solid var(--border);
    }

    .step:last-child { border-bottom: none; }

    .step-num {
      font-family: 'Share Tech Mono', monospace;
      font-size: 1.4rem;
      color: var(--neon);
      text-shadow: 0 0 10px var(--neon-glow);
      min-width: 40px;
      line-height: 1;
    }

    .step-content h3 {
      font-size: 1.1rem;
      font-weight: 700;
      color: #fff;
      margin-bottom: 4px;
    }

    .step-content p {
      font-size: 0.92rem;
      color: var(--text-dim);
      line-height: 1.5;
    }

    /* Footer */
    footer {
      width: 100%;
      border-top: 1px solid var(--border);
      padding: 24px 20px;
      text-align: center;
      font-family: 'Share Tech Mono', monospace;
      font-size: 0.68rem;
      color: var(--text-dim);
      letter-spacing: 1px;
      position: relative;
      z-index: 1;
    }

    footer a { color: var(--neon-dim); text-decoration: none; }
    footer a:hover { color: var(--neon); }

    @media (max-width: 600px) {
      .hero { padding: 50px 0 40px; }
      .hero h1 { font-size: 2.5rem; }
    }
  </style>
</head>
<body>
  <nav style="max-width:900px;width:100%;padding:24px 20px;z-index:1;position:relative;">
    <div class="logo">File2Link<span>BOT</span></div>
    <div class="nav-tag">v1.0 // TELEGRAM CDN</div>
  </nav>

  <main>
    <section class="hero">
      <div class="hero-badge">● ONLINE &nbsp;|&nbsp; INSTANT LINKS</div>
      <h1>File2Link<br><span>BOT</span></h1>
      <div class="hero-sub">// TELEGRAM FILE → DIRECT LINK</div>
      <p class="hero-desc">
        Forward any file to the bot and instantly receive a high-speed download link and a streaming page — right in your browser.
      </p>
      <a class="cta-btn" href="https://t.me/File2Link_StreamBot" target="_blank">
        ▶ OPEN IN TELEGRAM
      </a>
    </section>

    <!-- Terminal demo -->
    <div class="terminal">
      <div class="terminal-bar">
        <div class="dot dot-r"></div>
        <div class="dot dot-y"></div>
        <div class="dot dot-g"></div>
        <div class="terminal-title">file2link_bot — session</div>
      </div>
      <div class="t-line"><span class="t-prompt">›</span><span class="t-cmd">[User forwarded: movie.mp4 (1.4 GB)]</span></div>
      <div class="t-line"><span class="t-out t-success">✓ File processed successfully</span></div>
      <div class="t-line"><span class="t-out">⬇ Download: <span class="t-link">https://your-domain/api/download/a1b2c3d4</span></span></div>
      <div class="t-line"><span class="t-out">▶ Stream:   <span class="t-link">https://your-domain/api/stream-page/a1b2c3d4</span></span></div>
      <div class="t-line" style="margin-top:8px;"><span class="t-prompt">›</span><span class="t-cursor"></span></div>
    </div>

    <!-- Features -->
    <p class="section-title">// CAPABILITIES</p>
    <div class="features">
      <div class="feature">
        <span class="feat-icon">⬇</span>
        <div class="feat-title">Direct Download</div>
        <div class="feat-desc">Get a permanent download link for any file — open in any browser, share anywhere.</div>
      </div>
      <div class="feature">
        <span class="feat-icon">▶</span>
        <div class="feat-title">Online Streaming</div>
        <div class="feat-desc">Videos and audio play directly in the browser with a fast built-in media player. No app needed.</div>
      </div>
      <div class="feature">
        <span class="feat-icon">🎵</span>
        <div class="feat-title">Audio Playback</div>
        <div class="feat-desc">MP3, OGG, FLAC, AAC and more — stream audio files with the full-featured browser audio player.</div>
      </div>
      <div class="feature">
        <span class="feat-icon">⚡</span>
        <div class="feat-title">High-Speed CDN</div>
        <div class="feat-desc">Files stream directly from Telegram's infrastructure — blazing fast, no re-upload required.</div>
      </div>
      <div class="feature">
        <span class="feat-icon">🗂</span>
        <div class="feat-title">All File Types</div>
        <div class="feat-desc">Documents, videos, audio, images, voice messages, video notes — everything is supported.</div>
      </div>
      <div class="feature">
        <span class="feat-icon">🔗</span>
        <div class="feat-title">Permanent Links</div>
        <div class="feat-desc">Links are stored and cached. Share the same link multiple times — it always works.</div>
      </div>
    </div>

    <!-- How it works -->
    <p class="section-title">// HOW IT WORKS</p>
    <div class="steps">
      <div class="step">
        <div class="step-num">01</div>
        <div class="step-content">
          <h3>Open the Bot on Telegram</h3>
          <p>Search for <strong>@File2Link_StreamBot</strong> on Telegram or click the button above.</p>
        </div>
      </div>
      <div class="step">
        <div class="step-num">02</div>
        <div class="step-content">
          <h3>Forward or Send Any File</h3>
          <p>Forward a file from any chat, or send one directly. Supports all file types up to Telegram's size limit.</p>
        </div>
      </div>
      <div class="step">
        <div class="step-num">03</div>
        <div class="step-content">
          <h3>Get Your Links Instantly</h3>
          <p>The bot instantly replies with a download link and, for media, a streaming page link.</p>
        </div>
      </div>
      <div class="step">
        <div class="step-num">04</div>
        <div class="step-content">
          <h3>Stream or Download in Any Browser</h3>
          <p>Open the link on any device. Videos and audio play directly — no apps, no accounts needed.</p>
        </div>
      </div>
    </div>
  </main>

  <footer>
    <p>File2Link BOT &nbsp;|&nbsp; Fast Telegram CDN Streaming &nbsp;|&nbsp; <a href="https://t.me/File2Link_StreamBot" target="_blank">Open Bot</a></p>
  </footer>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

export default router;
