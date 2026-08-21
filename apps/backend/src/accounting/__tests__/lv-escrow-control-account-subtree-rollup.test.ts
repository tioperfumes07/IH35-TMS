import { describe, expect, it, vi } from "vitest";

/**
 * LV-ESCROW-CONTROL-ACCOUNT-BLIND-TO-CHILD-SUBACCOUNTS — a control account can be a GRANDPARENT
 * with real money posted only to a descendant sub-account, not to itself. Live-verified on USMCA
 * 2026-08-21: escrow_liability_default resolves to the ACCT-F5681 alias-fixed grandparent
 * ("Driver Escrow - Held in Trust"), which has ZERO direct postings — the real $250.00 first-ever
 * escrow accrual posted to a per-driver LEAF account three levels down (grandparent -> "Driver
 * Escrow" middle parent -> the specific driver's own sub-account). A single-account_id lookup is
 * structurally blind to this. Fix: recurse the full descendant subtree and sum every descendant's
 * own sign-normalized balance.
 *
 * Pure unit test — every dependency mocked, isolating exactly the recursive rollup behavior in
 * loadControlBalanceCents via a fake WITH RECURSIVE result set (the mock returns what the real
 * recursive query would for a 3-level hierarchy; it does not re-implement the recursion itself —
 * that stays exercised live, per VERIFY-2 in the shipping PR).
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
const GRANDPARENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function installMocks(subtreeRows: Array<{ closing_balance_cents: number; normal_balance: string }>, escrowSubledgerCents: number) {
  mockGetArAgingReport.mockReset().mockResolvedValue({ totals: { total_outstanding: 0 } });
  mockGetApAgingReport.mockReset().mockResolvedValue({ totals: { total_outstanding: 0 } });
  mockComputeFactoringBalanceInvoiceLinkage.mockReset().mockResolvedValue({ outstanding_liability_cents: 0 });
  mockResolveRoleAccountOptional.mockReset().mockImplementation(async (_c: unknown, _o: string, role: string) =>
    role === "escrow_liability_default" ? GRANDPARENT : null
  );
  mockQuery.mockReset();
  mockQuery.mockImplementation(async (sql: string) => {
    if (sql.includes("WITH RECURSIVE subtree")) return { rows: subtreeRows };
    if (sql.includes("escrow_accounts")) return { rows: [{ total_cents: escrowSubledgerCents }] };
    return { rows: [] };
  });
}

describe("LV-ESCROW-CONTROL-ACCOUNT-BLIND-TO-CHILD-SUBACCOUNTS subtree rollup", () => {
  it("ties escrow_liability_default when the real accrual posted to a grandchild leaf, not the resolved grandparent itself", async () => {
    // Grandparent itself: 0. Middle parent: 0. Per-driver leaf: the real $250.00 accrual
    // (closing_balance_cents=-25000, credit-normal Liability — debit-positive convention).
    installMocks(
      [
        { closing_balance_cents: 0, normal_balance: "credit" }, // grandparent, no direct postings
        { closing_balance_cents: 0, normal_balance: "credit" }, // middle parent, no direct postings
        { closing_balance_cents: -25000, normal_balance: "credit" }, // per-driver leaf, real accrual
      ],
      25000
    );

    const report = await getSubledgerGlControlRecReport({ userId: USER, operating_company_id: OPCO });

    const row = report.rows.find((r) => r.role === "escrow_liability_default")!;
    expect(row.control_balance_cents).toBe(25000);
    expect(row.subledger_balance_cents).toBe(25000);
    expect(row.variance_cents).toBe(0);
    expect(row.status).toBe("tied");
  });

  it("still flags a genuine variance across the subtree, not just the root", async () => {
    installMocks(
      [
        { closing_balance_cents: 0, normal_balance: "credit" },
        { closing_balance_cents: -10000, normal_balance: "credit" }, // one driver: $100.00
        { closing_balance_cents: -5000, normal_balance: "credit" }, // another driver: $50.00
      ],
      12000 // subledger only knows about $120.00 — a genuine $30.00 gap
    );

    const report = await getSubledgerGlControlRecReport({ userId: USER, operating_company_id: OPCO });

    const row = report.rows.find((r) => r.role === "escrow_liability_default")!;
    expect(row.control_balance_cents).toBe(15000);
    expect(row.subledger_balance_cents).toBe(12000);
    expect(row.variance_cents).toBe(3000);
    expect(row.status).toBe("variance");
  });
});
