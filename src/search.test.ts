import { describe, expect, it } from "vitest";
import { mockPlaceProvider } from "./providers/mock-place-provider";
import { searchPlaces, validateSearchRequest } from "./search";

describe("validateSearchRequest", () => {
  it("normalizes a valid request", () => {
    expect(validateSearchRequest({ query: "  성수 파스타  ", taste: "조용한 곳", transport: "transit" })).toEqual({
      query: "성수 파스타",
      taste: "조용한 곳",
      transport: "transit",
    });
  });

  it("rejects invalid and oversized input", () => {
    expect(validateSearchRequest({ query: "성", taste: "", transport: "car" })).toBeNull();
    expect(validateSearchRequest({ query: "성수", taste: "a".repeat(501), transport: "car" })).toBeNull();
    expect(validateSearchRequest({ query: "성수", taste: "", transport: "walk" })).toBeNull();
  });
});

describe("searchPlaces", () => {
  it("returns three ranked recommendations and transport-specific tips", async () => {
    const result = await searchPlaces(
      { query: "성수 마제소바", taste: "조용한 일식", transport: "transit" },
      mockPlaceProvider,
      new Date("2026-08-28T00:00:00.000Z"),
    );

    expect(result.recommendations).toHaveLength(3);
    expect(result.recommendations.map((place) => place.rank)).toEqual([1, 2, 3]);
    expect(result.recommendations[0]?.transitTip).toContain("성수역");
    expect(result.generatedAt).toBe("2026-08-28T00:00:00.000Z");
    expect(result.source).toBe("mock");
  });
});
