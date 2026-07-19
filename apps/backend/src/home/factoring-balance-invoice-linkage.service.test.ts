import { describe, expect, it } from "vitest";
import {
  computeFactoringBalanceInvoiceLinkage,
  computeOutstandingLiabilityCents,
  computeReserveReceivableCents,
  isCanonicalInvoiceDisplayId,
  wouldFanoutMultiply,
  __test__,
} from "./factoring-balance-invoice-linkage.service.js";

function mockClient(handlers: Array<(sql: string, values?: unknown[]) => { rows: unknown[] } | null>) {
  return {
    query: async (sql: string, values?: unknown[]) => {
      for (const h of handlers) {
        const hit = h(sql, values);
        if (hit) return hit;
      }
      return { rows: [] };
    },
  };
}

const PROBE_OK = (sql: string) =>
  sql.includes("to_regclass")
    ? {
        rows: [
          {
            advances_ok: true,
            invoices_ok: true,
            jep_ok: true,
            je_ok: true,
            roles_ok: true,
            view_ok: true,
          },
        ],
      }
    : null;

const TRANSP_CO = (sql: string) =>
  sql.includes("FROM org.companies")
    ? { rows: [{ code: "TRANSP", legal_name: "IH 35 TRANSPORTATION LLC" }] }
    : null;

const ACTIVE_FACTOR = (sql: string) =>
  sql.includes("WITH candidates") || (sql.includes("FROM mdata.vendors") && sql.includes("candidates"))
    ? { rows: [{ vendor_id: "v1", vendor_name: "Active Factor Vendor" }] }
    : sql.includes("FROM mdata.vendors")
      ? { rows: [{ vendor_id: "v1", vendor_name: "Active Factor Vendor" }] }
      : null;

const ROLES_OK = (sql: string) =>
  sql.includes("chart_of_accounts_roles")
    ? {
        rows: [
          { role: "factoring_advance_liability", account_id: "a1" },
          { role: "factor_reserve_held", account_id: "a2" },
        ],
      }
    : null;

const AS_OF = (sql: string) =>
  sql.includes("set_config('app.factoring_balance_as_of'") ? { rows: [{ set_config: "2026-07-19" }] } : null;

