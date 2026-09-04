import { describe, expect, it } from "vitest";
import { buildVerifiedReason } from "./ai/validation";
import worker, { type AppEnv, selectPlaceProvider } from "./worker";

describe("place provider selection", () => {
  it("requires an explicit supported mode", () => {
    expect(selectPlaceProvider({ PLACE_PROVIDER: "mock" }).id).toBe("mock");
    expect(selectPlaceProvider({ PLACE_PROVIDER: "kakao", KAKAO_REST_API_KEY: "fixture-key" }).id).toBe("kakao");
    expect(() => selectPlaceProvider({})).toThrowError(expect.objectContaining({ code: "PROVIDER_FAILURE" }));
  });

  it("does not silently configure kakao without credentials", () => {
    expect(selectPlaceProvider({ PLACE_PROVIDER: "kakao" }).id).toBe("kakao");
  });

  it("keeps private signup closed before touching D1", async () => {
    const response = await worker.fetch(
      new Request("https://example.test/api/auth/signup", {
        method: "POST",
        headers: { origin: "https://example.test", "content-type": "application/json" },
        body: JSON.stringify({ email: "user@example.com", password: "correct horse battery" }),
      }),
      { DB: null as never, PLACE_PROVIDER: "mock", ENABLE_SIGNUP: "false" },
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "SIGNUP_DISABLED" } });
  });

  it("rejects cross-origin and oversized signup requests before database access", async () => {
    const env = { DB: null as never, PLACE_PROVIDER: "mock", ENABLE_SIGNUP: "true" } satisfies AppEnv;
    const crossOrigin = await worker.fetch(
      new Request("https://example.test/api/auth/signup", {
        method: "POST",
        headers: { origin: "https://attacker.test", "content-type": "application/json" },
        body: JSON.stringify({ email: "user@example.com", password: "correct horse battery" }),
      }),
      env,
    );
    expect(crossOrigin.status).toBe(403);

    const oversized = await worker.fetch(
      new Request("https://example.test/api/auth/signup", {
        method: "POST",
        headers: { origin: "https://example.test", "content-type": "application/json" },
        body: JSON.stringify({ email: "user@example.com", password: "x".repeat(1_100) }),
      }),
      env,
    );
    expect(oversized.status).toBe(413);
  });

  it("returns fake AI curation and reuses its user-scoped cache", async () => {
    const db = new SearchD1();
    let openAiCalls = 0;
    const openAiFetch: typeof fetch = async () => {
      openAiCalls += 1;
      const rows = [
        ["hana-seongsu", "일식"],
        ["ojo-seongsu", "차분한 분위기"],
        ["marea-seongsu", "파스타"],
      ].map(([place_id, evidence]) => ({ place_id, evidence: [evidence], reason: buildVerifiedReason([evidence as string]) }));
      return Response.json({ output: [{ content: [{ type: "output_text", text: JSON.stringify({ recommendations: rows }) }] }], usage: { input_tokens: 20, output_tokens: 10 } });
    };
    const env = { DB: db as unknown as D1Database, PLACE_PROVIDER: "mock", OPENAI_API_KEY: "fixture-key", OPENAI_FETCH: openAiFetch } satisfies AppEnv;
    const request = () => new Request("https://example.test/api/search", {
      method: "POST",
      headers: { cookie: "date_mate_session=fixture", "content-type": "application/json" },
      body: JSON.stringify({ query: "성수 맛집", transport: "transit" }),
    });

    const first = await worker.fetch(request(), env);
    expect(first.status).toBe(200);
    const firstBody = await first.json() as { curation: { source: string }; recommendations: Array<{ id: string }> };
    expect(firstBody.curation.source).toBe("ai");
    expect(firstBody.recommendations[0]?.id).toBe("hana-seongsu");
    const second = await worker.fetch(request(), env);
    const secondBody = await second.json() as { curation: { source: string }; recommendations: Array<{ id: string }> };
    expect(secondBody.curation.source).toBe("cached");
    expect(secondBody.recommendations[0]?.id).toBe("hana-seongsu");
    expect(openAiCalls).toBe(1);
  });
});

class SearchD1 {
  private cache: { json: string; expires: string } | null = null;
  private dailyCalls = 0;
  private monthlyCalls = 0;

  prepare(sql: string) {
    let args: unknown[] = [];
    const statement = {
      bind: (...values: unknown[]) => { args = values; return statement; },
      first: async <T>() => this.first(sql) as T | null,
      run: async () => this.run(sql, args),
    };
    return statement;
  }

  async batch(statements: Array<{ run(): Promise<unknown> }>) {
    return Promise.all(statements.map((statement) => statement.run())) as Promise<D1Result[]>;
  }

  private first(sql: string): unknown {
    if (sql.includes("sessions JOIN users")) return { id: "user", email: "fixture@example.test", expires_at: "2099-01-01T00:00:00.000Z" };
    if (sql.includes("FROM preferences")) return { taste: "조용한 일식과 파스타", updated_at: "2026-09-04T00:00:00.000Z" };
    if (sql.includes("ai_curation_cache")) return this.cache ? { result_json: this.cache.json, expires_at: this.cache.expires } : null;
    if (sql.includes("ai_usage_daily")) return { call_count: this.dailyCalls };
    if (sql.includes("ai_usage_monthly")) return { call_count: this.monthlyCalls };
    return null;
  }

  private async run(sql: string, args: unknown[]) {
    if (sql.startsWith("INSERT INTO ai_curation_cache")) this.cache = { json: String(args[2]), expires: String(args[4]) };
    if (sql.startsWith("INSERT INTO ai_usage_daily")) this.dailyCalls += 1;
    if (sql.startsWith("INSERT INTO ai_usage_monthly")) this.monthlyCalls += 1;
    return { success: true, meta: { changes: 1 } } as D1Result;
  }
}
