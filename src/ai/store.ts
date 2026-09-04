import type { AiCuration, CuratorUsage } from "./types";

const CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
const USER_DAILY_LIMIT = 30;
const SERVICE_MONTHLY_LIMIT = 1_000;

interface CacheRow { result_json: string; expires_at: string }
interface CountRow { call_count: number }

export async function createCacheKey(parts: readonly string[]): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(parts));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function readCurationCache(db: D1Database, userId: string, cacheKey: string, now: Date): Promise<AiCuration | null> {
  const row = await db.prepare("SELECT result_json, expires_at FROM ai_curation_cache WHERE user_id = ? AND cache_key = ? LIMIT 1")
    .bind(userId, cacheKey).first<CacheRow>();
  if (!row || Date.parse(row.expires_at) <= now.getTime()) return null;
  try { return JSON.parse(row.result_json) as AiCuration; } catch { return null; }
}

export async function writeCurationCache(db: D1Database, userId: string, cacheKey: string, value: AiCuration, now: Date): Promise<void> {
  await db.prepare("INSERT INTO ai_curation_cache (user_id, cache_key, result_json, created_at, expires_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, cache_key) DO UPDATE SET result_json = excluded.result_json, created_at = excluded.created_at, expires_at = excluded.expires_at")
    .bind(userId, cacheKey, JSON.stringify(value), now.toISOString(), new Date(now.getTime() + CACHE_TTL_MS).toISOString()).run();
  await db.prepare("DELETE FROM ai_curation_cache WHERE expires_at <= ?").bind(now.toISOString()).run();
}

export async function reserveUsage(db: D1Database, userId: string, now: Date): Promise<boolean> {
  const day = now.toISOString().slice(0, 10);
  const month = day.slice(0, 7);
  const [daily, monthly] = await Promise.all([
    db.prepare("SELECT call_count FROM ai_usage_daily WHERE user_id = ? AND usage_date = ? LIMIT 1").bind(userId, day).first<CountRow>(),
    db.prepare("SELECT call_count FROM ai_usage_monthly WHERE usage_month = ? LIMIT 1").bind(month).first<CountRow>(),
  ]);
  if ((daily?.call_count ?? 0) >= USER_DAILY_LIMIT || (monthly?.call_count ?? 0) >= SERVICE_MONTHLY_LIMIT) return false;
  const results = await db.batch([
    db.prepare("INSERT INTO ai_usage_daily (user_id, usage_date, call_count, input_tokens, output_tokens) VALUES (?, ?, 1, 0, 0) ON CONFLICT(user_id, usage_date) DO UPDATE SET call_count = call_count + 1 WHERE call_count < 30").bind(userId, day),
    db.prepare("INSERT INTO ai_usage_monthly (usage_month, call_count, input_tokens, output_tokens) VALUES (?, 1, 0, 0) ON CONFLICT(usage_month) DO UPDATE SET call_count = call_count + 1 WHERE call_count < 1000").bind(month),
  ]);
  return results.every((result) => result.meta.changes === 1);
}

export async function recordUsageTokens(db: D1Database, userId: string, usage: CuratorUsage, now: Date): Promise<void> {
  const day = now.toISOString().slice(0, 10);
  const month = day.slice(0, 7);
  await db.batch([
    db.prepare("UPDATE ai_usage_daily SET input_tokens = input_tokens + ?, output_tokens = output_tokens + ? WHERE user_id = ? AND usage_date = ?").bind(usage.inputTokens, usage.outputTokens, userId, day),
    db.prepare("UPDATE ai_usage_monthly SET input_tokens = input_tokens + ?, output_tokens = output_tokens + ? WHERE usage_month = ?").bind(usage.inputTokens, usage.outputTokens, month),
  ]);
}
