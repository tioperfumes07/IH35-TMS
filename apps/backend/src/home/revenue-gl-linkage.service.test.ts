/**
 * Unit tests for 0280-02 revenue↔GL linkage (mocked DbClient — no silent swallow / fabricated zeros).
 */
import { describe, expect, it, vi } from "vitest";
import {
  computeRevenueGlLinkage,
  todayRevenueWindow,
  weeklyRevenueWindow,
  __test__,
  type DbClient,
} from "./revenue-gl-linkage.service.js";
import { COMPANY_TIME_ZONE } from "../lib/company-business-date.js";

function mockClient(handlers: Array<(sql: string, values?: unknown[]) => { rows: unknown[] } | null>): DbClient {
  return {
    query: vi.fn(async (sql: string, values?: unknown[]) => {
      for (const h of handlers) {
        const hit = h(sql, values);
        if (hit) return hit as { rows: Record<string, unknown>[] };
      }
      throw new Error(`unexpected SQL:\n${sql.slice(0, 200)}`);
    }),
  };
}

function probeOk() {
  return (sql: string) => {
    if (sql.includes("to_regclass('accounting.invoices')")) {
      return {
        rows: [
          {
            invoices_ok: true,
            je_ok: true,
            jep_ok: true,
            tsl_ok: true,
            accounts_ok: true,
            load_stops_ok: true,
          },
        ],
      };
    }
    if (sql.includes("information_schema.columns") && sql.includes("journal_entry_postings")) {
      return {
        rows: [
          { column_name: "source_transaction_type" },
          { column_name: "source_transaction_id" },
          { column_name: "journal_entry_uuid" },
          { column_name: "debit_or_credit" },
          { column_name: "amount_cents" },
          { column_name: "account_id" },
        ],
      };
    }
    return null;
  };
}

