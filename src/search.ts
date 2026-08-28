import type { SearchRequest, SearchResponse, Transport } from "./domain";

const MOCK_PLACES = [
  {
    id: "kanda-seongsu",
    name: "칸다소바 성수점",
    category: "일식 · 마제소바",
    address: "서울 성동구 연무장길 13-1",
    coordinates: { latitude: 37.5446, longitude: 127.0562 },
    tags: ["대화하기 좋은", "일식", "성수"],
    carTip: "인근 공영주차장 정보를 방문 전 확인해 주세요.",
    transitTip: "성수역 3번 출구에서 도보 이동이 편리해요.",
  },
  {
    id: "ojo-seongsu",
    name: "성수 오조",
    category: "일식 · 우동",
    address: "서울 성동구 성수이로 88",
    coordinates: { latitude: 37.5428, longitude: 127.0578 },
    tags: ["차분한 분위기", "일식", "데이트"],
    carTip: "매장 주차 가능 여부를 예약 전에 확인해 주세요.",
    transitTip: "성수역에서 큰길을 따라 이동할 수 있어요.",
  },
  {
    id: "marea-seongsu",
    name: "마레아 성수",
    category: "양식 · 파스타",
    address: "서울 성동구 연무장5길 9",
    coordinates: { latitude: 37.5439, longitude: 127.0539 },
    tags: ["파스타", "따뜻한 조명", "예약 추천"],
    carTip: "주변 유료 주차장을 이용하는 편이 안전해요.",
    transitTip: "성수역 4번 출구에서 골목으로 도보 이동해요.",
  },
  {
    id: "hana-seongsu",
    name: "멘야하나비 성수점",
    category: "일식 · 면요리",
    address: "서울 성동구 아차산로 57",
    coordinates: { latitude: 37.5461, longitude: 127.0551 },
    tags: ["캐주얼", "일식", "빠른 식사"],
    carTip: "전용 주차 정보가 없어 인근 주차장을 확인해야 해요.",
    transitTip: "성수역에서 도보로 접근하기 쉬워요.",
  },
] as const;

export function isTransport(value: unknown): value is Transport {
  return value === "car" || value === "transit";
}

export function validateSearchRequest(value: unknown): SearchRequest | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.query !== "string" ||
    candidate.query.trim().length < 2 ||
    candidate.query.length > 80 ||
    typeof candidate.taste !== "string" ||
    candidate.taste.length > 500 ||
    !isTransport(candidate.transport)
  ) {
    return null;
  }

  return {
    query: candidate.query.trim(),
    taste: candidate.taste.trim(),
    transport: candidate.transport,
  };
}

export function searchMockPlaces(request: SearchRequest, now = new Date()): SearchResponse {
  const places = MOCK_PLACES.map((place, index) => ({
    id: place.id,
    rank: index + 1,
    name: place.name,
    category: place.category,
    address: place.address,
    coordinates: place.coordinates,
    reason: buildReason(place.tags, request.taste),
    transitTip: request.transport === "car" ? place.carTip : place.transitTip,
    tags: [...place.tags],
  }));

  return {
    query: request.query,
    generatedAt: now.toISOString(),
    source: "mock",
    recommendations: places.slice(0, 3),
    places,
  };
}

function buildReason(tags: readonly string[], taste: string): string {
  const preference = taste.length > 0 ? "등록한 취향" : "데이트 분위기";
  return `${preference}과 잘 맞는 ${tags.slice(0, 2).join(", ")} 장소예요.`;
}
