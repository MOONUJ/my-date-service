import { describe, expect, it, vi } from "vitest";
import type { PlaceRecommendation } from "../domain";
import {
  createKakaoMapController,
  createMapPresenter,
  loadKakaoMapsSdk,
  type KakaoMapsSdk,
  type MapController,
  type MapViewState,
} from "./kakao-map";

const PLACES: PlaceRecommendation[] = [
  {
    id: "one",
    rank: 1,
    name: "첫 번째 장소",
    category: "일식",
    address: "서울",
    coordinates: { latitude: 37.5, longitude: 127.0 },
    reason: "취향과 잘 맞아요.",
    transitTip: null,
    tags: ["조용한"],
  },
  {
    id: "two",
    rank: 2,
    name: "두 번째 장소",
    category: "양식",
    address: "서울",
    coordinates: { latitude: 37.6, longitude: 127.1 },
    reason: "분위기가 좋아요.",
    transitTip: null,
    tags: ["데이트"],
  },
];

describe("createMapPresenter", () => {
  it("rejects an empty JavaScript key before requesting the SDK", async () => {
    await expect(loadKakaoMapsSdk("")).rejects.toThrow("키가 설정되지 않았어요");
  });

  it("does not load the SDK for empty results and exposes SDK failures", async () => {
    const states: MapViewState[] = [];
    const loadSdk = vi.fn().mockRejectedValue(new Error("missing key"));
    const presenter = createMapPresenter(loadSdk, vi.fn(), (state) => states.push(state));

    presenter.update([]);
    expect(loadSdk).not.toHaveBeenCalled();
    presenter.update(PLACES);
    await Promise.resolve();
    await Promise.resolve();

    expect(states).toEqual(["empty", "loading", "unavailable"]);
  });

  it("renders the latest results and replaces them without loading twice", async () => {
    const render = vi.fn<MapController["render"]>();
    const controller: MapController = { render };
    const sdk = {} as KakaoMapsSdk;
    const loadSdk = vi.fn().mockResolvedValue(sdk);
    const presenter = createMapPresenter(loadSdk, () => controller, vi.fn());

    presenter.update(PLACES);
    await Promise.resolve();
    await Promise.resolve();
    presenter.update(PLACES.slice(0, 1));

    expect(loadSdk).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenNthCalledWith(1, PLACES);
    expect(render).toHaveBeenNthCalledWith(2, PLACES.slice(0, 1));
  });
});

describe("createKakaoMapController", () => {
  it("clears old overlays and fits the map to new results", () => {
    const setBounds = vi.fn();
    const overlayInstances: Array<{ setMap: ReturnType<typeof vi.fn> }> = [];
    class LatLng {
      constructor(readonly latitude: number, readonly longitude: number) {}
    }
    class LatLngBounds {
      extend = vi.fn();
    }
    class Map {
      setBounds = setBounds;
      setCenter = vi.fn();
      setLevel = vi.fn();
    }
    class CustomOverlay {
      setMap = vi.fn();
      constructor() {
        overlayInstances.push(this);
      }
    }
    const ownerDocument = {
      createElement: () => ({ className: "", textContent: "", title: "", setAttribute: vi.fn() }),
    };
    const sdk = { Map, LatLng, LatLngBounds, CustomOverlay } as unknown as KakaoMapsSdk;
    const controller = createKakaoMapController({ ownerDocument } as unknown as HTMLElement, sdk);

    controller.render(PLACES);
    controller.render(PLACES.slice(0, 1));

    expect(overlayInstances).toHaveLength(3);
    expect(overlayInstances[0]?.setMap).toHaveBeenLastCalledWith(null);
    expect(overlayInstances[1]?.setMap).toHaveBeenLastCalledWith(null);
    expect(setBounds).toHaveBeenCalledTimes(1);
  });
});
