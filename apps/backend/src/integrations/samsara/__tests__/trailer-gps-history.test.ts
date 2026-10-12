/**
 * LEAD 443.107 item 2 (R17) — SamsaraClient.trailerGpsHistory against a stubbed fetch: the request names the trailer ids
 * we store (the /fleet/trailers ids) as `trailerIds`, asks for `types=gps` over an RFC 3339 window, follows
 * `pagination.endCursor` to the last page, and a 429 is retried after the server's Retry-After — never read as "no GPS".
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { SamsaraApiError, SamsaraClient, setSamsaraSleepForTests } from "../samsara-client.js";

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

afterEach(() => vi.unstubAllGlobals());

describe("trailerGpsHistory (443.107 R17)", () => {
  it("sends trailerIds + types=gps + RFC 3339 times, follows pagination, honours Retry-After on 429", async () => {
    const slept: number[] = [];
    setSamsaraSleepForTests(async (ms) => { slept.push(ms); });
    const urls: URL[] = [];
    const responses = [
      json(429, { message: "rate limited" }, { "retry-after": "2" }),
      json(200, { data: [{ id: "281474980000001", gps: [{ time: "2026-09-01T12:10:00Z", latitude: 29.5, longitude: -98.5 }] }], pagination: { hasNextPage: true, endCursor: "c1" } }),
      json(200, { data: [{ id: "281474980000001", gps: [{ time: "2026-09-01T12:00:00Z", latitude: 29.4, longitude: -98.5 }] }], pagination: { hasNextPage: false, endCursor: "" } }),
    ];
    vi.stubGlobal("fetch", vi.fn(async (u: URL | string) => { urls.push(new URL(String(u))); return responses.shift()!; }));
    const api = new SamsaraClient({ apiToken: "test-token", samsaraOrgId: null });
    const h = await api.trailerGpsHistory(["281474980000001", "281474980000002"], "2026-09-01T11:50:00.000Z", "2026-09-01T16:10:00.000Z");

    expect(urls[1]!.pathname).toMatch(/\/fleet\/trailers\/stats\/history$/);
    expect(urls[1]!.searchParams.get("trailerIds")).toBe("281474980000001,281474980000002");
    expect(urls[1]!.searchParams.get("types")).toBe("gps");
    expect(Number.isFinite(Date.parse(urls[1]!.searchParams.get("startTime")!))).toBe(true);
    expect(urls[2]!.searchParams.get("after")).toBe("c1"); // pagination followed
    expect(slept).toContain(2000); // Retry-After honoured
    expect(h.retries).toBe(1);
    expect(h.requests).toBe(3);
    expect(h.rows).toBe(2);
    const fixes = h.fixes.get("281474980000001")!;
    expect(fixes.map((f) => f.lat)).toEqual([29.4, 29.5]); // both pages merged, time-ordered
  });

  it("gives up after bounded retries and throws (the caller reports samsara_unavailable, never 'no GPS')", async () => {
    setSamsaraSleepForTests(async () => {});
    vi.stubGlobal("fetch", vi.fn(async () => json(429, { message: "rate limited" })));
    const api = new SamsaraClient({ apiToken: "test-token", samsaraOrgId: null });
    await expect(api.trailerGpsHistory(["1"], "2026-09-01T00:00:00Z", "2026-09-01T01:00:00Z")).rejects.toBeInstanceOf(SamsaraApiError);
  });
});
