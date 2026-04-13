import { Telegraf } from "telegraf";
import { db, filesTable, broadcastsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { isStreamable, isAudio, generateFileId } from "../lib/fileUtils.js";
import { logger } from "../lib/logger.js";
import { broadcastSse } from "../lib/sseClients.js";

const PUSH_BOT_TOKEN = process.env.PUSH_BOT_TOKEN;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID!;

export const pushBot = PUSH_BOT_TOKEN ? new Telegraf(PUSH_BOT_TOKEN) : null;

function getBaseUrl(): string {
  if (process.env.BASE_URL) return process.env.BASE_URL;
  const devDomain = process.env.REPLIT_DEV_DOMAIN;
  if (devDomain) return `https://${devDomain}`;
  return `http://localhost:${process.env.PORT || 8080}`;
}

async function forwardToLogChannel(
  fromChatId: number,
  fromMessageId: number,
): Promise<{ logChatId: number; logMessageId: number } | null> {
  if (!LOG_CHANNEL_ID || !pushBot) return null;
  try {
    const forwarded = await pushBot.telegram.forwardMessage(
      LOG_CHANNEL_ID,
      fromChatId,
      fromMessageId,
    );
    return { logChatId: forwarded.chat.id, logMessageId: forwarded.message_id };
  } catch (err: any) {
    logger.error({ err: err?.message }, "Push bot: failed to forward to log channel");
    return null;
  }
}

if (pushBot) {
  pushBot.start(async (ctx) => {
    await ctx.reply("✅ Push bot ready. Send me a message or file to broadcast it to the site.");
  });

  pushBot.on("message", async (ctx) => {
    const msg = ctx.message as any;

    if (msg.text && !msg.text.startsWith("/")) {
      try {
        const id = generateFileId();
        const now = new Date();
        await db.insert(broadcastsTable).values({
          id,
          type: "text",
          content: msg.text,
          createdAt: now,
        });
        broadcastSse({ id, type: "text", content: msg.text, createdAt: now.toISOString() });
        await ctx.reply("✅ Message pushed to the site!");
      } catch (err) {
        logger.error({ err }, "Push bot: error saving text broadcast");
        await ctx.reply("❌ Failed to push message.");
      }
      return;
    }

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
          chatId,
          messageId,
          duration,
          width,
          height,
          isStreamable: streamable,
          isAudio: audioFile,
        });
      }

      const logResult = await forwardToLogChannel(chatId, messageId);
      if (logResult) {
        await db.update(filesTable)
          .set({ chatId: logResult.logChatId, messageId: logResult.logMessageId })
          .where(eq(filesTable.id, recordId));
      }

      const baseUrl = getBaseUrl();
      const broadcastId = generateFileId();
      const now = new Date();
      await db.insert(broadcastsTable).values({
        id: broadcastId,
        type: "file",
        fileId: recordId,
        fileName: fileName || "File",
        mimeType: mimeType || null,
        fileType,
        createdAt: now,
      });

      broadcastSse({
        id: broadcastId,
        type: "file",
        fileId: recordId,
        fileName: fileName || "File",
        mimeType: mimeType || null,
        fileType,
        canStream: streamable || audioFile,
        streamUrl: `${baseUrl}/api/stream-page/${recordId}`,
        downloadUrl: `${baseUrl}/api/download/${recordId}`,
        createdAt: now.toISOString(),
      });

      await ctx.reply(`✅ File pushed to the site!\n🆔 ${recordId}`);
    } catch (err) {
      logger.error({ err }, "Push bot: error saving file broadcast");
      await ctx.reply("❌ Failed to push file.");
    }
  });
}

export function startPushBot(): void {
  if (!pushBot) {
    logger.warn("PUSH_BOT_TOKEN not set — push bot disabled");
    return;
  }
  logger.info("Starting push bot...");
  pushBot.launch().catch((err) => logger.error({ err }, "Push bot crashed"));
  logger.info("Push bot started");
}
