import type { ApiError, AuthResponse, Preference, SearchRequest, SearchResponse, SessionResponse, Transport } from "./domain";
import { createKakaoMapController, createMapPresenter, loadKakaoMapsSdk, type MapViewState } from "./map/kakao-map";
import "./styles.css";

const DEFAULT_TASTE = "조용하고 대화하기 좋은 분위기, 일식이나 파스타 선호";
const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("App root is missing");

app.innerHTML = `
  <section id="auth-view" class="auth-view" aria-labelledby="auth-title">
    <div class="auth-card">
      <a class="brand auth-brand" href="#auth-title" aria-label="Date Mate 홈"><span class="brand-mark" aria-hidden="true">D</span><span>Date Mate</span></a>
      <p class="eyebrow">PRIVATE DATE CURATION</p>
      <h1 id="auth-title">나의 취향으로<br /><em>시작해요.</em></h1>
      <p class="auth-copy">개인 취향은 로그인한 계정에만 저장됩니다.</p>
      <form id="auth-form" novalidate>
        <label class="field-label" for="email">이메일</label>
        <input id="email" name="email" type="email" autocomplete="email" maxlength="254" required />
        <label class="field-label" for="password">비밀번호</label>
        <input id="password" name="password" type="password" autocomplete="current-password" minlength="12" maxlength="128" required />
        <p class="field-help">비밀번호는 12자 이상 입력해 주세요.</p>
        <div id="auth-status" class="form-status" role="status" aria-live="polite"></div>
        <button id="login-button" class="primary-button" type="submit">로그인</button>
        <button id="signup-button" class="secondary-button" type="button" hidden>개인 계정 만들기</button>
      </form>
    </div>
  </section>

  <div id="service-view" hidden>
    <header class="topbar">
      <a class="brand" href="#top" aria-label="Date Mate 홈"><span class="brand-mark" aria-hidden="true">D</span><span>Date Mate</span></a>
      <div class="account-actions">
        <span id="account-email" class="account-email"></span>
        <button class="profile-button" type="button" aria-label="취향 설정 열기" aria-expanded="false"><span class="profile-dot" aria-hidden="true"></span>나의 취향</button>
        <button id="logout-button" class="text-button" type="button">로그아웃</button>
      </div>
    </header>

    <main id="top" class="page-shell">
      <section class="intro" aria-labelledby="intro-title">
        <p class="eyebrow">AI DATE CURATION</p>
        <h1 id="intro-title">검색은 짧게,<br /><em>데이트는 오래.</em></h1>
        <p class="intro-copy">내 취향과 오늘의 이동 방식을 반영해 실패 확률을 줄인 장소 세 곳을 먼저 보여드려요.</p>
      </section>

      <section class="search-panel" aria-label="데이트 장소 검색">
        <form id="search-form">
          <label class="field-label" for="query">어디에서 무엇을 찾나요?</label>
          <div class="search-row"><input id="query" name="query" type="search" value="성수동 마제소바" minlength="2" maxlength="80" required /><button class="primary-button" type="submit">찾아보기</button></div>
          <fieldset class="transport-fieldset"><legend>오늘의 이동 방식</legend><label><input type="radio" name="transport" value="car" checked /><span>자가용 · 주차 중요</span></label><label><input type="radio" name="transport" value="transit" /><span>대중교통 · 도보 중요</span></label></fieldset>
        </form>
        <div class="taste-summary"><span>저장된 취향 기준</span><p></p></div>
      </section>

      <section id="results" class="results" aria-labelledby="results-title" aria-live="polite">
        <div class="section-heading"><div><p class="eyebrow">PERSONAL PICKS</p><h2 id="results-title">오늘의 추천</h2></div><p id="result-meta">검색 전이에요</p></div>
        <div id="status" class="status-card">검색하면 취향에 맞는 세 곳을 먼저 골라드려요.</div>
        <div id="recommendations" class="recommendation-grid"></div>
      </section>

      <section class="map-section" aria-labelledby="map-title">
        <div class="section-heading"><div><p class="eyebrow">NEIGHBORHOOD</p><h2 id="map-title">한눈에 비교하기</h2></div></div>
        <div class="map-shell"><div id="map-canvas" class="map-canvas" aria-hidden="true"></div><div id="map-fallback" class="map-fallback" role="status"><p><strong>검색 결과를 기다리고 있어요</strong><br />검색하면 장소 위치를 지도에 함께 표시해 드려요.</p></div></div>
        <div id="place-list" class="place-list"></div>
      </section>
    </main>
  </div>

  <dialog id="taste-dialog" class="taste-dialog">
    <form id="taste-form">
      <div class="dialog-heading"><div><p class="eyebrow">MY TASTE</p><h2>나의 취향</h2></div><button id="close-taste" type="button" aria-label="닫기">×</button></div>
      <label class="field-label" for="taste">데이트 장소를 고를 때 중요한 점</label>
      <textarea id="taste" maxlength="500" minlength="2" rows="6" required></textarea>
      <p class="field-help">취향은 계정에 안전하게 저장되고 추천 순위에 사용됩니다.</p>
      <div id="taste-status" class="form-status" role="status" aria-live="polite"></div>
      <button id="save-taste" class="primary-button dialog-save" type="submit">취향 저장하기</button>
      <div class="danger-zone"><p><strong>계정과 저장 데이터 삭제</strong><br />삭제한 계정은 복구할 수 없습니다.</p><button id="open-delete-account" class="danger-link" type="button">계정 삭제</button></div>
    </form>
  </dialog>

  <dialog id="delete-account-dialog" class="taste-dialog delete-account-dialog" aria-labelledby="delete-account-title">
    <form id="delete-account-form">
      <div class="dialog-heading"><div><p class="eyebrow">DELETE ACCOUNT</p><h2 id="delete-account-title">계정 삭제</h2></div><button id="close-delete-account" type="button" aria-label="계정 삭제 취소">×</button></div>
      <p class="delete-warning">계정, 저장된 취향, 모든 로그인 세션과 사용자별 추천 캐시가 즉시 삭제되며 복구할 수 없습니다.</p>
      <label class="field-label" for="delete-password">현재 비밀번호</label>
      <input id="delete-password" name="password" type="password" autocomplete="current-password" minlength="12" maxlength="128" required />
      <label class="field-label" for="delete-confirmation">확인을 위해 ‘계정 삭제’ 입력</label>
      <input id="delete-confirmation" name="confirmation" type="text" autocomplete="off" required />
      <div id="delete-account-status" class="form-status" role="status" aria-live="polite"></div>
      <div class="delete-actions"><button id="cancel-delete-account" class="secondary-button" type="button">취소</button><button id="confirm-delete-account" class="danger-button" type="submit">영구 삭제</button></div>
    </form>
  </dialog>

  <footer id="footer" hidden>Made for unhurried dates · Seoul</footer>
`;

