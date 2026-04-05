import axios from "axios";
import type { Request, Response } from "express";
import { logger } from "./logger.js";

const BOT_TOKEN = process.env.BOT_TOKEN!;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const TELEGRAM_FILE_API = `https://api.telegram.org/file/bot${BOT_TOKEN}`;

const filePathCache = new Map<string, { path: string; expires: number }>();
const CACHE_TTL = 50 * 60 * 1000;

async function getTelegramFilePath(fileId: string): Promise<string> {
  const cached = filePathCache.get(fileId);
  if (cached && cached.expires > Date.now()) {
    return cached.path;
  }

  const resp = await axios.post(
    `${TELEGRAM_API}/getFile`,
    { file_id: fileId },
    { timeout: 10000 },
  );

  if (!resp.data.ok || !resp.data.result.file_path) {
    throw new Error("Failed to get file path from Telegram");
  }

  const filePath = resp.data.result.file_path as string;
  filePathCache.set(fileId, { path: filePath, expires: Date.now() + CACHE_TTL });
  return filePath;
}

export async function streamTelegramFile(
  req: Request,
  res: Response,
  fileId: string,
  mimeType: string | null | undefined,
  fileName: string | null | undefined,
  fileSize: number | null | undefined,
  isDownload = false,
): Promise<void> {
  try {
    const filePath = await getTelegramFilePath(fileId);
    const fileUrl = `${TELEGRAM_FILE_API}/${filePath}`;
    const contentType = mimeType || "application/octet-stream";
    const rangeHeader = req.headers["range"];

    if (rangeHeader && fileSize) {
      const parts = rangeHeader.replace(/bytes=/, "").split("-");
      const start = Number.parseInt(parts[0] ?? "0", 10);
      const end = parts[1] ? Number.parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Length", String(chunkSize));
      res.setHeader("Content-Type", contentType);
      if (isDownload) {
        res.setHeader("Content-Disposition", `attachment; filename="${sanitizeFileName(fileName || `file_${fileId}`)}"`);
      }

      const tgResp = await axios.get(fileUrl, {
        responseType: "stream",
        headers: { Range: `bytes=${start}-${end}` },
        timeout: 30000,
      });

      tgResp.data.pipe(res);
      return;
    }

    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type", contentType);
    if (fileSize) res.setHeader("Content-Length", String(fileSize));
    if (isDownload) {
      res.setHeader("Content-Disposition", `attachment; filename="${sanitizeFileName(fileName || `file_${fileId}`)}"`);
    } else {
      res.setHeader("Content-Disposition", "inline");
    }

    const tgResp = await axios.get(fileUrl, {
      responseType: "stream",
      timeout: 30000,
    });

    tgResp.data.pipe(res);
  } catch (err) {
    logger.error({ err }, "Error streaming Telegram file");
    if (!res.headersSent) {
      const message = err instanceof Error ? err.message : "Failed to stream file";
      res.status(500).json({ error: message });
    }
  }
}

function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, "_");
}
