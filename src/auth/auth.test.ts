import { describe, expect, it } from "vitest";
import { clearSessionCookie, hasSameOrigin, validateCredentials } from "./auth";

describe("auth input and request boundaries", () => {
  it("normalizes a valid email and requires a long password", () => {
    expect(validateCredentials({ email: "  USER@Example.COM ", password: "correct horse battery" })).toEqual({
      ok: true,
      email: "user@example.com",
      password: "correct horse battery",
    });
    expect(validateCredentials({ email: "invalid", password: "correct horse battery" })).toEqual({
      ok: false,
      code: "INVALID_EMAIL",
    });
    expect(validateCredentials({ email: "user@example.com", password: "short" })).toEqual({
      ok: false,
      code: "INVALID_PASSWORD",
    });
  });

  it("accepts only an explicit same-origin mutation", () => {
    expect(hasSameOrigin(new Request("https://date.test/api/auth/login", { headers: { origin: "https://date.test" } }))).toBe(true);
    expect(hasSameOrigin(new Request("https://date.test/api/auth/login", { headers: { origin: "https://evil.test" } }))).toBe(false);
    expect(hasSameOrigin(new Request("https://date.test/api/auth/login"))).toBe(false);
  });

  it("clears the opaque session cookie with secure attributes", () => {
    expect(clearSessionCookie()).toContain("HttpOnly; Secure; SameSite=Lax; Max-Age=0");
  });
});
