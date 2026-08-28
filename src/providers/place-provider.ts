export const MAX_PROVIDER_RESULTS = 20;

export interface PlaceProviderSearch {
  query: string;
  limit: number;
  signal?: AbortSignal;
}

export interface ProviderPlace {
  providerPlaceId: string;
  name: string;
  category: string;
  address: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  tags: string[];
  parkingTip: string | null;
  transitTip: string | null;
}

export interface PlaceProvider {
  readonly id: string;
  search(input: PlaceProviderSearch): Promise<ProviderPlace[]>;
}

export class PlaceProviderError extends Error {
  constructor(
    readonly code:
      | "INVALID_QUERY"
      | "INVALID_LIMIT"
      | "ABORTED"
      | "TIMEOUT"
      | "AUTHENTICATION_FAILED"
      | "RATE_LIMITED"
      | "INVALID_RESPONSE"
      | "PROVIDER_FAILURE",
    message: string,
  ) {
    super(message);
    this.name = "PlaceProviderError";
  }
}

export function validateProviderSearch(input: PlaceProviderSearch): void {
  if (input.signal?.aborted) {
    throw new PlaceProviderError("ABORTED", "장소 검색이 취소되었습니다.");
  }

  if (input.query.trim().length < 2 || input.query.length > 80) {
    throw new PlaceProviderError("INVALID_QUERY", "검색어는 2자 이상 80자 이하여야 합니다.");
  }

  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > MAX_PROVIDER_RESULTS) {
    throw new PlaceProviderError("INVALID_LIMIT", `검색 결과 수는 1에서 ${MAX_PROVIDER_RESULTS} 사이여야 합니다.`);
  }
}
