import type { PlaceRecommendation } from "../domain";

export type MapViewState = "empty" | "loading" | "ready" | "unavailable";

export interface MapController {
  render(places: readonly PlaceRecommendation[]): void;
}

export interface KakaoMapsSdk {
  Map: new (container: HTMLElement, options: { center: KakaoLatLng; level: number }) => KakaoMap;
  LatLng: new (latitude: number, longitude: number) => KakaoLatLng;
  LatLngBounds: new () => KakaoLatLngBounds;
  CustomOverlay: new (options: {
    position: KakaoLatLng;
    content: HTMLElement;
    xAnchor: number;
    yAnchor: number;
    zIndex: number;
  }) => KakaoOverlay;
  load(callback: () => void): void;
}

interface KakaoLatLng {}

interface KakaoLatLngBounds {
  extend(position: KakaoLatLng): void;
}

interface KakaoMap {
  setBounds(bounds: KakaoLatLngBounds, padding?: number): void;
  setCenter(position: KakaoLatLng): void;
  setLevel(level: number): void;
}

interface KakaoOverlay {
  setMap(map: KakaoMap | null): void;
}

interface KakaoGlobal {
  maps: KakaoMapsSdk;
}

declare global {
  interface Window {
    kakao?: KakaoGlobal;
  }
}

const SCRIPT_ID = "kakao-maps-sdk";
const SCRIPT_TIMEOUT_MS = 8_000;
let sdkPromise: Promise<KakaoMapsSdk> | undefined;

export function loadKakaoMapsSdk(
  javascriptKey: string,
  documentRef?: Document,
  windowRef?: Window,
): Promise<KakaoMapsSdk> {
  const key = javascriptKey.trim();
  if (!key) return Promise.reject(new Error("카카오 지도 키가 설정되지 않았어요."));
  const currentDocument = documentRef ?? document;
  const currentWindow = windowRef ?? window;
  if (currentWindow.kakao?.maps.Map) return Promise.resolve(currentWindow.kakao.maps);
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<KakaoMapsSdk>((resolve, reject) => {
    const existing = currentDocument.getElementById(SCRIPT_ID);
    const script = existing instanceof HTMLScriptElement ? existing : currentDocument.createElement("script");
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const cleanup = (): void => {
      if (timeoutId) clearTimeout(timeoutId);
      script.removeEventListener("load", handleLoad);
      script.removeEventListener("error", handleError);
    };
    const fail = (message: string): void => {
      cleanup();
      sdkPromise = undefined;
      reject(new Error(message));
    };
    const handleLoad = (): void => {
      const maps = currentWindow.kakao?.maps;
      if (!maps) {
        fail("카카오 지도 SDK를 초기화하지 못했어요.");
        return;
      }
      maps.load(() => {
        cleanup();
        resolve(maps);
      });
    };
    const handleError = (): void => fail("카카오 지도를 불러오지 못했어요.");

    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });
    timeoutId = setTimeout(() => fail("카카오 지도 응답이 지연되고 있어요."), SCRIPT_TIMEOUT_MS);

    if (!existing) {
      script.id = SCRIPT_ID;
      script.async = true;
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false`;
      currentDocument.head.append(script);
    }
  });

  return sdkPromise;
}

export function createKakaoMapController(container: HTMLElement, sdk: KakaoMapsSdk): MapController {
  const initialCenter = new sdk.LatLng(37.5446, 127.0562);
  const map = new sdk.Map(container, { center: initialCenter, level: 4 });
  let overlays: KakaoOverlay[] = [];

  return {
    render(places): void {
      overlays.forEach((overlay) => overlay.setMap(null));
      overlays = [];
      if (places.length === 0) return;

      const bounds = new sdk.LatLngBounds();
      for (const place of places) {
        const position = new sdk.LatLng(place.coordinates.latitude, place.coordinates.longitude);
        bounds.extend(position);
        const label = container.ownerDocument.createElement("span");
        label.className = place.rank <= 3 ? "kakao-map-marker recommended" : "kakao-map-marker";
        label.textContent = String(place.rank);
        label.title = `${place.rank}위 ${place.name}`;
        label.setAttribute("aria-hidden", "true");
        const overlay = new sdk.CustomOverlay({
          position,
          content: label,
          xAnchor: 0.5,
          yAnchor: 1.25,
          zIndex: place.rank <= 3 ? 3 : 2,
        });
        overlay.setMap(map);
        overlays.push(overlay);
      }

      if (places.length === 1) {
        const place = places[0];
        if (!place) return;
        map.setCenter(new sdk.LatLng(place.coordinates.latitude, place.coordinates.longitude));
        map.setLevel(4);
      } else {
        map.setBounds(bounds, 48);
      }
    },
  };
}

export function createMapPresenter(
  loadSdk: () => Promise<KakaoMapsSdk>,
  createController: (sdk: KakaoMapsSdk) => MapController,
  onStateChange: (state: MapViewState) => void,
): { update(places: readonly PlaceRecommendation[]): void } {
  let controller: MapController | undefined;
  let loading: Promise<void> | undefined;
  let unavailable = false;
  let latestPlaces: readonly PlaceRecommendation[] = [];

  return {
    update(places): void {
      latestPlaces = places;
      if (places.length === 0) {
        controller?.render([]);
        onStateChange("empty");
        return;
      }
      if (controller) {
        controller.render(places);
        onStateChange("ready");
        return;
      }
      if (unavailable) {
        onStateChange("unavailable");
        return;
      }
      if (loading) return;

      onStateChange("loading");
      loading = loadSdk()
        .then((sdk) => {
          controller = createController(sdk);
          controller.render(latestPlaces);
          onStateChange(latestPlaces.length > 0 ? "ready" : "empty");
        })
        .catch(() => {
          unavailable = true;
          onStateChange("unavailable");
        })
        .finally(() => {
          loading = undefined;
        });
    },
  };
}
