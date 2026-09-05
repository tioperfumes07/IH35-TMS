import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeRouteReference } from "./routes-api-client.js";

describe("computeRouteReference (DSP-48)", () => {
  const priorKey = process.env.GOOGLE_PLACES_API_KEY;
  const priorFlag = process.env.GOOGLE_PLACES_ENABLED;

  beforeEach(() => {
    process.env.GOOGLE_PLACES_API_KEY = "test-key";
    process.env.GOOGLE_PLACES_ENABLED = "true";
  });
  afterEach(() => {
    process.env.GOOGLE_PLACES_API_KEY = priorKey;
    process.env.GOOGLE_PLACES_ENABLED = priorFlag;
    vi.unstubAllGlobals();
  });

  it("matches DSP-48's own worked example: 1,214.3 mi / 18 h 40 m", async () => {
    // 1214.3 mi * 1609.344 m/mi = 1,954,226 m (rounded); 18h40m = 67200s.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ routes: [{ distanceMeters: 1954226, duration: "67200s" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await computeRouteReference({ lat: 32.7767, lng: -96.797 }, { lat: 41.8781, lng: -87.6298 });

    expect(result).toEqual({ miles: 1214.3, minutes: 1120 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://routes.googleapis.com/directions/v2:computeRoutes");
    expect((init.headers as Record<string, string>)["X-Goog-FieldMask"]).toBe("routes.distanceMeters,routes.duration");
    expect((init.headers as Record<string, string>)["X-Goog-Api-Key"]).toBe("test-key");
    const body = JSON.parse(init.body as string) as { travelMode: string };
    expect(body.travelMode).toBe("DRIVE");
  });

  it("degrades to null on a Routes API error response, never throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) })
    );
    const result = await computeRouteReference({ lat: 1, lng: 1 }, { lat: 2, lng: 2 });
    expect(result).toBeNull();
  });

  it("degrades to null when the key is not configured, without calling fetch", async () => {
    // loadConfig() caches its result at module scope, so a fresh module instance is required to
    // observe the key being absent (a prior test in this file already primed the cache with a key).
    delete process.env.GOOGLE_PLACES_API_KEY;
    vi.resetModules();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const fresh = await import("./routes-api-client.js");
    const result = await fresh.computeRouteReference({ lat: 1, lng: 1 }, { lat: 2, lng: 2 });
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
