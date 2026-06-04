import { describe, expect, it } from "vitest";
import {
  countActiveDispatchLoads,
  countDriverEscrowKpis,
  countDriversOnActiveLoads,
  countInTransitDispatchLoads,
  countOpenMaintenanceWorkOrders,
  countPastDueMaintenanceWorkOrders,
  countPendingBills,
  countPmDueAlerts,
  DISPATCH_ACTIVE_LOAD_STATUSES,
  DISPATCH_IN_TRANSIT_STATUSES,
  OPEN_MAINTENANCE_WO_STATUSES,
  PENDING_BILL_STATUSES,
} from "../canonical-kpis.js";

describe("canonical-kpis (P8-AUDIT-KPI-DRIFTS)", () => {
  it("active loads status set includes pickup/delivery and excludes soft-deleted path", () => {
    expect(DISPATCH_ACTIVE_LOAD_STATUSES).toContain("at_pickup");
    expect(DISPATCH_ACTIVE_LOAD_STATUSES).toContain("at_delivery");
    expect(DISPATCH_ACTIVE_LOAD_STATUSES).toHaveLength(6);
  });

  it("in-transit status set matches movement-phase loads", () => {
    expect(DISPATCH_IN_TRANSIT_STATUSES).toEqual(["at_pickup", "in_transit", "at_delivery"]);
  });

  it("open WO statuses align maintenance home and wos-open-count", () => {
    expect(OPEN_MAINTENANCE_WO_STATUSES).toEqual(["open", "in_progress", "waiting_parts"]);
  });

  it("pm due and past due use distinct definitions", async () => {
    const calls: string[] = [];
    const client = {
      query: async (sql: string) => {
        calls.push(sql);
        if (sql.includes("pm_alerts")) return { rows: [{ count: 4 }] };
        return { rows: [{ count: 2 }] };
      },
    };
    const pmDue = await countPmDueAlerts(client, "00000000-0000-0000-0000-000000000001");
    const pastDue = await countPastDueMaintenanceWorkOrders(client, "00000000-0000-0000-0000-000000000001");
    expect(pmDue).toBe(4);
    expect(pastDue).toBe(2);
    expect(calls[0]).toMatch(/pm_alerts/);
    expect(calls[1]).toMatch(/due_date < CURRENT_DATE/);
  });

  it("drivers on active loads counts distinct drivers on canonical statuses", async () => {
    const client = {
      query: async (sql: string) => {
        expect(sql).toMatch(/soft_deleted_at IS NULL/);
        expect(sql).toMatch(/assigned_primary_driver_id/);
        for (const status of DISPATCH_ACTIVE_LOAD_STATUSES) {
          expect(sql).toContain(status);
        }
        return { rows: [{ count: 7 }] };
      },
    };
    await expect(countDriversOnActiveLoads(client, "00000000-0000-0000-0000-000000000001")).resolves.toBe(7);
  });

  it("pending bills uses open and partially_paid only", () => {
    expect(PENDING_BILL_STATUSES).toEqual(["open", "partially_paid"]);
  });

  it("exports dispatch and banking canonical counters", () => {
    expect(typeof countActiveDispatchLoads).toBe("function");
    expect(typeof countInTransitDispatchLoads).toBe("function");
    expect(typeof countDriverEscrowKpis).toBe("function");
    expect(typeof countOpenMaintenanceWorkOrders).toBe("function");
    expect(typeof countPendingBills).toBe("function");
  });

  it("pending bills query scopes to company and canonical statuses", async () => {
    const client = {
      query: async (sql: string) => {
        expect(sql).toMatch(/accounting\.bills/);
        expect(sql).toMatch(/partially_paid/);
        return { rows: [{ count: 3 }] };
      },
    };
    await expect(countPendingBills(client, "00000000-0000-0000-0000-000000000001")).resolves.toBe(3);
  });
});
