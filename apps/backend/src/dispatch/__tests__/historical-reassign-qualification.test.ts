// FAIL-D1 (443.187) — a driver (re)assigned to an existing load on a historical backfill (Settlement Creator, settlement-
// document seed) runs the SAME qualification gate; a block is RECORDED as dispatch.historical_backfill_gate_exception and
// the reassignment proceeds (owner ruling for historical_backfill: never skipped, never silently passed).
import { beforeEach, describe, expect, it, vi } from "vitest";

const { audit } = vi.hoisted(() => ({ audit: vi.fn(async () => undefined) }));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: audit }));

const { recordHistoricalReassignQualification } = await import("../driver-qualification.service.js");

const cred = (over: Record<string, unknown>) => ({
  id: "drv-1", driver_name: "Test Driver", is_deactivated: false, is_archived: false, is_status_inactive: false,
  cdl_missing: false, cdl_expired: false, cdl_expires_at: "2030-01-01", med_missing: false, med_expired: false,
  med_expiry_date: "2030-01-01", hazmat_blocked: false, hazmat_endorsement_expires_at: null, ...over,
});
const clientFor = (row: Record<string, unknown>) => ({
  query: vi.fn(async (sql: string) => (/cdl_missing/.test(sql) ? { rows: [row] } : { rows: [] })),
});
const args = { driverId: "drv-1", operatingCompanyId: "oci", loadId: "load-1", actorUserId: "actor", via: "settlement_creator" };

describe("FAIL-D1 — historical reassignment runs and records the qualification gate", () => {
  beforeEach(() => audit.mockClear());

  it("a driver with no CDL is recorded as a historical_backfill gate exception (not blocked)", async () => {
    const block = await recordHistoricalReassignQualification(clientFor(cred({ cdl_missing: true, cdl_expires_at: null })), args);
    expect(block).not.toBeNull();
    expect(audit).toHaveBeenCalledTimes(1);
    const [, actor, event, payload, severity] = audit.mock.calls[0] as unknown as [unknown, string, string, Record<string, unknown>, string];
    expect(actor).toBe("actor");
    expect(event).toBe("dispatch.historical_backfill_gate_exception");
    expect(payload).toMatchObject({ load_id: "load-1", gate: "driver_qualification", on: "driver_reassign", via: "settlement_creator", driver_id: "drv-1", historical_backfill_gate_exception: true });
    expect(severity).toBe("warning");
  });

  it("a qualified driver writes no exception", async () => {
    const block = await recordHistoricalReassignQualification(clientFor(cred({})), args);
    expect(block).toBeNull();
    expect(audit).not.toHaveBeenCalled();
  });
});
