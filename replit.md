# File2Link BOT

## Overview

A Telegram bot that accepts forwarded files and generates direct download + stream links. Files are streamed via Telegram MTProto (gramjs) for any file size — bypasses the 20MB Bot API limit.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **Telegram Bot**: Telegraf v4
- **Telegram MTProto**: gramjs (`telegram`) — for unlimited file size streaming
- **BigInt math**: `big-integer` (required by gramjs iterDownload)

## Architecture

### Bot (`artifacts/api-server/src/bot/index.ts`)
- Listens for all file types: document, video, audio, voice, video_note, animation, sticker, photo
- Saves file metadata + chatId + messageId to PostgreSQL via Drizzle ORM
- Replies with HTML text links (⬇️ Download, ▶️ Stream Online) — no inline keyboard buttons
- Uses contextual emojis per file type (🎬 video, 🎵 audio, 🖼 photo, 📄 document)
- Logs activity to LOG_CHANNEL_ID

### Routes (`artifacts/api-server/src/routes/`)
- `GET /` — Landing page (neon green/black gradient theme)
- `GET /api/download/:id` — Direct file download (Content-Disposition: attachment)
- `GET /api/stream/:id` — Raw streaming endpoint with HTTP range support
- `GET /api/stream-page/:id` — Full HTML stream page with video/audio/image player

### File Streaming (`artifacts/api-server/src/lib/telegramStream.ts`)
- Uses gramjs MTProto client to stream files of any size
- Supports HTTP Range requests for browser video seeking
- Streams in 512KB chunks via `client.iterDownload()`

### MTProto Client (`artifacts/api-server/src/lib/gramjsClient.ts`)
- Singleton `TelegramClient` using TCP connection (not WebSocket, avoids bufferutil)
- Authenticates as bot using BOT_TOKEN
- Fetches message by chatId + messageId (both stored in DB), then streams media
- Session persisted to `artifacts/api-server/telegram_session.txt` for fast reconnect
- Connects to file's DC automatically (exports DC auth as needed)

### Database Schema (`lib/db/src/schema/files.ts`)
- `files` table: stores fileId, fileUniqueId, metadata, mimeType, size, duration, chatId, messageId, streamability flags, accessCount

## Environment Variables / Secrets
- `BOT_TOKEN` — Telegram bot token (from @BotFather)
- `API_ID` — Telegram API ID (from my.telegram.org)
- `API_HASH` — Telegram API Hash (from my.telegram.org)
- `LOG_CHANNEL_ID` — Telegram channel ID for activity logging
- `DATABASE_URL` — PostgreSQL connection string (auto-provisioned)
- `SESSION_SECRET` — (reserved, not currently in use)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-server run dev` — run API server + bot locally
- `pnpm --filter @workspace/db run push` — push DB schema changes

## Supported File Types

Video, Audio, Voice messages, Video notes, Animations (GIFs), Documents, Photos, Stickers

## Streamable Formats

Video: mp4, webm, ogg, mkv, avi, mov, 3gp, flv, mpeg  
Audio: mp3, ogg, wav, flac, aac, m4a, webm

## Design

- Neon green (#00ff6a / #b7ff00) + deep black gradient background
- Radial glow gradients + scan-line overlay
- Inter + Manrope premium fonts (Google Fonts)
- Glassmorphism card style with backdrop-filter blur

## Notes

- On first server start, gramjs takes ~5-15s to authenticate with Telegram's MTProto servers
- The session is cached in `telegram_session.txt` — subsequent restarts reconnect in ~1-2s
- Files >20MB require gramjs (Bot API getFile limit). All sizes handled transparently
- The esbuild config externalizes `*.node` but bundles `bufferutil`/`utf-8-validate` as they have JS fallbacks
