#!/usr/bin/env node
/**
 * BANK-F01 — the Banking Home cash KPI must convert CENTS to dollars before formatting.
 *
 * WHY (verified on prod br-fancy-credit-akjnd07a, 2026-08-02):
 * GET /api/v1/banking/dashboard/kpis overrides total_cash with sumAuthoritativeDepositoryCashCents(),
 * whose body is literally `COALESCE(SUM(current_balance_cents), 0)::bigint`. BankingHome fed that
 * straight into an Intl currency formatter, which expects DOLLARS — a clean 100x overstatement on the
 * home screen. TRANSP's 5 active accounts sum to 4,023,590 cents, so the tile read $4,023,590.00 for
 * $40,235.90. Cash Flow divided the same authoritative total correctly, which is exactly why the two
 * surfaces disagreed by a factor of 100.
 *
 * This is an honest-financial-reporting defect, not cosmetics: the number an operator reads first,
 * wrong by two orders of magnitude, is the "traceable numbers" failure this repo exists to prevent.
 *
 * SCOPE — deliberately narrow, and verified rather than assumed. total_cash is the ONLY cents-valued
 * field on this page: factoring reserve_balance is already divided by 100 in SQL
 * (factoring-virtual.routes.ts), and dip_operating / dip_payroll / driver_escrow come from
 * views.banking_account_tiles.current_balance, a dollar-denominated numeric. Flagging those would be
 * a false positive, and a guard that cries wolf gets disabled.
 *
 * THE INVARIANT: any read of a `*_cents` API field must be divided by 100 (or passed to a
 * cents-aware formatter) before reaching a dollar formatter. Enforced for total_cash by name because
 * the field name does NOT carry the _cents suffix — that missing suffix is precisely how the unit got
 * lost, so the guard remembers what the name forgot.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PAGE = "apps/frontend/src/pages/banking/BankingHome.tsx";
const ROUTE = "apps/backend/src/banking/banking.routes.ts";
const LABEL = "verify-banking-cash-kpi-cents-unit";

/** Fields the API returns in CENTS despite a name that does not say so. */
const CENTS_FIELDS = ["total_cash"];

export function auditPage(src) {
  const problems = [];
  for (const field of CENTS_FIELDS) {
    const re = new RegExp(`const\\s+(\\w+)\\s*=\\s*Number\\(([^)]*?\\b${field}\\b[^)]*?)\\)([^;\\n]*)`, "g");
    const matches = [...src.matchAll(re)];
    if (matches.length === 0) {
      problems.push(
        `${PAGE}: no selector reads ${field}. This guard's anchor is gone — re-point it at wherever ` +
          `the cash KPI is derived rather than passing by absence.`
      );
      continue;
    }
    for (const m of matches) {
      const tail = m[3] ?? "";
      if (!/\/\s*100/.test(tail)) {
        problems.push(
          `${PAGE}: \`${m[1]}\` reads ${field} without dividing by 100. The API returns that field in ` +
            `CENTS (sumAuthoritativeDepositoryCashCents = SUM(current_balance_cents)), and it is ` +
            `rendered through a dollar formatter — a 100x overstatement of the headline cash number.`
        );
      }
    }
  }
  return problems;
}

export function auditRoute(src) {
  // If the backend ever starts returning dollars, this guard's premise dies and the /100 becomes the
  // bug. Assert the cents source is still what feeds total_cash.
  if (!/total_cash:\s*authoritativeTotalCash/.test(src) || !/sumAuthoritativeDepositoryCashCents/.test(src)) {
    return [
      `${ROUTE}: total_cash is no longer sourced from sumAuthoritativeDepositoryCashCents. The ` +
        `frontend divides that field by 100 on the premise that it is CENTS — if the unit changed ` +
        `here, that division is now itself the defect. Re-check both sides together.`,
    ];
  }
  return [];
}

function auditTree() {
  return [
    ...auditPage(readFileSync(join(ROOT, PAGE), "utf8")),
    ...auditRoute(readFileSync(join(ROOT, ROUTE), "utf8")),
  ];
}

function selftest() {
  const failures = [];
  if (auditTree().length !== 0) failures.push(`case0 FAIL — real source flagged: ${auditTree().join(" | ")}`);

  const bug = `  const cashPosting = Number(kpiQuery.data?.total_cash ?? 0);`;
  if (!auditPage(bug).some((p) => p.includes("without dividing by 100")))
    failures.push("case1 FAIL — the undivided cents read (the BANK-F01 defect verbatim) was NOT caught");

  const fixed = `  const cashPosting = Number(kpiQuery.data?.total_cash ?? 0) / 100;`;
  if (auditPage(fixed).length !== 0) failures.push("case2 FAIL — the corrected form was wrongly flagged");

  if (!auditPage("const x = 1;").some((p) => p.includes("anchor is gone")))
    failures.push("case3 FAIL — a missing selector did NOT fail closed");

  if (!auditRoute("const total_cash = 0;").some((p) => p.includes("no longer sourced")))
    failures.push("case4 FAIL — a backend unit change did NOT fail closed");

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(
    `${LABEL}: selftest PASS — undivided cents caught, corrected form passes, missing selector and ` +
      `backend unit change both fail closed`
  );
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — the Banking Home cash KPI converts cents to dollars before formatting`);
}

main();
