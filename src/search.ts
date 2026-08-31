import type { SearchRequest, SearchResponse, Transport } from "./domain";
import type { PlaceProvider, ProviderPlace } from "./providers/place-provider";

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

export async function searchPlaces(
  request: SearchRequest,
  provider: PlaceProvider,
  now = new Date(),
): Promise<SearchResponse> {
  const providerPlaces = await provider.search({ query: request.query, limit: 12 });
  return curatePlaces(request, provider.id, providerPlaces, now);
}

export function curatePlaces(
  request: SearchRequest,
  source: string,
  providerPlaces: ProviderPlace[],
  now = new Date(),
): SearchResponse {
  const tasteTokens = tokenize(request.taste);
  const rankedPlaces = providerPlaces
    .map((place, providerIndex) => {
      const matchedEvidence = findMatchedEvidence(place, tasteTokens);
      const transitTip = request.transport === "car" ? place.parkingTip : place.transitTip;

      return {
        providerIndex,
        score: matchedEvidence.length * 10 + (transitTip === null ? 0 : 1),
        place,
        matchedEvidence,
        transitTip,
      };
    })
    .sort((left, right) => right.score - left.score || left.providerIndex - right.providerIndex);

  const places = rankedPlaces.map(({ place, matchedEvidence, transitTip }, index) => ({
    id: place.providerPlaceId,
    rank: index + 1,
    name: place.name,
    category: place.category,
    address: place.address,
    coordinates: place.coordinates,
    reason: buildReason(matchedEvidence, request.taste, request.transport, transitTip !== null),
    transitTip,
    tags: [...place.tags],
  }));

  return {
    query: request.query,
    generatedAt: now.toISOString(),
    source,
    recommendations: places.slice(0, 3),
    places,
  };
}

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function tokenize(value: string): string[] {
  return [...new Set(normalize(value).split(/\s+/u).filter((token) => token.length >= 2))];
}

function findMatchedEvidence(place: ProviderPlace, tasteTokens: readonly string[]): string[] {
  if (tasteTokens.length === 0) return [];

  const evidence = [place.name, place.category, ...place.tags];
  return [...new Set(evidence.filter((value) => {
    const normalizedValue = normalize(value);
    return normalizedValue.length > 0 && tasteTokens.some((token) => normalizedValue.includes(token));
  }))];
}

function buildReason(
  matchedEvidence: readonly string[],
  taste: string,
  transport: Transport,
  hasTransportTip: boolean,
): string {
  const transportEvidence = hasTransportTip
    ? `${transport === "car" ? "주차" : "대중교통"} 안내를 확인할 수 있어요.`
    : null;

  if (matchedEvidence.length > 0) {
    const preferenceEvidence = matchedEvidence.slice(0, 2).map((value) => `“${value}”`).join(", ");
    return `${preferenceEvidence} 정보가 취향과 일치해요.${transportEvidence ? ` ${transportEvidence}` : ""}`;
  }

  if (taste.length > 0) {
    return `취향과 직접 일치하는 장소 정보는 없어 검색 결과를 기준으로 추천했어요.${transportEvidence ? ` ${transportEvidence}` : ""}`;
  }

  return `검색 결과 순서${transportEvidence ? `와 ${transport === "car" ? "주차" : "대중교통"} 안내 여부` : ""}를 기준으로 추천했어요.`;
}
