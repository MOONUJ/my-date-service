import { describe, expect, it, vi } from "vitest";
import fixture from "./fixtures/kakao-keyword-response.json";
import { createKakaoPlaceProvider, parseKakaoPlaces } from "./kakao-place-provider";
import { runPlaceProviderContract } from "./place-provider.contract";

const fixtureResponse = () => new Response(JSON.stringify(fixture), { headers: { "content-type": "application/json" } });

runPlaceProviderContract(() => createKakaoPlaceProvider({ apiKey: "fixture-key", fetcher: async () => fixtureResponse() }));

describe("kakao place provider", () => {
  it("sends a server-side authenticated keyword request within Kakao's page limit", async () => {
    const requests: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
    const fetcher: typeof fetch = async (input, init) => {
      requests.push([input, init]);
      return fixtureResponse();
    };
    const provider = createKakaoPlaceProvider({ apiKey: "fixture-key", fetcher });
    await provider.search({ query: "  성수 파스타  ", limit: 20 });

    const [url, init] = requests[0] ?? [];
    expect(String(url)).toContain("query=%EC%84%B1%EC%88%98+%ED%8C%8C%EC%8A%A4%ED%83%80");
    expect(String(url)).toContain("size=15");
    expect(init?.headers).toEqual({ Authorization: "KakaoAK fixture-key" });
  });

  it("normalizes the documented keyword response fields", () => {
    expect(parseKakaoPlaces(fixture)[0]).toEqual({
      providerPlaceId: "fixture-kakao-1",
      name: "성수 테스트 키친",
      category: "이탈리안",
      address: "서울 성동구 연무장길 1",
      coordinates: { latitude: 37.544321, longitude: 127.056123 },
      tags: ["음식점", "양식", "이탈리안"],
      parkingTip: null,
      transitTip: null,
    });
  });

  it.each([
    [401, "AUTHENTICATION_FAILED"],
    [403, "AUTHENTICATION_FAILED"],
    [429, "RATE_LIMITED"],
    [500, "PROVIDER_FAILURE"],
  ] as const)("maps status %i to %s", async (status, code) => {
    const provider = createKakaoPlaceProvider({ apiKey: "fixture-key", fetcher: async () => new Response(null, { status }) });
    await expect(provider.search({ query: "성수 파스타", limit: 3 })).rejects.toMatchObject({ code });
  });

  it("maps invalid JSON and invalid documents to INVALID_RESPONSE", async () => {
    const invalidJson = createKakaoPlaceProvider({ apiKey: "fixture-key", fetcher: async () => new Response("{") });
    await expect(invalidJson.search({ query: "성수 파스타", limit: 3 })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(() => parseKakaoPlaces({ documents: [{ id: "missing-fields" }] })).toThrowError(
      expect.objectContaining({ code: "INVALID_RESPONSE" }),
    );
  });

  it("distinguishes timeout from caller cancellation", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))),
    );
    const provider = createKakaoPlaceProvider({ apiKey: "fixture-key", fetcher, timeoutMs: 50 });
    const pending = provider.search({ query: "성수 파스타", limit: 3 });
    const timeoutExpectation = expect(pending).rejects.toMatchObject({ code: "TIMEOUT" });
    await vi.advanceTimersByTimeAsync(50);
    await timeoutExpectation;
    vi.useRealTimers();

    const controller = new AbortController();
    const cancelled = createKakaoPlaceProvider({ apiKey: "fixture-key", fetcher }).search({
      query: "성수 파스타",
      limit: 3,
      signal: controller.signal,
    });
    controller.abort();
    await expect(cancelled).rejects.toMatchObject({ code: "ABORTED" });
  });
});
