/**
 * AJK-01 regression test: same-total driver reassignment must move driver_bill.driver_id to the new driver.
 *
 * Root cause: book-load.service.ts ensureDriverBillArtifactsForLoadInClientTx had an early return
 * when totalBillCents === existingGross that skipped the UPDATE entirely, leaving the old driver on
 * the open bill. The fix adds a targeted UPDATE driver_id-only on this branch when the driver changed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  appendCrudAudit: vi.fn(async () => undefined),
  emitDispatchSpineEvent: vi.fn(async () => undefined),
}));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: mocks.appendCrudAudit }));
vi.mock("../../audit/emit-dispatch-spine-event.js", () => ({ emitDispatchSpineEvent: mocks.emitDispatchSpineEvent }));

import { ensureDriverBillArtifactsForLoad } from "../book-load.service.js";

const OPCO = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";
const LOAD_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BILL_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DRIVER_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const DRIVER_B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ACTOR = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

// Pay: 100 miles × $1.00/mi = 10000 cents (same total when existingGross is also 10000)
const RATE_DOLLARS = 1.0;
const MILES = 100;
const RATE_CENTS = Math.round(RATE_DOLLARS * 100);
const TOTAL_CENTS = MILES * RATE_CENTS;

function makeClient(overrides: { driverA?: boolean; existingGrossCents?: number; existingDriverId?: string } = {}) {
  const { existingGrossCents = TOTAL_CENTS, existingDriverId = DRIVER_A } = overrides;
  const updateCalls: string[] = [];

  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    const normalized = sql.replace(/\s+/g, " ").trim();

    // relation existence check
    if (normalized.includes("to_regclass")) {
      return { rows: [{ exists: true }] };
    }
    // advisory lock
    if (normalized.includes("pg_advisory_xact_lock")) {
      return { rows: [] };
    }
    // Load re-read by ensureDriverBillArtifactsForLoad
    if (normalized.includes("FROM mdata.loads") && normalized.includes("miles_shortest")) {
      return {
        rows: [
          {
            id: LOAD_ID,
            operating_company_id: OPCO,
            load_number: "AJK01-001",
            customer_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
            status: "assigned_not_dispatched",
            assigned_primary_driver_id: DRIVER_B, // already updated to new driver
            assigned_secondary_driver_id: null,
            team_id: null,
            requires_tarps: false,
            miles_shortest: MILES,
            miles_practical: null,
            driver_pay_rate_per_mile: RATE_DOLLARS,
            driver_pay_rate_override_reason: "AJK-01 test override reason",
            miles_deadhead: null,
          },
        ],
      };
    }
    // Load stops
    if (normalized.includes("FROM mdata.load_stops")) {
      return { rows: [] };
    }
    // Existing driver bill SELECT (with driver_id column added by the fix)
    if (normalized.includes("FROM driver_finance.driver_bills") && normalized.includes("SELECT")) {
      return {
        rows: [
          {
            id: BILL_ID,
            status: "open",
            gross_amount_cents: existingGrossCents,
            voided_at: null,
            settled_in_settlement_id: null,
            driver_id: existingDriverId,
          },
        ],
      };
    }
    // Pay rate card (no card — use per-load override)
    if (normalized.includes("driver_finance.driver_pay_rates")) {
      return { rows: [] };
    }
    // Salaried check
    if (normalized.includes("driver_finance.driver_contracts")) {
      return { rows: [] };
    }
    // Driver stops extra
    if (normalized.includes("driver_finance.driver_extra_stop_bonuses")) {
      return { rows: [] };
    }
    // Tarp config
    if (normalized.includes("driver_finance.driver_tarp_rates")) {
      return { rows: [] };
    }
    // Lumper
    if (normalized.includes("lumper")) {
      return { rows: [] };
    }
    // UPDATE driver_bills — capture it
    if (normalized.includes("UPDATE driver_finance.driver_bills")) {
      updateCalls.push(JSON.stringify(params));
      return { rows: [] };
    }
    // INSERT driver_bills (fresh mint case)
    if (normalized.includes("INSERT INTO driver_finance.driver_bills")) {
      return { rows: [{ id: BILL_ID }] };
    }
    return { rows: [] };
  });

  return { query, updateCalls };
}

describe("AJK-01: same-total reassignment moves driver_bill.driver_id to the new driver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates driver_id when totalBillCents === existingGross but driver changed (regression gate)", async () => {
    const { query, updateCalls } = makeClient({ existingGrossCents: TOTAL_CENTS, existingDriverId: DRIVER_A });

    await ensureDriverBillArtifactsForLoad(
      { query } as never,
      { loadId: LOAD_ID, operatingCompanyId: OPCO, actorUserId: ACTOR }
    );

    // The same-total branch must have issued an UPDATE with DRIVER_B
    const driverBillUpdate = updateCalls.find((c) => c.includes(DRIVER_B));
    expect(driverBillUpdate, "expected UPDATE driver_bills to carry the new driver DRIVER_B").toBeTruthy();
  });

  it("does NOT issue a spurious UPDATE when the driver did not change", async () => {
    const { query, updateCalls } = makeClient({ existingGrossCents: TOTAL_CENTS, existingDriverId: DRIVER_B });

    // Load re-read also returns DRIVER_B (no change)
    await ensureDriverBillArtifactsForLoad(
      { query } as never,
      { loadId: LOAD_ID, operatingCompanyId: OPCO, actorUserId: ACTOR }
    );

    expect(updateCalls.length).toBe(0);
  });
});
