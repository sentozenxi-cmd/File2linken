import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { Request, Response } from "express";
import { streamFileByMessage } from "./gramjsClient.js";
import { logger } from "./logger.js";

const TEMP_DIR = os.tmpdir();
// Files under this size get the fast-start treatment (download → remux → stream)
const FAST_START_MAX_BYTES = 200 * 1024 * 1024; // 200 MB

/**
 * Streams a Telegram video to the browser.
 *
 * For files ≤ 200 MB:
 *   Downloads to a temp file, remuxes with ffmpeg -movflags +faststart so
 *   the moov atom is at the very start, then streams the result. The browser
 *   starts playing within seconds of the remux finishing.
 *
 * For files > 200 MB:
 *   Falls back to direct streaming with range-request support. The browser
 *   may seek to the end to find the moov atom, but this is handled natively.
 */
export async function streamVideoFast(
  req: Request,
  res: Response,
  chatId: number,
  messageId: number,
  mimeType: string | null | undefined,
  fileName: string | null | undefined,
  fileSize: number | null | undefined,
): Promise<void> {
  const useFastStart = fileSize == null || fileSize <= FAST_START_MAX_BYTES;

  if (useFastStart) {
    await streamWithFastStart(req, res, chatId, messageId, fileName, fileSize);
  } else {
    await streamDirect(req, res, chatId, messageId, mimeType, fileName, fileSize);
  }
}

async function streamWithFastStart(
  req: Request,
  res: Response,
  chatId: number,
  messageId: number,
  fileName: string | null | undefined,
  fileSize: number | null | undefined,
): Promise<void> {
  const tmpInput = path.join(TEMP_DIR, `f2l-in-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`);
  const tmpOutput = path.join(TEMP_DIR, `f2l-out-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`);

  const cleanup = () => {
    try { fs.unlinkSync(tmpInput); } catch {}
    try { fs.unlinkSync(tmpOutput); } catch {}
  };

  req.on("close", cleanup);

  try {
    logger.info({ fileSize }, "Downloading video to temp for fast-start remux");

    // 1. Download from Telegram → temp file
    const writeStream = fs.createWriteStream(tmpInput);
    await new Promise<void>((resolve, reject) => {
      writeStream.on("error", reject);
      writeStream.on("finish", resolve);
      streamFileByMessage(chatId, messageId, (chunk) => {
        writeStream.write(chunk);
        return true;
      }).then(() => writeStream.end()).catch(reject);
    });

    logger.info("Download complete, running ffmpeg fast-start");

    // 2. ffmpeg remux with moov at front
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

    logger.info("ffmpeg fast-start done, streaming to browser");

    // 3. Stream the remuxed file to browser with range support
    const stat = fs.statSync(tmpOutput);
    const totalSize = stat.size;
    const rangeHeader = req.headers["range"];

    if (rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0] ?? "0", 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
      const chunkSize = end - start + 1;

      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${totalSize}`);
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Length", String(chunkSize));
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Cache-Control", "no-store");

      const fileStream = fs.createReadStream(tmpOutput, { start, end });
      fileStream.on("error", (err) => {
        logger.error({ err }, "Error reading temp output for range");
        cleanup();
      });
      fileStream.pipe(res);
      fileStream.on("end", cleanup);
    } else {
      res.status(200);
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Content-Length", String(totalSize));
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Cache-Control", "no-store");

      const fileStream = fs.createReadStream(tmpOutput);
      fileStream.on("error", (err) => {
        logger.error({ err }, "Error reading temp output");
        cleanup();
      });
      fileStream.pipe(res);
      fileStream.on("end", cleanup);
    }

  } catch (err) {
    cleanup();
    logger.error({ err }, "streamWithFastStart error");
    if (!res.headersSent) res.status(500).send("Streaming error");
    else if (!res.writableEnded) { try { res.end(); } catch {} }
  }
}

async function streamDirect(
  req: Request,
  res: Response,
  chatId: number,
  messageId: number,
  mimeType: string | null | undefined,
  fileName: string | null | undefined,
  fileSize: number,
): Promise<void> {
  let aborted = false;
  req.on("close", () => { aborted = true; });

  try {
    const contentType = mimeType || "video/mp4";
    const rangeHeader = req.headers["range"];

    if (rangeHeader && fileSize) {
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