const authView = getElement<HTMLElement>("auth-view");
const skipLink = getElement<HTMLAnchorElement>("skip-link");
const serviceView = getElement<HTMLDivElement>("service-view");
const authForm = getElement<HTMLFormElement>("auth-form");
const authStatus = getElement<HTMLDivElement>("auth-status");
const signupButton = getElement<HTMLButtonElement>("signup-button");
const loginButton = getElement<HTMLButtonElement>("login-button");
const logoutButton = getElement<HTMLButtonElement>("logout-button");
const accountEmail = getElement<HTMLSpanElement>("account-email");
const footer = getElement<HTMLElement>("footer");
const form = getElement<HTMLFormElement>("search-form");
const recommendations = getElement<HTMLDivElement>("recommendations");
const placeList = getElement<HTMLDivElement>("place-list");
const status = getElement<HTMLDivElement>("status");
const resultMeta = getElement<HTMLParagraphElement>("result-meta");
const dialog = getElement<HTMLDialogElement>("taste-dialog");
const profileButton = document.querySelector<HTMLButtonElement>(".profile-button");
const tasteForm = getElement<HTMLFormElement>("taste-form");
const tasteInput = getElement<HTMLTextAreaElement>("taste");
const tasteStatus = getElement<HTMLDivElement>("taste-status");
const closeTasteButton = getElement<HTMLButtonElement>("close-taste");
const openDeleteAccountButton = getElement<HTMLButtonElement>("open-delete-account");
const deleteAccountDialog = getElement<HTMLDialogElement>("delete-account-dialog");
const deleteAccountForm = getElement<HTMLFormElement>("delete-account-form");
const deleteAccountStatus = getElement<HTMLDivElement>("delete-account-status");
const closeDeleteAccountButton = getElement<HTMLButtonElement>("close-delete-account");
const cancelDeleteAccountButton = getElement<HTMLButtonElement>("cancel-delete-account");
const confirmDeleteAccountButton = getElement<HTMLButtonElement>("confirm-delete-account");
const tasteSummary = document.querySelector<HTMLElement>(".taste-summary p");
const submitButton = form.querySelector<HTMLButtonElement>("button[type='submit']");
const mapCanvas = getElement<HTMLDivElement>("map-canvas");
const mapFallback = getElement<HTMLDivElement>("map-fallback");
const mapPresenter = createMapPresenter(() => loadKakaoMapsSdk(import.meta.env.VITE_KAKAO_MAP_JAVASCRIPT_KEY ?? ""), (sdk) => createKakaoMapController(mapCanvas, sdk), renderMapState);

