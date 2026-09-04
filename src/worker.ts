import type { ApiError } from "./domain";
import { applyAiCuration } from "./ai/curation";
import { createOpenAiCurator } from "./ai/openai-curator";
import {
  clearSessionCookie,
  createSession,
  createUser,
  deleteAccount,
  getSessionUser,
  hasSameOrigin,
  revokeSession,
  validateCredentials,
  validateAccountDeletion,
  verifyCredentials,
  verifyUserPassword,
} from "./auth/auth";
import { getPreference, savePreference, validateTaste } from "./preferences/preferences";
import { createKakaoPlaceProvider } from "./providers/kakao-place-provider";
import { mockPlaceProvider } from "./providers/mock-place-provider";
import { type PlaceProvider, PlaceProviderError } from "./providers/place-provider";
import { consumeRateLimit, networkSubject, RateLimitConfigurationError, type RateLimitPolicy } from "./rate-limit/rate-limit";
import { searchPlaces, validateSearchRequest } from "./search";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const AUTH_BODY_LIMIT = 1_024;
const SEARCH_BODY_LIMIT = 2_048;
const AUTH_RATE_LIMIT = { scope: "auth", limit: 5, windowSeconds: 5 * 60 } satisfies RateLimitPolicy;
const PREFERENCE_RATE_LIMIT = { scope: "preference", limit: 10, windowSeconds: 60 } satisfies RateLimitPolicy;
const SEARCH_RATE_LIMIT = { scope: "search", limit: 20, windowSeconds: 60 } satisfies RateLimitPolicy;

export type AppEnv = Omit<Env, "ENABLE_SIGNUP" | "PLACE_PROVIDER"> & {
  ENABLE_SIGNUP?: string;
  PLACE_PROVIDER?: string;
  OPENAI_API_KEY?: string;
  OPENAI_FETCH?: typeof fetch;
  RATE_LIMIT_SECRET?: string;
  RATE_LIMIT_NETWORK_FALLBACK?: string;
} & Record<string, unknown>;

export default {
  async fetch(request: Request, env: AppEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/health" && request.method === "GET") {
      return Response.json({ status: "ok" }, { headers: JSON_HEADERS });
    }

    try {
      if (url.pathname === "/api/auth/session" && request.method === "GET") return await handleSession(request, env);
      if (url.pathname === "/api/auth/signup" && request.method === "POST") return await handleSignup(request, env);
      if (url.pathname === "/api/auth/login" && request.method === "POST") return await handleLogin(request, env);
      if (url.pathname === "/api/auth/logout" && request.method === "POST") return await handleLogout(request, env);
      if (url.pathname === "/api/account" && request.method === "DELETE") return await handleDeleteAccount(request, env);
      if (url.pathname === "/api/preferences" && request.method === "GET") return await handleGetPreference(request, env);
      if (url.pathname === "/api/preferences" && request.method === "PUT") return await handleSavePreference(request, env);
      if (url.pathname === "/api/search" && request.method === "POST") return await handleSearch(request, env);
    } catch (error) {
      if (error instanceof RateLimitConfigurationError) {
        return jsonError("SERVICE_MISCONFIGURED", "요청 보호 설정을 확인해 주세요.", 503);
      }
      return jsonError("DATABASE_UNAVAILABLE", "사용자 정보를 일시적으로 불러올 수 없습니다.", 503);
    }

    return jsonError("NOT_FOUND", "요청한 API를 찾을 수 없습니다.", 404);
  },
} satisfies { fetch(request: Request, env: AppEnv): Promise<Response> };

async function handleSession(request: Request, env: AppEnv): Promise<Response> {
  const user = await getSessionUser(env.DB, request);
  if (!user) return Response.json({ user: null, signupEnabled: isSignupEnabled(env) }, { headers: JSON_HEADERS });
  const preference = await getPreference(env.DB, user.id);
  return Response.json({ user, preference, signupEnabled: isSignupEnabled(env) }, { headers: JSON_HEADERS });
}

