import { describe, expect, it, vi } from "vitest";
import type { SearchResponse } from "../domain";
import { applyAiCuration } from "./curation";
import { AiCurationError, buildOpenAiRequest, createOpenAiCurator } from "./openai-curator";
import { buildVerifiedReason, validateCuration } from "./validation";
import { MAX_OUTPUT_TOKENS, OPENAI_MODEL, type AiCandidate, type AiCuration, type AiCurator } from "./types";

const candidates: AiCandidate[] = [
  { id: "a", name: "고요", category: "한식", tags: ["조용한 분위기"], transportTip: "성수역 1번 출구" },
  { id: "b", name: "마레", category: "파스타", tags: ["따뜻한 조명"], transportTip: null },
  { id: "c", name: "스시야", category: "일식", tags: ["오마카세"], transportTip: null },
];

const validCuration: AiCuration = {
  recommendations: candidates.map((candidate) => ({
    placeId: candidate.id,
    evidence: [candidate.tags[0] as string],
    reason: buildVerifiedReason([candidate.tags[0] as string]),
  })),
};

describe("OpenAI curator", () => {
  it("uses the pinned model, strict schema, candidate allowlist and output cap", () => {
    const payload = buildOpenAiRequest({ taste: "조용한 곳", transport: "transit", candidates });
    expect(payload).toMatchObject({ model: OPENAI_MODEL, max_output_tokens: MAX_OUTPUT_TOKENS, store: false });
    expect(JSON.stringify(payload)).toContain('"strict":true');
    expect(JSON.stringify(payload)).toContain('"enum":["a","b","c"]');
  });

  it("parses a valid Responses API fixture and records token counts", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({
        recommendations: validCuration.recommendations.map(({ placeId, evidence, reason }) => ({ place_id: placeId, evidence, reason })),
      }) }] }],
      usage: { input_tokens: 100, output_tokens: 40 },
    }));
    const result = await createOpenAiCurator("secret", fetcher).curate({ taste: "조용한 곳", transport: "transit", candidates });
    expect(result).toEqual({ curation: validCuration, usage: { inputTokens: 100, outputTokens: 40 } });
    const init = fetcher.mock.calls[0]?.[1];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect((init?.headers as Record<string, string>).authorization).toBe("Bearer secret");
  });

  it.each([
    [429, "rate_limited"],
    [500, "provider_error"],
  ] as const)("maps HTTP %s to %s without retry", async (status, code) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status }));
    await expect(createOpenAiCurator("secret", fetcher).curate({ taste: "취향", transport: "car", candidates }))
      .rejects.toEqual(expect.objectContaining({ code }));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects refusal, invalid JSON and schema mismatch", async () => {
    const fixtures = [
      { output: [{ content: [{ type: "refusal", refusal: "cannot" }] }] },
      { output: [{ content: [{ type: "output_text", text: "{" }] }] },
      { output: [{ content: [{ type: "output_text", text: JSON.stringify({ recommendations: [] }) }] }] },
    ];
    for (const fixture of fixtures) {
      const curator = createOpenAiCurator("secret", vi.fn<typeof fetch>().mockResolvedValue(Response.json(fixture)));
      await expect(curator.curate({ taste: "취향", transport: "car", candidates })).rejects.toBeInstanceOf(AiCurationError);
    }
  });

  it("aborts after four seconds and rejects oversized responses", async () => {
    vi.useFakeTimers();
    const waitingFetch: typeof fetch = async (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    });
    const pending = createOpenAiCurator("secret", waitingFetch).curate({ taste: "취향", transport: "car", candidates });
    const rejection = expect(pending).rejects.toEqual(expect.objectContaining({ code: "timeout" }));
    await vi.advanceTimersByTimeAsync(4_000);
    await rejection;
    vi.useRealTimers();

    const oversized = new Response("x".repeat(128 * 1_024 + 1));
    await expect(createOpenAiCurator("secret", vi.fn<typeof fetch>().mockResolvedValue(oversized)).curate({ taste: "취향", transport: "car", candidates }))
      .rejects.toEqual(expect.objectContaining({ code: "invalid_output" }));
  });
});

