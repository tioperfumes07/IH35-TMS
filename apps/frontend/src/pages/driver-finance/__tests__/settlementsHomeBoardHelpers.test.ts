import { describe, expect, it } from "vitest";
import { addDaysIso } from "../../../lib/businessDate";
import {
  buildSettlementsWeekBuckets,
  companyWeekStartSundayIso,
  formatWeekOfTitle,
  resolveSelectedWeekBucket,
  settlementPeriodEndIso,
  settlementsWeekOfStatusLabel,
  weekBucketLabelFromIso,
} from "../settlementsHomeBoardHelpers";
import { weekOfBoardStatus } from "../SettlementsHomeBoardPanels";
import type { SettlementListRow } from "../../../api/driverFinance";

/** Codex batch92 probe instant — noon UTC on a Tuesday → Chicago still Mon/Tue same calendar week starting Sun 10/18. */
const PROBE = new Date("2026-10-20T12:00:00.000Z");

describe("settlementsHomeBoardHelpers company-calendar weeks (Codex batch91/92)", () => {
  it("companyWeekStartSundayIso is America/Chicago Sunday for the probe instant", () => {
    expect(companyWeekStartSundayIso(PROBE)).toBe("2026-10-18");
  });

  it("formatWeekOfTitle uses bare ISO without TZ shift (CT/Eastern/UTC agree)", () => {
    expect(formatWeekOfTitle("2026-10-18")).toBe("10/18/2026");
    // Eastern local Sunday midnight projected through Instant formatter used to yield 10/17 —
    // ISO path must never do that.
    expect(formatWeekOfTitle("2026-10-18")).not.toBe("10/17/2026");
  });

  it("week label + title stay aligned for every bucket around DST spring-forward", () => {
    // 2026 US spring-forward is 2026-03-08; week containing that Sunday.
    const aroundDst = new Date("2026-03-10T17:00:00.000Z");
    const start = companyWeekStartSundayIso(aroundDst);
    expect(start).toBe("2026-03-08");
    expect(weekBucketLabelFromIso(start)).toBe("03-08");
    expect(formatWeekOfTitle(start)).toBe("03/08/2026");
    expect(formatWeekOfTitle(addDaysIso(start, 7))).toBe("03/15/2026");
  });

  it("buildSettlementsWeekBuckets keys week_start on company ISO and titles match", () => {
    const rows: SettlementListRow[] = [
      {
        id: "s1",
        status: "open",
        period_end: "2026-10-19",
        net_pay: 100,
        gross_pay: 120,
        deductions_total: 20,
      } as SettlementListRow,
    ];
    const buckets = buildSettlementsWeekBuckets(rows, 3, PROBE);
    expect(buckets).toHaveLength(3);
    const selected = resolveSelectedWeekBucket(buckets, "2026-10-18");
    expect(selected?.weekStartIso).toBe("2026-10-18");
    expect(selected?.label).toBe("10-18");
    expect(formatWeekOfTitle(selected!.weekStartIso)).toBe("10/18/2026");
    expect(selected?.net).toBe(100);
    expect(selected?.deductions).toBe(20);
  });

  it("settlementPeriodEndIso keeps date-only and Chicago-stamps timestamptz", () => {
    expect(settlementPeriodEndIso("2026-10-18")).toBe("2026-10-18");
    expect(settlementPeriodEndIso("2026-10-18T15:30:00")).toBe("2026-10-18");
    // 2026-10-18T04:00:00.000Z = 2026-10-17 23:00 CDT → company day 10/17
    expect(settlementPeriodEndIso("2026-10-18T04:00:00.000Z")).toBe("2026-10-17");
  });

  // T4 — Closed-week rows must not read payment "Open" when the tour is closed.
  it("weekOfBoardStatus labels tour-closed unpaid as Closed (not Open)", () => {
    const closedUnpaid = {
      id: "s-closed",
      status: "closed",
      payment_state: "unpaid",
      trip_closed_at: "2026-10-20T12:00:00.000Z",
    } as SettlementListRow;
    expect(settlementsWeekOfStatusLabel(closedUnpaid)).toBe("Closed");
    expect(weekOfBoardStatus(closedUnpaid).label).toBe("Closed");
    const openTour = { id: "s-open", status: "open", payment_state: "unpaid" } as SettlementListRow;
    expect(weekOfBoardStatus(openTour).label).toBe("Open");
    const paid = { id: "s-paid", status: "paid", payment_state: "cleared", trip_closed_at: "2026-10-20T12:00:00.000Z" } as SettlementListRow;
    expect(weekOfBoardStatus(paid).label).toBe("Paid");
  });
});
