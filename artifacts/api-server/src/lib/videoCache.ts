import * as fs from "fs";
import { logger } from "./logger.js";

const TTL_MS = 30 * 60 * 1000; // 30 minutes

interface CacheEntry {
  path: string;
  size: number;
  expiresAt: number;
  processing?: Promise<void>;
}

const cache = new Map<string, CacheEntry>();

// Clean up expired temp files every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (!entry.processing && entry.expiresAt < now) {
      try { fs.unlinkSync(entry.path); } catch {}
      cache.delete(key);
      logger.debug({ key }, "videoCache: evicted expired entry");
    }
  }
}, 5 * 60 * 1000).unref();

export function getCached(videoId: string): { path: string; size: number } | null {
  const entry = cache.get(videoId);
  if (!entry || entry.processing) return null;
  if (entry.expiresAt < Date.now()) {
    try { fs.unlinkSync(entry.path); } catch {}
    cache.delete(videoId);
    return null;
  }
  // Refresh TTL on access
  entry.expiresAt = Date.now() + TTL_MS;
  return { path: entry.path, size: entry.size };
}

export function getProcessing(videoId: string): Promise<void> | null {
  return cache.get(videoId)?.processing ?? null;
}

export function setProcessing(videoId: string, promise: Promise<void>): void {
  cache.set(videoId, { path: "", size: 0, expiresAt: 0, processing: promise });
}

export function setReady(videoId: string, path: string, size: number): void {
  cache.set(videoId, { path, size, expiresAt: Date.now() + TTL_MS });
}

export function evict(videoId: string): void {
  const entry = cache.get(videoId);
  if (entry) {
    try { if (entry.path) fs.unlinkSync(entry.path); } catch {}
    cache.delete(videoId);
  }
}
