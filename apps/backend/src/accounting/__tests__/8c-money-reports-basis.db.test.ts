/**
 * 8c: all money reports take accrual/cash basis — guard and proof
 *
 * Verifies each of the 7 target routes declares `basis` in its query
 * schema. Tests fail if any report drops the basis declaration (old state).
 *
 * Q4 LOCKED: AR/AP aging routes accept the param but always compute
 * accrual (engine.ts LOCKED_DECISIONS Q4). The tests below assert they
 * accept the param, not that they bifurcate on it.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(__dirname, "../../../../..");

const BASIS_RE = /basis.*z\.enum.*["']accrual["'].*["']cash["']|z\.enum.*["']accrual["'].*["']cash["'].*basis/;

const TARGETS: Array<{ file: string; desc: string }> = [
  {
    file: "apps/backend/src/accounting/profit-loss.routes.ts",
    desc: "P&L route",
  },
  {
    file: "apps/backend/src/accounting/balance-sheet.routes.ts",
    desc: "balance sheet route",
  },
  {
    file: "apps/backend/src/accounting/trial-balance.routes.ts",
    desc: "trial balance route",
  },
  {
    file: "apps/backend/src/accounting/ar-aging.routes.ts",
    desc: "A/R aging route (Q4-locked accrual-only)",
  },
  {
    file: "apps/backend/src/accounting/ap-aging.routes.ts",
    desc: "A/P aging route (Q4-locked accrual-only)",
  },
  {
    file: "apps/backend/src/accounting/account-register.routes.ts",
    desc: "account register route",
  },
  {
    file: "apps/backend/src/accounting/cash-flow.routes.ts",
    desc: "cash flow route",
  },
];

describe("8c: all money reports take basis param", () => {
  for (const { file, desc } of TARGETS) {
    it(`${desc} declares basis z.enum(["accrual","cash"])`, () => {
      const src = readFileSync(resolve(ROOT, file), "utf8");
      expect(BASIS_RE.test(src), `${file} must declare basis: z.enum(["accrual","cash"]) in query schema`).toBe(true);
    });
  }

  it("P&L route imports and uses getCashBasisProfitLossReport for cash mode", () => {
    const src = readFileSync(resolve(ROOT, "apps/backend/src/accounting/profit-loss.routes.ts"), "utf8");
    expect(src).toContain("getCashBasisProfitLossReport");
  });

  it("balance sheet route imports and uses transformBalanceSheetToCashBasis for cash mode", () => {
    const src = readFileSync(resolve(ROOT, "apps/backend/src/accounting/balance-sheet.routes.ts"), "utf8");
    expect(src).toContain("transformBalanceSheetToCashBasis");
  });

  it("trial balance route imports and uses transformTrialBalanceToCashBasis for cash mode", () => {
    const src = readFileSync(resolve(ROOT, "apps/backend/src/accounting/trial-balance.routes.ts"), "utf8");
    expect(src).toContain("transformTrialBalanceToCashBasis");
  });

  it("account register service imports applyCashBasisSuppression for cash mode", () => {
    const src = readFileSync(resolve(ROOT, "apps/backend/src/accounting/account-register.service.ts"), "utf8");
    expect(src).toContain("applyCashBasisSuppression");
  });

  it("cash flow service bifurcates on basis (separate accrual and cash computations)", () => {
    const src = readFileSync(resolve(ROOT, "apps/backend/src/accounting/cash-flow.service.ts"), "utf8");
    expect(src).toContain("basis === \"accrual\"");
    // cash branch: service calls getCashBasisSections when basis !== "accrual"
    expect(src).toContain("getCashBasisSections");
    expect(src).toContain("getAccrualBasisSections");
  });

  it("AR aging returns basis: accrual always (Q4 decision locked)", () => {
    const src = readFileSync(resolve(ROOT, "apps/backend/src/accounting/ar-aging.routes.ts"), "utf8");
    expect(src).toContain('basis: "accrual"');
  });

  it("AP aging returns basis: accrual always (Q4 decision locked)", () => {
    const src = readFileSync(resolve(ROOT, "apps/backend/src/accounting/ap-aging.routes.ts"), "utf8");
    expect(src).toContain('basis: "accrual"');
  });
});
