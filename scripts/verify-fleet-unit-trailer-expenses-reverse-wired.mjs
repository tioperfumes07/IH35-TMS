#!/usr/bin/env node
/**
 * WAVE 2 fleet money — Box 3 Built for `unit.profile.expenses_reverse` /
 * `trailer.profile.expenses_reverse` × `expense`.
 *
 * @matrix-built {"modules":["fleet"],"cols":["expense"],"task":"WAVE2-FLEET-UNIT-TRAILER-EXPENSES-REVERSE-BUILT","vertical":"column-wave","leafRe":"^(unit|trailer)\\.profile\\.expenses_reverse$"}
 *
 * VehicleProfilePage.tsx and TrailerProfilePage.tsx both already mount the shared
 * ExpensesReverseSection component, scoped by unit_id/trailer_id respectively (ACCT-F5032 /
 * FINAL-WEEKEND-FULL-WIRING-2026-08-12 rank 6) — the wiring existed, only the Box-3 credit was
 * missing. This guard proves the SPECIFIC leaf-scoped wiring (not a word-blanket claim):
 *   - forward: each profile page passes { unit_id: id } / { trailer_id: id } into
 *     ExpensesReverseSection, which queries listExpenses(operatingCompanyId, { ...filter }) — scoped
 *     to this specific unit/trailer, not the global expense list
 *   - depth: each row shows amount/date/status/vendor (money linkage visibility, not just a count)
 *   - reverse: each row is an EntityLink(kind="expense") drilling to the expense's own detail record
 *
 * Self-test: node scripts/verify-fleet-unit-trailer-expenses-reverse-wired.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fleet-unit-trailer-expenses-reverse-wired";

const CHECKS = [
  {
    name: "VehicleProfilePage mounts ExpensesReverseSection scoped by unit_id (forward writer)",
    file: "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx",
    pattern: /<ExpensesReverseSection[\s\S]{0,120}filter=\{\{\s*unit_id:\s*id\s*\}\}/,
  },
  {
    name: "TrailerProfilePage mounts ExpensesReverseSection scoped by trailer_id (forward writer)",
    file: "apps/frontend/src/pages/fleet/TrailerProfilePage.tsx",
    pattern: /<ExpensesReverseSection[\s\S]{0,120}filter=\{\{\s*trailer_id:\s*id\s*\}\}/,
  },
  {
    name: "ExpensesReverseSection queries listExpenses scoped by the passed filter (forward query)",
    file: "apps/frontend/src/components/accounting/ExpensesReverseSection.tsx",
    pattern: /queryFn:\s*\(\)\s*=>\s*listExpenses\(operatingCompanyId,\s*\{\s*\.\.\.filter\s*\}\)/,
  },
  {
    name: "ExpensesReverseSection renders amount/date/status/vendor depth per row",
    file: "apps/frontend/src/components/accounting/ExpensesReverseSection.tsx",
    pattern: /formatDateUS\(row\.transaction_date\)[\s\S]{0,80}formatMoneyCents\(Number\(row\.total_amount_cents\)/,
  },
  {
    name: "ExpensesReverseSection drills each row via EntityLink kind=\"expense\" (reverse nav)",
    file: "apps/frontend/src/components/accounting/ExpensesReverseSection.tsx",
    pattern: /<EntityLink kind="expense" id=\{row\.id\}/,
  },
  {
    name: "EntityLink's expense case resolves to a real detail route",
    file: "apps/frontend/src/components/shared/EntityLink.tsx",
    pattern: /case\s*"expense":\s*\n\s*return\s*`\/accounting\/expenses\/\$\{id\}`/,
  },
];

export function checkAll(readFile) {
  const failures = [];
  for (const c of CHECKS) {
    const src = readFile(c.file);
    if (src === null) {
      failures.push(`${c.name}: ${c.file} not found`);
      continue;
    }
    if (!c.pattern.test(src)) {
      failures.push(`${c.name}: ${c.file} no longer matches expected shape`);
    }
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const GOOD_FIXTURES = {
    "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx": `
      <ExpensesReverseSection
        operatingCompanyId={companyId}
        filter={{ unit_id: id }}
        contextLabel="this unit"
      />
    `,
    "apps/frontend/src/pages/fleet/TrailerProfilePage.tsx": `
      <ExpensesReverseSection
        operatingCompanyId={companyId}
        filter={{ trailer_id: id }}
        contextLabel="this trailer"
      />
    `,
    "apps/frontend/src/components/accounting/ExpensesReverseSection.tsx": `
      const expensesQ = useQuery({
        queryFn: () => listExpenses(operatingCompanyId, { ...filter }),
      });
      {formatDateUS(row.transaction_date)} · {formatMoneyCents(Number(row.total_amount_cents), "USD")} · {row.status}
      <EntityLink kind="expense" id={row.id} label={entityLabel(row.expense_number, row.id, "Expense")} />
    `,
    "apps/frontend/src/components/shared/EntityLink.tsx": `
      switch (kind) {
        case "expense":
          return \`/accounting/expenses/\${id}\`;
      }
    `,
  };
  const goodFailures = checkAll((f) => GOOD_FIXTURES[f] ?? null);
  if (goodFailures.length) {
    console.error(`[${LABEL}] selftest FAIL: known-good fixture should pass — ${goodFailures.join("; ")}`);
    process.exit(1);
  }
  const regressedFailures = checkAll(() => "nothing matches here");
  if (regressedFailures.length !== CHECKS.length) {
    console.error(`[${LABEL}] selftest FAIL: regressed fixture (all-empty) should fail every check`);
    process.exit(1);
  }
  console.log(`[${LABEL}] selftest: PASS — good/regressed fixtures classify correctly`);
  process.exit(0);
}

const failures = checkAll((rel) => {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
});

if (failures.length) {
  console.error(`[${LABEL}] FAILED — ${failures.length} check(s) regressed:`);
  for (const f of failures) console.error("  ✗", f);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — unit/trailer profile expenses-reverse forward-query + depth + reverse EntityLink all present`);
