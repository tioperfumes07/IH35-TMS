/**
 * Unit tests for 0280-02 revenue↔GL linkage (mocked DbClient — no silent swallow / fabricated zeros).
 * Planted cases: cancelled stop SQL, draft exclusion, wrong_account single count, tax pretax,
 * pending batch → missing_je, TSL-only unlinked filter, unverifiable, no swallow.
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
      throw new Error(`unexpected SQL:\n${sql.slice(0, 240)}`);
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
            batches_ok: true,
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
          { column_name: "posting_batch_id" },
        ],
      };
    }
    return null;
  };
}

/** Capture invoice / link / unlinked SQL for planted regression assertions. */
function capturingClient() {
  const sqls: string[] = [];
  const valuesLog: unknown[][] = [];
  const client = mockClient([
    probeOk(),
    (sql, values) => {
      sqls.push(sql);
      if (values) valuesLog.push(values);
      if (sql.includes("WITH invoice_ids")) return { rows: [] };
      if (sql.includes("transaction_source_links tsl") && sql.includes("NOT EXISTS")) return { rows: [] };
      if (sql.includes("GROUP BY je.entry_date")) return { rows: [] };
      if (sql.includes("FROM accounting.invoices i") && sql.includes("recognition_date")) return { rows: [] };
      return null;
    },
  ]);
  return { client, sqls, valuesLog };
}

describe("revenue-gl-linkage.service helpers", () => {
  it("today/weekly windows use company timezone calendar dates", () => {
    const lateUtc = new Date("2026-07-19T02:00:00.000Z");
    const today = todayRevenueWindow(lateUtc);
    expect(today.fromDate).toBe(today.toDate);
    expect(today.toDate).toBe("2026-07-18");

    const week = weeklyRevenueWindow(7, lateUtc);
    expect(week.toDate).toBe("2026-07-18");
    expect(week.fromDate).toBe(__test__.addDaysIso("2026-07-18", -7));
    expect(__test__.INVOICE_BASIS_ELIGIBLE_STATUSES).toEqual(["sent", "partial", "paid", "factored"]);
    expect(__test__.POSTED_BATCH_STATUSES).toEqual(["posted", "reversed"]);
    expect(COMPANY_TIME_ZONE).toBe("America/Chicago");
  });

  it("unverifiable result never fabricates a numeric revenue_cents=0 success", () => {
    const u = __test__.unverifiableResult("2026-07-01", "2026-07-01", "missing_table:x");
    expect(u.status).toBe("unverifiable");
    expect(u.revenue_cents).toBeNull();
    expect(u.unverifiable_reason).toBe("missing_table:x");
  });

  it("pretax helper is total − tax (floored at 0)", () => {
    expect(__test__.pretaxCents(11000, 1000)).toBe(10000);
    expect(__test__.pretaxCents(500, 900)).toBe(0);
  });
});

