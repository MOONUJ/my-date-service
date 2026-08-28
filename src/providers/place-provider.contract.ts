import { describe, expect, it } from "vitest";
import {
  MAX_PROVIDER_RESULTS,
  type PlaceProvider,
  PlaceProviderError,
  type ProviderPlace,
} from "./place-provider";

export function runPlaceProviderContract(createProvider: () => PlaceProvider): void {
  describe(`${createProvider().id} place provider contract`, () => {
    it("has a stable non-empty identifier", () => {
      const provider = createProvider();
      expect(provider.id).toBe(provider.id.trim());
      expect(provider.id.length).toBeGreaterThan(0);
    });

    it("returns normalized, unique places within the requested limit", async () => {
      const provider = createProvider();
      const places = await provider.search({ query: "성수 파스타", limit: 3 });

      expect(places.length).toBeGreaterThan(0);
      expect(places.length).toBeLessThanOrEqual(3);
      expect(new Set(places.map((place) => place.providerPlaceId)).size).toBe(places.length);
      places.forEach(expectNormalizedPlace);
    });

    it("does not leak mutable result state between calls", async () => {
      const provider = createProvider();
      const first = await provider.search({ query: "성수 파스타", limit: 2 });
      first[0]?.tags.push("mutated-by-consumer");
      if (first[0]) first[0].coordinates.latitude = 0;

      const second = await provider.search({ query: "성수 파스타", limit: 2 });
      expect(second[0]?.tags).not.toContain("mutated-by-consumer");
      expect(second[0]?.coordinates.latitude).not.toBe(0);
    });

    it("rejects invalid queries and limits with typed errors", async () => {
      const provider = createProvider();

      await expect(provider.search({ query: "성", limit: 3 })).rejects.toMatchObject({
        name: "PlaceProviderError",
        code: "INVALID_QUERY",
      } satisfies Partial<PlaceProviderError>);
      await expect(provider.search({ query: "성수", limit: 0 })).rejects.toMatchObject({
        name: "PlaceProviderError",
        code: "INVALID_LIMIT",
      } satisfies Partial<PlaceProviderError>);
      await expect(provider.search({ query: "성수", limit: MAX_PROVIDER_RESULTS + 1 })).rejects.toMatchObject({
        name: "PlaceProviderError",
        code: "INVALID_LIMIT",
      } satisfies Partial<PlaceProviderError>);
    });

    it("honors an already-aborted request", async () => {
      const provider = createProvider();
      const controller = new AbortController();
      controller.abort();

      await expect(provider.search({ query: "성수 파스타", limit: 3, signal: controller.signal })).rejects.toMatchObject({
        name: "PlaceProviderError",
        code: "ABORTED",
      } satisfies Partial<PlaceProviderError>);
    });
  });
}

function expectNormalizedPlace(place: ProviderPlace): void {
  expect(place.providerPlaceId).toBe(place.providerPlaceId.trim());
  expect(place.providerPlaceId.length).toBeGreaterThan(0);
  expect(place.name).toBe(place.name.trim());
  expect(place.name.length).toBeGreaterThan(0);
  expect(place.category).toBe(place.category.trim());
  expect(place.category.length).toBeGreaterThan(0);
  expect(place.address).toBe(place.address.trim());
  expect(place.address.length).toBeGreaterThan(0);
  expect(Number.isFinite(place.coordinates.latitude)).toBe(true);
  expect(Number.isFinite(place.coordinates.longitude)).toBe(true);
  expect(place.coordinates.latitude).toBeGreaterThanOrEqual(-90);
  expect(place.coordinates.latitude).toBeLessThanOrEqual(90);
  expect(place.coordinates.longitude).toBeGreaterThanOrEqual(-180);
  expect(place.coordinates.longitude).toBeLessThanOrEqual(180);
  expect(place.tags.every((tag) => tag.length > 0 && tag === tag.trim())).toBe(true);
  expect(place.parkingTip === null || (place.parkingTip.length > 0 && place.parkingTip === place.parkingTip.trim())).toBe(
    true,
  );
  expect(place.transitTip === null || (place.transitTip.length > 0 && place.transitTip === place.transitTip.trim())).toBe(
    true,
  );
}
