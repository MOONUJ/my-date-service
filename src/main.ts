import type { ApiError, SearchRequest, SearchResponse, Transport } from "./domain";
import "./styles.css";

const DEFAULT_TASTE = "조용하고 대화하기 좋은 분위기, 일식이나 파스타 선호";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("App root is missing");

app.innerHTML = `
  <header class="topbar">
    <a class="brand" href="#top" aria-label="Date Mate 홈">
      <span class="brand-mark" aria-hidden="true">D</span>
      <span>Date Mate</span>
    </a>
    <button class="profile-button" type="button" aria-label="취향 설정 열기" aria-expanded="false">
      <span class="profile-dot" aria-hidden="true"></span>
      나의 취향
    </button>
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
        <div class="search-row">
          <input id="query" name="query" type="search" value="성수동 마제소바" minlength="2" maxlength="80" required />
          <button class="primary-button" type="submit">찾아보기</button>
        </div>
        <fieldset class="transport-fieldset">
          <legend>오늘의 이동 방식</legend>
          <label><input type="radio" name="transport" value="car" checked /><span>자가용 · 주차 중요</span></label>
          <label><input type="radio" name="transport" value="transit" /><span>대중교통 · 도보 중요</span></label>
        </fieldset>
      </form>
      <div class="taste-summary"><span>취향 기준</span><p>${DEFAULT_TASTE}</p></div>
    </section>

    <section id="results" class="results" aria-labelledby="results-title" aria-live="polite">
      <div class="section-heading">
        <div><p class="eyebrow">PERSONAL PICKS</p><h2 id="results-title">오늘의 추천</h2></div>
        <p id="result-meta">검색 전이에요</p>
      </div>
      <div id="status" class="status-card">검색하면 취향에 맞는 세 곳을 먼저 골라드려요.</div>
      <div id="recommendations" class="recommendation-grid"></div>
    </section>

    <section class="map-section" aria-labelledby="map-title">
      <div class="section-heading"><div><p class="eyebrow">NEIGHBORHOOD</p><h2 id="map-title">한눈에 비교하기</h2></div></div>
      <div class="map-placeholder" role="img" aria-label="검색한 장소의 지도 영역 준비 중">
        <div class="map-grid" aria-hidden="true"></div>
        <span class="map-pin pin-one" aria-hidden="true">1</span>
        <span class="map-pin pin-two" aria-hidden="true">2</span>
        <span class="map-pin pin-three" aria-hidden="true">3</span>
        <p><strong>지도 연결 준비 중</strong><br />장소 목록은 지도 없이도 모두 확인할 수 있어요.</p>
      </div>
      <div id="place-list" class="place-list"></div>
    </section>
  </main>

  <dialog id="taste-dialog" class="taste-dialog">
    <form method="dialog">
      <div class="dialog-heading"><div><p class="eyebrow">MY TASTE</p><h2>나의 취향</h2></div><button value="cancel" aria-label="닫기">×</button></div>
      <label class="field-label" for="taste">데이트 장소를 고를 때 중요한 점</label>
      <textarea id="taste" maxlength="500" rows="6">${DEFAULT_TASTE}</textarea>
      <p class="field-help">취향은 현재 브라우저에서만 사용하며 아직 서버에 저장하지 않아요.</p>
      <button id="save-taste" class="primary-button dialog-save" value="save">취향 적용하기</button>
    </form>
  </dialog>

  <footer>Made for unhurried dates · Seoul</footer>
`;

const form = getElement<HTMLFormElement>("search-form");
const recommendations = getElement<HTMLDivElement>("recommendations");
const placeList = getElement<HTMLDivElement>("place-list");
const status = getElement<HTMLDivElement>("status");
const resultMeta = getElement<HTMLParagraphElement>("result-meta");
const dialog = getElement<HTMLDialogElement>("taste-dialog");
const profileButton = document.querySelector<HTMLButtonElement>(".profile-button");
const tasteInput = getElement<HTMLTextAreaElement>("taste");
const tasteSummary = document.querySelector<HTMLElement>(".taste-summary p");
const submitButton = form.querySelector<HTMLButtonElement>("button[type='submit']");

profileButton?.addEventListener("click", () => {
  profileButton.setAttribute("aria-expanded", "true");
  dialog.showModal();
});

dialog.addEventListener("close", () => {
  profileButton?.setAttribute("aria-expanded", "false");
  if (dialog.returnValue === "save" && tasteSummary) tasteSummary.textContent = tasteInput.value.trim() || "분위기 좋은 곳";
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  const request: SearchRequest = {
    query: String(formData.get("query") ?? ""),
    transport: String(formData.get("transport") ?? "car") as Transport,
    taste: tasteInput.value,
  };

  setLoading(true);
  try {
    const response = await fetch("/api/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    const data = (await response.json()) as SearchResponse | ApiError;
    if (!response.ok || "error" in data) throw new Error("error" in data ? data.error.message : "검색에 실패했습니다.");
    renderResults(data);
  } catch (error) {
    status.hidden = false;
    status.className = "status-card error";
    status.textContent = error instanceof Error ? error.message : "잠시 후 다시 검색해 주세요.";
  } finally {
    setLoading(false);
  }
});

function setLoading(loading: boolean): void {
  if (submitButton) {
    submitButton.disabled = loading;
    submitButton.textContent = loading ? "고르는 중…" : "찾아보기";
  }
  if (loading) {
    status.hidden = false;
    status.className = "status-card loading";
    status.textContent = "취향과 이동 방식을 함께 살펴보고 있어요…";
  }
}

function renderResults(data: SearchResponse): void {
  status.hidden = true;
  resultMeta.textContent = `${data.recommendations.length}곳 · 데모 데이터`;
  recommendations.innerHTML = data.recommendations.map((place) => `
    <article class="recommendation-card ${place.rank === 1 ? "featured" : ""}">
      <div class="rank">0${place.rank}</div>
      <div class="card-top"><span>${escapeHtml(place.category)}</span><span>${place.tags.map(escapeHtml).join(" · ")}</span></div>
      <h3>${escapeHtml(place.name)}</h3>
      <p class="reason">${escapeHtml(place.reason)}</p>
      <p class="transit-tip"><span aria-hidden="true">↗</span>${escapeHtml(place.transitTip ?? "이동 정보가 아직 없어요.")}</p>
    </article>
  `).join("");
  placeList.innerHTML = data.places.map((place) => `
    <article class="place-row">
      <span class="list-rank">${place.rank}</span>
      <div><h3>${escapeHtml(place.name)}</h3><p>${escapeHtml(place.address)}</p></div>
      <span class="category">${escapeHtml(place.category)}</span>
    </article>
  `).join("");
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
