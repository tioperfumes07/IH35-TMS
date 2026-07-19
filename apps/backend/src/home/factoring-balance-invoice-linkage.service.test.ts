/**
 * 0280-05 unit tests — Factoring Balance invoice-grain read model.
 * Mocked DbClient only (no Postgres). DB behavioral coverage lives in
 * __tests__/factoring-balance-invoice-linkage.db.test.ts.
 */
import { describe, expect, it, vi } from "vitest";
import {
  computeFactoringBalanceInvoiceLinkage,
  computeOutstandingLiabilityCents,
  wouldFanoutMultiply,
  __test__,
} from "./factoring-balance-invoice-linkage.service.js";

type Row = Record<string, unknown>;

function mockClient(handlers: Array<(sql: string, values?: unknown[]) => { rows: Row[] } | null>) {
  return {
    query: vi.fn(async (sql: string, values?: unknown[]) => {
      for (const h of handlers) {
        const hit = h(sql, values);
        if (hit) return hit;
      }
      throw new Error(`unexpected SQL: ${sql.slice(0, 120)}`);
    }),
  };
}

function probeOk() {
  return (sql: string) => {
    if (sql.includes("to_regclass('accounting.factoring_advances')")) {
      return { rows: [{ advances_ok: true, invoices_ok: true, view_ok: true }] };
    }
    if (sql.includes("table_name = 'factoring_advances'")) {
      return {
        rows: [
          "id",
          "operating_company_id",
          "status",
          "invoice_total_cents",
          "reserve_amount_cents",
          "release_amount_cents",
          "advanced_at",
        ].map((column_name) => ({ column_name })),
      };
    }
    if (sql.includes("table_name = 'invoices'")) {
      return {
        rows: ["id", "operating_company_id", "factoring_advance_id", "voided_at"].map((column_name) => ({
          column_name,
        })),
      };
    }
    return null;
  };
}

describe("0280-05 factoring-balance-invoice-linkage (unit)", () => {
  it("formula: funded − settled − recourse = outstanding liability (never negative)", () => {
    expect(
      computeOutstandingLiabilityCents({
        funded_cents: 1_000_000,
        settled_cents: 400_000,
        recourse_buyback_cents: 100_000,
      })
    ).toBe(500_000);
    expect(
      computeOutstandingLiabilityCents({
        funded_cents: 100,
        settled_cents: 80,
        recourse_buyback_cents: 50,
      })
    ).toBe(0);
  });

  it("fanout ban: joining invoices before summing advance money multiplies", () => {
    // One $10k advance linked to 3 invoices must NOT become $30k.
    expect(wouldFanoutMultiply(1_000_000, 3)).toBe(3_000_000);
    expect(wouldFanoutMultiply(1_000_000, 1)).toBe(1_000_000);
  });

  it("ok: returns integer cents liability + separate reserve + invoice_count", async () => {
    const client = mockClient([
      probeOk(),
      (sql) => {
        if (sql.includes("FROM views.factoring_balance_invoice_linkage")) {
          return {
            rows: [
              {
                outstanding_liability_cents: 750_000,
                reserve_receivable_cents: 15_000,
                funded_cents: 1_000_000,
                settled_cents: 250_000,
                recourse_buyback_cents: 0,
                invoice_count: 2,
                funded_advance_count: 2,
              },
            ],
          };
        }
        return null;
      },
    ]);

    const result = await computeFactoringBalanceInvoiceLinkage(client, {
      operatingCompanyId: "11111111-1111-1111-1111-111111111111",
    });
    expect(result.status).toBe("ok");
    expect(result.outstanding_liability_cents).toBe(750_000);
    expect(result.reserve_receivable_cents).toBe(15_000);
    expect(result.invoice_count).toBe(2);
    expect(result.meta.never_net_reserve_into_liability).toBe(true);
    expect(result.meta.ar_remains_on_books).toBe(true);
    // Reserve must not be folded into liability.
    expect(result.outstanding_liability_cents).not.toBe(
      (result.outstanding_liability_cents ?? 0) + (result.reserve_receivable_cents ?? 0)
    );
  });

  it("empty: legitimate zero when no funded advances", async () => {
    const client = mockClient([
      probeOk(),
      (sql) => {
        if (sql.includes("FROM views.factoring_balance_invoice_linkage")) {
          return { rows: [] };
        }
        return null;
      },
    ]);
    const result = await computeFactoringBalanceInvoiceLinkage(client, {
      operatingCompanyId: "11111111-1111-1111-1111-111111111111",
    });
    expect(result.status).toBe("empty");
    expect(result.outstanding_liability_cents).toBe(0);
    expect(result.reserve_receivable_cents).toBe(0);
    expect(result.invoice_count).toBe(0);
    expect(result.unverifiable_reason).toBeNull();
  });

  it("unverifiable: missing view — never fabricate zero cents as ok", async () => {
    const client = mockClient([
      (sql) => {
        if (sql.includes("to_regclass")) {
          return { rows: [{ advances_ok: true, invoices_ok: true, view_ok: false }] };
        }
        return null;
      },
    ]);
    const result = await computeFactoringBalanceInvoiceLinkage(client, {
      operatingCompanyId: "11111111-1111-1111-1111-111111111111",
    });
    expect(result.status).toBe("unverifiable");
    expect(result.unverifiable_reason).toContain("missing_view");
    expect(result.outstanding_liability_cents).toBeNull();
    expect(result.reserve_receivable_cents).toBeNull();
    expect(result.invoice_count).toBeNull();
  });

  it("planted query failure: connection_reset must throw (routes surface 500, no silent $0)", async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("to_regclass")) {
          return { rows: [{ advances_ok: true, invoices_ok: true, view_ok: true }] };
        }
        if (sql.includes("table_name = 'factoring_advances'")) {
          return {
            rows: [
              "id",
              "operating_company_id",
              "status",
              "invoice_total_cents",
              "reserve_amount_cents",
              "release_amount_cents",
              "advanced_at",
            ].map((column_name) => ({ column_name })),
          };
        }
        if (sql.includes("table_name = 'invoices'")) {
          return {
            rows: ["id", "operating_company_id", "factoring_advance_id", "voided_at"].map((column_name) => ({
              column_name,
            })),
          };
        }
        if (sql.includes("FROM views.factoring_balance_invoice_linkage")) {
          throw new Error("connection_reset");
        }
        throw new Error(`unexpected SQL: ${sql.slice(0, 80)}`);
      }),
    };
    await expect(
      computeFactoringBalanceInvoiceLinkage(client, {
        operatingCompanyId: "11111111-1111-1111-1111-111111111111",
      })
    ).rejects.toThrow(/connection_reset/);
  });

  it("meta documents liability vs reserve separation", () => {
    expect(__test__.META.liability_label).toBe("outstanding_secured_borrowing_liability");
    expect(__test__.META.reserve_label).toBe("factoring_reserve_receivable_asset");
    expect(__test__.META.never_net_reserve_into_liability).toBe(true);
  });
});
