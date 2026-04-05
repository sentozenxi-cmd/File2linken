import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { ConnectionTCPFull } from "telegram/network/connection/TCPFull.js";
import bigInt from "big-integer";
import * as fs from "fs";
import * as path from "path";
import { logger } from "./logger.js";

const API_ID = parseInt(process.env.API_ID!, 10);
const API_HASH = process.env.API_HASH!;
const BOT_TOKEN = process.env.BOT_TOKEN!;
const SESSION_FILE = path.resolve("telegram_session.txt");

let _client: TelegramClient | null = null;

function loadSession(): string {
  try {
    return fs.readFileSync(SESSION_FILE, "utf-8").trim();
  } catch {
    return "";
  }
}

function saveSession(session: string): void {
  try {
    fs.writeFileSync(SESSION_FILE, session, "utf-8");
  } catch (err) {
    logger.warn({ err }, "Could not save Telegram session file");
  }
}

export async function getGramjsClient(): Promise<TelegramClient> {
  if (_client?.connected) return _client;

  const sessionStr = loadSession();
  const session = new StringSession(sessionStr);

  const client = new TelegramClient(session, API_ID, API_HASH, {
    connectionRetries: 5,
    retryDelay: 1000,
    connection: ConnectionTCPFull,
    useWSS: false,
    deviceModel: "File2Link BOT",
    appVersion: "1.0.0",
    langCode: "en",
  });

  await client.start({
    botAuthToken: BOT_TOKEN,
    onError: (err) => {
      logger.error({ err }, "GramJS client error");
    },
  });

  const savedSession = client.session.save() as unknown as string;
  if (savedSession !== sessionStr) {
    saveSession(savedSession);
  }

  logger.info("GramJS MTProto client connected");
  _client = client;
  return client;
}

export async function streamFileByMessage(
  chatId: number,
  messageId: number,
  onChunk: (chunk: Buffer) => Promise<void> | void,
  offsetBytes = 0,
  limitBytes?: number,
): Promise<{ mimeType: string | undefined; fileSize: number | undefined }> {
  const client = await getGramjsClient();

  const [message] = await client.getMessages(chatId, { ids: [messageId] });
  if (!message?.media) throw new Error("No media found in message");

  let mime: string | undefined;
  let size: number | undefined;

  // Extract mime type and size from media
  const media = message.media as any;
  if (media.document) {
    mime = media.document.mimeType;
    size = Number(media.document.size);
    for (const attr of (media.document.attributes || [])) {
      if (attr.fileName) break;
    }
  } else if (media.photo) {
    mime = "image/jpeg";
  } else if (media.audio) {
    mime = media.audio.mimeType;
    size = Number(media.audio.size);
  }

  // Align offset to 4096-byte boundary (MTProto requirement)
  const alignedOffset = Math.floor(offsetBytes / 4096) * 4096;
  const skipBytes = offsetBytes - alignedOffset;

  let sent = 0;
  let skipped = 0;

  const REQUEST_SIZE = 512 * 1024; // 512KB chunks

  for await (const chunk of client.iterDownload({
    file: message.media as any,
    offset: bigInt(alignedOffset),
    requestSize: REQUEST_SIZE,
  })) {
    const buf = Buffer.from(chunk);

    let start = 0;
    // Skip bytes at the beginning to match the exact offset
    if (skipped < skipBytes) {
      const need = skipBytes - skipped;
      if (buf.length <= need) {
        skipped += buf.length;
        continue;
      }
      start = need;
      skipped = skipBytes;
    }

    const slice = start > 0 ? buf.subarray(start) : buf;

    if (limitBytes !== undefined && sent + slice.length >= limitBytes) {
      const remaining = limitBytes - sent;
      await onChunk(slice.subarray(0, remaining));
      sent += remaining;
      break;
    }

    await onChunk(slice);
    sent += slice.length;
  }

  return { mimeType: mime, fileSize: size };
}
