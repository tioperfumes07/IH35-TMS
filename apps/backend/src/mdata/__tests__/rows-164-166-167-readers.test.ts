/**
 * Register rows 164 / 166 / 167 (2026-11-03) — readers resolve through the canonical rule.
 *  166: unit→driver follows merged shells to the survivor; the Truck planner's vacant trucks carry that driver;
 *       latest HOS clocks read the survivor's shells; Probation drivers are polled.
 *  167: driver profile current truck reads any OPEN pairing (prod: 809/809 VDA rows are source='reconciled');
 *       shell credentials fill the survivor's blanks.
 *  164: Fuel Home MTD and the Fuel board read ONE fuel spend function (live rows, volume-weighted $/gal).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { overlayShellCredentials, survivorDriverIdSql, driverAndShellIdsSql } from "../driver-merge-resolution.js";
import { unitCurrentDriverSql } from "../../dispatch/unit-current-driver.js";
import { FUEL_PERIOD_SPEND_SQL, companyMonthToDateRange, readFuelPeriodSpend } from "../../fuel/fuel-period-spend.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../../../");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("row 167 — merged shell credentials", () => {
  it("fills only the survivor's blank fields, newest shell first", () => {
    const survivor: Record<string, unknown> = { cdl_number: null, cdl_expires_at: null, emergency_contact_name: "Kept" };
    const filled = overlayShellCredentials(survivor, [
      { cdl_number: "TAMP220307", cdl_expires_at: "2029-09-22", emergency_contact_name: "Shell" },
      { cdl_number: "OLDER", cdl_expires_at: "2020-01-01" },
    ]);
    expect(survivor.cdl_number).toBe("TAMP220307");
    expect(survivor.cdl_expires_at).toBe("2029-09-22");
    expect(survivor.emergency_contact_name).toBe("Kept");
    expect(filled).toEqual(expect.arrayContaining(["cdl_number", "cdl_expires_at"]));
    expect(filled).not.toContain("emergency_contact_name");
  });

  it("driver aggregate reads any open pairing (no samsara_webhook-only filter) and medical cards across shells", () => {
    const src = read("apps/backend/src/mdata/driver-aggregate.service.ts");
    expect(src).not.toMatch(/vda\.source = 'samsara_webhook'/);
    expect(src).toContain("loadMergedShellCredentials(client, driverId, operatingCompanyId)");
    expect(src).toMatch(/FROM safety\.medical_cards\s+WHERE driver_id = ANY\(\$\{driverAndShellIdsSql/);
    const unit = read("apps/backend/src/mdata/unit-aggregate.service.ts");
    expect(unit).not.toMatch(/vda\.source = 'samsara_webhook'/);
  });

  it("shell id set is company-pinned", () => {
    expect(driverAndShellIdsSql("$1", "$2")).toContain("shell.operating_company_id = $2::uuid");
  });
});

describe("row 166 — unit driver + HOS through the survivor", () => {
  it("unit→driver resolver joins the survivor of the resolved id", () => {
    const sql = unitCurrentDriverSql("u", "$1::uuid");
    expect(sql).toContain(survivorDriverIdSql("COALESCE(unit_vda.driver_id, unit_last_drv.driver_id)"));
  });
  it("scheduler grid vacant trucks carry the resolver's driver; Truck planner uses it", () => {
    const svc = read("apps/backend/src/safety/driver-scheduler.service.ts");
    expect(svc).toMatch(/ud\.id::text AS driver_id[\s\S]{0,200}FROM mdata\.units u\s+\$\{unitCurrentDriverSql\("u", "\$1::uuid"\)\}/);
    const fe = read("apps/frontend/src/pages/dispatch/planners/TruckPlanner.tsx");
    expect(fe).toContain("driverId: u.driver_id ? String(u.driver_id) : null");
  });
  it("latest HOS clocks probe the driver and each merged shell; roster polls Probation", () => {
    const svc = read("apps/backend/src/integrations/samsara/samsara-hos-clocks-pull.service.ts");
    expect(svc).toContain("shell.merged_into_driver_id = d.id");
    expect(svc).toMatch(/h\.driver_uuid = ids\.id\s+ORDER BY h\.polled_at DESC\s+LIMIT 1/);
    const roster = read("apps/backend/src/integrations/samsara/active-hos-driver-roster.service.ts");
    expect(roster).toContain("d.status IN ('Active', 'Probation')");
  });
});

describe("row 164 — one fuel spend reader", () => {
  it("live rows only, transaction date range, volume-weighted avg", () => {
    expect(FUEL_PERIOD_SPEND_SQL).toContain("ft.archived_at IS NULL AND ft.voided_at IS NULL");
    expect(FUEL_PERIOD_SPEND_SQL).toContain("ft.transaction_at::date >= $2::date");
    expect(FUEL_PERIOD_SPEND_SQL).not.toMatch(/avg\(\s*(ft\.)?price_per_gallon\s*\)/);
  });
  it("maps the row and keeps no-gallon avg null", async () => {
    const client = { query: async () => ({ rows: [{ spend: "76349.13", gallons: "13897.553", avg_price: "5.4937", fill_count: 214 }] }) };
    const r = await readFuelPeriodSpend(client, "c", "2026-10-01", "2026-10-31");
    expect(r).toMatchObject({ spend: 76349.13, gallons: 13897.553, avg_price_per_gallon: 5.4937, fill_count: 214 });
    const empty = await readFuelPeriodSpend({ query: async () => ({ rows: [{ spend: 0, gallons: 0, avg_price: null, fill_count: 0 }] }) }, "c", "a", "b");
    expect(empty.avg_price_per_gallon).toBeNull();
  });
  it("MTD range is the company business month (America/Chicago)", () => {
    // 2026-11-01T03:00Z is still Oct 31 in Chicago.
    expect(companyMonthToDateRange(new Date("2026-11-01T03:00:00Z"))).toEqual({ from: "2026-10-01", to: "2026-10-31" });
  });
  it("Fuel Home dashboard and the Fuel board strip both read it", () => {
    expect(read("apps/backend/src/fuel/planner.routes.ts")).toMatch(/mtd_spend: mtd\.spend/);
    expect(read("apps/backend/src/fuel/planner.routes.ts")).toContain('"/api/v1/fuel/spend-summary"');
    expect(read("apps/frontend/src/pages/fuel/components/FuelBoardKpiStrip.tsx")).toContain("getFuelSpendSummary(companyId, range.from, range.to)");
  });
});
