import { describe, expect, it, vi } from "vitest";
import {
  assertReadOnlySurface,
  buildDotAuditPdfPayload,
  getEditHistory,
  getRecentEditHistory,
} from "../viewer.service.js";

describe("ELD audit trail viewer", () => {
  it("returns chronological edit history for a driver and period", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: "e1",
          driver_uuid: "d1",
          driver_name: "Ada Driver",
          edited_at: "2026-05-01T10:00:00.000Z",
          edited_by: "dispatcher@ih35.com",
          reason: "Corrected off-duty gap",
          field_name: "duty_status",
          before_state: "off_duty",
          after_state: "sleeper",
        },
        {
          id: "e2",
          driver_uuid: "d1",
          driver_name: "Ada Driver",
          edited_at: "2026-05-02T08:00:00.000Z",
          edited_by: "safety@ih35.com",
          reason: "DOT prep",
          field_name: "location",
          before_state: "Laredo, TX",
          after_state: "Nuevo Laredo, MX",
        },
      ],
    });

    const result = await getEditHistory({ query }, "11111111-1111-1111-1111-111111111111", "d1", "2026-05-01", "2026-05-31");

    expect(query).toHaveBeenCalledOnce();
    expect(result.read_only).toBe(true);
    expect(result.edits).toHaveLength(2);
    expect(result.edits[0]?.field_name).toBe("duty_status");
    expect(result.edits[1]?.field_name).toBe("location");
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
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await getRecentEditHistory({ query }, "22222222-2222-2222-2222-222222222222", "d9", 10);
    expect(query).toHaveBeenCalledOnce();
    const sql = String(query.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("samsara.hos_log_edits");
    expect(sql).toContain("operating_company_id = $1::uuid");
    expect(query.mock.calls[0]?.[1]).toEqual(["22222222-2222-2222-2222-222222222222", "d9", 10]);
  });
});
