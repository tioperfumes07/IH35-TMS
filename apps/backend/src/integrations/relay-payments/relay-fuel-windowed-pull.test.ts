import { describe, expect, it } from "vitest";
import { RelayApiError, type RelayCallPacer, type RelayFuelTransaction } from "./relay-client.js";
import {
  createRelayCallPacer,
  fetchRelayFuelTransactionsInWindows,
  isRelayTimeoutClassError,
  RELAY_MIN_CALL_INTERVAL_FLOOR_MS,
} from "./relay-fuel-windowed-pull.js";

// Relay (relayed 2026-10-03): dtstart/dtend filter, all history available, and "a 10 second limit on pulling
// transactions" — read BOTH ways: >=10s between calls, and a short per-call budget with window halving.

function fakeClock() {
  let t = 0;
  const sleeps: number[] = [];
  return {
    clock: {
      now: () => t,
      sleep: async (ms: number) => {
        sleeps.push(ms);
        t += ms;
      },
    },
    advance: (ms: number) => {
      t += ms;
    },
    sleeps,
    now: () => t,
  };
}

type Call = { startDate: string; endDate: string; at: number; timeoutMs: number; maxRetries: number };

/** fetchWindow fake: runs the pacer like the real client, takes `callMs`, and lets `fail` decide per call. */
function fakeFetch(c: ReturnType<typeof fakeClock>, fail: (call: Call, n: number) => Error | null = () => null, callMs = 2_000) {
  const calls: Call[] = [];
  const fetchWindow = async (
    _entity: string | null,
    o: { startDate: string; endDate: string; timeoutMs: number; maxRetries: number; pacer: RelayCallPacer }
  ) => {
    await o.pacer.beforeCall();
    const call: Call = { startDate: o.startDate, endDate: o.endDate, at: c.now(), timeoutMs: o.timeoutMs, maxRetries: o.maxRetries };
    calls.push(call);
    c.advance(callMs);
    o.pacer.afterCall();
    const err = fail(call, calls.length);
    if (err) throw err;
    const row = { transaction_id: `${o.startDate}`, created_at: `${o.startDate}T12:00:00Z` } as RelayFuelTransaction;
    return { rows: [row], meta: { api_row_count: 1, pages_fetched: 1, envelope: "array", rejected: [] } };
  };
  return { calls, fetchWindow };
}

const timeout = () => new RelayApiError("relay_network_error:This operation was aborted", null, null, true);