describe("revenue-gl-linkage.service helpers", () => {
  it("today/weekly windows use company timezone calendar dates", () => {
    // 2026-07-19 02:00 UTC = still 2026-07-18 evening Central — must NOT use UTC date.
    const lateUtc = new Date("2026-07-19T02:00:00.000Z");
    const today = todayRevenueWindow(lateUtc);
    expect(today.fromDate).toBe(today.toDate);
    expect(today.toDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // America/Chicago at 02:00 UTC on 19th is still 18th CDT.
    expect(today.toDate).toBe("2026-07-18");

    const week = weeklyRevenueWindow(7, lateUtc);
    expect(week.toDate).toBe("2026-07-18");
    expect(week.fromDate).toBe(__test__.addDaysIso("2026-07-18", -7));
    expect(__test__.INVOICE_BASIS_META.label).toBe("invoice_basis");
    expect(__test__.GL_BASIS_META.label).toBe("gl_posted");
    expect(COMPANY_TIME_ZONE).toBe("America/Chicago");
  });

  it("unverifiable result never fabricates a numeric revenue_cents=0 success", () => {
    const u = __test__.unverifiableResult("2026-07-01", "2026-07-01", "missing_table:x");
    expect(u.status).toBe("unverifiable");
    expect(u.revenue_cents).toBeNull();
    expect(u.unverifiable_reason).toBe("missing_table:x");
  });
});

describe("computeRevenueGlLinkage (mocked)", () => {
  const OC = "00000000-0000-4000-8000-000000000001";

  it("returns unverifiable when transaction_source_links table is missing (no fabricated zero)", async () => {
    const client = mockClient([
      (sql) => {
        if (sql.includes("to_regclass('accounting.invoices')")) {
          return {
            rows: [
              {
                invoices_ok: true,
                je_ok: true,
                jep_ok: true,
                tsl_ok: false,
                accounts_ok: true,
                load_stops_ok: true,
              },
            ],
          };
        }
        return null;
      },
    ]);
    const result = await computeRevenueGlLinkage(client, {
      operatingCompanyId: OC,
      fromDate: "2026-07-18",
      toDate: "2026-07-18",
    });
    expect(result.status).toBe("unverifiable");
    expect(result.revenue_cents).toBeNull();
    expect(result.unverifiable_reason).toContain("transaction_source_links");
  });

  it("returns empty for empty datasets (honest zeros)", async () => {
    const client = mockClient([
      probeOk(),
      (sql) => {
        if (sql.includes("WITH invoice_ids")) return { rows: [] };
        if (sql.includes("source_transaction_type IS DISTINCT FROM")) return { rows: [] };
        if (sql.includes("GROUP BY je.entry_date")) return { rows: [] };
        if (sql.includes("FROM accounting.invoices i") && sql.includes("recognition_date")) return { rows: [] };
        return null;
      },
    ]);
    const result = await computeRevenueGlLinkage(client, {
      operatingCompanyId: OC,
      fromDate: "2026-07-18",
      toDate: "2026-07-18",
    });
    expect(result.status).toBe("empty");
    expect(result.revenue_cents).toBe(0);
    expect(result.invoice_basis_cents).toBe(0);
    expect(result.gl_posted_revenue_cents).toBe(0);
    expect(result.discrepancy_count).toBe(0);
    expect(result.basis.invoice.label).toBe("invoice_basis");
  });

  it("matched invoice + GL → ok, zero discrepancy, drill empty", async () => {
    const invId = "11111111-1111-4111-8111-111111111111";
    const jeId = "22222222-2222-4222-8222-222222222222";
    const client = mockClient([
      probeOk(),
      (sql) => {
        if (sql.includes("WITH invoice_ids")) {
          return {
            rows: [
              {
                invoice_id: invId,
                journal_entry_id: jeId,
                entry_date: "2026-07-18",
                je_status: "posted",
                gl_revenue_cents: 10000,
                non_revenue_credit_cents: 0,
                account_ids: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
              },
            ],
          };
        }
        if (sql.includes("source_transaction_type IS DISTINCT FROM")) return { rows: [] };
        if (sql.includes("GROUP BY je.entry_date")) {
          return { rows: [{ d: "2026-07-18", cents: 10000 }] };
        }
        if (sql.includes("FROM accounting.invoices i") && sql.includes("recognition_date")) {
          return {
            rows: [
              {
                invoice_id: invId,
                display_id: "INV-2026-10001",
                recognition_date: "2026-07-18",
                total_cents: 10000,
                tax_cents: 0,
                status: "sent",
              },
            ],
          };
        }
        return null;
      },
    ]);
    const result = await computeRevenueGlLinkage(client, {
      operatingCompanyId: OC,
      fromDate: "2026-07-18",
      toDate: "2026-07-18",
    });
    expect(result.status).toBe("ok");
    expect(result.invoice_basis_cents).toBe(10000);
    expect(result.gl_posted_revenue_cents).toBe(10000);
    expect(result.revenue_cents).toBe(10000);
    expect(result.discrepancy_count).toBe(0);
    expect(result.drill.mismatched_invoices).toHaveLength(0);
  });

  it("missing JE → discrepancy missing_je with invoice drill href", async () => {
    const invId = "11111111-1111-4111-8111-111111111112";
    const client = mockClient([
      probeOk(),
      (sql) => {
        if (sql.includes("WITH invoice_ids")) return { rows: [] };
        if (sql.includes("source_transaction_type IS DISTINCT FROM")) return { rows: [] };
        if (sql.includes("GROUP BY je.entry_date")) return { rows: [] };
        if (sql.includes("FROM accounting.invoices i") && sql.includes("recognition_date")) {
          return {
            rows: [
              {
                invoice_id: invId,
                display_id: "INV-2026-10002",
                recognition_date: "2026-07-18",
                total_cents: 5000,
                tax_cents: 0,
                status: "sent",
              },
            ],
          };
        }
        return null;
      },
    ]);
    const result = await computeRevenueGlLinkage(client, {
      operatingCompanyId: OC,
      fromDate: "2026-07-18",
      toDate: "2026-07-18",
    });
    expect(result.discrepancy_count).toBe(1);
    expect(result.drill.mismatched_invoices[0]?.reason).toBe("missing_je");
    expect(result.drill.mismatched_invoices[0]?.href).toContain(invId);
    expect(result.discrepancy_cents).toBe(5000);
  });

  it("wrong account credit → discrepancy wrong_account", async () => {
    const invId = "11111111-1111-4111-8111-111111111113";
    const jeId = "22222222-2222-4222-8222-222222222223";
    const client = mockClient([
      probeOk(),
      (sql) => {
        if (sql.includes("WITH invoice_ids")) {
          return {
            rows: [
              {
                invoice_id: invId,
                journal_entry_id: jeId,
                entry_date: "2026-07-18",
                je_status: "posted",
                gl_revenue_cents: 0,
                non_revenue_credit_cents: 8000,
                account_ids: null,
              },
            ],
          };
        }
        if (sql.includes("source_transaction_type IS DISTINCT FROM")) return { rows: [] };
        if (sql.includes("GROUP BY je.entry_date")) return { rows: [] };
        if (sql.includes("FROM accounting.invoices i") && sql.includes("recognition_date")) {
          return {
            rows: [
              {
                invoice_id: invId,
                display_id: "INV-2026-10003",
                recognition_date: "2026-07-18",
                total_cents: 8000,
                tax_cents: 0,
                status: "sent",
              },
            ],
          };
        }
        return null;
      },
    ]);
    const result = await computeRevenueGlLinkage(client, {
      operatingCompanyId: OC,
      fromDate: "2026-07-18",
      toDate: "2026-07-18",
    });
    expect(result.drill.mismatched_invoices[0]?.reason).toBe("wrong_account");
    expect(result.drill.mismatched_journal_entries.some((d) => d.reason === "wrong_account")).toBe(true);
  });

  it("voided JE only → discrepancy voided_je", async () => {
    const invId = "11111111-1111-4111-8111-111111111114";
    const jeId = "22222222-2222-4222-8222-222222222224";
    const client = mockClient([
      probeOk(),
      (sql) => {
        if (sql.includes("WITH invoice_ids")) {
          return {
            rows: [
              {
                invoice_id: invId,
                journal_entry_id: jeId,
                entry_date: "2026-07-18",
                je_status: "voided",
                gl_revenue_cents: 7000,
                non_revenue_credit_cents: 0,
                account_ids: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
              },
            ],
          };
        }
        if (sql.includes("source_transaction_type IS DISTINCT FROM")) return { rows: [] };
        if (sql.includes("GROUP BY je.entry_date")) return { rows: [] };
        if (sql.includes("FROM accounting.invoices i") && sql.includes("recognition_date")) {
          return {
            rows: [
              {
                invoice_id: invId,
                display_id: "INV-2026-10004",
                recognition_date: "2026-07-18",
                total_cents: 7000,
                tax_cents: 0,
                status: "sent",
              },
            ],
          };
        }
        return null;
      },
    ]);
    const result = await computeRevenueGlLinkage(client, {
      operatingCompanyId: OC,
      fromDate: "2026-07-18",
      toDate: "2026-07-18",
    });
    expect(result.drill.mismatched_invoices[0]?.reason).toBe("voided_je");
  });

  it("amount mismatch → discrepancy amount_mismatch", async () => {
    const invId = "11111111-1111-4111-8111-111111111115";
    const jeId = "22222222-2222-4222-8222-222222222225";
    const client = mockClient([
      probeOk(),
      (sql) => {
        if (sql.includes("WITH invoice_ids")) {
          return {
            rows: [
              {
                invoice_id: invId,
                journal_entry_id: jeId,
                entry_date: "2026-07-18",
                je_status: "posted",
                gl_revenue_cents: 9000,
                non_revenue_credit_cents: 0,
                account_ids: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
              },
            ],
          };
        }
        if (sql.includes("source_transaction_type IS DISTINCT FROM")) return { rows: [] };
        if (sql.includes("GROUP BY je.entry_date")) {
          return { rows: [{ d: "2026-07-18", cents: 9000 }] };
        }
        if (sql.includes("FROM accounting.invoices i") && sql.includes("recognition_date")) {
          return {
            rows: [
              {
                invoice_id: invId,
                display_id: "INV-2026-10005",
                recognition_date: "2026-07-18",
                total_cents: 10000,
                tax_cents: 0,
                status: "sent",
              },
            ],
          };
        }
        return null;
      },
    ]);
    const result = await computeRevenueGlLinkage(client, {
      operatingCompanyId: OC,
      fromDate: "2026-07-18",
      toDate: "2026-07-18",
    });
    expect(result.drill.mismatched_invoices[0]?.reason).toBe("amount_mismatch");
    expect(result.discrepancy_cents).toBe(1000);
  });

  it("does not swallow query errors (propagates)", async () => {
    const client: DbClient = {
      query: vi.fn(async () => {
        throw new Error("connection_reset");
      }),
    };
    await expect(
      computeRevenueGlLinkage(client, {
        operatingCompanyId: OC,
        fromDate: "2026-07-18",
        toDate: "2026-07-18",
      })
    ).rejects.toThrow("connection_reset");
  });
});
