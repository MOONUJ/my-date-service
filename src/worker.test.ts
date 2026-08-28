import { describe, expect, it } from "vitest";
import worker, { selectPlaceProvider } from "./worker";

describe("place provider selection", () => {
  it("requires an explicit supported mode", () => {
    expect(selectPlaceProvider({ PLACE_PROVIDER: "mock" }).id).toBe("mock");
    expect(selectPlaceProvider({ PLACE_PROVIDER: "kakao", KAKAO_REST_API_KEY: "fixture-key" }).id).toBe("kakao");
    expect(() => selectPlaceProvider({})).toThrowError(expect.objectContaining({ code: "PROVIDER_FAILURE" }));
  });

  it("does not silently fall back when kakao credentials are missing", async () => {
    const response = await worker.fetch(
      new Request("https://example.test/api/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: "성수 파스타", taste: "조용한 곳", transport: "transit" }),
      }),
      { PLACE_PROVIDER: "kakao" },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "PLACE_PROVIDER_AUTH" } });
  });
});