describe("curation validation", () => {
  it("rejects unknown IDs, duplicates, missing fields, long strings and invented facts", () => {
    const item = (id: string, evidence: string[]) => ({ place_id: id, evidence, reason: buildVerifiedReason(evidence) });
    expect(validateCuration({ recommendations: [item("a", ["조용한 분위기"]), item("b", ["따뜻한 조명"]), item("missing", ["오마카세"])] }, candidates)).toBeNull();
    expect(validateCuration({ recommendations: [item("a", ["조용한 분위기"]), item("a", ["조용한 분위기"]), item("c", ["오마카세"])] }, candidates)).toBeNull();
    expect(validateCuration({ recommendations: [{ ...item("a", ["조용한 분위기"]), reason: "영업시간이 길고 주차가 가능해요." }, item("b", ["따뜻한 조명"]), item("c", ["오마카세"])] }, candidates)).toBeNull();
    expect(validateCuration({ recommendations: [{ place_id: "a", evidence: ["x"], reason: "x" }, item("b", ["따뜻한 조명"]), item("c", ["오마카세"])] }, candidates)).toBeNull();
  });
});

describe("AI curation orchestration", () => {
  it("sends at most six candidates and applies AI ranking", async () => {
    const db = new MemoryDb();
    const curator: AiCurator = { curate: vi.fn(async (input) => {
      expect(input.candidates).toHaveLength(6);
      return { curation: { recommendations: [...validCuration.recommendations].reverse() }, usage: { inputTokens: 12, outputTokens: 5 } };
    }) };
    const result = await applyAiCuration(context(db, curator));
    expect(result.curation.source).toBe("ai");
    expect(result.recommendations.map(({ id }) => id)).toEqual(["c", "b", "a"]);
    expect(db.daily.get("user:2026-09-04")?.input).toBe(12);
  });

  it("uses a 24-hour user-scoped cache and invalidates it when inputs change", async () => {
    const db = new MemoryDb();
    const curator: AiCurator = { curate: vi.fn(async () => ({ curation: validCuration, usage: { inputTokens: 1, outputTokens: 1 } })) };
    expect((await applyAiCuration(context(db, curator))).curation.source).toBe("ai");
    expect((await applyAiCuration(context(db, curator))).curation.source).toBe("cached");
    expect(curator.curate).toHaveBeenCalledTimes(1);
    expect((await applyAiCuration({ ...context(db, curator), preferenceUpdatedAt: "changed" })).curation.source).toBe("ai");
    expect((await applyAiCuration({ ...context(db, curator), userId: "other" })).curation.source).toBe("ai");
  });

  it("falls back before external calls for missing keys and usage limits", async () => {
    const db = new MemoryDb();
    expect((await applyAiCuration(context(db, null))).curation).toEqual({ source: "deterministic", fallbackReason: "missing_key" });
    db.daily.set("user:2026-09-04", { calls: 30, input: 0, output: 0 });
    const curator: AiCurator = { curate: vi.fn(async () => ({ curation: validCuration, usage: { inputTokens: 0, outputTokens: 0 } })) };
    expect((await applyAiCuration(context(db, curator))).curation.fallbackReason).toBe("budget_exhausted");
    expect(curator.curate).not.toHaveBeenCalled();
  });

  it("falls back on timeout, rate limit, refusal and invalid output errors", async () => {
    for (const code of ["timeout", "rate_limited", "refused", "invalid_output"] as const) {
      const curator: AiCurator = { curate: async () => { throw new AiCurationError(code); } };
      expect((await applyAiCuration(context(new MemoryDb(), curator))).curation.fallbackReason).toBe(code);
    }
  });
});