describe("0280-05 factoring-balance-invoice-linkage service", () => {
  it("formula helpers: signed liability/reserve; never clamp; recourse does not zero reserve", () => {
    expect(
      computeOutstandingLiabilityCents({
        funded_cents: 1_000_000,
        settled_cents: 200_000,
        recourse_buyback_cents: 100_000,
      })
    ).toBe(700_000);
    expect(
      computeOutstandingLiabilityCents({
        funded_cents: 100_000,
        settled_cents: 200_000,
        recourse_buyback_cents: 0,
      })
    ).toBe(-100_000);
    expect(
      computeReserveReceivableCents({
        reserve_held_cents: 15_000,
        reserve_released_cents: 0,
      })
    ).toBe(15_000);
    expect(
      computeReserveReceivableCents({
        reserve_held_cents: 3_000,
        reserve_released_cents: 5_000,
      })
    ).toBe(-2_000);
    expect(wouldFanoutMultiply(1_000_000, 3)).toBe(3_000_000);
  });

  it("canonical invoice display_id contract", () => {
    expect(isCanonicalInvoiceDisplayId("INV-2026-10001")).toBe(true);
    expect(isCanonicalInvoiceDisplayId(["INV", "FBL", "12345"].join("-"))).toBe(false);
    expect(isCanonicalInvoiceDisplayId("INV-26-00001")).toBe(false);
  });

  it("meta never attributes liability/reserve to mutable status; never clamp", () => {
    expect(__test__.BASE_META.liability_from_status).toBe(false);
    expect(__test__.BASE_META.reserve_from_status).toBe(false);
    expect(__test__.BASE_META.never_net_reserve_into_liability).toBe(true);
    expect(__test__.BASE_META.never_clamp_anomaly_to_zero).toBe(true);
  });

  it("unverifiable when Faro/TRANSP contract entity mismatch", async () => {
    const client = mockClient([
      PROBE_OK,
      (sql) =>
        sql.includes("FROM org.companies")
          ? { rows: [{ code: "USMCA-1", legal_name: "USMCA Logistics" }] }
          : null,
    ]);
    const result = await computeFactoringBalanceInvoiceLinkage(client, {
      operatingCompanyId: "00000000-0000-4000-8000-000000000099",
    });
    expect(result.status).toBe("unverifiable");
    expect(result.unverifiable_reason).toBe("faro_contract_entity_mismatch");
    expect(result.outstanding_liability_cents).toBeNull();
  });

  it("mixed_factor_assignment fail closed", async () => {
    const client = mockClient([
      PROBE_OK,
      TRANSP_CO,
      (sql) =>
        sql.includes("WITH candidates") || sql.includes("FROM mdata.vendors")
          ? {
              rows: [
                { vendor_id: "v1", vendor_name: "Factor A" },
                { vendor_id: "v2", vendor_name: "Factor B" },
              ],
            }
          : null,
    ]);
    const result = await computeFactoringBalanceInvoiceLinkage(client, {
      operatingCompanyId: "00000000-0000-4000-8000-000000000001",
    });
    expect(result.status).toBe("unverifiable");
    expect(result.unverifiable_reason).toBe("mixed_factor_assignment");
    expect(result.outstanding_liability_cents).toBeNull();
  });

  it("empty when active factor ok and view returns no row", async () => {
    const client = mockClient([
      PROBE_OK,
      TRANSP_CO,
      ACTIVE_FACTOR,
      ROLES_OK,
      AS_OF,
      (sql) => (sql.includes("FROM views.factoring_balance_invoice_linkage") ? { rows: [] } : null),
    ]);
    const result = await computeFactoringBalanceInvoiceLinkage(client, {
      operatingCompanyId: "00000000-0000-4000-8000-000000000001",
    });
    expect(result.status).toBe("empty");
    expect(result.outstanding_liability_cents).toBe(0);
    expect(result.reserve_receivable_cents).toBe(0);
  });

  it("ok path maps artifact rollup; incomplete funding → unverifiable", async () => {
    const okClient = mockClient([
      PROBE_OK,
      TRANSP_CO,
      ACTIVE_FACTOR,
      ROLES_OK,
      AS_OF,
      (sql) =>
        sql.includes("FROM views.factoring_balance_invoice_linkage")
          ? {
              rows: [
                {
                  liability_credits_cents: 1_000_000,
                  liability_debits_settled_cents: 0,
                  liability_debits_recourse_cents: 0,
                  outstanding_liability_signed_cents: 1_000_000,
                  reserve_debits_cents: 15_000,
                  reserve_credits_cents: 0,
                  reserve_receivable_signed_cents: 15_000,
                  invoice_count: 2,
                  funded_advance_count: 1,
                  factor_advances_without_funding_artifact: 0,
                  factor_advances_with_reserve_missing_held_artifact: 0,
                  orphan_liability_role_cents: 0,
                  orphan_reserve_role_cents: 0,
                  as_of_business_date: "2026-07-19",
                },
              ],
            }
          : null,
    ]);
    const ok = await computeFactoringBalanceInvoiceLinkage(okClient, {
      operatingCompanyId: "00000000-0000-4000-8000-000000000001",
    });
    expect(ok.status).toBe("ok");
    expect(ok.outstanding_liability_cents).toBe(1_000_000);
    expect(ok.reserve_receivable_cents).toBe(15_000);
    expect(ok.invoice_count).toBe(2);

    const incomplete = mockClient([
      PROBE_OK,
      TRANSP_CO,
      ACTIVE_FACTOR,
      ROLES_OK,
      AS_OF,
      (sql) =>
        sql.includes("FROM views.factoring_balance_invoice_linkage")
          ? {
              rows: [
                {
                  liability_credits_cents: 0,
                  liability_debits_settled_cents: 0,
                  liability_debits_recourse_cents: 0,
                  outstanding_liability_signed_cents: 0,
                  reserve_debits_cents: 0,
                  reserve_credits_cents: 0,
                  reserve_receivable_signed_cents: 0,
                  invoice_count: 1,
                  funded_advance_count: 1,
                  factor_advances_without_funding_artifact: 1,
                  factor_advances_with_reserve_missing_held_artifact: 0,
                  orphan_liability_role_cents: 0,
                  orphan_reserve_role_cents: 0,
                  as_of_business_date: "2026-07-19",
                },
              ],
            }
          : null,
    ]);
    const bad = await computeFactoringBalanceInvoiceLinkage(incomplete, {
      operatingCompanyId: "00000000-0000-4000-8000-000000000001",
    });
    expect(bad.status).toBe("unverifiable");
    expect(bad.unverifiable_reason).toBe("incomplete_funding_je_artifacts");
  });

  it("debit liability anomaly → accounting_exception (never clamp headline to 0)", async () => {
    const client = mockClient([
      PROBE_OK,
      TRANSP_CO,
      ACTIVE_FACTOR,
      ROLES_OK,
      AS_OF,
      (sql) =>
        sql.includes("FROM views.factoring_balance_invoice_linkage")
          ? {
              rows: [
                {
                  liability_credits_cents: 100_000,
                  liability_debits_settled_cents: 250_000,
                  liability_debits_recourse_cents: 0,
                  outstanding_liability_signed_cents: -150_000,
                  reserve_debits_cents: 1_500,
                  reserve_credits_cents: 0,
                  reserve_receivable_signed_cents: 1_500,
                  invoice_count: 1,
                  funded_advance_count: 1,
                  factor_advances_without_funding_artifact: 0,
                  factor_advances_with_reserve_missing_held_artifact: 0,
                  orphan_liability_role_cents: 0,
                  orphan_reserve_role_cents: 0,
                  as_of_business_date: "2026-07-19",
                },
              ],
            }
          : null,
    ]);
    const result = await computeFactoringBalanceInvoiceLinkage(client, {
      operatingCompanyId: "00000000-0000-4000-8000-000000000001",
    });
    expect(result.status).toBe("accounting_exception");
    expect(result.unverifiable_reason).toBe("accounting_exception:debit_liability_anomaly");
    expect(result.outstanding_liability_cents).toBeNull();
    expect(result.diagnostics?.outstanding_liability_signed_cents).toBe(-150_000);
  });

  it("planted connection_reset / query failure propagates (no silent zero)", async () => {
    const client = mockClient([
      () => {
        throw new Error("connection_reset");
      },
    ]);
    await expect(
      computeFactoringBalanceInvoiceLinkage(client, {
        operatingCompanyId: "00000000-0000-4000-8000-000000000001",
      })
    ).rejects.toThrow(/connection_reset/);
  });
});
