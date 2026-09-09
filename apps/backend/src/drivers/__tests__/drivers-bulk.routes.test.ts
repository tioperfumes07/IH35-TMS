import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const routes = fs.readFileSync(path.join(here, "..", "drivers-bulk.routes.ts"), "utf8");
const mdataIndex = fs.readFileSync(path.join(here, "..", "..", "mdata", "index.ts"), "utf8");

describe("drivers bulk-update route", () => {
  it("exposes POST /api/v1/mdata/drivers/bulk-update via registerBulkRoute", () => {
    expect(routes).toMatch(/registerBulkRoute(?:<[^>]+>)?\(/);
    expect(routes).toMatch(/\/api\/v1\/mdata\/drivers\/bulk-update/);
    expect(routes).toMatch(/set_status: setStatusPayloadSchema/);
    expect(routes).toMatch(/set_oos_reason: setOosReasonPayloadSchema/);
    expect(routes).toMatch(/assign_to_truck: assignTruckPayloadSchema/);
    expect(routes).toMatch(/archive: archivePayloadSchema/);
  });

  it("caps bulk IDs at 100 and requires reason on status/archive/OOS actions", () => {
    expect(routes).toMatch(/maxIds: FLEET_BULK_MAX_IDS/);
    expect(routes).toMatch(/requireReasonActions: \["set_status", "archive", "set_oos_reason"\]/);
    expect(routes).toMatch(/destructiveActions: \["archive"\]/);
  });

  it("requires reason_code_id when setting status to Inactive", () => {
    expect(routes).toMatch(/reason_code_id required when setting status to Inactive/);
    expect(routes).toMatch(/E_OOS_REASON_INVALID/);
  });

  it("rejects Active employment status as OOS reason per row", () => {
    expect(routes).toMatch(/E_OOS_REASON_REJECTED/);
    expect(routes).toMatch(/OOS reason cannot be Active employment status/);
  });

  it("registers route from mdata module and archives without delete", () => {
    expect(routes).toMatch(/archived_at = COALESCE\(archived_at, now\(\)\)/);
    expect(routes).toMatch(/deactivated_at = COALESCE\(deactivated_at, now\(\)\)/);
    expect(routes).toMatch(/appendBulkCrudAudit/);
    expect(mdataIndex).toMatch(/registerDriversBulkRoutes/);
  });

  // DRV-STATUS-LOCK-PREVENTS-AUTO-REACTIVATION (owner 2026-09-07 report; gap found 2026-09-09):
  // the single-item /deactivate + /reactivate routes lock/unlock status_locked_at so the daily
  // driver-active-30d cron can never silently reverse a human's decision -- this bulk set_status
  // action (the "Deactivate drivers" multi-select button) never did, leaving every
  // bulk-deactivated driver unlocked and eligible for the very next cron run to flip it straight
  // back to Active. Guards the regression class, not just the one-time count.
  it("set_status locks status_locked_at/reason on Inactive/Terminated and clears it on Active — same as the single-item routes", () => {
    const setStatusUpdate = routes.slice(routes.indexOf("async function handleSetStatus"));
    expect(setStatusUpdate).toMatch(
      /status_locked_at = CASE\s+WHEN \$2 IN \('Inactive', 'Terminated'\) THEN now\(\)\s+WHEN \$2 = 'Active' THEN NULL/
    );
    expect(setStatusUpdate).toMatch(
      /status_locked_reason = CASE\s+WHEN \$2 IN \('Inactive', 'Terminated'\) THEN 'manual_deactivate'\s+WHEN \$2 = 'Active' THEN NULL/
    );
  });
});
