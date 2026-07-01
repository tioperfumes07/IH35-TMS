import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Regression guard for the "demo/junk data leaking into live views" audit defects:
//   DISPATCH-4  — Fleet OOS / In-shop board surfaced onboarding sample units.
//   DRIVERHUB-2 — Driver Scheduler surfaced demo/DUMMY/TEST drivers.
//   MAINT-1     — Maintenance WO list surfaced DEMO-WO-* seed work orders.
// Each live query MUST keep excluding the seed rows (is_sample_data flag / DEMO-|TEST- name markers).
// These are static source assertions — they cannot regress silently in a refactor.

const here = path.dirname(fileURLToPath(import.meta.url));
const backendSrc = path.join(here, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(backendSrc, rel), "utf8");

describe("DISPATCH-4: units list / OOS board excludes sample units", () => {
  const units = read("mdata/units.routes.ts");
  it("filters is_sample_data out of the non-unified /api/v1/mdata/units query", () => {
    expect(units).toMatch(/filters\.push\("is_sample_data IS NOT TRUE"\)/);
    expect(units).toMatch(/DISPATCH-4/);
  });
});

describe("DRIVERHUB-2: driver scheduler excludes demo/test drivers", () => {
  const scheduler = read("safety/driver-scheduler.service.ts");
  it("excludes is_sample_data and DEMO/DUMMY/TEST name markers from the fleet schedule", () => {
    expect(scheduler).toMatch(/d\.is_sample_data IS NOT TRUE/);
    expect(scheduler).toMatch(/NOT ILIKE '%DEMO%'/);
    expect(scheduler).toMatch(/NOT ILIKE '%DUMMY%'/);
    expect(scheduler).toMatch(/NOT ILIKE 'TEST%'/);
    expect(scheduler).toMatch(/DRIVERHUB-2/);
  });
});

describe("MAINT-1: work-order lists exclude DEMO-/TEST- seed work orders", () => {
  const woList = read("work-orders/work-orders.routes.ts");
  const maintWoList = read("maintenance/work-orders.routes.ts");
  it("filters DEMO-/TEST- display_id out of /api/v1/work-orders", () => {
    expect(woList).toMatch(/COALESCE\(w\.display_id, ''\) NOT ILIKE 'DEMO-%'/);
    expect(woList).toMatch(/COALESCE\(w\.display_id, ''\) NOT ILIKE 'TEST-%'/);
    expect(woList).toMatch(/MAINT-1/);
  });
  it("filters DEMO-/TEST- display_id out of /api/v1/maintenance/work-orders", () => {
    expect(maintWoList).toMatch(/COALESCE\(w\.display_id, ''\) NOT ILIKE 'DEMO-%'/);
    expect(maintWoList).toMatch(/COALESCE\(w\.display_id, ''\) NOT ILIKE 'TEST-%'/);
    expect(maintWoList).toMatch(/MAINT-1/);
  });
});
