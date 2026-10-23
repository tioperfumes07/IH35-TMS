// LEAD 443.204 (owner 2026-10-21 15:27 CT: "for the current drivers, it cannot block, we do have the files in person").
// ROUND 443.257 — missing CDL / medical dates are reminders only (never book blockers). Expired still blocks
// unless waived by dq_file_on_paper_since. HOS / inactive / D&A still use the paper-file / full gate rules.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { audit } = vi.hoisted(() => ({ audit: vi.fn(async () => undefined) }));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: audit }));

const { assertDriverQualifiedForLoad, splitPaperFileReasons } = await import("../driver-qualification.service.js");

const cred = (over: Record<string, unknown>) => ({
  id: "drv-1", driver_name: "JOSE ANTONIO VICENTE MARTINEZ", is_deactivated: false, is_archived: false, is_status_inactive: false,
  cdl_missing: false, cdl_expired: false, cdl_expires_at: "2029-06-12", med_missing: true, med_expired: false,
  med_expiry_date: null, hazmat_blocked: false, hazmat_endorsement_expires_at: null, merged_into: null, merged_into_name: null,
  dq_file_on_paper_since: "2026-10-21 21:00:00+00", ...over,
});
const clientFor = (row: Record<string, unknown>, hos = false) => ({
  query: vi.fn(async (sql: string) => {
    if (/cdl_missing/.test(sql)) return { rows: [row] };
    if (/drivers_with_hos_status/.test(sql)) return { rows: [{ is_in_violation: hos, minutes_until_violation: null }] };
    return { rows: [] };
  }),
});
const args = { driverId: "drv-1", operatingCompanyId: "oci", isHazmat: false, actorUserId: "owner", loadNumber: "13687", via: "book_load" };

describe("443.204 / 443.257 — missing dates never block; paper file waives expired/HOS", () => {
  beforeEach(() => audit.mockClear());

  it("medical card missing alone: not a book blocker (reminder path)", async () => {
    expect(await assertDriverQualifiedForLoad(clientFor(cred({})), args)).toBeNull();
    expect(audit).not.toHaveBeenCalled();
  });

  it("CDL missing + medical missing + HOS on a paper-file driver: HOS waived, not blocked", async () => {
    const block = await assertDriverQualifiedForLoad(clientFor(cred({ cdl_missing: true, cdl_expires_at: null }), true), args);
    expect(block).toBeNull();
    expect((audit.mock.calls[0] as unknown as [unknown, string, string, { waived_reasons: string[] }])[3].waived_reasons)
      .toEqual(["hos_violation"]);
  });

  it("a recorded violation still blocks a paper-file driver", async () => {
    const block = await assertDriverQualifiedForLoad(clientFor(cred({ is_status_inactive: true })), args);
    expect(block?.reasons).toEqual(["driver_status_inactive"]);
  });

  it("a driver created after the stamp (NULL) still does not block on missing medical alone", async () => {
    const block = await assertDriverQualifiedForLoad(clientFor(cred({ dq_file_on_paper_since: null })), args);
    expect(block).toBeNull();
    expect(audit).not.toHaveBeenCalled();
  });

  it("splitPaperFileReasons never waives drug & alcohol or Clearinghouse", () => {
    expect(splitPaperFileReasons(["drug_alcohol_positive", "clearinghouse_prohibited", "cdl_expired"], "2026-10-21"))
      .toEqual({ blocking: ["drug_alcohol_positive", "clearinghouse_prohibited"], waived: ["cdl_expired"] });
  });
});
