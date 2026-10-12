import { afterEach, describe, expect, it } from "vitest";
import { GEOCODE_HEALTH_ADDRESS, GEOCODE_HEALTH_TTL_MS, geocodeHealth, resetGeocodeHealthCacheForTest } from "../geocode-health.js";

describe("geocode health probe (443.102)", () => {
  afterEach(() => resetGeocodeHealthCacheForTest());

  it("reports provider_unavailable as not ok", async () => {
    const h = await geocodeHealth(() => 1_000, async () => ({ ok: false, reason: "provider_unavailable" }));
    expect(h).toMatchObject({ ok: false, reason: "provider_unavailable", cached: false });
  });

  it("geocodes only the fixed address and reports the provider", async () => {
    const seen: unknown[] = [];
    const h = await geocodeHealth(() => 1_000, async (a) => {
      seen.push(a);
      return { ok: true, latitude: 38.9, longitude: -77.0, source: "google", confidence: 1, precision: "range" } as never;
    });
    expect(seen).toEqual([GEOCODE_HEALTH_ADDRESS]);
    expect(h).toMatchObject({ ok: true, source: "google", reason: null });
  });

  it("caches inside the TTL so the public probe cannot spend provider quota", async () => {
    let calls = 0;
    const geo = async () => { calls++; return { ok: false, reason: "no_result" } as const; };
    await geocodeHealth(() => 1_000, geo);
    const second = await geocodeHealth(() => 1_000 + GEOCODE_HEALTH_TTL_MS - 1, geo);
    expect(calls).toBe(1);
    expect(second.cached).toBe(true);
    await geocodeHealth(() => 1_000 + GEOCODE_HEALTH_TTL_MS, geo);
    expect(calls).toBe(2);
  });

  it("a throwing provider is a failure, never a pass", async () => {
    const h = await geocodeHealth(() => 1_000, async () => { throw new Error("boom"); });
    expect(h).toMatchObject({ ok: false, reason: "probe_threw" });
  });
});
