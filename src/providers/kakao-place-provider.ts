import {
  type PlaceProvider,
  PlaceProviderError,
  type PlaceProviderSearch,
  type ProviderPlace,
  validateProviderSearch,
} from "./place-provider";

const KAKAO_KEYWORD_SEARCH_URL = "https://dapi.kakao.com/v2/local/search/keyword.json";
const DEFAULT_TIMEOUT_MS = 4_000;
const MAX_RESPONSE_BYTES = 512 * 1024;

export interface KakaoPlaceProviderOptions {
  apiKey: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

interface KakaoDocument {
  address_name: string;
  category_group_name: string;
  category_name: string;
  id: string;
  place_name: string;
  road_address_name: string;
  x: string;
  y: string;
}

export function createKakaoPlaceProvider(options: KakaoPlaceProviderOptions): PlaceProvider {
  const apiKey = options.apiKey.trim();
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    id: "kakao",
    async search(input: PlaceProviderSearch): Promise<ProviderPlace[]> {
      validateProviderSearch(input);
      if (!apiKey) {
        throw new PlaceProviderError("AUTHENTICATION_FAILED", "카카오 장소 검색 키가 설정되지 않았습니다.");
      }

      const controller = new AbortController();
      let timedOut = false;
      const abortFromCaller = () => controller.abort();
      input.signal?.addEventListener("abort", abortFromCaller, { once: true });
      const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);

      try {
        const url = new URL(KAKAO_KEYWORD_SEARCH_URL);
        url.searchParams.set("query", input.query.trim());
        url.searchParams.set("size", String(Math.min(input.limit, 15)));

        const response = await fetcher(url, {
          headers: { Authorization: `KakaoAK ${apiKey}` },
          signal: controller.signal,
        });

        if (response.status === 401 || response.status === 403) {
          throw new PlaceProviderError("AUTHENTICATION_FAILED", "카카오 장소 검색 인증에 실패했습니다.");
        }
        if (response.status === 429) {
          throw new PlaceProviderError("RATE_LIMITED", "카카오 장소 검색 요청 한도를 초과했습니다.");
        }
        if (!response.ok) {
          throw new PlaceProviderError("PROVIDER_FAILURE", "카카오 장소 검색 서비스가 응답하지 않았습니다.");
        }

        const payload = await readJson(response);
        return parseKakaoPlaces(payload).slice(0, input.limit);
      } catch (error) {
        if (error instanceof PlaceProviderError) throw error;
        if (controller.signal.aborted) {
          throw new PlaceProviderError(
            timedOut ? "TIMEOUT" : "ABORTED",
            timedOut ? "카카오 장소 검색 시간이 초과되었습니다." : "장소 검색이 취소되었습니다.",
          );
        }
        throw new PlaceProviderError("PROVIDER_FAILURE", "카카오 장소 검색 중 오류가 발생했습니다.");
      } finally {
        clearTimeout(timeout);
        input.signal?.removeEventListener("abort", abortFromCaller);
      }
    },
  };
}

export function parseKakaoPlaces(payload: unknown): ProviderPlace[] {
  if (!isRecord(payload) || !Array.isArray(payload.documents)) {
    throw new PlaceProviderError("INVALID_RESPONSE", "카카오 장소 검색 응답 형식이 올바르지 않습니다.");
  }

  const seen = new Set<string>();
  return payload.documents.map(parseDocument).filter((place) => {
    if (seen.has(place.providerPlaceId)) return false;
    seen.add(place.providerPlaceId);
    return true;
  });
}

function parseDocument(value: unknown): ProviderPlace {
  if (!isKakaoDocument(value)) {
    throw new PlaceProviderError("INVALID_RESPONSE", "카카오 장소 데이터 형식이 올바르지 않습니다.");
  }

  const latitude = Number(value.y);
  const longitude = Number(value.x);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new PlaceProviderError("INVALID_RESPONSE", "카카오 장소 좌표가 올바르지 않습니다.");
  }

  const categories = value.category_name.split(">").map((category) => category.trim()).filter(Boolean);
  const category = categories.at(-1) ?? value.category_group_name.trim();
  const address = value.road_address_name.trim() || value.address_name.trim();
  if (!category || !address) {
    throw new PlaceProviderError("INVALID_RESPONSE", "카카오 장소 분류 또는 주소가 비어 있습니다.");
  }

  return {
    providerPlaceId: value.id.trim(),
    name: value.place_name.trim(),
    category,
    address,
    coordinates: { latitude, longitude },
    tags: [...new Set([value.category_group_name.trim(), ...categories])].filter(Boolean),
    parkingTip: null,
    transitTip: null,
  };
}

async function readJson(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_RESPONSE_BYTES) {
    throw new PlaceProviderError("INVALID_RESPONSE", "카카오 장소 검색 응답이 너무 큽니다.");
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new PlaceProviderError("INVALID_RESPONSE", "카카오 장소 검색 응답 본문이 없습니다.");
  }

  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new PlaceProviderError("INVALID_RESPONSE", "카카오 장소 검색 응답이 너무 큽니다.");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new PlaceProviderError("INVALID_RESPONSE", "카카오 장소 검색 JSON이 올바르지 않습니다.");
  }
}

function isKakaoDocument(value: unknown): value is KakaoDocument {
  if (!isRecord(value)) return false;
  return ["address_name", "category_group_name", "category_name", "id", "place_name", "road_address_name", "x", "y"].every(
    (key) => typeof value[key] === "string" && (key === "road_address_name" || key === "address_name" || value[key].trim().length > 0),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