let currentTaste = "";
let searchInFlight = false;
let searchCooldownUntil = 0;
let searchCooldownTimer: number | undefined;

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await authenticate("login");
});

signupButton.addEventListener("click", async () => authenticate("signup"));
logoutButton.addEventListener("click", async () => {
  logoutButton.disabled = true;
  try {
    await apiRequest<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
    resetServiceState();
    showAuth(false);
  } catch (error) {
    status.hidden = false;
    status.className = "status-card error";
    status.textContent = messageFrom(error, "로그아웃하지 못했습니다.");
  } finally {
    logoutButton.disabled = false;
  }
});

profileButton?.addEventListener("click", () => {
  profileButton.setAttribute("aria-expanded", "true");
  tasteInput.value = currentTaste;
  tasteStatus.textContent = "";
  dialog.showModal();
});
closeTasteButton.addEventListener("click", () => dialog.close());
dialog.addEventListener("close", () => profileButton?.setAttribute("aria-expanded", "false"));
openDeleteAccountButton.addEventListener("click", () => {
  dialog.close();
  deleteAccountForm.reset();
  deleteAccountStatus.textContent = "";
  deleteAccountDialog.showModal();
});
const closeDeleteAccount = () => deleteAccountDialog.close();
closeDeleteAccountButton.addEventListener("click", closeDeleteAccount);
cancelDeleteAccountButton.addEventListener("click", closeDeleteAccount);
deleteAccountDialog.addEventListener("close", () => profileButton?.focus());

deleteAccountForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!deleteAccountForm.reportValidity()) return;
  const data = new FormData(deleteAccountForm);
  confirmDeleteAccountButton.disabled = true;
  deleteAccountStatus.textContent = "계정과 저장 데이터를 삭제하고 있어요…";
  try {
    await apiRequest<{ ok: boolean }>("/api/account", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: data.get("password"), confirmation: data.get("confirmation") }),
    });
    deleteAccountDialog.close();
    resetServiceState();
    showAuth(false);
    authStatus.textContent = "계정과 저장 데이터가 삭제됐습니다.";
  } catch (error) {
    deleteAccountStatus.textContent = messageFrom(error, "계정을 삭제하지 못했습니다.");
  } finally {
    confirmDeleteAccountButton.disabled = false;
  }
});

tasteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const saveButton = getElement<HTMLButtonElement>("save-taste");
  saveButton.disabled = true;
  tasteStatus.textContent = "저장 중…";
  try {
    const preference = await apiRequest<Preference>("/api/preferences", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ taste: tasteInput.value }),
    });
    setPreference(preference);
    dialog.close();
  } catch (error) {
    tasteStatus.textContent = messageFrom(error, "취향을 저장하지 못했습니다.");
  } finally {
    saveButton.disabled = false;
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (searchInFlight || Date.now() < searchCooldownUntil) return;
  if (!currentTaste) {
    status.hidden = false;
    status.className = "status-card error";
    status.textContent = "먼저 나의 취향을 저장해 주세요.";
    profileButton?.focus();
    return;
  }
  const formData = new FormData(form);
  const request: SearchRequest = {
    query: String(formData.get("query") ?? ""),
    transport: String(formData.get("transport") ?? "car") as Transport,
    taste: currentTaste,
  };
  searchInFlight = true;
  setLoading(true);
  try {
    renderResults(await apiRequest<SearchResponse>("/api/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) }));
  } catch (error) {
    status.hidden = false;
    status.className = "status-card error";
    status.textContent = messageFrom(error, "잠시 후 다시 검색해 주세요.");
    if (error instanceof ApiRequestError && error.code === "REQUEST_RATE_LIMITED" && error.retryAfterSeconds > 0) {
      startSearchCooldown(error.retryAfterSeconds);
    }
  } finally {
    searchInFlight = false;
    setLoading(false);
  }
});

void initialize();

async function initialize(): Promise<void> {
  authStatus.textContent = "로그인 상태를 확인하고 있어요…";
  try {
    const session = await apiRequest<SessionResponse>("/api/auth/session");
    signupButton.hidden = !session.signupEnabled;
    if (session.user) showService(session.user.email, session.preference ?? { taste: "", updatedAt: null });
    else showAuth(session.signupEnabled);
  } catch (error) {
    showAuth(false);
    authStatus.textContent = messageFrom(error, "로그인 상태를 확인하지 못했습니다.");
  }
}

async function authenticate(mode: "login" | "signup"): Promise<void> {
  if (!authForm.reportValidity()) return;
  const data = new FormData(authForm);
  const button = mode === "login" ? loginButton : signupButton;
  button.disabled = true;
  authStatus.textContent = mode === "login" ? "로그인 중…" : "계정을 만드는 중…";
  try {
    const result = await apiRequest<AuthResponse>(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: data.get("email"), password: data.get("password") }),
    });
    authForm.reset();
    showService(result.user.email, result.preference);
  } catch (error) {
    authStatus.textContent = messageFrom(error, mode === "login" ? "로그인하지 못했습니다." : "계정을 만들지 못했습니다.");
  } finally {
    button.disabled = false;
  }
}

function showAuth(signupEnabled: boolean): void {
  skipLink.hidden = true;
  authView.hidden = false;
  serviceView.hidden = true;
  footer.hidden = true;
  signupButton.hidden = !signupEnabled;
  authStatus.textContent = signupEnabled ? "로그인하거나 개인 계정을 만들 수 있습니다." : "개인 계정으로 로그인해 주세요.";
  getElement<HTMLInputElement>("email").focus();
}

function showService(email: string, preference: Preference): void {
  skipLink.hidden = false;
  authView.hidden = true;
  serviceView.hidden = false;
  footer.hidden = false;
  accountEmail.textContent = email;
  setPreference(preference);
  if (!preference.taste) {
    tasteInput.value = DEFAULT_TASTE;
    dialog.showModal();
    profileButton?.setAttribute("aria-expanded", "true");
  }
}

function setPreference(preference: Preference): void {
  currentTaste = preference.taste;
  tasteInput.value = currentTaste || DEFAULT_TASTE;
  if (tasteSummary) tasteSummary.textContent = currentTaste || "아직 저장된 취향이 없어요.";
}

function resetServiceState(): void {
  clearSearchCooldown();
  currentTaste = "";
  accountEmail.textContent = "";
  tasteInput.value = DEFAULT_TASTE;
  if (tasteSummary) tasteSummary.textContent = "아직 저장된 취향이 없어요.";
  recommendations.replaceChildren();
  placeList.replaceChildren();
  resultMeta.textContent = "검색 전이에요";
  status.hidden = false;
  status.className = "status-card";
  status.textContent = "검색하면 취향에 맞는 세 곳을 먼저 골라드려요.";
  mapPresenter.update([]);
}

async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", ...init });
  const data = (await response.json()) as T | ApiError;
  if (!response.ok || isApiError(data)) {
    const retryAfter = Number(response.headers.get("Retry-After") ?? "0");
    throw new ApiRequestError(
      isApiError(data) ? data.error.message : "요청에 실패했습니다.",
      isApiError(data) ? data.error.code : "REQUEST_FAILED",
      Number.isFinite(retryAfter) ? Math.min(3_600, Math.max(0, Math.ceil(retryAfter))) : 0,
    );
  }
  return data as T;
}

class ApiRequestError extends Error {
  constructor(message: string, readonly code: string, readonly retryAfterSeconds: number) {
    super(message);
  }
}

function isApiError(value: unknown): value is ApiError {
  return typeof value === "object" && value !== null && "error" in value;
}

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function setLoading(loading: boolean): void {
  if (submitButton) {
    const cooldownSeconds = Math.max(0, Math.ceil((searchCooldownUntil - Date.now()) / 1_000));
    submitButton.disabled = loading || cooldownSeconds > 0;
    submitButton.textContent = loading ? "고르는 중…" : cooldownSeconds > 0 ? `${cooldownSeconds}초 후 다시 찾기` : "찾아보기";
  }
  if (loading) {
    status.hidden = false;
    status.className = "status-card loading";
    status.textContent = "취향과 이동 방식을 함께 살펴보고 있어요…";
  }
}

