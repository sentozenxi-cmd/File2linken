import { spawn } from "child_process";
import { Readable, PassThrough } from "stream";
import type { Request, Response } from "express";
import { streamFileByMessage } from "./gramjsClient.js";
import { logger } from "./logger.js";

/**
 * Streams a Telegram file through ffmpeg, repackaging it as fragmented MP4.
 * This puts metadata (moov atom) at the very start so the browser can begin
 * playback immediately — no waiting for the whole file to buffer.
 */
export async function streamVideoFast(
  req: Request,
  res: Response,
  chatId: number,
  messageId: number,
  fileName: string | null | undefined,
): Promise<void> {
  let ffmpegProc: ReturnType<typeof spawn> | null = null;
  let aborted = false;

  req.on("close", () => {
    aborted = true;
    if (ffmpegProc) {
      try { ffmpegProc.kill("SIGKILL"); } catch {}
    }
  });

  try {
    // Fragmented MP4 flags:
    // frag_keyframe   – start a new fragment at each keyframe
    // empty_moov      – write an empty moov box at the very start (browser can play immediately)
    // default_base_moof – makes seeks work better in fragmented MP4
    ffmpegProc = spawn("ffmpeg", [
      "-loglevel", "error",
      "-i", "pipe:0",       // read from stdin
      "-c", "copy",         // no re-encoding – just remux
      "-movflags", "frag_keyframe+empty_moov+default_base_moof",
      "-f", "mp4",
      "pipe:1",             // write to stdout
    ]);

    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Transfer-Encoding", "chunked");

    // Pipe ffmpeg stdout → HTTP response
    ffmpegProc.stdout.pipe(res, { end: true });

    ffmpegProc.stderr.on("data", (d: Buffer) => {
      const msg = d.toString().trim();
      if (msg) logger.warn({ msg }, "ffmpeg stderr");
    });

    ffmpegProc.on("error", (err) => {
      logger.error({ err }, "ffmpeg process error");
      if (!res.headersSent) res.status(500).send("ffmpeg error");
    });

    // Feed Telegram data into ffmpeg stdin
    const stdin = ffmpegProc.stdin;
    const passthrough = new PassThrough();
    passthrough.pipe(stdin, { end: true });

    await streamFileByMessage(chatId, messageId, (chunk) => {
      if (aborted) return false;
      const ok = passthrough.write(chunk);
      return true; // always continue – backpressure handled by pipe
    });

    if (!aborted) passthrough.end();

  } catch (err) {
    logger.error({ err }, "streamVideoFast error");
    if (ffmpegProc) { try { ffmpegProc.kill("SIGKILL"); } catch {} }
    if (!res.headersSent) res.status(500).send("Streaming error");
  }
}
