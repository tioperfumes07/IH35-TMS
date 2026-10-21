import { describe, expect, it, vi } from "vitest";

import { getLoadsReport } from "../loads-report.service.js";

/**
 * LEAD 443.206 D8 / D9 — GET /reports/loads shows real loads that happened, dated by the scheduled stop date the boards
 * read. Before: only cancelled was excluded (draft / voided / sample rows reported) and the default date was
 * l.created_at, with created_at / updated_at fallbacks. FAILS on main (no scope exclusions, no scope label, created_at).
 */

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";

function captureClient() {
  const sql: string[] = [];
  const client = { query: vi.fn(async (q: string) => { sql.push(q); return { rows: [] }; }) };
  return { client, sql };
}

describe("LEAD 443.206 — the loads report scope and date", () => {
  it("excludes draft, cancelled, voided, deleted and sample loads and states its scope", async () => {
    const { client, sql } = captureClient();
    const out = await getLoadsReport(client as never, { operatingCompanyId: OPCO, from: "2026-10-01", to: "2026-10-31", dateField: "pickup" });
    const where = sql[0]!.slice(sql[0]!.indexOf("WHERE l.operating_company_id = $1::uuid"), sql[0]!.indexOf("ORDER BY l.load_number"));
    for (const needle of ["l.soft_deleted_at IS NULL", "l.voided_at IS NULL", "l.is_sample_data IS NOT TRUE", "'draft'", "'cancelled'", "'voided'"])
      expect(where).toContain(needle);
    expect(out).toMatchObject({ scope: "real_loads_that_happened", date_field: "pickup" });
    expect((out as { scope_label?: string }).scope_label).toMatch(/excludes draft, cancelled, voided, deleted and sample/);
  });

  it("dates by the scheduled stop (the boards' field), never created_at / updated_at — 'created' is read as pickup", async () => {
    for (const dateField of ["created", "pickup", "delivery"] as const) {
      const { client, sql } = captureClient();
      const out = await getLoadsReport(client as never, { operatingCompanyId: OPCO, from: "2026-10-01", to: "2026-10-31", dateField });
      const where = sql[0]!.slice(sql[0]!.indexOf("WHERE l.operating_company_id = $1::uuid"), sql[0]!.indexOf("ORDER BY l.load_number"));
      expect(where).toContain("COALESCE(ls.scheduled_arrival_at, ls.appointment_start_at)");
      expect(where).not.toMatch(/l\.created_at|l\.updated_at|ls\.created_at/);
      expect(out.date_field).toBe(dateField === "delivery" ? "delivery" : "pickup");
    }
  });
});