async function handleSignup(request: Request, env: AppEnv): Promise<Response> {
  if (!isSignupEnabled(env)) return jsonError("SIGNUP_DISABLED", "현재 회원가입이 닫혀 있습니다.", 403);
  const unsafeRequest = rejectCrossOrigin(request);
  if (unsafeRequest) return unsafeRequest;
  const parsed = await readJson(request, AUTH_BODY_LIMIT);
  if (!parsed.ok) return parsed.response;
  const credentials = validateCredentials(parsed.value);
  if (!credentials.ok) return credentialValidationError(credentials.code);
  const limited = await applyNetworkRateLimit(request, env, { ...AUTH_RATE_LIMIT, scope: "auth:signup" });
  if (limited) return limited;
  try {
    const user = await createUser(env.DB, credentials.email, credentials.password);
    const cookie = await createSession(env.DB, user.id);
    return Response.json(
      { user, preference: { taste: "", updatedAt: null } },
      { status: 201, headers: { ...JSON_HEADERS, "set-cookie": cookie } },
    );
  } catch (error) {
    if (isDuplicateEmailError(error)) return jsonError("EMAIL_ALREADY_USED", "이미 등록된 이메일입니다.", 409);
    throw error;
  }
}

async function handleLogin(request: Request, env: AppEnv): Promise<Response> {
  const unsafeRequest = rejectCrossOrigin(request);
  if (unsafeRequest) return unsafeRequest;
  const parsed = await readJson(request, AUTH_BODY_LIMIT);
  if (!parsed.ok) return parsed.response;
  const credentials = validateCredentials(parsed.value);
  if (!credentials.ok) return credentialValidationError(credentials.code);
  const limited = await applyNetworkRateLimit(request, env, { ...AUTH_RATE_LIMIT, scope: "auth:login" });
  if (limited) return limited;
  const user = await verifyCredentials(env.DB, credentials.email, credentials.password);
  if (!user) return jsonError("INVALID_CREDENTIALS", "이메일 또는 비밀번호를 확인해 주세요.", 401);
  const [cookie, preference] = await Promise.all([createSession(env.DB, user.id), getPreference(env.DB, user.id)]);
  return Response.json({ user, preference }, { headers: { ...JSON_HEADERS, "set-cookie": cookie } });
}

async function handleLogout(request: Request, env: AppEnv): Promise<Response> {
  const unsafeRequest = rejectCrossOrigin(request);
  if (unsafeRequest) return unsafeRequest;
  await revokeSession(env.DB, request);
  return Response.json({ ok: true }, { headers: { ...JSON_HEADERS, "set-cookie": clearSessionCookie() } });
}

async function handleDeleteAccount(request: Request, env: AppEnv): Promise<Response> {
  const unsafeRequest = rejectCrossOrigin(request);
  if (unsafeRequest) return unsafeRequest;
  const user = await getSessionUser(env.DB, request);
  if (!user) return unauthorized();
  const parsed = await readJson(request, AUTH_BODY_LIMIT);
  if (!parsed.ok) return parsed.response;
  const deletion = validateAccountDeletion(parsed.value);
  if (!deletion.ok) {
    return deletion.code === "INVALID_CONFIRMATION"
      ? jsonError(deletion.code, "확인란에 ‘계정 삭제’를 정확히 입력해 주세요.", 400)
      : jsonError(deletion.code, "현재 비밀번호를 확인해 주세요.", 400);
  }
  const limited = await applyNetworkRateLimit(request, env, { ...AUTH_RATE_LIMIT, scope: "auth:account-delete" }, user.id);
  if (limited) return limited;
  if (!(await verifyUserPassword(env.DB, user.id, deletion.password))) {
    return jsonError("INVALID_ACCOUNT_CREDENTIALS", "현재 비밀번호를 확인해 주세요.", 401);
  }
  if (!(await deleteAccount(env.DB, user.id))) return unauthorized();
  return Response.json(
    { ok: true },
    { headers: { ...JSON_HEADERS, "set-cookie": clearSessionCookie() } },
  );
}

async function handleGetPreference(request: Request, env: AppEnv): Promise<Response> {
  const user = await getSessionUser(env.DB, request);
  if (!user) return unauthorized();
  return Response.json(await getPreference(env.DB, user.id), { headers: JSON_HEADERS });
}

async function handleSavePreference(request: Request, env: AppEnv): Promise<Response> {
  const unsafeRequest = rejectCrossOrigin(request);
  if (unsafeRequest) return unsafeRequest;
  const user = await getSessionUser(env.DB, request);
  if (!user) return unauthorized();
  const parsed = await readJson(request, AUTH_BODY_LIMIT);
  if (!parsed.ok) return parsed.response;
  const taste = isRecord(parsed.value) ? validateTaste(parsed.value.taste) : null;
  if (!taste) return jsonError("INVALID_TASTE", "취향은 2자 이상 500자 이하로 입력해 주세요.", 400);
  const limited = await applyUserRateLimit(env, user.id, PREFERENCE_RATE_LIMIT);
  if (limited) return limited;
  return Response.json(await savePreference(env.DB, user.id, taste), { headers: JSON_HEADERS });
}

