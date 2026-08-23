import { describe, expect, it, vi } from "vitest";
import {
  assertReadOnlySurface,
  buildDotAuditPdfPayload,
  getEditHistory,
  getRecentEditHistory,
} from "../viewer.service.js";

describe("ELD audit trail viewer", () => {
  const sourceRow = {
    samsara_driver_id: "sam-77",
    driver_name: "Ada Driver",
    encrypted_api_token: null,
    api_token_encrypted: null,
    samsara_org_id: "org-1",
    is_enabled: true,
  };

  it("returns chronological edit history for a driver and period", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [sourceRow] });
    const fetchLogEdits = vi.fn().mockResolvedValue([
      { id: "e2", editedAt: "2026-05-02T08:00:00.000Z", editedBy: "safety@ih35.com", reason: "DOT prep", fieldName: "location", beforeState: "Laredo, TX", afterState: "Nuevo Laredo, MX" },
      { id: "e1", editTimeMs: 1777629600000, editorName: "dispatcher@ih35.com", remark: "Corrected off-duty gap", editType: "duty_status", oldValue: "off_duty", newValue: "sleeper" },
    ]);

    const result = await getEditHistory({ query }, "11111111-1111-1111-1111-111111111111", "d1", "2026-05-01", "2026-05-31", fetchLogEdits);

    expect(query).toHaveBeenCalledOnce();
    expect(result.read_only).toBe(true);
    expect(result.edits).toHaveLength(2);
    expect(result.edits[0]?.field_name).toBe("duty_status");
    expect(result.edits[1]?.field_name).toBe("location");
    expect(fetchLogEdits).toHaveBeenCalledWith("sam-77", expect.objectContaining({ start: expect.stringContaining("2026-05-01"), end: expect.stringContaining("2026-05-31") }));
  });

  it("returns an honest empty history only after the configured source returns no edits", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [sourceRow] });

    const result = await getEditHistory({ query }, "11111111-1111-1111-1111-111111111111", "d1", "2026-05-01", "2026-05-31", vi.fn().mockResolvedValue([]));

    expect(query).toHaveBeenCalledOnce();
    expect(result.read_only).toBe(true);
    expect(result.edits).toEqual([]);
    expect(result.driver_uuid).toBe("d1");
  });

  it("fails honestly when the company driver has no configured Samsara source", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [] });
    await expect(getEditHistory({ query }, "11111111-1111-1111-1111-111111111111", "d1", "2026-05-01", "2026-05-31", vi.fn())).rejects.toThrow("eld_audit_source_not_configured");
  });

  it("returns empty recent history when the configured source has no edits", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [sourceRow] });
    const result = await getRecentEditHistory({ query }, "22222222-2222-2222-2222-222222222222", "d9", 10, vi.fn().mockResolvedValue([]));
    expect(query).toHaveBeenCalledOnce();
    expect(result.edits).toEqual([]);
  });

  it("builds DOT-compliant PDF payload from history", () => {
    const payload = buildDotAuditPdfPayload({
      driver_uuid: "d1",
      driver_name: "Ada Driver",
      from: "2026-05-01",
      to: "2026-05-31",
      read_only: true,
      edits: [
        {
          id: "e1",
          edited_at: "2026-05-01T10:00:00.000Z",
          edited_by: "dispatcher@ih35.com",
          reason: "Corrected off-duty gap",
          field_name: "duty_status",
          before_state: "off_duty",
          after_state: "sleeper",
        },
      ],
    });

    expect(payload.title).toContain("FMCSA");
    expect(payload.fmcsa_notice).toContain("read-only");
    expect(payload.edits).toHaveLength(1);
    expect(payload.period.from).toBe("2026-05-01");
  });

  it("enforces read-only surface (GET only)", () => {
    expect(() => assertReadOnlySurface("GET")).not.toThrow();
    expect(() => assertReadOnlySurface("POST")).toThrow(/read-only/i);
    expect(() => assertReadOnlySurface("PUT")).toThrow(/read-only/i);
    expect(() => assertReadOnlySurface("DELETE")).toThrow(/read-only/i);
  });

  it("scopes recent history query with tenant company id", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [sourceRow] });
    await getRecentEditHistory({ query }, "22222222-2222-2222-2222-222222222222", "d9", 10, vi.fn().mockResolvedValue([]));
    expect(query).toHaveBeenCalledOnce();
    const sql = String(query.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("integrations.samsara_drivers");
    expect(sql).toContain("integrations.samsara_config");
    expect(sql).toContain("sd.operating_company_id = $1::uuid");
    expect(sql).toContain("sc.operating_company_id = $1::uuid");
    expect(sql).toContain("sd.local_driver_id = d.id");
    expect(sql).toContain("driver_company_authorizations eld_audit_driver_dca");
    expect(sql).toContain("eld_audit_driver_dca.driver_id = d.id");
    expect(sql).toContain("eld_audit_driver_dca.company_id = $1::uuid");
    expect(sql).toContain("eld_audit_driver_dca.is_authorized = true");
    expect(sql).toContain("eld_audit_driver_dca.deactivated_at IS NULL");
    expect(sql).not.toContain("sd.operating_company_id = d.operating_company_id");
    expect(sql).not.toContain("sc.operating_company_id = d.operating_company_id");
    expect(sql).toContain("NULLIF(BTRIM(CONCAT_WS(' ', d.first_name, d.last_name)), '') AS driver_name");
    expect(sql).not.toContain("d.display_name");
    expect(query.mock.calls[0]?.[1]).toEqual(["22222222-2222-2222-2222-222222222222", "d9"]);
  });
});