function startSearchCooldown(retryAfterSeconds: number): void {
  searchCooldownUntil = Date.now() + retryAfterSeconds * 1_000;
  if (searchCooldownTimer !== undefined) window.clearTimeout(searchCooldownTimer);
  searchCooldownTimer = window.setTimeout(() => {
    searchCooldownUntil = 0;
    searchCooldownTimer = undefined;
    setLoading(false);
  }, retryAfterSeconds * 1_000);
}

function clearSearchCooldown(): void {
  if (searchCooldownTimer !== undefined) window.clearTimeout(searchCooldownTimer);
  searchCooldownTimer = undefined;
  searchCooldownUntil = 0;
  searchInFlight = false;
  setLoading(false);
}

function renderResults(data: SearchResponse): void {
  const curationLabels: Record<SearchResponse["curation"]["source"], string> = {
    ai: "AI 추천",
    cached: "저장된 AI 추천",
    deterministic: "기본 추천",
  };
  const fallbackLabels: Partial<Record<NonNullable<SearchResponse["curation"]["fallbackReason"]>, string>> = {
    missing_key: "AI 연결 전이라 기본 추천을 보여드려요.",
    budget_exhausted: "오늘의 AI 사용 한도에 도달해 기본 추천을 보여드려요.",
    timeout: "AI 응답이 늦어 기본 추천을 보여드려요.",
    rate_limited: "AI 요청이 많아 기본 추천을 보여드려요.",
    provider_error: "AI를 일시적으로 사용할 수 없어 기본 추천을 보여드려요.",
    refused: "AI가 결과를 만들지 않아 기본 추천을 보여드려요.",
    invalid_output: "AI 결과를 안전하게 확인할 수 없어 기본 추천을 보여드려요.",
  };
  const fallbackMessage = data.curation.fallbackReason ? fallbackLabels[data.curation.fallbackReason] : undefined;
  status.hidden = !fallbackMessage;
  if (fallbackMessage) {
    status.className = "status-card notice";
    status.textContent = fallbackMessage;
  }
  resultMeta.textContent = `${data.recommendations.length}곳 · ${curationLabels[data.curation.source]} · ${data.source === "kakao" ? "카카오 검색" : "데모 데이터"}`;
  recommendations.innerHTML = data.recommendations.map((place) => `<article class="recommendation-card ${place.rank === 1 ? "featured" : ""}"><div class="rank">0${place.rank}</div><div class="card-top"><span>${escapeHtml(place.category)}</span><span>${place.tags.map(escapeHtml).join(" · ")}</span></div><h3>${escapeHtml(place.name)}</h3><p class="reason">${escapeHtml(place.reason)}</p><p class="transit-tip"><span aria-hidden="true">↗</span>${escapeHtml(place.transitTip ?? "이동 정보가 아직 없어요.")}</p></article>`).join("");
  placeList.innerHTML = data.places.map((place) => `<article class="place-row"><span class="list-rank">${place.rank}</span><div><h3>${escapeHtml(place.name)}</h3><p>${escapeHtml(place.address)}</p></div><span class="category">${escapeHtml(place.category)}</span></article>`).join("");
  mapPresenter.update(data.places);
}

function renderMapState(state: MapViewState): void {
  const messages: Record<Exclude<MapViewState, "ready">, string> = {
    empty: "<strong>표시할 장소가 없어요</strong><br />검색 조건을 바꿔 다시 찾아보세요.",
    loading: "<strong>지도를 불러오는 중이에요</strong><br />장소 목록은 먼저 확인할 수 있어요.",
    unavailable: "<strong>지도를 표시할 수 없어요</strong><br />아래 장소 목록은 계속 이용할 수 있어요.",
  };
  const ready = state === "ready";
  mapCanvas.hidden = state === "empty" || state === "unavailable";
  mapFallback.hidden = ready;
  if (!ready) mapFallback.innerHTML = `<p>${messages[state]}</p>`;
}

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element: ${id}`);
  return element as T;
}

function escapeHtml(value: string): string {
  const element = document.createElement("span");
  element.textContent = value;
  return element.innerHTML;
}
