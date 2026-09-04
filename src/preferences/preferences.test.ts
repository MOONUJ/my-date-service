import { describe, expect, it } from "vitest";
import { validateTaste } from "./preferences";

describe("taste validation", () => {
  it("trims a useful preference and rejects invalid lengths", () => {
    expect(validateTaste("  조용한 파스타 식당  ")).toBe("조용한 파스타 식당");
    expect(validateTaste(" ")).toBeNull();
    expect(validateTaste("가".repeat(501))).toBeNull();
    expect(validateTaste({ taste: "조용한 곳" })).toBeNull();
  });
});