function context(db: MemoryDb, curator: AiCurator | null) {
  return {
    db: db as unknown as D1Database,
    userId: "user",
    preferenceUpdatedAt: "2026-09-04T00:00:00.000Z",
    request: { query: "성수 맛집", taste: "조용한 곳", transport: "transit" as const },
    deterministic: deterministicResponse(),
    curator,
    now: new Date("2026-09-04T01:00:00.000Z"),
  };
}

function deterministicResponse(): SearchResponse {
  const allCandidates = [...candidates, ...Array.from({ length: 4 }, (_, index) => ({
    id: `extra-${index}`, name: `추가 ${index}`, category: "카페", tags: ["카페"], transportTip: null,
  }))];
  const places = allCandidates.map((candidate, index) => ({
    id: candidate.id, rank: index + 1, name: candidate.name, category: candidate.category, address: "서울",
    coordinates: { latitude: 37, longitude: 127 }, reason: "기본 이유", transitTip: candidate.transportTip, tags: candidate.tags,
  }));
  return { query: "성수 맛집", generatedAt: "2026-09-04T01:00:00.000Z", source: "mock", curation: { source: "deterministic" }, recommendations: places.slice(0, 3), places };
}

class MemoryDb {
  cache = new Map<string, { json: string; expires: string }>();
  daily = new Map<string, { calls: number; input: number; output: number }>();
  monthly = new Map<string, { calls: number; input: number; output: number }>();

  prepare(sql: string) {
    let args: unknown[] = [];
    const statement = {
      bind: (...values: unknown[]) => { args = values; return statement; },
      first: async <T>() => this.first(sql, args) as T | null,
      run: async () => this.run(sql, args),
    };
    return statement;
  }

  async batch(statements: Array<{ run(): Promise<unknown> }>) {
    return Promise.all(statements.map((statement) => statement.run())) as Promise<D1Result[]>;
  }

  private first(sql: string, args: unknown[]): unknown {
    if (sql.includes("ai_curation_cache")) {
      const row = this.cache.get(`${args[0]}:${args[1]}`);
      return row ? { result_json: row.json, expires_at: row.expires } : null;
    }
    if (sql.includes("ai_usage_daily")) return { call_count: this.daily.get(`${args[0]}:${args[1]}`)?.calls ?? 0 };
    if (sql.includes("ai_usage_monthly")) return { call_count: this.monthly.get(String(args[0]))?.calls ?? 0 };
    return null;
  }

  private async run(sql: string, args: unknown[]) {
    let changes = 1;
    if (sql.startsWith("INSERT INTO ai_curation_cache")) this.cache.set(`${args[0]}:${args[1]}`, { json: String(args[2]), expires: String(args[4]) });
    else if (sql.startsWith("DELETE FROM ai_curation_cache")) {
      for (const [key, value] of this.cache) if (value.expires <= String(args[0])) this.cache.delete(key);
    } else if (sql.startsWith("INSERT INTO ai_usage_daily")) changes = this.increment(this.daily, `${args[0]}:${args[1]}`, 30);
    else if (sql.startsWith("INSERT INTO ai_usage_monthly")) changes = this.increment(this.monthly, String(args[0]), 1_000);
    else if (sql.startsWith("UPDATE ai_usage_daily")) this.addTokens(this.daily, `${args[2]}:${args[3]}`, Number(args[0]), Number(args[1]));
    else if (sql.startsWith("UPDATE ai_usage_monthly")) this.addTokens(this.monthly, String(args[2]), Number(args[0]), Number(args[1]));
    return { success: true, meta: { changes } } as D1Result;
  }

  private increment(map: Map<string, { calls: number; input: number; output: number }>, key: string, limit: number): number {
    const value = map.get(key) ?? { calls: 0, input: 0, output: 0 };
    if (value.calls >= limit) return 0;
    value.calls += 1; map.set(key, value); return 1;
  }

  private addTokens(map: Map<string, { calls: number; input: number; output: number }>, key: string, input: number, output: number): void {
    const value = map.get(key) ?? { calls: 0, input: 0, output: 0 };
    value.input += input; value.output += output; map.set(key, value);
  }
}
