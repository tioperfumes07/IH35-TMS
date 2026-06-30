import * as client from "./client";
import {
  fetchHomeWoStatusCounts,
  fetchHomeWeeklyRevenue,
  fetchHomeOpenLoadsCount,
  fetchHomeDriversOnDuty,
  fetchHomeWosOpenCount,
  fetchHomeFleetUtilization,
  fetchHomeTodayRevenue,
} from "./home";
import { beforeEach, describe, expect, it, vi } from "vitest";

// REGRESSION GUARD (GUARD audit HOME-2..6): the Home dashboard tiles read undefined → 0/[] when the
// frontend reader and the backend `home-widgets` response shapes drift apart. These tests pin each
// reader to the EXACT shape `apps/backend/src/home/home-widgets.routes.ts` returns, so a future
// rename on either side fails here instead of silently zeroing the dashboard.
describe("home-widgets FE↔BE response contract", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("wo-status-counts: reads the backend keyed object (not an array)", async () => {
    vi.spyOn(client, "apiRequest").mockResolvedValue({
      draft: 1,
      open: 2,
      in_progress: 3,
      awaiting_parts: 4,
      completed: 5,
      cancelled: 6,
      unknown: 0,
    } as never);
    const rows = await fetchHomeWoStatusCounts("c1");
    const byStatus = Object.fromEntries(rows.map((r) => [r.status, r.count]));
    expect(byStatus).toMatchObject({ open: 2, in_progress: 3, awaiting_parts: 4, completed: 5, cancelled: 6, draft: 1 });
  });

  it("weekly-revenue: reads { days: [{ date, cents }] }", async () => {
    vi.spyOn(client, "apiRequest").mockResolvedValue({
      days: [
        { date: "2026-06-28", cents: 12_345 },
        { date: "2026-06-29", cents: 0 },
      ],
      totalCents: 12_345,
    } as never);
    const points = await fetchHomeWeeklyRevenue("c1", 7);
    expect(points).toEqual([
      { date: "2026-06-28", revenue_cents: 12_345 },
      { date: "2026-06-29", revenue_cents: 0 },
    ]);
  });

  it("open-loads-count: reads { total, in_transit, assigned, unassigned }", async () => {
    vi.spyOn(client, "apiRequest").mockResolvedValue({ total: 4, in_transit: 1, assigned: 2, unassigned: 1 } as never);
    expect(await fetchHomeOpenLoadsCount("c1")).toEqual({ total: 4, in_transit: 1, assigned: 2, unassigned: 1 });
  });

  it("drivers-on-duty: reads { active, total_drivers, on_break } (denominator present)", async () => {
    vi.spyOn(client, "apiRequest").mockResolvedValue({ active: 3, total_drivers: 84, on_break: 0 } as never);
    expect(await fetchHomeDriversOnDuty("c1")).toEqual({ active: 3, total_drivers: 84, on_break: 0 });
  });

  it("wos-open-count: reads { open, in_progress }", async () => {
    vi.spyOn(client, "apiRequest").mockResolvedValue({ open: 11, in_progress: 4 } as never);
    expect(await fetchHomeWosOpenCount("c1")).toEqual({ open: 11, in_progress: 4 });
  });

  it("fleet-utilization: reads snake_case { active_units, total_units, percentage }", async () => {
    vi.spyOn(client, "apiRequest").mockResolvedValue({ active_units: 8, total_units: 10, percentage: 80 } as never);
    expect(await fetchHomeFleetUtilization("c1")).toEqual({ active_units: 8, total_units: 10, percentage: 80 });
  });

  it("today-revenue: reads { revenue_cents }", async () => {
    vi.spyOn(client, "apiRequest").mockResolvedValue({ revenue_cents: 4_900 } as never);
    const tr = await fetchHomeTodayRevenue("c1");
    expect(tr.revenue_cents).toBe(4_900);
  });
});
