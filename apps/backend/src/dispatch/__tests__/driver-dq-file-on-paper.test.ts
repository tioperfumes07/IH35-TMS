// LEAD 443.204 (owner 2026-10-21 15:27 CT: "for the current drivers, it cannot block, we do have the files in person").
// Measured 10-21: Book Load 13687 refused 422 E_DRIVER_NOT_QUALIFIED medical_card_missing (JOSE ANTONIO VICENTE MARTINEZ);
// none of the 7 drivers on 13687–13695 has a medical card in the app. A driver stamped dq_file_on_paper_since (migration
// 202616040700, every driver existing then) is recorded, never blocked, on the paperwork reasons; a recorded violation
// still blocks; a driver created after the stamp (NULL) keeps the full gate.
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

describe("443.204 — a current driver's paper DQ file never blocks", () => {
  beforeEach(() => audit.mockClear());

  it("medical card missing on a paper-file driver: not blocked, recorded", async () => {
    expect(await assertDriverQualifiedForLoad(clientFor(cred({})), args)).toBeNull();
    expect(audit).toHaveBeenCalledTimes(1);
    const [, actor, event, payload] = audit.mock.calls[0] as unknown as [unknown, string, string, Record<string, unknown>];
    expect(actor).toBe("owner");
    expect(event).toBe("dispatch.driver_dq_file_on_paper");
    expect(payload).toMatchObject({ waived_reasons: ["medical_card_missing"], load_number: "13687", note: "DQ file held on paper (owner 10-21)" });
  });

  it("CDL missing + medical missing + HOS violation on a paper-file driver: not blocked", async () => {
    const block = await assertDriverQualifiedForLoad(clientFor(cred({ cdl_missing: true, cdl_expires_at: null }), true), args);
    expect(block).toBeNull();
    expect((audit.mock.calls[0] as unknown as [unknown, string, string, { waived_reasons: string[] }])[3].waived_reasons)
      .toEqual(["cdl_missing", "medical_card_missing", "hos_violation"]);
  });

  it("a recorded violation still blocks a paper-file driver", async () => {
    const block = await assertDriverQualifiedForLoad(clientFor(cred({ is_status_inactive: true })), args);
    expect(block?.reasons).toEqual(["driver_status_inactive"]);
  });

  it("a driver created after the stamp (NULL) keeps the full gate", async () => {
    const block = await assertDriverQualifiedForLoad(clientFor(cred({ dq_file_on_paper_since: null })), args);
    expect(block?.reasons).toEqual(["medical_card_missing"]);
    expect(audit).not.toHaveBeenCalled();
  });

  it("splitPaperFileReasons never waives drug & alcohol or Clearinghouse", () => {
    expect(splitPaperFileReasons(["drug_alcohol_positive", "clearinghouse_prohibited", "cdl_expired"], "2026-10-21"))
      .toEqual({ blocking: ["drug_alcohol_positive", "clearinghouse_prohibited"], waived: ["cdl_expired"] });
  });
});
