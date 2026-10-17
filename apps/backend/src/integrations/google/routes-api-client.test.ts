import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeRouteReference, computeRouteReferenceOrReason } from "./routes-api-client.js";

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
  // LEAD 443.192 (10:35Z): every failure used to be a bare null — a revoked key / disabled API / missing config was invisible.
  it("443.192: names the HTTP status of a failed call (never the key)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({}) }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await computeRouteReferenceOrReason({ lat: 1, lng: 1 }, { lat: 2, lng: 2 })).toEqual({ miles: null, reason: "google_routes_http_403" });
    expect(String(warn.mock.calls[0]?.[0])).toContain("google_routes_http_403");
    expect(String(warn.mock.calls[0]?.[0])).not.toContain("test-key");
    warn.mockRestore();
  });
  it("443.192: names a disabled flag and an empty route", async () => {
    process.env.GOOGLE_PLACES_ENABLED = "false";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await computeRouteReferenceOrReason({ lat: 1, lng: 1 }, { lat: 2, lng: 2 })).toEqual({ miles: null, reason: "google_routes_disabled" });
    expect(fetchMock).not.toHaveBeenCalled();
    process.env.GOOGLE_PLACES_ENABLED = "true";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ routes: [] }) }));
    expect(await computeRouteReferenceOrReason({ lat: 1, lng: 1 }, { lat: 2, lng: 2 })).toEqual({ miles: null, reason: "google_routes_no_route" });
  });
  it("443.192: names a missing key", async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    vi.resetModules();
    const fresh = await import("./routes-api-client.js");
    expect(await fresh.computeRouteReferenceOrReason({ lat: 1, lng: 1 }, { lat: 2, lng: 2 })).toEqual({ miles: null, reason: "google_routes_not_configured" });
  });
});