async function handleSearch(request: Request, env: AppEnv): Promise<Response> {
  const user = await getSessionUser(env.DB, request);
  if (!user) return unauthorized();
  const parsed = await readJson(request, SEARCH_BODY_LIMIT);
  if (!parsed.ok) return parsed.response;
  const preference = await getPreference(env.DB, user.id);
  if (!preference.taste) return jsonError("TASTE_REQUIRED", "검색 전에 나의 취향을 저장해 주세요.", 409);
  const searchRequest = validateSearchRequest(isRecord(parsed.value) ? { ...parsed.value, taste: preference.taste } : parsed.value);
  if (!searchRequest) return jsonError("INVALID_SEARCH", "검색어와 이동 수단을 확인해 주세요.", 400);
  const limited = await applyUserRateLimit(env, user.id, SEARCH_RATE_LIMIT);
  if (limited) return limited;

  try {
    const deterministic = await searchPlaces({ ...searchRequest, taste: preference.taste }, selectPlaceProvider(env));
    const apiKey = typeof env.OPENAI_API_KEY === "string" ? env.OPENAI_API_KEY.trim() : "";
    const result = await applyAiCuration({
      db: env.DB,
      userId: user.id,
      preferenceUpdatedAt: preference.updatedAt ?? "",
      request: searchRequest,
      deterministic,
      curator: apiKey ? createOpenAiCurator(apiKey, env.OPENAI_FETCH ?? fetch) : null,
    });
    return Response.json(result, { headers: JSON_HEADERS });
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

function rejectCrossOrigin(request: Request): Response | null {
  return hasSameOrigin(request) ? null : jsonError("INVALID_ORIGIN", "허용되지 않은 요청입니다.", 403);
}

async function readJson(
  request: Request,
  limit: number,
): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > limit) return { ok: false, response: jsonError("PAYLOAD_TOO_LARGE", "요청 내용이 너무 깁니다.", 413) };
  const reader = request.body?.getReader();
  if (!reader) return { ok: false, response: jsonError("INVALID_JSON", "올바른 JSON 요청이 필요합니다.", 400) };
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        return { ok: false, response: jsonError("PAYLOAD_TOO_LARGE", "요청 내용이 너무 깁니다.", 413) };
      }
      chunks.push(value);
    }
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { ok: true, value: JSON.parse(new TextDecoder().decode(body)) as unknown };
  } catch {
    return { ok: false, response: jsonError("INVALID_JSON", "올바른 JSON 요청이 필요합니다.", 400) };
  }
}

function credentialValidationError(code: "INVALID_EMAIL" | "INVALID_PASSWORD"): Response {
  return code === "INVALID_EMAIL"
    ? jsonError(code, "올바른 이메일을 입력해 주세요.", 400)
    : jsonError(code, "비밀번호는 12자 이상 128자 이하로 입력해 주세요.", 400);
}

function unauthorized(): Response {
  return jsonError("AUTH_REQUIRED", "로그인이 필요합니다.", 401);
}

function isDuplicateEmailError(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed: users\.email/u.test(error.message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSignupEnabled(env: Record<string, unknown>): boolean {
  return env.ENABLE_SIGNUP === "true";
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

async function applyNetworkRateLimit(
  request: Request,
  env: AppEnv,
  policy: RateLimitPolicy,
  userId?: string,
): Promise<Response | null> {
  return rateLimitResponse(await consumeRateLimit({
    db: env.DB,
    secret: env.RATE_LIMIT_SECRET?.trim() ?? "",
    subject: networkSubject(request, env.RATE_LIMIT_NETWORK_FALLBACK?.trim() || "local-development"),
    policy,
    userId,
  }));
}

async function applyUserRateLimit(env: AppEnv, userId: string, policy: RateLimitPolicy): Promise<Response | null> {
  return rateLimitResponse(await consumeRateLimit({
    db: env.DB,
    secret: env.RATE_LIMIT_SECRET?.trim() ?? "",
    subject: userId,
    policy,
    userId,
  }));
}

function rateLimitResponse(result: { allowed: boolean; retryAfterSeconds: number }): Response | null {
  if (result.allowed) return null;
  const response = jsonError("REQUEST_RATE_LIMITED", "요청이 많습니다. 잠시 후 다시 시도해 주세요.", 429);
  response.headers.set("Retry-After", String(result.retryAfterSeconds));
  return response;
}

function jsonError(code: string, message: string, status: number): Response {
  const body: ApiError = { error: { code, message } };
  return Response.json(body, { status, headers: JSON_HEADERS });
}
