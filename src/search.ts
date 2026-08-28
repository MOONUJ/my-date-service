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
  const places = providerPlaces.map((place, index) => ({
    id: place.providerPlaceId,
    rank: index + 1,
    name: place.name,
    category: place.category,
    address: place.address,
    coordinates: place.coordinates,
    reason: buildReason(place.tags, request.taste),
    transitTip: request.transport === "car" ? place.parkingTip : place.transitTip,
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

function buildReason(tags: readonly string[], taste: string): string {
  const preference = taste.length > 0 ? "등록한 취향" : "데이트 분위기";
  return `${preference}과 잘 맞는 ${tags.slice(0, 2).join(", ")} 장소예요.`;
}
