import { describe, expect, it } from "vitest";
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
});
