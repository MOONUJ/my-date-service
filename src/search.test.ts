import { describe, expect, it } from "vitest";
import type { ProviderPlace } from "./providers/place-provider";
import { mockPlaceProvider } from "./providers/mock-place-provider";
import { curatePlaces, searchPlaces, validateSearchRequest } from "./search";

const place = (overrides: Partial<ProviderPlace> & Pick<ProviderPlace, "providerPlaceId" | "name">): ProviderPlace => ({
  providerPlaceId: overrides.providerPlaceId,
  name: overrides.name,
  category: overrides.category ?? "음식점",
  address: overrides.address ?? "서울 성동구",
  coordinates: overrides.coordinates ?? { latitude: 37.54, longitude: 127.05 },
  tags: overrides.tags ?? [],
  parkingTip: overrides.parkingTip ?? null,
  transitTip: overrides.transitTip ?? null,
});

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

describe("curatePlaces", () => {
  const candidates = [
    place({ providerPlaceId: "quiet", name: "고요", category: "한식", tags: ["조용한 분위기"] }),
    place({ providerPlaceId: "pasta", name: "마레", category: "양식 · 파스타", tags: ["따뜻한 조명"] }),
    place({ providerPlaceId: "sushi", name: "스시야", category: "일식", tags: ["오마카세"] }),
    place({ providerPlaceId: "casual", name: "산책", tags: ["캐주얼"] }),
  ];

  it("changes the recommendation order using matched taste evidence", () => {
    const pastaResult = curatePlaces({ query: "성수 맛집", taste: "파스타", transport: "transit" }, "test", candidates);
    const quietResult = curatePlaces({ query: "성수 맛집", taste: "조용한 분위기", transport: "transit" }, "test", candidates);

    expect(pastaResult.recommendations[0]?.id).toBe("pasta");
    expect(quietResult.recommendations[0]?.id).toBe("quiet");
    expect(pastaResult.recommendations[0]?.reason).toContain("양식 · 파스타");
    expect(pastaResult.recommendations[0]?.reason).not.toContain("조용한");
  });

  it("uses transport information as a small tie-breaker and mentions only available guidance", () => {
    const transportCandidates = [
      place({ providerPlaceId: "none", name: "안내 없음", tags: ["데이트"] }),
      place({ providerPlaceId: "transit", name: "역세권", tags: ["데이트"], transitTip: "성수역 1번 출구" }),
      place({ providerPlaceId: "parking", name: "주차 가능", tags: ["데이트"], parkingTip: "건물 주차장" }),
    ];

    const transitResult = curatePlaces(
      { query: "성수 맛집", taste: "데이트", transport: "transit" },
      "test",
      transportCandidates,
    );
    const carResult = curatePlaces({ query: "성수 맛집", taste: "데이트", transport: "car" }, "test", transportCandidates);

    expect(transitResult.places.map(({ id }) => id)).toEqual(["transit", "none", "parking"]);
    expect(transitResult.places[0]?.reason).toContain("대중교통 안내");
    expect(transitResult.places[1]?.reason).not.toContain("대중교통 안내");
    expect(carResult.places.map(({ id }) => id)).toEqual(["parking", "none", "transit"]);
    expect(carResult.places[0]?.reason).toContain("주차 안내");
  });

  it("keeps provider order for equal scores and assigns consecutive ranks", () => {
    const result = curatePlaces({ query: "성수 맛집", taste: "루프탑", transport: "transit" }, "test", candidates);

    expect(result.places.map(({ id }) => id)).toEqual(["quiet", "pasta", "sushi", "casual"]);
    expect(result.places.map(({ rank }) => rank)).toEqual([1, 2, 3, 4]);
    expect(result.recommendations.map(({ rank }) => rank)).toEqual([1, 2, 3]);
    expect(result.places[0]?.reason).toBe("취향과 직접 일치하는 장소 정보는 없어 검색 결과를 기준으로 추천했어요.");
  });

  it("handles empty taste, missing evidence, and fewer than three results", () => {
    const result = curatePlaces(
      { query: "성수 맛집", taste: "", transport: "car" },
      "test",
      [place({ providerPlaceId: "empty", name: "빈 태그" }), place({ providerPlaceId: "parking", name: "주차", parkingTip: "주차장" })],
    );

    expect(result.places.map(({ id }) => id)).toEqual(["parking", "empty"]);
    expect(result.recommendations).toHaveLength(2);
    expect(result.places[0]?.reason).toBe("검색 결과 순서와 주차 안내 여부를 기준으로 추천했어요.");
    expect(result.places[1]?.reason).toBe("검색 결과 순서를 기준으로 추천했어요.");
  });
});
