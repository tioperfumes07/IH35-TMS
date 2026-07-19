import { describe, expect, it } from "vitest";
import {
  computeFactoringBalanceInvoiceLinkage,
  computeOutstandingLiabilityCents,
  computeReserveReceivableCents,
  isCanonicalInvoiceDisplayId,
  wouldFanoutMultiply,
  __test__,
  FARO_FULL_RECOURSE_AGREEMENT_CODE,
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
  sql.includes("to_regclass") && sql.includes("advances_ok")
    ? {
        rows: [
          {
            advances_ok: true,
            invoices_ok: true,
            jep_ok: true,
            je_ok: true,
            roles_ok: true,
            view_ok: true,
            agreements_ok: true,
            factor_ok: true,
          },
        ],
      }
    : null;

const TRANSP_CO = (sql: string) =>
  sql.includes("FROM org.companies")
    ? { rows: [{ code: "TRANSP", legal_name: "IH 35 TRANSPORTATION LLC" }] }
    : null;

const AGREEMENT_TABLE_OK = (sql: string) =>
  sql.includes("to_regclass('factoring.canonical_factor_agreements')")
    ? { rows: [{ ok: true }] }
    : null;

function faroBindingRow(overrides: Record<string, unknown> = {}) {
  return {
    agreement_id: "a1",
    factor_profile_id: "p1",
    factor_vendor_id: "v-faro",
    vendor_name: "Bound Faro Vendor",
    is_full_recourse: true,
    fee_rate_tier1: "0.015",
    fee_rate_tier2: "0.02",
    reserve_rate: "0.015",
    repurchase_term_days: 30,
    grace_days: 5,
    repurchase_deadline_days: 95,
    default_interest_daily_rate: "0.00067",
    profile_fee_rate: "0.015",
    profile_reserve_rate: "0.015",
    profile_recourse_days: 95,
    profile_active: true,
    ...overrides,
  };
}

const VALID_FARO = (sql: string) => {
  if (sql.includes("FROM factoring.canonical_factor_agreements a")) {
    return { rows: [faroBindingRow()] };
  }
  if (sql.includes("to_regclass('factoring.canonical_factor_agreements')")) {
    return { rows: [{ ok: true }] };
  }
  return null;
};

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

  it("locked Faro terms helpers reject wrong rates", () => {
    expect(
      __test__.profileMatchesLockedFaroTerms({
        fee_rate: 0.015,
        reserve_rate: 0.015,
        recourse_days: 95,
      })
    ).toBe(true);
    expect(
      __test__.profileMatchesLockedFaroTerms({
        fee_rate: 0.03,
        reserve_rate: 0.015,
        recourse_days: 95,
      })
    ).toBe(false);
    expect(FARO_FULL_RECOURSE_AGREEMENT_CODE).toBe("FARO_FULL_RECOURSE_V1");
  });

  it("unverifiable when Faro/TRANSP contract entity mismatch", async () => {
    const client = mockClient([
      PROBE_OK,
      (sql) =>
        sql.includes("FROM org.companies")
          ? { rows: [{ code: "USMCA-1" }] }
          : null,
    ]);
    const result = await computeFactoringBalanceInvoiceLinkage(client, {
      operatingCompanyId: "00000000-0000-4000-8000-000000000099",
    });
    expect(result.status).toBe("unverifiable");
    expect(result.unverifiable_reason).toBe("faro_contract_entity_mismatch");
    expect(result.outstanding_liability_cents).toBeNull();
  });

  it("never infers Faro contract entity from legal_name alone", async () => {
    const client = mockClient([
      PROBE_OK,
      (sql) =>
        sql.includes("FROM org.companies")
          ? { rows: [{ code: "TRK", legal_name: "IH 35 TRANSPORTATION Spoof" }] }
          : null,
    ]);
    const result = await computeFactoringBalanceInvoiceLinkage(client, {
      operatingCompanyId: "00000000-0000-4000-8000-000000000098",
    });
    expect(result.status).toBe("unverifiable");
    expect(result.unverifiable_reason).toBe("faro_contract_entity_mismatch");
  });

  it("RTS-only sole factor is NEVER labeled Faro without owner-seeded agreement", async () => {
    const client = mockClient([
      PROBE_OK,
      TRANSP_CO,
      AGREEMENT_TABLE_OK,
      (sql) => {
        if (sql.includes("FROM factoring.canonical_factor_agreements a")) return { rows: [] };
        if (sql.includes("voided_current_n") && sql.includes("canonical_factor_agreements")) {
          return { rows: [{ live_future_n: "0", live_expired_n: "0", voided_current_n: "0" }] };
        }
        return null;
      },
    ]);
    const result = await computeFactoringBalanceInvoiceLinkage(client, {
      operatingCompanyId: "00000000-0000-4000-8000-000000000001",
      asOfBusinessDate: "2026-07-19",
    });
    expect(result.status).toBe("unverifiable");
    expect(result.unverifiable_reason).toBe("missing_faro_agreement_binding");
    expect(result.meta.active_factor_vendor_id).toBeNull();
    expect(result.outstanding_liability_cents).toBeNull();
  });

  it("ambiguous/mixed overlapping Faro agreement bindings fail closed", async () => {
    const client = mockClient([
      PROBE_OK,
      TRANSP_CO,
      AGREEMENT_TABLE_OK,
      (sql) =>
        sql.includes("FROM factoring.canonical_factor_agreements a")
          ? {
              rows: [
                faroBindingRow({ agreement_id: "a1", factor_vendor_id: "v1" }),
                faroBindingRow({ agreement_id: "a2", factor_vendor_id: "v2", vendor_name: "Other" }),
              ],
            }
          : null,
    ]);
    const result = await computeFactoringBalanceInvoiceLinkage(client, {
      operatingCompanyId: "00000000-0000-4000-8000-000000000001",
      asOfBusinessDate: "2026-07-19",
    });
    expect(result.status).toBe("unverifiable");
    expect(result.unverifiable_reason).toBe("ambiguous_faro_agreement_binding");
    expect(result.outstanding_liability_cents).toBeNull();
  });

  it("expired / not-yet-effective Faro agreement → faro_agreement_not_effective", async () => {
    const client = mockClient([
      PROBE_OK,
      TRANSP_CO,
      AGREEMENT_TABLE_OK,
      (sql) => {
        if (sql.includes("FROM factoring.canonical_factor_agreements a")) return { rows: [] };
        if (sql.includes("voided_current_n") && sql.includes("canonical_factor_agreements")) {
          // Non-voided expired sibling, no voided-current binding → not_effective (new classifier shape).
          return { rows: [{ live_future_n: "0", live_expired_n: "1", voided_current_n: "0" }] };
        }
        return null;
      },
    ]);
    const result = await computeFactoringBalanceInvoiceLinkage(client, {
      operatingCompanyId: "00000000-0000-4000-8000-000000000001",
      asOfBusinessDate: "2026-07-19",
    });
    expect(result.status).toBe("unverifiable");
    expect(result.unverifiable_reason).toBe("faro_agreement_not_effective");
  });

  it("wrong Faro terms on profile → faro_agreement_terms_mismatch", async () => {
    const client = mockClient([
      PROBE_OK,
      TRANSP_CO,
      AGREEMENT_TABLE_OK,
      (sql) =>
        sql.includes("FROM factoring.canonical_factor_agreements a")
          ? {
              rows: [
                faroBindingRow({
                  profile_reserve_rate: "0.03",
                  profile_fee_rate: "0.015",
                }),
              ],
            }
          : null,
    ]);
    const result = await computeFactoringBalanceInvoiceLinkage(client, {
      operatingCompanyId: "00000000-0000-4000-8000-000000000001",
      asOfBusinessDate: "2026-07-19",
    });
    expect(result.status).toBe("unverifiable");
    expect(result.unverifiable_reason).toBe("faro_agreement_terms_mismatch");
  });

  it("empty when valid Faro agreement and view returns no row", async () => {
    const client = mockClient([
      PROBE_OK,
      TRANSP_CO,
      VALID_FARO,
      ROLES_OK,
      AS_OF,
      (sql) => (sql.includes("FROM views.factoring_balance_invoice_linkage") ? { rows: [] } : null),
    ]);
    const result = await computeFactoringBalanceInvoiceLinkage(client, {
      operatingCompanyId: "00000000-0000-4000-8000-000000000001",
      asOfBusinessDate: "2026-07-19",
    });
    expect(result.status).toBe("empty");
    expect(result.outstanding_liability_cents).toBe(0);
    expect(result.reserve_receivable_cents).toBe(0);
    expect(result.meta.active_factor_vendor_id).toBe("v-faro");
  });

  it("ok path maps artifact rollup; incomplete funding → unverifiable", async () => {
    const okClient = mockClient([
      PROBE_OK,
      TRANSP_CO,
      VALID_FARO,
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
      asOfBusinessDate: "2026-07-19",
    });
    expect(ok.status).toBe("ok");
    expect(ok.outstanding_liability_cents).toBe(1_000_000);
    expect(ok.reserve_receivable_cents).toBe(15_000);
    expect(ok.invoice_count).toBe(2);

    const incomplete = mockClient([
      PROBE_OK,
      TRANSP_CO,
      VALID_FARO,
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
      asOfBusinessDate: "2026-07-19",
    });
    expect(bad.status).toBe("unverifiable");
    expect(bad.unverifiable_reason).toBe("incomplete_funding_je_artifacts");
  });

  it("debit liability anomaly → accounting_exception (never clamp headline to 0)", async () => {
    const client = mockClient([
      PROBE_OK,
      TRANSP_CO,
      VALID_FARO,
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
      asOfBusinessDate: "2026-07-19",
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