describe("fetchRelayFuelTransactionsInWindows", () => {
  it("walks the range in contiguous dated windows, oldest first, >=10s between calls", async () => {
    const c = fakeClock();
    const f = fakeFetch(c);
    const seen: string[] = [];
    const summary = await fetchRelayFuelTransactionsInWindows(
      "USMCA",
      {
        startDate: "2026-01-01",
        endDate: "2026-01-20",
        windowDays: 7,
        onWindow: async (w) => {
          seen.push(`${w.startDate}..${w.endDate}`);
        },
      },
      { fetchWindow: f.fetchWindow, clock: c.clock, callTimeoutMs: 15_000 }
    );
    expect(seen).toEqual(["2026-01-01..2026-01-07", "2026-01-08..2026-01-14", "2026-01-15..2026-01-20"]);
    expect(summary).toMatchObject({ windows: 3, calls: 3, halvings: 0, rows: 3 });
    // every call starts at least 10s after the previous one finished (each call took 2s)
    for (let i = 1; i < f.calls.length; i++) expect(f.calls[i].at - (f.calls[i - 1].at + 2_000)).toBeGreaterThanOrEqual(10_000);
    // per-call budget passed down; the client's own inner retries are off (retries stay behind the pacer)
    expect(f.calls.every((x) => x.timeoutMs === 15_000 && x.maxRetries === 0)).toBe(true);
  });

  it("never paces below 10s even if configured lower", async () => {
    const c = fakeClock();
    const f = fakeFetch(c, () => null, 0);
    await fetchRelayFuelTransactionsInWindows(
      null,
      { startDate: "2026-01-01", endDate: "2026-01-02", windowDays: 1, onWindow: async () => {} },
      { fetchWindow: f.fetchWindow, clock: c.clock, minIntervalMs: 1_000 }
    );
    expect(f.calls[1].at - f.calls[0].at).toBeGreaterThanOrEqual(RELAY_MIN_CALL_INTERVAL_FLOOR_MS);
  });

  it("halves a window that times out and retries it, then grows back", async () => {
    const c = fakeClock();
    // the first 7-day call and the following 4-day call time out; 2 days succeeds
    const f = fakeFetch(c, (call) => (call.startDate === "2026-01-01" && call.endDate >= "2026-01-04" ? timeout() : null));
    const seen: string[] = [];
    const summary = await fetchRelayFuelTransactionsInWindows(
      null,
      { startDate: "2026-01-01", endDate: "2026-01-14", windowDays: 7, onWindow: async (w) => void seen.push(`${w.startDate}..${w.endDate}`) },
      { fetchWindow: f.fetchWindow, clock: c.clock }
    );
    expect(f.calls.map((x) => `${x.startDate}..${x.endDate}`)).toEqual([
      "2026-01-01..2026-01-07", // timeout -> 4
      "2026-01-01..2026-01-04", // timeout -> 2
      "2026-01-01..2026-01-02", // ok, grow to 4
      "2026-01-03..2026-01-06", // ok, grow to 7
      "2026-01-07..2026-01-13",
      "2026-01-14..2026-01-14",
    ]);
    expect(seen[0]).toBe("2026-01-01..2026-01-02");
    expect(summary.halvings).toBe(2);
    // no gap and no overlap across what was handed to the caller
    expect(seen).toEqual(["2026-01-01..2026-01-02", "2026-01-03..2026-01-06", "2026-01-07..2026-01-13", "2026-01-14..2026-01-14"]);
  });

  it("fails loudly when a 1-day window still times out", async () => {
    const c = fakeClock();
    const f = fakeFetch(c, () => new RelayApiError("relay_http_504", 504, null, true));
    await expect(
      fetchRelayFuelTransactionsInWindows(
        null,
        { startDate: "2026-01-01", endDate: "2026-01-07", windowDays: 7, onWindow: async () => {} },
        { fetchWindow: f.fetchWindow, clock: c.clock }
      )
    ).rejects.toThrow(/relay_window_timeout_at_min_window:2026-01-01\.\.2026-01-01/);
    expect(f.calls.map((x) => `${x.startDate}..${x.endDate}`)).toEqual([
      "2026-01-01..2026-01-07",
      "2026-01-01..2026-01-04",
      "2026-01-01..2026-01-02",
      "2026-01-01..2026-01-01",
    ]);
  });

  it("does not hand a failed window to the caller, and throws a non-timeout error at once", async () => {
    const c = fakeClock();
    const f = fakeFetch(c, (_call, n) => (n === 2 ? new RelayApiError("relay_http_401", 401, null, false) : null));
    const seen: string[] = [];
    await expect(
      fetchRelayFuelTransactionsInWindows(
        null,
        { startDate: "2026-01-01", endDate: "2026-01-21", windowDays: 7, onWindow: async (w) => void seen.push(w.startDate) },
        { fetchWindow: f.fetchWindow, clock: c.clock }
      )
    ).rejects.toThrow(/relay_http_401/);
    expect(seen).toEqual(["2026-01-01"]);
    expect(f.calls).toHaveLength(2);
  });

  it("retries a 429 on the same window behind the pacer (Retry-After honoured), then gives up", async () => {
    const c = fakeClock();
    const rateLimited = () => new RelayApiError("relay_http_429", 429, { retry_after: "30" }, true);
    const f = fakeFetch(c, (_call, n) => (n === 1 ? rateLimited() : null));
    await fetchRelayFuelTransactionsInWindows(
      null,
      { startDate: "2026-01-01", endDate: "2026-01-01", windowDays: 7, onWindow: async () => {} },
      { fetchWindow: f.fetchWindow, clock: c.clock }
    );
    expect(f.calls).toHaveLength(2);
    expect(f.calls[1].startDate).toBe("2026-01-01");
    expect(f.calls[1].at - (f.calls[0].at + 2_000)).toBeGreaterThanOrEqual(30_000);

    const c2 = fakeClock();
    const always = fakeFetch(c2, () => rateLimited());
    await expect(
      fetchRelayFuelTransactionsInWindows(
        null,
        { startDate: "2026-01-01", endDate: "2026-01-01", windowDays: 1, onWindow: async () => {} },
        { fetchWindow: always.fetchWindow, clock: c2.clock }
      )
    ).rejects.toThrow(/relay_http_429/);
    expect(always.calls).toHaveLength(4); // 1 + 3 retries
  });
});

describe("isRelayTimeoutClassError / createRelayCallPacer", () => {
  it("classifies abort/network, 408 and 5xx as cured by a smaller window; 4xx/429/non-Relay are not", () => {
    expect(isRelayTimeoutClassError(timeout())).toBe(true);
    expect(isRelayTimeoutClassError(new RelayApiError("relay_http_408", 408, null, false))).toBe(true);
    expect(isRelayTimeoutClassError(new RelayApiError("relay_http_503", 503, null, true))).toBe(true);
    expect(isRelayTimeoutClassError(new RelayApiError("relay_http_429", 429, null, true))).toBe(false);
    expect(isRelayTimeoutClassError(new RelayApiError("relay_http_401", 401, null, false))).toBe(false);
    expect(isRelayTimeoutClassError(new RelayApiError("relay_not_configured", null, null, false))).toBe(false);
    expect(isRelayTimeoutClassError(new Error("x"))).toBe(false);
  });

  it("pacer waits only the remainder of the interval since the last call finished", async () => {
    const c = fakeClock();
    const pacer = createRelayCallPacer(10_000, c.clock);
    await pacer.beforeCall(); // first call: no wait
    pacer.afterCall();
    c.advance(4_000); // caller spent 4s committing rows
    await pacer.beforeCall();
    expect(c.sleeps).toEqual([6_000]);
    expect(pacer.calls()).toBe(2);
  });
});
