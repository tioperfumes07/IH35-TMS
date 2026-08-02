#!/usr/bin/env node
/**
 * BANK-F01/BANK-F16 — the Banking Home cash KPI must be converted from CENTS to dollars EXACTLY ONCE.
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
 * THE INVARIANT (CORRECTED 2026-08-02, BANK-F16): the conversion happens EXACTLY ONCE, on the
 * SERVER. `total_cash` on the API is DOLLARS.
 *
 * WHY THIS GUARD CHANGED. Its original form required the CLIENT to divide, which was right when it
 * was written. PR #4011 then added the same division on the server with a comment reading "BankingHome
 * money.format expects dollars ... do not assign cents here" — so both sides divided and the KPI went
 * from 100x too HIGH to 100x too LOW (TRANSP: $402.36 shown for a true $40,235.90; TRK $0.05 for
 * $5.38; USMCA $0.94 for $93.68, prod 2026-08-02, positive control mdata.vendors=2,827).
 *
 * This guard did not catch that, and the reason matters: auditRoute tested
 * /total_cash:\s*authoritativeTotalCash/, which STILL MATCHES `total_cash: authoritativeTotalCash / 100`.
 * A prefix match that ignores the suffix cannot see a unit change — so CI went on REQUIRING the client
 * division and locked the defect in. Both halves are now asserted explicitly, and the guard fails on
 * BOTH failure shapes: neither side converting (100x high) and both sides converting (100x low).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PAGE = "apps/frontend/src/pages/banking/BankingHome.tsx";
const ROUTE = "apps/backend/src/banking/banking.routes.ts";
const LABEL = "verify-banking-cash-kpi-cents-unit";

/** Fields whose dollar conversion is owned by the SERVER — the client must NOT convert again. */
const SERVER_CONVERTED_FIELDS = ["total_cash"];

export function auditPage(src) {
  const problems = [];
  for (const field of SERVER_CONVERTED_FIELDS) {
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
      if (/\/\s*100/.test(tail)) {
        problems.push(
          `${PAGE}: \`${m[1]}\` divides ${field} by 100, but the SERVER already converted it to ` +
            `dollars (${ROUTE}). Dividing again renders the headline cash number 100x TOO LOW — the ` +
            `live defect of 2026-08-02, when TRANSP showed $402.36 against a true $40,235.90.`
        );
      }
    }
  }
  return problems;
}

export function auditRoute(src) {
  // The server owns the cents->dollars conversion, because the server is the side that knows the
  // source column is `current_balance_cents`. Both halves are asserted: the cents source AND the
  // division. The previous version of this check tested only /total_cash:\s*authoritativeTotalCash/,
  // which still matches `total_cash: authoritativeTotalCash / 100` — so when PR #4011 added the
  // server-side division the guard did not notice, and CI went on REQUIRING the client division too.
  // That loose prefix match is exactly how the double-division was locked in.
  const problems = [];
  if (!/sumAuthoritativeDepositoryCashCents/.test(src)) {
    problems.push(
      `${ROUTE}: total_cash is no longer sourced from sumAuthoritativeDepositoryCashCents. Re-check ` +
        `both sides together before changing either.`
    );
  }
  if (!/total_cash:\s*[A-Za-z0-9_.()\s]*\/\s*100/.test(src)) {
    problems.push(
      `${ROUTE}: total_cash is not divided by 100. sumAuthoritativeDepositoryCashCents() returns ` +
        `CENTS, so without the server-side conversion the KPI renders 100x TOO HIGH.`
    );
  }
  return problems;
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

  // case1 — the CURRENT defect: the client divides a field the server already converted (100x LOW).
  const doubleDivided = `  const cashPosting = Number(kpiQuery.data?.total_cash ?? 0) / 100;`;
  if (!auditPage(doubleDivided).some((p) => p.includes("divides total_cash by 100")))
    failures.push("case1 FAIL — the double division (100x TOO LOW, the live 2026-08-02 defect) was NOT caught");

  // case2 — the corrected form: client consumes dollars as-is.
  const fixed = `  const cashPosting = Number(kpiQuery.data?.total_cash ?? 0);`;
  if (auditPage(fixed).length !== 0) failures.push("case2 FAIL — the corrected form was wrongly flagged");

  if (!auditPage("const x = 1;").some((p) => p.includes("anchor is gone")))
    failures.push("case3 FAIL — a missing selector did NOT fail closed");

  // case4 — the ORIGINAL defect shape: server stops converting (100x HIGH).
  if (!auditRoute("total_cash: authoritativeTotalCash,\nsumAuthoritativeDepositoryCashCents").some((p) => p.includes("not divided by 100")))
    failures.push("case4 FAIL — a missing SERVER division (100x TOO HIGH) did NOT fail closed");

  // case5 — the cents source itself being swapped out.
  if (!auditRoute("const total_cash = 0;").some((p) => p.includes("no longer sourced")))
    failures.push("case5 FAIL — a backend source change did NOT fail closed");

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(
    `${LABEL}: selftest PASS — 5 cases: double division (100x low) caught, corrected form passes, ` +
      `missing selector / missing server division (100x high) / source swap all fail closed`
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
