import { afterEach, describe, expect, it, vi } from "vitest";
import { captureLocation, mapsLink, reverseGeocode } from "@/lib/geolocation";
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("geolocation utilities", () => {
  it("creates a Google Maps link", () => {
    expect(mapsLink(19.076, 72.8777)).toBe("https://www.google.com/maps?q=19.076,72.8777");
  });
  it("returns null when geolocation is unavailable", async () => {
    vi.stubGlobal("navigator", {});
    await expect(captureLocation()).resolves.toBeNull();
  });
  it("returns coordinates from the browser", async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success({
        coords: {
          latitude: 19.076,
          longitude: 72.8777,
        },
      } as GeolocationPosition);
    });
    vi.stubGlobal("navigator", {
      geolocation: { getCurrentPosition },
    });
    await expect(captureLocation(1000)).resolves.toEqual({
      latitude: 19.076,
      longitude: 72.8777,
    });
    expect(getCurrentPosition).toHaveBeenCalledOnce();
  });
  it("returns null when the browser rejects location access", async () => {
    const getCurrentPosition = vi.fn((_success: PositionCallback, error: PositionErrorCallback) => {
      error({ code: 1, message: "Permission denied" } as GeolocationPositionError);
    });
    vi.stubGlobal("navigator", {
      geolocation: { getCurrentPosition },
    });
    await expect(captureLocation(1000)).resolves.toBeNull();
  });
  it("returns null when location capture times out", async () => {
    vi.useFakeTimers();
    const getCurrentPosition = vi.fn();
    vi.stubGlobal("navigator", {
      geolocation: { getCurrentPosition },
    });
    const locationPromise = captureLocation(100);
    await vi.advanceTimersByTimeAsync(100);
    await expect(locationPromise).resolves.toBeNull();
  });
  it("returns a reverse-geocoded address", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ display_name: "Mumbai, Maharashtra" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    await expect(reverseGeocode(19.076, 72.8777)).resolves.toBe("Mumbai, Maharashtra");
  });
  it("returns null when reverse geocoding has no address", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    await expect(reverseGeocode(19.076, 72.8777)).resolves.toBeNull();
  });
  it("returns null when reverse geocoding returns an HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    await expect(reverseGeocode(19.076, 72.8777)).resolves.toBeNull();
  });
  it("returns null when reverse geocoding fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(reverseGeocode(19.076, 72.8777)).resolves.toBeNull();
  });
});
