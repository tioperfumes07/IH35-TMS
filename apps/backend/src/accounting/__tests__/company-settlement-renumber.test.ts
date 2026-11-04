/**
 * Rows 98 (R86) — a company settlement born under its driver settlement's open-tour P-number takes the driver
 * settlement's AlwaysTrack number at close (prod 11-03: header a188e47a read "P-0119" while P-0119 closed as 5854).
 */
import { describe, expect, it, vi } from "vitest";
import { closeCompanySettlementAlongsideDriverSettlement, renumberCompanySettlementToDriverNumber } from "../company-settlement-close.service.js";

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const CS = "a188e47a-e355-4bda-b0ed-e1afaa6d18c8";
const DS = "2c9ff323-e78a-406d-ad9b-ffe09e88d441";

function client(header: { header_number: string; p_number: string; real_number: string | null; voided?: boolean }, taken = false) {
  const updates: unknown[][] = [];
  const q = vi.fn().mockImplementation(async (sql: string, values?: unknown[]) => {
    if (sql.includes("AS header_number")) return { rows: [{ voided: false, ...header }] };
    if (sql.includes("AND display_id = $2 AND id <> $3::uuid")) return { rows: taken ? [{ id: "other" }] : [] };
    if (sql.includes("UPDATE accounting.company_settlements SET display_id")) { updates.push(values!); return { rows: [] }; }
    if (sql.includes("SELECT period_start::text")) return { rows: [{ period_start: "2026-10-21", period_end: "2026-10-23", status: "closed" }] };
    if (sql.includes("SELECT company_settlement_id::text FROM accounting.company_settlement_driver_settlements")) return { rows: [{ company_settlement_id: CS }] };
    if (sql.includes("SELECT status, voided_at::text")) return { rows: [{ status: "closed", voided_at: null }] };
    if (sql.includes("WITH linked_period")) return { rows: [{ id: CS, display_id: updates.length ? String(updates[0]![2]) : header.header_number, status: "closed" }] };
    throw new Error(`unexpected sql: ${sql}`);
  });
  return { query: q, updates };
}

describe("rows 98 — company settlement carries its driver settlement's number", () => {
  it("renumbers a header still carrying the tour's P-number once the driver settlement is numbered", async () => {
    const c = client({ header_number: "P-0119", p_number: "P-0119", real_number: "5854" });
    const r = await renumberCompanySettlementToDriverNumber(c as never, { operatingCompanyId: OPCO, companySettlementId: CS, driverSettlementId: DS });
    expect(r).toEqual({ renumbered: true, from: "P-0119", to: "5854" });
    expect(c.updates).toEqual([[CS, OPCO, "5854", "P-0119"]]);
  });

  it("the close path renumbers on idempotent re-entry (the case that left P-0119 behind)", async () => {
    const c = client({ header_number: "P-0119", p_number: "P-0119", real_number: "5854" });
    const r = await closeCompanySettlementAlongsideDriverSettlement(c as never, { operatingCompanyId: OPCO, driverSettlementId: DS, actorUserId: "u1" });
    expect(r.display_id).toBe("5854");
    expect(c.updates).toHaveLength(1);
  });

  it("never touches a header already on its real number, or named by any other number", async () => {
    for (const h of [
      { header_number: "5854", p_number: "P-0119", real_number: "5854" },
      { header_number: "5852", p_number: "P-0113", real_number: "5852" },
      { header_number: "5816", p_number: "P-0067", real_number: "5899" },
    ]) {
      const c = client(h);
      expect((await renumberCompanySettlementToDriverNumber(c as never, { operatingCompanyId: OPCO, companySettlementId: CS, driverSettlementId: DS })).renumbered).toBe(false);
      expect(c.updates).toHaveLength(0);
    }
  });

  it("an open tour (no real number yet) keeps its P-number", async () => {
    const c = client({ header_number: "P-0114", p_number: "P-0114", real_number: null });
    expect((await renumberCompanySettlementToDriverNumber(c as never, { operatingCompanyId: OPCO, companySettlementId: CS, driverSettlementId: DS })).renumbered).toBe(false);
  });

  it("a number held by another header is refused by name, never duplicated", async () => {
    const c = client({ header_number: "P-0119", p_number: "P-0119", real_number: "5854" }, true);
    await expect(renumberCompanySettlementToDriverNumber(c as never, { operatingCompanyId: OPCO, companySettlementId: CS, driverSettlementId: DS }))
      .rejects.toMatchObject({ code: "company_settlement_number_taken" });
    expect(c.updates).toHaveLength(0);
  });
});
