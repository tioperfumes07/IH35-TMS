// LEAD 443.208R — a write anywhere refreshes Truck Line, List, Kanban and Load Costs in every open tab.
// Main: no realtime bus, no shared helper — a load.changed event reaches nothing and the views stay stale.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isLoadViewQueryKey, invalidateLoadViews } from "../invalidateLoadViews";
import { RealtimeBus, nextBackoffMs } from "../../hooks/useRealtimeBus";

// LEAD 443.232 a: the bus opens only for a signed-in user (the app's ["auth","me"] query).
const authState = vi.hoisted(() => ({ user: { id: "u1" } as unknown }));
vi.mock("../../auth/useAuth", () => ({ useAuth: () => ({ user: authState.user }) }));

type Listener = (ev: MessageEvent) => void;
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  listeners: Record<string, Listener[]> = {};
  onerror: (() => void) | null = null;
  onopen: (() => void) | null = null;
  closed = false;
  constructor(url: string) { this.url = url; FakeEventSource.instances.push(this); }
  addEventListener(type: string, fn: Listener) { (this.listeners[type] ??= []).push(fn); }
  close() { this.closed = true; }
  emit(type: string, data: unknown) { for (const fn of this.listeners[type] ?? []) fn({ data: JSON.stringify(data) } as MessageEvent); }
}

const BOARDS = [
  ["truck-line", "co", "2026-10-21"],
  ["loads", "list", "co"],
  ["kanban", "load-profit", "l1", "co"],
  ["load-costs-board", "co"],
  ["accounting", "load-costs-board", "co"],
  ["loads", "detail", "co", "l1"],
];

describe("invalidateLoadViews + realtime bus (443.208R)", () => {
  afterEach(() => { FakeEventSource.instances = []; vi.unstubAllGlobals(); vi.useRealTimers(); });

  it("covers every board the owner watches and nothing unrelated", () => {
    for (const k of BOARDS) expect(isLoadViewQueryKey(k)).toBe(true);
    expect(isLoadViewQueryKey(["planner-week", "co"])).toBe(true);
    expect(isLoadViewQueryKey(["identity", "me"])).toBe(false);
    expect(isLoadViewQueryKey(["accounting", "chart-of-accounts"])).toBe(false);
  });

  it("a load.changed event marks every board stale", async () => {
    vi.stubGlobal("EventSource", FakeEventSource);
    const qc = new QueryClient();
    for (const k of BOARDS) qc.setQueryData(k, { v: 1 });
    qc.setQueryData(["identity", "me"], { v: 1 });
    render(<QueryClientProvider client={qc}><RealtimeBus /></QueryClientProvider>);
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0]!.url).toContain("/api/v1/notifications/stream?channels=loads");
    await act(async () => { FakeEventSource.instances[0]!.emit("load.changed", { company_id: "co", load_ids: ["l1"] }); });
    for (const k of BOARDS) expect(qc.getQueryState(k)?.isInvalidated).toBe(true);
    expect(qc.getQueryState(["identity", "me"])?.isInvalidated).toBe(false);
  });

  it("reconnects after an error (the bell's stream closed for good)", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("EventSource", FakeEventSource);
    const qc = new QueryClient();
    render(<QueryClientProvider client={qc}><RealtimeBus /></QueryClientProvider>);
    act(() => { FakeEventSource.instances[0]!.onerror?.(); });
    expect(FakeEventSource.instances[0]!.closed).toBe(true);
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(nextBackoffMs(16_000)).toBe(30_000);
  });

  it("443.232 a: a signed-out tab opens no stream (before: a 401 every 30 s, forever)", async () => {
    vi.stubGlobal("EventSource", FakeEventSource);
    authState.user = null;
    try {
      render(<QueryClientProvider client={new QueryClient()}><RealtimeBus /></QueryClientProvider>);
      expect(FakeEventSource.instances).toHaveLength(0);
    } finally {
      authState.user = { id: "u1" };
    }
  });

  it("the helper itself invalidates only load views", async () => {
    const qc = new QueryClient();
    qc.setQueryData(["truck-line", "co"], 1);
    qc.setQueryData(["users", "list"], 1);
    await invalidateLoadViews(qc);
    expect(qc.getQueryState(["truck-line", "co"])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(["users", "list"])?.isInvalidated).toBe(false);
  });
});
