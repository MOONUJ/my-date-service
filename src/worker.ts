import type { ApiError } from "./domain";
import { mockPlaceProvider } from "./providers/mock-place-provider";
import { searchPlaces, validateSearchRequest } from "./search";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health" && request.method === "GET") {
      return Response.json({ status: "ok" }, { headers: JSON_HEADERS });
    }

    if (url.pathname === "/api/search" && request.method === "POST") {
      return handleSearch(request);
    }

    return jsonError("NOT_FOUND", "요청한 API를 찾을 수 없습니다.", 404);
  },
} satisfies { fetch(request: Request): Promise<Response> };

async function handleSearch(request: Request): Promise<Response> {
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

  return Response.json(await searchPlaces(searchRequest, mockPlaceProvider), { headers: JSON_HEADERS });
}

function jsonError(code: string, message: string, status: number): Response {
  const body: ApiError = { error: { code, message } };
  return Response.json(body, { status, headers: JSON_HEADERS });
}
