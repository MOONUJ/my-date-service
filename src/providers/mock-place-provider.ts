import {
  type PlaceProvider,
  type PlaceProviderSearch,
  type ProviderPlace,
  validateProviderSearch,
} from "./place-provider";

const MOCK_PLACES: readonly ProviderPlace[] = [
  {
    providerPlaceId: "kanda-seongsu",
    name: "칸다소바 성수점",
    category: "일식 · 마제소바",
    address: "서울 성동구 연무장길 13-1",
    coordinates: { latitude: 37.5446, longitude: 127.0562 },
    tags: ["대화하기 좋은", "일식", "성수"],
    parkingTip: "인근 공영주차장 정보를 방문 전 확인해 주세요.",
    transitTip: "성수역 3번 출구에서 도보 이동이 편리해요.",
  },
  {
    providerPlaceId: "ojo-seongsu",
    name: "성수 오조",
    category: "일식 · 우동",
    address: "서울 성동구 성수이로 88",
    coordinates: { latitude: 37.5428, longitude: 127.0578 },
    tags: ["차분한 분위기", "일식", "데이트"],
    parkingTip: "매장 주차 가능 여부를 예약 전에 확인해 주세요.",
    transitTip: "성수역에서 큰길을 따라 이동할 수 있어요.",
  },
  {
    providerPlaceId: "marea-seongsu",
    name: "마레아 성수",
    category: "양식 · 파스타",
    address: "서울 성동구 연무장5길 9",
    coordinates: { latitude: 37.5439, longitude: 127.0539 },
    tags: ["파스타", "따뜻한 조명", "예약 추천"],
    parkingTip: "주변 유료 주차장을 이용하는 편이 안전해요.",
    transitTip: "성수역 4번 출구에서 골목으로 도보 이동해요.",
  },
  {
    providerPlaceId: "hana-seongsu",
    name: "멘야하나비 성수점",
    category: "일식 · 면요리",
    address: "서울 성동구 아차산로 57",
    coordinates: { latitude: 37.5461, longitude: 127.0551 },
    tags: ["캐주얼", "일식", "빠른 식사"],
    parkingTip: "전용 주차 정보가 없어 인근 주차장을 확인해야 해요.",
    transitTip: "성수역에서 도보로 접근하기 쉬워요.",
  },
];

export const mockPlaceProvider: PlaceProvider = {
  id: "mock",
  async search(input: PlaceProviderSearch): Promise<ProviderPlace[]> {
    validateProviderSearch(input);

    return MOCK_PLACES.slice(0, input.limit).map((place) => ({
      ...place,
      coordinates: { ...place.coordinates },
      tags: [...place.tags],
    }));
  },
};