describe("computeRevenueGlLinkage SQL contracts (planted)", () => {
  const OC = "00000000-0000-4000-8000-000000000001";

  it("every delivery-stop recognition query excludes status='cancelled'", async () => {
    const { client, sqls } = capturingClient();
    await computeRevenueGlLinkage(client, { operatingCompanyId: OC, fromDate: "2026-07-18", toDate: "2026-07-18" });
    const deliverySql = sqls.filter((s) => s.includes("load_stops"));
    expect(deliverySql.length).toBeGreaterThan(0);
    for (const s of deliverySql) {
      expect(s).toMatch(/ls\.status\s*<>\s*'cancelled'/);
    }
  });

  it("invoice basis filters to sent/partial/paid/factored (excludes draft/void)", async () => {
    const { client, valuesLog, sqls } = capturingClient();
    await computeRevenueGlLinkage(client, { operatingCompanyId: OC, fromDate: "2026-07-18", toDate: "2026-07-18" });
    const invoiceSql = sqls.find((s) => s.includes("FROM accounting.invoices i") && s.includes("recognition_date"));
    expect(invoiceSql).toBeTruthy();
    expect(invoiceSql).toMatch(/i\.status\s*=\s*ANY\(/);
    expect(invoiceSql).not.toMatch(/status\s*<>\s*'void'/); // superseded by eligible ANY
    const eligibleBound = valuesLog.some(
      (v) => Array.isArray(v) && v.some((x) => Array.isArray(x) && x.includes("sent") && x.includes("factored") && !x.includes("draft"))
    );
    expect(eligibleBound).toBe(true);
  });

  it("per-invoice + day GL require posted|reversed batch (pending excluded)", async () => {
    const { client, sqls } = capturingClient();
    await computeRevenueGlLinkage(client, { operatingCompanyId: OC, fromDate: "2026-07-18", toDate: "2026-07-18" });
    const glDay = sqls.find((s) => s.includes("GROUP BY je.entry_date"));
    const link = sqls.find((s) => s.includes("WITH invoice_ids"));
    expect(glDay).toMatch(/batch_status\s*=\s*ANY/);
    expect(link).toMatch(/batch_status\s*=\s*ANY/);
  });

  it("unlinked-GL detection unifies direct source cols + TSL (no false unlinked)", async () => {
    const { client, sqls } = capturingClient();
    await computeRevenueGlLinkage(client, { operatingCompanyId: OC, fromDate: "2026-07-18", toDate: "2026-07-18" });
    const unlinked = sqls.find((s) => s.includes("NOT EXISTS") && s.includes("transaction_source_links"));
    expect(unlinked).toBeTruthy();
    expect(unlinked).toContain("source_transaction_type = 'invoice'");
    expect(unlinked).toContain("transaction_source_links tsl");
    expect(unlinked).toContain("linked_object_type = 'invoice'");
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
                batches_ok: true,
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
        if (sql.includes("NOT EXISTS") && sql.includes("transaction_source_links")) return { rows: [] };
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
    expect(result.discrepancy_count).toBe(0);
  });

  it("matched invoice + GL → ok, zero discrepancy (pre-tax)", async () => {
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
        if (sql.includes("NOT EXISTS") && sql.includes("transaction_source_links")) return { rows: [] };
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
                pretax_revenue_cents: 10000,
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
    expect(result.discrepancy_count).toBe(0);
  });

  it("taxed invoice matches on pre-tax (total − tax) not gross total", async () => {
    const invId = "11111111-1111-4111-8111-111111111116";
    const jeId = "22222222-2222-4222-8222-222222222226";
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
        if (sql.includes("NOT EXISTS") && sql.includes("transaction_source_links")) return { rows: [] };
        if (sql.includes("GROUP BY je.entry_date")) {
          return { rows: [{ d: "2026-07-18", cents: 10000 }] };
        }
        if (sql.includes("FROM accounting.invoices i") && sql.includes("recognition_date")) {
          return {
            rows: [
              {
                invoice_id: invId,
                display_id: "INV-2026-TAX",
                recognition_date: "2026-07-18",
                total_cents: 11000,
                tax_cents: 1000,
                pretax_revenue_cents: 10000,
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
    expect(result.invoice_basis_cents).toBe(10000);
    expect(result.revenue_cents).toBe(10000);
    expect(result.discrepancy_count).toBe(0);
    expect(result.days.find((d) => d.date === "2026-07-18")?.invoice_basis_cents).toBe(10000);
  });

  it("missing JE → discrepancy missing_je with invoice drill href", async () => {
    const invId = "11111111-1111-4111-8111-111111111112";
    const client = mockClient([
      probeOk(),
      (sql) => {
        if (sql.includes("WITH invoice_ids")) return { rows: [] };
        if (sql.includes("NOT EXISTS") && sql.includes("transaction_source_links")) return { rows: [] };
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
                pretax_revenue_cents: 5000,
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
    expect(result.drill.mismatched_invoices[0]?.href).toBe(`/accounting/invoices/${invId}`);
    expect(result.discrepancy_cents).toBe(5000);
  });

  it("pending-only batch (no posted links returned) → missing_je, not matched", async () => {
    // Service filters pending at SQL; mock returns empty links as the DB would.
    const invId = "11111111-1111-4111-8111-111111111117";
    const client = mockClient([
      probeOk(),
      (sql) => {
        if (sql.includes("WITH invoice_ids")) return { rows: [] };
        if (sql.includes("NOT EXISTS") && sql.includes("transaction_source_links")) return { rows: [] };
        if (sql.includes("GROUP BY je.entry_date")) return { rows: [] };
        if (sql.includes("FROM accounting.invoices i") && sql.includes("recognition_date")) {
          return {
            rows: [
              {
                invoice_id: invId,
                display_id: "INV-2026-PEND",
                recognition_date: "2026-07-18",
                total_cents: 6000,
                tax_cents: 0,
                pretax_revenue_cents: 6000,
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
    expect(result.drill.mismatched_invoices[0]?.reason).toBe("missing_je");
    expect(result.discrepancy_cents).toBe(6000);
  });

  it("wrong_account counts invoice pretax once (no double-count)", async () => {
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
        if (sql.includes("NOT EXISTS") && sql.includes("transaction_source_links")) return { rows: [] };
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
                pretax_revenue_cents: 8000,
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
    expect(result.discrepancy_cents).toBe(8000); // NOT 16000
    expect(result.discrepancy_count).toBe(1);
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
        if (sql.includes("NOT EXISTS") && sql.includes("transaction_source_links")) return { rows: [] };
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
                pretax_revenue_cents: 7000,
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
        if (sql.includes("NOT EXISTS") && sql.includes("transaction_source_links")) return { rows: [] };
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
                pretax_revenue_cents: 10000,
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
