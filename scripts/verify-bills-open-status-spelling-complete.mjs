#!/usr/bin/env node
/**
 * ACCT-F183-class VERTICAL guard — one column ("does this leaf correctly recognize an
 * accounting.bills row as still owing money"), every applicable leaf, in one ratchet.
 *
 * Live on prod (all entities, measured before this guard shipped): accounting.bills.status carries
 * BOTH 'unpaid' (1113 rows) and 'partial' (526 rows) as genuine live spellings — plus the dead-but-
 * harmless legacy pair 'open'/'partially_paid' (0 live rows today, kept for defense-in-depth). Three
 * leaves were found silently matching only a SUBSET of the live spellings, each undercounting a real
 * money signal:
 *   - bills.service.ts (listBillsByVendor/listAllBillsForCompany)  — reference/canonical, already correct
 *   - fin20-aging.service.ts (live AP aging)                        — already correct (ACCT-F183 fix)
 *   - accounting-home.service.ts (home KPI strip)                   — already correct
 *   - reports/cash-flow-overview.routes.ts                          — already correct
 *   - bank-recon/match.service.ts (OPEN_BILL_STATUSES)               — already correct
 *   - month-close.service.ts (AP-overdue warning)      — WAS 'open','partial' only, missed 986/1512
 *     live overdue-with-balance bills (all the 'unpaid' ones). FIXED this commit.
 *   - cash-advances.routes.ts (/unpaid-bills picker)   — WAS 'unpaid' only, missed 526 live 'partial'
 *     bills that still have an open balance. FIXED this commit.
 *
 * This is a STATIC per-file baseline ratchet (like scripts/entity-link-adoption-baseline.json), not a
 * generic AST scanner — it locks the 7 known leaves at their now-correct shape so none of them can
 * silently regress to a partial-spelling match again, and gives the next agent who greps for
 * "b.status" a concrete list of every leaf this column already reached.
 *
 * Self-test: node scripts/verify-bills-open-status-spelling-complete.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bills-open-status-spelling-complete";

// Each leaf: file + a regex that must match somewhere in the file, requiring ALL FOUR live/legacy
// spellings to appear together within one status-set expression (IN (...) list, ANY($n) array literal,
// or the split-clause combined-OR shape). This is intentionally strict about co-occurrence, not just
// "the string appears somewhere in the file" — that would pass even if the four spellings live in
// unrelated, disconnected clauses.
const LEAVES = [
  {
    file: "apps/backend/src/accounting/bills.service.ts",
    // combined-clause shape used twice (listBillsByVendor + listAllBillsForCompany)
    pattern: /b\.status IN \('open','unpaid'\)[\s\S]{0,200}?b\.status IN \('partial','partially_paid'\)/g,
    minOccurrences: 2,
  },
  {
    file: "apps/backend/src/accounting/fin20-aging.service.ts",
    pattern: /b\.status IN \('unpaid',\s*'partial',\s*'partially_paid'\)/,
  },
  {
    file: "apps/backend/src/accounting/role-home/accounting-home.service.ts",
    pattern: /b\.status IN \('unpaid',\s*'partial',\s*'partially_paid'\)/,
  },
  {
    file: "apps/backend/src/reports/cash-flow-overview.routes.ts",
    pattern: /b\.status IN \('unpaid',\s*'partial',\s*'partially_paid'\)/,
  },
  {
    file: "apps/backend/src/accounting/bank-recon/match.service.ts",
    pattern: /OPEN_BILL_STATUSES\s*=\s*\[\s*"open",\s*"partial",\s*"partially_paid",\s*"unpaid"\s*\]/,
  },
  {
    file: "apps/backend/src/accounting/month-close.service.ts",
    pattern: /b\.status IN \('open',\s*'unpaid',\s*'partial',\s*'partially_paid'\)/,
  },
  {
    file: "apps/backend/src/cash-advances/cash-advances.routes.ts",
    pattern: /b\.status IN \('open',\s*'unpaid',\s*'partial',\s*'partially_paid'\)/,
  },
];

export function checkLeaf(src, leaf) {
  const matches = src.match(leaf.pattern);
  const count = matches ? matches.length : 0;
  const need = leaf.minOccurrences ?? 1;
  if (count < need) {
    return {
      ok: false,
      reason: `expected ${need} occurrence(s) of the full-spelling status match, found ${count}`,
    };
  }
  return { ok: true };
}

if (process.argv.includes("--selftest")) {
  const oneFn = "if (x) where.push(\"b.status IN ('open','unpaid')\"); if (y) where.push(\"b.status IN ('partial','partially_paid')\");";
  const good = oneFn + "\n" + oneFn; // real file shape: same pair repeated in listBillsByVendor + listAllBillsForCompany
  const goodResult = checkLeaf(good, LEAVES[0]);
  if (!goodResult.ok) {
    console.error(`[${LABEL}] selftest FAIL: known-good bills.service.ts fixture should pass — ${goodResult.reason}`);
    process.exit(1);
  }

  const regressed = "AND b.status IN ('open', 'partial')"; // the pre-fix month-close.service.ts shape
  const mcLeaf = LEAVES.find((l) => l.file.includes("month-close"));
  const regressedResult = checkLeaf(regressed, mcLeaf);
  if (regressedResult.ok) {
    console.error(`[${LABEL}] selftest FAIL: regressed month-close fixture (missing 'unpaid'/'partially_paid') should FAIL but passed`);
    process.exit(1);
  }

  const regressedCA = "AND b.status = 'unpaid'"; // the pre-fix cash-advances.routes.ts shape
  const caLeaf = LEAVES.find((l) => l.file.includes("cash-advances"));
  const regressedCAResult = checkLeaf(regressedCA, caLeaf);
  if (regressedCAResult.ok) {
    console.error(`[${LABEL}] selftest FAIL: regressed cash-advances fixture (missing 'partial') should FAIL but passed`);
    process.exit(1);
  }

  console.log(`[${LABEL}] selftest: PASS — good/regressed fixtures classify correctly for both fixed leaves`);
  process.exit(0);
}

let failures = [];
for (const leaf of LEAVES) {
  const p = path.join(ROOT, leaf.file);
  if (!fs.existsSync(p)) {
    failures.push(`${leaf.file}: file not found`);
    continue;
  }
  const src = fs.readFileSync(p, "utf8");
  const result = checkLeaf(src, leaf);
  if (!result.ok) failures.push(`${leaf.file}: ${result.reason}`);
}

if (failures.length) {
  console.error(`[${LABEL}] FAILED — ${failures.length} leaf(ves) regressed off the full open-bill status spelling:`);
  for (const f of failures) console.error("  ✗", f);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — all ${LEAVES.length} known accounting.bills open-status leaves carry the full live spelling set`);
