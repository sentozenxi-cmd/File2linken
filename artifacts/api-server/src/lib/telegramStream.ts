import axios from "axios";
import type { Request, Response } from "express";
import { logger } from "./logger.js";

const BOT_TOKEN = process.env.BOT_TOKEN!;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const TELEGRAM_FILE_API = `https://api.telegram.org/file/bot${BOT_TOKEN}`;

const filePathCache = new Map<string, { path: string; expires: number }>();
const CACHE_TTL = 50 * 60 * 1000; // 50 minutes

async function getTelegramFilePath(fileId: string): Promise<string> {
  const cached = filePathCache.get(fileId);
  if (cached && cached.expires > Date.now()) {
    return cached.path;
  }

  const resp = await axios.get(`${TELEGRAM_API}/getFile`, {
    params: { file_id: fileId },
    timeout: 10000,
  });

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
  isDownload = false
): Promise<void> {
  try {
    const filePath = await getTelegramFilePath(fileId);
    const fileUrl = `${TELEGRAM_FILE_API}/${filePath}`;

    const contentType = mimeType || "application/octet-stream";
    const rangeHeader = req.headers["range"];

    if (rangeHeader && fileSize) {
      const parts = rangeHeader.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0]!, 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Length", chunkSize);
      res.setHeader("Content-Type", contentType);
      res.status(206);

      const tgResp = await axios.get(fileUrl, {
        responseType: "stream",
        headers: { Range: `bytes=${start}-${end}` },
        timeout: 30000,
      });

      tgResp.data.pipe(res);
    } else {
      res.setHeader("Content-Type", contentType);
      res.setHeader("Accept-Ranges", "bytes");
      if (fileSize) res.setHeader("Content-Length", fileSize);
      if (isDownload) {
        const dlName = fileName || `file_${fileId}`;
        res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(dlName)}"`);
      } else {
        res.setHeader("Content-Disposition", "inline");
      }

      const tgResp = await axios.get(fileUrl, {
        responseType: "stream",
        timeout: 30000,
      });

      tgResp.data.pipe(res);
    }
  } catch (err) {
    logger.error({ err }, "Error streaming Telegram file");
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to stream file" });
    }
  }
}
