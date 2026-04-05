import { Telegraf, Markup } from "telegraf";
import { db, filesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { isStreamable, isAudio, generateFileId } from "../lib/fileUtils.js";
import { logger } from "../lib/logger.js";

const BOT_TOKEN = process.env.BOT_TOKEN!;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID!;

export const bot = new Telegraf(BOT_TOKEN);

function getBaseUrl(): string {
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
  if (domain) return `https://${domain}`;
  return `http://localhost:${process.env.PORT || 8080}`;
}

async function logToChannel(message: string): Promise<void> {
  try {
    await bot.telegram.sendMessage(LOG_CHANNEL_ID, message, { parse_mode: "HTML" });
  } catch (err) {
    logger.warn({ err }, "Failed to log to channel");
  }
}

function replyMarkup(downloadUrl: string, streamUrl?: string) {
  const buttons = [[Markup.button.url("⬇️ Download", downloadUrl)]];
  if (streamUrl) buttons.push([Markup.button.url("❤️ Stream", streamUrl)]);
  return Markup.inlineKeyboard(buttons);
}

bot.start(async (ctx) => {
  const startParam = ctx.startPayload;
  if (startParam) {
    try {
      const rows = await db.select().from(filesTable).where(eq(filesTable.id, startParam)).limit(1);
      if (rows.length > 0) {
        const file = rows[0]!;
        await db.update(filesTable).set({ accessCount: (file.accessCount || 0) + 1 }).where(eq(filesTable.id, startParam));
        const baseUrl = getBaseUrl();
        const streamable = file.isStreamable || isStreamable(file.mimeType);
        const audioFile = file.isAudio || isAudio(file.mimeType);
        const fileLabel = file.fileName || "File";
        let msg = `<b>📁 ${fileLabel}</b>\n\n`;
        if (file.mimeType) msg += `Type: <code>${file.mimeType}</code>\n`;
        if (file.fileSize) msg += `Size: ${formatSize(file.fileSize)}\n`;
        await ctx.replyWithHTML(msg, replyMarkup(`${baseUrl}/api/download/${file.id}`, streamable || audioFile ? `${baseUrl}/api/stream-page/${file.id}` : undefined));
        return;
      }
    } catch (err) {
      logger.error({ err }, "Error looking up file from start param");
    }
  }

  await ctx.replyWithHTML(
    `<b>🌐 Welcome to File2Link BOT</b>\n\nForward any file to me and I’ll return stylish download and stream links.`,
  );
});

bot.on("message", async (ctx) => {
  const msg = ctx.message as any;
  let fileId: string | null = null;
  let fileUniqueId: string | null = null;
  let fileName: string | null = null;
  let mimeType: string | null = null;
  let fileSize: number | null = null;
  let fileType = "document";
  let duration: number | null = null;
  let width: number | null = null;
  let height: number | null = null;

  if (msg.document) {
    fileId = msg.document.file_id;
    fileUniqueId = msg.document.file_unique_id;
    fileName = msg.document.file_name || null;
    mimeType = msg.document.mime_type || null;
    fileSize = msg.document.file_size || null;
    fileType = "document";
  } else if (msg.video) {
    fileId = msg.video.file_id;
    fileUniqueId = msg.video.file_unique_id;
    fileName = msg.video.file_name || null;
    mimeType = msg.video.mime_type || "video/mp4";
    fileSize = msg.video.file_size || null;
    fileType = "video";
    duration = msg.video.duration || null;
    width = msg.video.width || null;
    height = msg.video.height || null;
  } else if (msg.audio) {
    fileId = msg.audio.file_id;
    fileUniqueId = msg.audio.file_unique_id;
    fileName = msg.audio.file_name || msg.audio.title || null;
    mimeType = msg.audio.mime_type || "audio/mpeg";
    fileSize = msg.audio.file_size || null;
    fileType = "audio";
    duration = msg.audio.duration || null;
  } else if (msg.voice) {
    fileId = msg.voice.file_id;
    fileUniqueId = msg.voice.file_unique_id;
    fileName = "voice_message.ogg";
    mimeType = msg.voice.mime_type || "audio/ogg";
    fileSize = msg.voice.file_size || null;
    fileType = "voice";
    duration = msg.voice.duration || null;
  } else if (msg.video_note) {
    fileId = msg.video_note.file_id;
    fileUniqueId = msg.video_note.file_unique_id;
    fileName = "video_note.mp4";
    mimeType = "video/mp4";
    fileSize = msg.video_note.file_size || null;
    fileType = "video_note";
    duration = msg.video_note.duration || null;
  } else if (msg.animation) {
    fileId = msg.animation.file_id;
    fileUniqueId = msg.animation.file_unique_id;
    fileName = msg.animation.file_name || "animation.mp4";
    mimeType = msg.animation.mime_type || "video/mp4";
    fileSize = msg.animation.file_size || null;
    fileType = "animation";
    duration = msg.animation.duration || null;
  } else if (msg.sticker) {
    fileId = msg.sticker.file_id;
    fileUniqueId = msg.sticker.file_unique_id;
    fileName = "sticker.webp";
    mimeType = "image/webp";
    fileSize = msg.sticker.file_size || null;
    fileType = "sticker";
  } else if (msg.photo && msg.photo.length > 0) {
    const photo = msg.photo[msg.photo.length - 1];
    fileId = photo.file_id;
    fileUniqueId = photo.file_unique_id;
    fileName = "photo.jpg";
    mimeType = "image/jpeg";
    fileSize = photo.file_size || null;
    fileType = "photo";
    width = photo.width || null;
    height = photo.height || null;
  } else {
    return;
  }

  if (!fileId || !fileUniqueId) return;

  const chatId = ctx.chat.id;
  const messageId = msg.message_id;
  const fromUserId = msg.from?.id || null;
  const fromUsername = msg.from?.username || msg.from?.first_name || null;
  const caption = msg.caption || null;
  const streamable = isStreamable(mimeType);
  const audioFile = isAudio(mimeType);

  try {
    const existing = await db.select().from(filesTable).where(eq(filesTable.fileUniqueId, fileUniqueId)).limit(1);
    let recordId: string;

    if (existing.length > 0) {
      recordId = existing[0]!.id;
      await db.update(filesTable).set({ fileId, chatId, messageId }).where(eq(filesTable.id, recordId));
    } else {
      recordId = generateFileId();
      await db.insert(filesTable).values({
        id: recordId,
        fileId,
        fileUniqueId,
        fileName,
        mimeType,
        fileSize,
        fileType,
        fromUserId,
        fromUsername,
        chatId,
        messageId,
        caption,
        duration,
        width,
        height,
        isStreamable: streamable,
        isAudio: audioFile,
      });
    }

    const baseUrl = getBaseUrl();
    const downloadUrl = `${baseUrl}/api/download/${recordId}`;
    const streamPageUrl = `${baseUrl}/api/stream-page/${recordId}`;
    const text = [`<b>💖 File2Link BOT</b>`, ``, `<b>📁 ${fileName || "File"}</b>`, mimeType ? `Type: <code>${mimeType}</code>` : null, fileSize ? `Size: ${formatSize(fileSize)}` : null].filter(Boolean).join("\n");

    await ctx.replyWithHTML(text, replyMarkup(downloadUrl, streamable || audioFile ? streamPageUrl : undefined));

    await logToChannel(
      `<b>📥 New File Received</b>\nUser: ${fromUsername ? `@${fromUsername}` : "Unknown"} (${fromUserId})\nFile: ${fileName || "Untitled"}\nType: ${mimeType || fileType}\nSize: ${fileSize ? formatSize(fileSize) : "Unknown"}\nID: <code>${recordId}</code>`,
    );
  } catch (err) {
    logger.error({ err }, "Error processing file message");
    await ctx.reply("❌ An error occurred while processing your file. Please try again.");
  }
});

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export async function startBot(): Promise<void> {
  logger.info("Starting Telegram bot...");
  await bot.launch();
  logger.info("Telegram bot started");
}
