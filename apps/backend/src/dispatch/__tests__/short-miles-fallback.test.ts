// LEAD 443.233 — the owner miles rule's pure parts and its Google path (injected leg, no network).
import { describe, expect, it, vi } from "vitest";
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn(async () => undefined) }));
import { medianMiles, resolveShortMilesFallback } from "../short-miles-fallback.js";

const client = (opts: { practical: string | null; lane: { o: string | null; d: string | null }; hist: string[]; stops: Array<{ lat: string | null; lng: string | null }> }) => ({
  query: vi.fn(async (sql: string) => {
    if (/SELECT miles_practical::text/.test(sql)) return { rows: [{ p: opts.practical }] };
    if (/AS o,/.test(sql)) return { rows: [opts.lane] };
    if (/l\.miles_shortest::text AS m/.test(sql)) return { rows: opts.hist.map((m) => ({ m })) };
    if (/latitude::text AS lat/.test(sql)) return { rows: opts.stops };
    return { rows: [] };
  }),
});

describe("owner miles rule (443.233)", () => {
  it("median of recorded lane miles", () => {
    expect(medianMiles([1900, 1920])).toBe(1910);
    expect(medianMiles([1000, 3000, 1100])).toBe(1100);
    expect(medianMiles([])).toBeNull();
  });
  it("no lane history -> Google shortest summed over the geocoded legs", async () => {
    const leg = vi.fn(async () => ({ miles: 600.25, minutes: 500 }));
    const r = await resolveShortMilesFallback(client({ practical: "1400", lane: { o: "a|tx", d: "b|nj" }, hist: [], stops: [{ lat: "27.5", lng: "-99.5" }, { lat: "35.0", lng: "-90.0" }, { lat: "40.5", lng: "-74.4" }] }) as never,
      { operatingCompanyId: "co", loadId: "l" }, { shortestLeg: leg as never });
    expect(r).toMatchObject({ miles: 1200.5, source: "google_shortest" });
    expect(leg).toHaveBeenCalledTimes(2);
  });
  it("never a straight line: stops without coordinates refuse with the reason", async () => {
    const r = await resolveShortMilesFallback(client({ practical: "1400", lane: { o: "a|tx", d: "b|nj" }, hist: [], stops: [{ lat: null, lng: null }, { lat: "40", lng: "-74" }] }) as never,
      { operatingCompanyId: "co", loadId: "l" }, { shortestLeg: vi.fn() as never });
    expect(r).toEqual({ miles: null, reason: "no recorded lane history; stops not geocoded" });
  });
  it("short miles never exceed practical", async () => {
    const r = await resolveShortMilesFallback(client({ practical: "1000", lane: { o: "a|tx", d: "b|nj" }, hist: ["1500"], stops: [{ lat: "1", lng: "1" }, { lat: "2", lng: "2" }] }) as never,
      { operatingCompanyId: "co", loadId: "l" }, { shortestLeg: vi.fn(async () => ({ miles: 1200, minutes: 1 })) as never });
    expect(r.miles).toBeNull();
  });
});
