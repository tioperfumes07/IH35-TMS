#!/usr/bin/env node
// verify-banking-uncategorized-kpi-parity (0519-fl1) — locks the BANKING-1 fix so the Banking Home
// "UNCATEGORIZED" headline KPI and the Transactions "For review" queue can never re-diverge.
//
// The original defect (manifest 0519-fl1): the KPI summed views.banking_account_tiles.uncategorized_count
// (status='uncategorized' ONLY) and read 0, while the For-review queue listed BOTH statuses
// ('pending_categorization' OR 'uncategorized') and held thousands of rows — so a real ~2,650-row backlog
// showed as "UNCATEGORIZED: 0". Fixed in #2230 by making BOTH surfaces derive from the single predicate
// in apps/backend/src/banking/pending-categorization.ts. This guard asserts that single-source wiring
// stays in place (the fix shipped with a unit test but no static CI guard — §2 requires one).
//
// Self-test: node scripts/verify-banking-uncategorized-kpi-parity.mjs --selftest
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHARED = "apps/backend/src/banking/pending-categorization.ts";
const KPI = "apps/backend/src/banking/banking.routes.ts"; // Banking Home headline
const QUEUE = "apps/backend/src/banking/categorization.routes.ts"; // "For review" queue

// Pure checks over the three files' text — takes an object so --selftest can inject fixtures.
export function check({ shared, kpi, queue }) {
  const f = [];

  // 1) The shared single-source module must define the two-status predicate and export both helpers.
  if (!/PENDING_CATEGORIZATION_STATUSES\s*=\s*\[\s*["']pending_categorization["']\s*,\s*["']uncategorized["']/.test(shared))
    f.push(`${SHARED}: must define PENDING_CATEGORIZATION_STATUSES = ["pending_categorization","uncategorized"] (both statuses)`);
  if (!/status\s*=\s*'pending_categorization'\s*OR\s*\$\{alias\}\.status\s*=\s*'uncategorized'/.test(shared))
    f.push(`${SHARED}: pendingCategorizationPredicate must match BOTH 'pending_categorization' OR 'uncategorized' rows`);
  if (!/export\s+function\s+pendingCategorizationPredicate/.test(shared))
    f.push(`${SHARED}: must export pendingCategorizationPredicate (shared by the For-review queue)`);
  if (!/export\s+async\s+function\s+countUncategorizedTransactions/.test(shared))
    f.push(`${SHARED}: must export countUncategorizedTransactions (shared by the Banking Home KPI)`);

  // 2) The Banking Home headline KPI must derive from the shared count, NOT solely from the tile view's
  //    uncategorized-only column (the original bug).
  if (!/countUncategorizedTransactions/.test(kpi))
    f.push(`${KPI}: the UNCATEGORIZED headline must call countUncategorizedTransactions (single source) — not re-derive from banking_account_tiles.uncategorized_count alone`);

  // 3) The For-review queue must derive from the shared predicate.
  if (!/pendingCategorizationPredicate/.test(queue))
    f.push(`${QUEUE}: the "For review" queue must build its filter from pendingCategorizationPredicate (single source)`);

  return f;
}

export function run() {
  const read = (rel) => {
    try {
      return fs.readFileSync(path.join(ROOT, rel), "utf8");
    } catch {
      return null;
    }
  };
  const shared = read(SHARED);
  const kpi = read(KPI);
  const queue = read(QUEUE);
  const missing = [];
  if (shared === null) missing.push(`${SHARED} not found`);
  if (kpi === null) missing.push(`${KPI} not found`);
  if (queue === null) missing.push(`${QUEUE} not found`);
  if (missing.length) return missing;
  return check({ shared, kpi, queue });
}

if (process.argv.includes("--selftest")) {
  const goodShared = `
    export const PENDING_CATEGORIZATION_STATUSES = ["pending_categorization", "uncategorized"] as const;
    export function pendingCategorizationPredicate(alias = "bt") {
      return \`(\${alias}.status = 'pending_categorization' OR \${alias}.status = 'uncategorized')\`;
    }
    export async function countUncategorizedTransactions(client, id) { return 0; }
  `;
  const goodKpi = `import { countUncategorizedTransactions } from "./pending-categorization.js";
    const uncategorizedCount = await countUncategorizedTransactions(client, companyId);`;
  const goodQueue = `import { pendingCategorizationPredicate } from "./pending-categorization.js";
    return pendingCategorizationPredicate("bt");`;

  const checks = [
    ["healthy single-source wiring passes", check({ shared: goodShared, kpi: goodKpi, queue: goodQueue }).length === 0],
    [
      "regressed KPI (tile-only, no shared count) caught",
      check({ shared: goodShared, kpi: `const n = SUM(uncategorized_count);`, queue: goodQueue }).some((x) => x.includes("banking.routes.ts")),
    ],
    [
      "regressed queue (drops shared predicate) caught",
      check({ shared: goodShared, kpi: goodKpi, queue: `const w = "status = 'uncategorized'";` }).some((x) => x.includes("categorization.routes.ts")),
    ],
    [
      "single-status predicate regression caught",
      check({
        shared: goodShared.replace(/, ["']uncategorized["']/, "").replace(/\s*OR\s*\$\{alias\}\.status = 'uncategorized'/, ""),
        kpi: goodKpi,
        queue: goodQueue,
      }).length > 0,
    ],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error("verify:banking-uncategorized-kpi-parity --selftest FAIL:");
    for (const [n] of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`verify:banking-uncategorized-kpi-parity --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const f = run();
  if (f.length) {
    console.error("verify:banking-uncategorized-kpi-parity FAIL:");
    for (const x of f) console.error("  ✗ " + x);
    process.exit(1);
  }
  console.log("verify:banking-uncategorized-kpi-parity PASS");
}
