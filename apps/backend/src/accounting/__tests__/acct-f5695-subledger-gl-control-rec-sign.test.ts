import { describe, expect, it, vi } from "vitest";

/**
 * ACCT-F5695 — accounting.fn_account_balances_as_of's closing_balance_cents is DEBIT-POSITIVE
 * (SUM(debit) − SUM(credit)) regardless of the account's own normal_balance. A credit-normal control
 * account (Liability — ap_control, escrow_liability_default, factoring_advance_liability) with a real
 * $X owed reports closing_balance_cents = −X, while every subledger source in this report expresses
 * its own figure as a positive magnitude. Comparing them directly for a credit-normal role doubles the
 * apparent variance (sign-inverted) instead of proving tie-out. Live-verified on USMCA 2026-08-21:
 * ap_control read control=-$123.45 / subledger=$123.45 — exactly this bug's signature, not a real gap.
 *
 * Pure unit test — every dependency mocked (DB client + the 4 sibling report services this function
 * reuses), isolating exactly the sign-flip behavior in loadControlBalanceCents.
 */

const { mockQuery, mockWithCompanyScope, mockGetArAgingReport, mockGetApAgingReport, mockResolveRoleAccountOptional, mockComputeFactoringBalanceInvoiceLinkage } =
  vi.hoisted(() => {
    const query = vi.fn();
    return {
      mockQuery: query,
      mockWithCompanyScope: vi.fn(async (_userId: string, _opco: string, fn: (client: { query: typeof query }) => unknown) =>
        fn({ query })
      ),
      mockGetArAgingReport: vi.fn(),
      mockGetApAgingReport: vi.fn(),
      mockResolveRoleAccountOptional: vi.fn(),
      mockComputeFactoringBalanceInvoiceLinkage: vi.fn(),
    };
  });

vi.mock("../shared.js", () => ({ withCompanyScope: mockWithCompanyScope }));
vi.mock("../ar-aging.service.js", () => ({ getArAgingReport: mockGetArAgingReport }));
vi.mock("../ap-aging.service.js", () => ({ getApAgingReport: mockGetApAgingReport }));
vi.mock("../coa-roles/resolver.service.js", () => ({ resolveRoleAccountOptional: mockResolveRoleAccountOptional }));
vi.mock("../../home/factoring-balance-invoice-linkage.service.js", () => ({
  computeFactoringBalanceInvoiceLinkage: mockComputeFactoringBalanceInvoiceLinkage,
}));

const { getSubledgerGlControlRecReport } = await import("../subledger-gl-control-rec.service.js");

const OPCO = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const AP_ACCOUNT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function installMocks({ apControlBalanceCents }: { apControlBalanceCents: number }) {
  mockGetArAgingReport.mockReset().mockResolvedValue({ totals: { total_outstanding: 0 } });
  mockGetApAgingReport.mockReset().mockResolvedValue({ totals: { total_outstanding: 12345 } });
  mockComputeFactoringBalanceInvoiceLinkage.mockReset().mockResolvedValue({ outstanding_liability_cents: 0 });
  mockResolveRoleAccountOptional.mockReset().mockImplementation(async (_c: unknown, _o: string, role: string) =>
    role === "ap_control" ? AP_ACCOUNT : null
  );
  mockQuery.mockReset();
  mockQuery.mockImplementation(async (sql: string) => {
    if (sql.includes("fn_account_balances_as_of")) {
      // A real $123.45 AP liability posts as debit-positive closing_balance_cents = -12345
      // (SUM(debit) − SUM(credit), credit-heavy), with normal_balance correctly reported 'credit'.
      return { rows: [{ closing_balance_cents: apControlBalanceCents, normal_balance: "credit" }] };
    }
    if (sql.includes("escrow_accounts")) return { rows: [{ total_cents: 0 }] };
    return { rows: [] };
  });
}

describe("ACCT-F5695 subledger-gl-control-rec sign convention", () => {
  it("ties ap_control (Liability, credit-normal) when the real $ amounts match, despite the raw closing_balance_cents being negative", async () => {
    installMocks({ apControlBalanceCents: -12345 });

    const report = await getSubledgerGlControlRecReport({ userId: USER, operating_company_id: OPCO });

    const apRow = report.rows.find((r) => r.role === "ap_control")!;
    expect(apRow.control_balance_cents).toBe(12345);
    expect(apRow.subledger_balance_cents).toBe(12345);
    expect(apRow.variance_cents).toBe(0);
    expect(apRow.status).toBe("tied");
  });

  it("does NOT double-count a genuine variance for a credit-normal role — a real $1 gap stays $1, not $2 sign-inverted", async () => {
    // Subledger says $123.45 owed; GL control account's real credit-heavy balance is $124.45
    // (closing_balance_cents = -12445, debit-positive convention).
    installMocks({ apControlBalanceCents: -12445 });

    const report = await getSubledgerGlControlRecReport({ userId: USER, operating_company_id: OPCO });

    const apRow = report.rows.find((r) => r.role === "ap_control")!;
    expect(apRow.control_balance_cents).toBe(12445);
    expect(apRow.subledger_balance_cents).toBe(12345);
    expect(apRow.variance_cents).toBe(100);
    expect(apRow.status).toBe("variance");
  });
});
