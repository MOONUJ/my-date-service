import type { ApiError } from "./domain";
import { createKakaoPlaceProvider } from "./providers/kakao-place-provider";
import { mockPlaceProvider } from "./providers/mock-place-provider";
import { type PlaceProvider, PlaceProviderError } from "./providers/place-provider";
import { searchPlaces, validateSearchRequest } from "./search";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

export default {
  async fetch(request: Request, env: Record<string, unknown>): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health" && request.method === "GET") {
      return Response.json({ status: "ok" }, { headers: JSON_HEADERS });
    }

    if (url.pathname === "/api/search" && request.method === "POST") {
      return handleSearch(request, env);
    }

    return jsonError("NOT_FOUND", "요청한 API를 찾을 수 없습니다.", 404);
  },
} satisfies { fetch(request: Request, env: Record<string, unknown>): Promise<Response> };

async function handleSearch(request: Request, env: Record<string, unknown>): Promise<Response> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 2_048) {
    return jsonError("PAYLOAD_TOO_LARGE", "검색 조건이 너무 깁니다.", 413);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("INVALID_JSON", "올바른 JSON 요청이 필요합니다.", 400);
  }

  const searchRequest = validateSearchRequest(body);
  if (!searchRequest) {
    return jsonError("INVALID_SEARCH", "검색어와 이동 수단을 확인해 주세요.", 400);
  }

  try {
    return Response.json(await searchPlaces(searchRequest, selectPlaceProvider(env)), { headers: JSON_HEADERS });
  } catch (error) {
    if (error instanceof PlaceProviderError) return providerError(error);
    return jsonError("SEARCH_FAILED", "장소 검색 중 오류가 발생했습니다.", 502);
  }
}

export function selectPlaceProvider(env: Record<string, unknown>): PlaceProvider {
  const mode = env.PLACE_PROVIDER;
  if (mode === "mock") return mockPlaceProvider;
  if (mode === "kakao") {
    return createKakaoPlaceProvider({ apiKey: typeof env.KAKAO_REST_API_KEY === "string" ? env.KAKAO_REST_API_KEY : "" });
  }
  throw new PlaceProviderError("PROVIDER_FAILURE", "장소 검색 공급자 설정이 올바르지 않습니다.");
}

function providerError(error: PlaceProviderError): Response {
  switch (error.code) {
    case "AUTHENTICATION_FAILED":
      return jsonError("PLACE_PROVIDER_AUTH", "장소 검색 서비스 설정을 확인해 주세요.", 503);
    case "RATE_LIMITED":
      return jsonError("PLACE_PROVIDER_RATE_LIMITED", "장소 검색 요청이 많습니다. 잠시 후 다시 시도해 주세요.", 429);
    case "TIMEOUT":
      return jsonError("PLACE_PROVIDER_TIMEOUT", "장소 검색 응답이 지연되고 있습니다.", 504);
    case "ABORTED":
      return jsonError("SEARCH_ABORTED", "장소 검색이 취소되었습니다.", 499);
    case "INVALID_RESPONSE":
    case "PROVIDER_FAILURE":
      return jsonError("PLACE_PROVIDER_FAILED", "장소 검색 서비스를 일시적으로 사용할 수 없습니다.", 502);
    case "INVALID_QUERY":
    case "INVALID_LIMIT":
      return jsonError("INVALID_SEARCH", "검색 조건을 확인해 주세요.", 400);
  }
}

function jsonError(code: string, message: string, status: number): Response {
  const body: ApiError = { error: { code, message } };
  return Response.json(body, { status, headers: JSON_HEADERS });
}
