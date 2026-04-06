import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { ConnectionTCPFull } from "telegram/network/connection/TCPFull.js";
import bigInt from "big-integer";
import * as fs from "fs";
import * as path from "path";
import { logger } from "./logger.js";

const API_ID = parseInt(process.env.TELEGRAM_API_ID!, 10);
const API_HASH = process.env.TELEGRAM_API_HASH!;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const SESSION_FILE = path.resolve("telegram_session.txt");

// Request size must be a multiple of 4096 for MTProto
// 1MB chunks with 4 parallel workers = ~4MB/s+ effective throughput
const REQUEST_SIZE = 1024 * 1024; // 1 MB per request
const WORKERS = 4; // parallel download workers

let _client: TelegramClient | null = null;
let _connecting: Promise<TelegramClient> | null = null;

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

  // Prevent multiple simultaneous connection attempts
  if (_connecting) return _connecting;

  _connecting = (async () => {
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
    if (savedSession && savedSession !== sessionStr) {
      saveSession(savedSession);
    }

    logger.info("GramJS MTProto client connected");
    _client = client;
    _connecting = null;
    return client;
  })();

  return _connecting;
}

/** Save the session string whenever DC auth changes (captures new DC authorizations) */
function persistSession(client: TelegramClient): void {
  try {
    const current = client.session.save() as unknown as string;
    const stored = loadSession();
    if (current && current !== stored) {
      saveSession(current);
      logger.debug("Telegram session updated (new DC auth saved)");
    }
  } catch {
    // non-fatal
  }
}

export async function streamFileByMessage(
  chatId: number,
  messageId: number,
  onChunk: (chunk: Buffer) => boolean | Promise<boolean>,
  offsetBytes = 0,
  limitBytes?: number,
): Promise<void> {
  const client = await getGramjsClient();

  const [message] = await client.getMessages(chatId, { ids: [messageId] });
  if (!message?.media) throw new Error("No media found in message");

  // Align offset to 4096-byte boundary (MTProto requirement)
  const alignedOffset = Math.floor(offsetBytes / 4096) * 4096;
  const skipBytes = offsetBytes - alignedOffset;

  let sent = 0;
  let skipped = 0;

  for await (const chunk of client.iterDownload({
    file: message.media as any,
    offset: bigInt(alignedOffset),
    requestSize: REQUEST_SIZE,
    workers: WORKERS,
  })) {
    const buf = Buffer.from(chunk);

    let start = 0;
    // Skip bytes to reach exact requested offset
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
      await onChunk(slice.subarray(0, limitBytes - sent));
      break; // limit reached
    }

    const shouldContinue = await onChunk(slice);
    sent += slice.length;
    if (!shouldContinue) break; // client disconnected
  }

  // Persist session after download so DC auth is cached for next restart
  persistSession(client);
}
