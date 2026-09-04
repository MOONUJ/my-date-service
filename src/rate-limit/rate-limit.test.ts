import { describe, expect, it } from "vitest";
import { cleanupExpiredRateLimits, consumeRateLimit, networkSubject, RateLimitConfigurationError } from "./rate-limit";

const SECRET = "fixture-rate-limit-secret-32-bytes";

describe("request rate limits", () => {
  it("allows through the boundary, isolates keys, rejects excess, and resets after expiry", async () => {
    const db = new RateLimitD1();
    const policy = { scope: "search", limit: 2, windowSeconds: 60 };
    const atStart = new Date("2026-09-04T00:00:00.000Z");

    expect(await consumeRateLimit({ db: db as unknown as D1Database, secret: SECRET, subject: "user-a", userId: "user-a", policy, now: atStart })).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(await consumeRateLimit({ db: db as unknown as D1Database, secret: SECRET, subject: "user-a", userId: "user-a", policy, now: atStart })).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(await consumeRateLimit({ db: db as unknown as D1Database, secret: SECRET, subject: "user-b", userId: "user-b", policy, now: atStart })).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(await consumeRateLimit({ db: db as unknown as D1Database, secret: SECRET, subject: "user-a", userId: "user-a", policy, now: new Date(atStart.getTime() + 30_000) })).toEqual({ allowed: false, retryAfterSeconds: 30 });
    expect(await consumeRateLimit({ db: db as unknown as D1Database, secret: SECRET, subject: "user-a", userId: "user-a", policy, now: new Date(atStart.getTime() + 60_000) })).toEqual({ allowed: true, retryAfterSeconds: 0 });

    expect(db.keys.every((key) => !key.includes("user-a") && !key.includes("user-b"))).toBe(true);
  });

  it("requires a strong server secret and trusts only Cloudflare's connecting IP header", async () => {
    await expect(consumeRateLimit({
      db: new RateLimitD1() as unknown as D1Database,
      secret: "short",
      subject: "client",
      policy: { scope: "login", limit: 1, windowSeconds: 1 },
    })).rejects.toBeInstanceOf(RateLimitConfigurationError);
    expect(networkSubject(new Request("https://example.test", { headers: { "CF-Connecting-IP": "203.0.113.10", "x-forwarded-for": "198.51.100.1" } }))).toBe("203.0.113.10");
    expect(networkSubject(new Request("https://example.test", { headers: { "x-forwarded-for": "198.51.100.1" } }))).toBe("local-development");
    expect(networkSubject(new Request("https://example.test"), "isolated-test-client")).toBe("isolated-test-client");
  });

  it("cleans expired counters in bounded batches", async () => {
    const db = new RateLimitD1();
    db.seed(25, 100);
    db.seed(1, 300);
    await cleanupExpiredRateLimits(db as unknown as D1Database, 200);
    expect(db.size).toBe(6);
  });
});

class RateLimitD1 {
  private readonly counters = new Map<string, { count: number; expires: number }>();
  readonly keys: string[] = [];

  get size(): number {
    return this.counters.size;
  }

  seed(count: number, expires: number): void {
    for (let index = 0; index < count; index += 1) this.counters.set(`seed:${expires}:${index}`, { count: 1, expires });
  }

  prepare(sql: string) {
    let args: unknown[] = [];
    const statement = {
      bind: (...values: unknown[]) => { args = values; return statement; },
      first: async <T>() => this.first(sql, args) as T | null,
      run: async () => this.run(sql, args),
    };
    return statement;
  }

  private first(sql: string, args: unknown[]): unknown {
    if (sql.startsWith("INSERT INTO request_rate_limits")) {
      const [scope, hash, , , nowSeconds, , , limit] = args as [string, string, null, number, number, number, number, number];
      const key = `${scope}:${hash}`;
      this.keys.push(key);
      const existing = this.counters.get(key);
      const expires = Number(args[3]);
      if (!existing || existing.expires <= nowSeconds) {
        const row = { count: 1, expires };
        this.counters.set(key, row);
        return { request_count: row.count, window_expires_at: row.expires };
      }
      if (existing.count >= limit) return null;
      existing.count += 1;
      return { request_count: existing.count, window_expires_at: existing.expires };
    }
    if (sql.startsWith("SELECT request_count")) {
      const row = this.counters.get(`${String(args[0])}:${String(args[1])}`);
      return row ? { request_count: row.count, window_expires_at: row.expires } : null;
    }
    return null;
  }

  private run(sql: string, args: unknown[]): D1Result {
    if (sql.startsWith("DELETE FROM request_rate_limits")) {
      const nowSeconds = Number(args[0]);
      const limit = Number(args[1]);
      const expired = [...this.counters.entries()]
        .filter(([, row]) => row.expires <= nowSeconds)
        .sort((left, right) => left[1].expires - right[1].expires)
        .slice(0, limit);
      for (const [key] of expired) this.counters.delete(key);
      return { success: true, meta: { changes: expired.length } } as D1Result;
    }
    return { success: true, meta: { changes: 0 } } as D1Result;
  }
}
