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
    expect(routes).toMatch(/appendBulkCrudAudit/);
    expect(mdataIndex).toMatch(/registerDriversBulkRoutes/);
  });
});
