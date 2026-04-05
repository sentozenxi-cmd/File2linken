# File2Link BOT

## Overview

A Telegram bot that accepts forwarded files and generates direct download + stream links. Files are streamed directly from Telegram's CDN infrastructure via HTTP range requests with caching.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **Telegram**: Telegraf v4
- **HTTP client**: Axios (for streaming from Telegram CDN)

## Architecture

### Bot (`artifacts/api-server/src/bot/index.ts`)
- Listens for all file types: document, video, audio, voice, video_note, animation, sticker, photo
- Saves file metadata to PostgreSQL via Drizzle ORM
- Replies with download + stream links
- Logs activity to LOG_CHANNEL_ID

### Routes (`artifacts/api-server/src/routes/`)
- `GET /` — Landing page (neon green/black themed)
- `GET /api/download/:id` — Direct file download (Content-Disposition: attachment)
- `GET /api/stream/:id` — Raw streaming endpoint with HTTP range support
- `GET /api/stream-page/:id` — Full HTML stream page with video/audio/image player

### File Streaming (`artifacts/api-server/src/lib/telegramStream.ts`)
- Gets file path from Telegram Bot API (`getFile`)
- Caches file paths for 50 minutes to avoid repeated API calls
- Supports HTTP Range requests for seeking in video/audio
- Streams directly from `api.telegram.org/file/bot<token>/...`

### Database Schema (`lib/db/src/schema/files.ts`)
- `files` table: stores file ID, unique ID, metadata, MIME type, size, duration, streamability flags, access count

## Environment Variables / Secrets
- `BOT_TOKEN` — Telegram bot token (from @BotFather)
- `API_ID` — Telegram API ID (from my.telegram.org)
- `API_HASH` — Telegram API Hash (from my.telegram.org)
- `LOG_CHANNEL_ID` — Telegram channel ID for activity logging
- `DATABASE_URL` — PostgreSQL connection string (auto-provisioned)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-server run dev` — run API server + bot locally
- `pnpm --filter @workspace/db run push` — push DB schema changes

## Supported File Types

Video, Audio, Voice messages, Video notes, Animations (GIFs), Documents, Photos, Stickers

## Streamable Formats

Video: mp4, webm, ogg, mkv, avi, mov, 3gp, flv, mpeg  
Audio: mp3, ogg, wav, flac, aac, m4a, webm
