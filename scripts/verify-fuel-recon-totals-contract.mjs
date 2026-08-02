#!/usr/bin/env node
/**
 * RPT-F02 — the fuel-reconciliation totals payload must carry the keys the page actually reads.
 *
 * The totals block named its money fields differently from the by_truck rows in the SAME payload:
 * rows carried card_amount_cents / wo_amount_cents, totals carried fuel_card_amount_cents /
 * wo_fuel_amount_cents. FuelReconciliationPage read the row-shaped names for both, so the headline
 * tiles resolved to undefined and rendered $0 over real data — while the Delta tile rendered
 * $60,159.10 correctly, because delta_cents happened to match on both sides.
 *
 * A silent $0 beside a correct figure is worse than an error: it reads as a real number. TypeScript
 * could not catch it because the response is untyped at the fetch boundary.
 *
 * unmatched_count was never a rename — the server only ever returned unmatched_card_count and
 * unmatched_wo_count, two halves of a number the UI wanted as one. It is now returned as the sum,
 * with both halves retained.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ROUTE = "apps/backend/src/reports/fuel-reconciliation.routes.ts";
const PAGE = "apps/frontend/src/pages/reports/FuelReconciliationPage.tsx";
const LABEL = "verify-fuel-recon-totals-contract";

export function audit(routeSrc, pageSrc) {
  const problems = [];
  const totals = /totals:\s*\{([\s\S]*?)\n\s{8}\},/.exec(routeSrc);
  if (!totals) {
    return [`${ROUTE}: could not locate the totals block — this guard's anchor is gone, re-point it.`];
  }
  const served = new Set(
    [...totals[1].matchAll(/^\s*([a-z_][a-z0-9_]*)\s*[:,]/gim)].map((m) => m[1])
  );
  const read = new Set([...pageSrc.matchAll(/\.totals\.([a-z_][a-z0-9_]*)/g)].map((m) => m[1]));
  for (const key of read) {
    if (!served.has(key)) {
      problems.push(
        `${PAGE} reads totals.${key}, which ${ROUTE} does not return. The tile renders $0/0 over real ` +
          `data — silently, because the response is untyped at the fetch boundary and undefined ` +
          `formats as zero rather than throwing.`
      );
    }
  }
  return problems;
}

function auditTree() {
  return audit(readFileSync(join(ROOT, ROUTE), "utf8"), readFileSync(join(ROOT, PAGE), "utf8"));
}

function selftest() {
  const failures = [];
  if (auditTree().length !== 0) failures.push(`case0 FAIL — real source flagged: ${auditTree().join(" | ")}`);
  const bad = `        totals: {\n          fuel_card_amount_cents: x,\n          delta_cents: y,\n        },\n`;
  if (!audit(bad, "query.data.totals.card_amount_cents").some((p) => p.includes("card_amount_cents")))
    failures.push("case1 FAIL — a key the page reads but the route omits was NOT caught");
  const good = `        totals: {\n          card_amount_cents: x,\n          delta_cents: y,\n        },\n`;
  if (audit(good, "query.data.totals.card_amount_cents").length !== 0)
    failures.push("case2 FAIL — a served key was wrongly flagged");
  if (failures.length) { for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`); process.exit(1); }
  console.log(`${LABEL}: selftest PASS — missing totals key caught, served key passes`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = auditTree();
  if (problems.length) { for (const p of problems) console.error(`  ✗ ${p}`); process.exit(1); }
  console.log(`${LABEL} OK — every totals key the page reads is served by the route`);
}
main();
