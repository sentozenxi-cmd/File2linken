import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { Request, Response } from "express";
import { streamFileByMessage } from "./gramjsClient.js";
import { logger } from "./logger.js";
import { getCached, getProcessing, setProcessing, setReady, evict } from "./videoCache.js";

const TEMP_DIR = os.tmpdir();
// Files up to this size get the fast-start treatment (download → remux → cache → stream)
const FAST_START_MAX_BYTES = 500 * 1024 * 1024; // 500 MB

/**
 * Streams a Telegram video.
 *
 * For files ≤ 500 MB:
 *   Downloads to a temp file once, remuxes with ffmpeg +faststart so the
 *   moov atom is at the front, caches the result for 30 min, and serves
 *   all subsequent range requests from the cached file instantly — no
 *   Telegram re-downloads, no stutter.
 *
 * For files > 500 MB:
 *   Falls back to direct range streaming from Telegram.
 */
export async function streamVideoFast(
  req: Request,
  res: Response,
  videoId: string,
  chatId: number,
  messageId: number,
  mimeType: string | null | undefined,
  fileName: string | null | undefined,
  fileSize: number | null | undefined,
): Promise<void> {
  const useFastStart = fileSize == null || fileSize <= FAST_START_MAX_BYTES;

  if (useFastStart) {
    await streamWithCache(req, res, videoId, chatId, messageId);
  } else {
    await streamDirect(req, res, chatId, messageId, mimeType, fileSize!);
  }
}

async function streamWithCache(
  req: Request,
  res: Response,
  videoId: string,
  chatId: number,
  messageId: number,
): Promise<void> {
  try {
    // 1. Check cache first
    let cached = getCached(videoId);

    if (!cached) {
      // Check if another request is already processing this video
      let processing = getProcessing(videoId);

      if (!processing) {
        // We're the first — start processing
        processing = processVideoToCache(videoId, chatId, messageId);
        setProcessing(videoId, processing);
      }

      // Wait for processing to finish
      await processing;
      cached = getCached(videoId);
    }

    if (!cached) {
      throw new Error("Video cache entry missing after processing");
    }

    // 2. Serve from cached temp file with full range-request support
    serveFromFile(req, res, cached.path, cached.size);

  } catch (err) {
    logger.error({ err, videoId }, "streamWithCache error");
    if (!res.headersSent) res.status(500).send("Streaming error");
  }
}

async function processVideoToCache(videoId: string, chatId: number, messageId: number): Promise<void> {
  const tmpInput = path.join(TEMP_DIR, `f2l-in-${videoId}.tmp`);
  const tmpOutput = path.join(TEMP_DIR, `f2l-out-${videoId}.mp4`);

  try {
    logger.info({ videoId }, "Downloading video for fast-start cache");

    // Download from Telegram → temp input file
    const writeStream = fs.createWriteStream(tmpInput);
    await new Promise<void>((resolve, reject) => {
      writeStream.on("error", reject);
      writeStream.on("finish", resolve);
      streamFileByMessage(chatId, messageId, (chunk) => {
        writeStream.write(chunk);
        return true;
      }).then(() => writeStream.end()).catch(reject);
    });

    logger.info({ videoId }, "Download complete, running ffmpeg fast-start");

    // ffmpeg remux with moov at front
    await new Promise<void>((resolve, reject) => {
      const ff = spawn("ffmpeg", [
        "-y",
        "-loglevel", "error",
        "-i", tmpInput,
        "-c", "copy",
        "-movflags", "+faststart",
        tmpOutput,
      ]);

      let stderr = "";
      ff.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
      ff.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited ${code}: ${stderr.trim()}`));
      });
      ff.on("error", reject);
    });

    // Delete the input temp file — we only need the output
    try { fs.unlinkSync(tmpInput); } catch {}

    const stat = fs.statSync(tmpOutput);
    setReady(videoId, tmpOutput, stat.size);
    logger.info({ videoId, size: stat.size }, "Video cached and ready");

  } catch (err) {
    try { fs.unlinkSync(tmpInput); } catch {}
    try { fs.unlinkSync(tmpOutput); } catch {}
    evict(videoId);
    throw err;
  }
}

function serveFromFile(req: Request, res: Response, filePath: string, totalSize: number): void {
  const rangeHeader = req.headers["range"];

  res.setHeader("Content-Type", "video/mp4");
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "no-store");

  if (rangeHeader) {
    const parts = rangeHeader.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0] ?? "0", 10);
    const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
    const chunkSize = end - start + 1;

    res.status(206);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${totalSize}`);
    res.setHeader("Content-Length", String(chunkSize));

    const fileStream = fs.createReadStream(filePath, { start, end });
    fileStream.on("error", (err) => { logger.error({ err }, "serveFromFile range error"); });
    fileStream.pipe(res);
  } else {
    res.status(200);
    res.setHeader("Content-Length", String(totalSize));

    const fileStream = fs.createReadStream(filePath);
    fileStream.on("error", (err) => { logger.error({ err }, "serveFromFile full error"); });
    fileStream.pipe(res);
  }
}

async function streamDirect(
  req: Request,
  res: Response,
  chatId: number,
  messageId: number,
  mimeType: string | null | undefined,
  fileSize: number,
): Promise<void> {
  let aborted = false;
  req.on("close", () => { aborted = true; });

  try {
    const contentType = mimeType || "video/mp4";
    const rangeHeader = req.headers["range"];

    if (rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0] ?? "0", 10);
      const end = parts[1]
        ? parseInt(parts[1], 10)
        : Math.min(start + 10 * 1024 * 1024 - 1, fileSize - 1);
      const chunkSize = end - start + 1;

      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Length", String(chunkSize));
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "no-store");

      await streamFileByMessage(chatId, messageId, (chunk) => {
        if (aborted) return false;
        res.write(chunk);
        return true;
      }, start, chunkSize);

      if (!aborted) res.end();
    } else {
      res.status(200);
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Length", String(fileSize));
      res.setHeader("Cache-Control", "no-store");

      await streamFileByMessage(chatId, messageId, (chunk) => {
        if (aborted) return false;
        res.write(chunk);
        return true;
      });

      if (!aborted) res.end();
    }
  } catch (err) {
    logger.error({ err }, "streamDirect error");
    if (!res.headersSent) res.status(500).send("Streaming error");
  }
}
