const encoder = new TextEncoder();
const CLEANUP_BATCH_SIZE = 20;

export interface RateLimitPolicy {
  scope: string;
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

interface CounterRow {
  request_count: number;
  window_expires_at: number;
}

export class RateLimitConfigurationError extends Error {}

export async function consumeRateLimit(input: {
  db: D1Database;
  secret: string;
  subject: string;
  policy: RateLimitPolicy;
  userId?: string;
  now?: Date;
}): Promise<RateLimitResult> {
  validateInput(input.secret, input.subject, input.policy);
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1_000);
  const windowExpiresAt = nowSeconds + input.policy.windowSeconds;
  const keyHash = await createOpaqueKey(input.secret, input.policy.scope, input.subject);
  const updated = await input.db
    .prepare(
      `INSERT INTO request_rate_limits (scope, key_hash, user_id, request_count, window_expires_at)
       VALUES (?, ?, ?, 1, ?)
       ON CONFLICT(scope, key_hash) DO UPDATE SET
         user_id = excluded.user_id,
         request_count = CASE
           WHEN request_rate_limits.window_expires_at <= ? THEN 1
           ELSE request_rate_limits.request_count + 1
         END,
         window_expires_at = CASE
           WHEN request_rate_limits.window_expires_at <= ? THEN excluded.window_expires_at
           ELSE request_rate_limits.window_expires_at
         END
       WHERE request_rate_limits.window_expires_at <= ? OR request_rate_limits.request_count < ?
       RETURNING request_count, window_expires_at`,
    )
    .bind(
      input.policy.scope,
      keyHash,
      input.userId ?? null,
      windowExpiresAt,
      nowSeconds,
      nowSeconds,
      nowSeconds,
      input.policy.limit,
    )
    .first<CounterRow>();

  const row = updated ?? await input.db
    .prepare("SELECT request_count, window_expires_at FROM request_rate_limits WHERE scope = ? AND key_hash = ? LIMIT 1")
    .bind(input.policy.scope, keyHash)
    .first<CounterRow>();
  if (!row) throw new Error("Rate limit counter was not persisted.");

  if (updated) await cleanupExpiredRateLimits(input.db, nowSeconds);
  return {
    allowed: updated !== null,
    retryAfterSeconds: updated ? 0 : Math.max(1, row.window_expires_at - nowSeconds),
  };
}

export function networkSubject(request: Request, fallback = "local-development"): string {
  return request.headers.get("CF-Connecting-IP")?.trim() || fallback;
}

export async function cleanupExpiredRateLimits(db: D1Database, nowSeconds: number): Promise<void> {
  await db
    .prepare(
      "DELETE FROM request_rate_limits WHERE rowid IN (SELECT rowid FROM request_rate_limits WHERE window_expires_at <= ? ORDER BY window_expires_at LIMIT ?)",
    )
    .bind(nowSeconds, CLEANUP_BATCH_SIZE)
    .run();
}

async function createOpaqueKey(secret: string, scope: string, subject: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`${scope}\u0000${subject}`));
  return toBase64Url(new Uint8Array(signature));
}

function validateInput(secret: string, subject: string, policy: RateLimitPolicy): void {
  if (secret.length < 32) throw new RateLimitConfigurationError("RATE_LIMIT_SECRET must contain at least 32 characters.");
  if (!subject || !policy.scope || !Number.isInteger(policy.limit) || policy.limit < 1 || !Number.isInteger(policy.windowSeconds) || policy.windowSeconds < 1) {
    throw new RateLimitConfigurationError("Rate limit configuration is invalid.");
  }
}

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}
