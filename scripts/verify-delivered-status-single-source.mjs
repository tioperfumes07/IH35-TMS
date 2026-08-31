#!/usr/bin/env node
/**
 * DELIVERY-EVIDENCE-SINGLE-SOURCE — delivery-evidence predicate lives in ONE leaf module.
 *
 * Canonical: apps/backend/src/dispatch/delivery-evidence-status.ts
 *   isDeliveryEvidenceStatus · FACTORING_PATH_LOAD_MDATA_STATUSES
 *
 * WHY: four revenue-path call sites regressed to legacy cohort A
 *   ('delivered','invoiced','paid','closed') or substring .includes("delivered") while the product
 *   writes delivered_pending_docs / completed_docs_received. Factoring queue showed 1 of 19 loads.
 *
 * FAIL when any backend TS file outside the canonical + exempt set:
 *   (a) inlines legacy cohort A in SQL/arrays (bare 'delivered' with invoiced/paid/closed)
 *   (b) re-declares DELIVERY_EVIDENCE_STATUSES / DELIVERY_EVIDENCE_MDATA_STATUSES locally
 *   (c) substring-matches load status (.includes("deliver") / LIKE '%deliver%' on status)
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(ROOT, "apps/backend/src");
const CANONICAL = "apps/backend/src/dispatch/delivery-evidence-status.ts";
const LABEL = "verify-delivered-status-single-source";

/** Files allowed to mention every enum member including legacy `delivered`. */
const EXEMPT_RELS = new Set([
  CANONICAL,
  "apps/backend/src/dispatch/load-state-machine.ts",
  "apps/backend/src/dispatch/loads.routes.ts",
  "apps/backend/src/mdata/loads.routes.ts",
  "apps/backend/src/driver/loads.routes.ts",
  "apps/backend/src/seed/csv-seed-import.ts",
  "apps/backend/src/integrations/edi/edi.routes.ts",
]);

/** Legacy cohort A — the product stopped writing bare `delivered`. */
const LEGACY_COHORT_A =
  /(?:IN\s*\(|=\s*ANY\s*\([^)]*\)|\[\s*|,\s*)['"]delivered['"]\s*,\s*['"]invoiced['"]\s*,\s*['"]paid['"]\s*,\s*['"]closed['"]/i;

const REDECLARE_EVIDENCE =
  /(?:^|\n)\s*(?:export\s+)?const\s+DELIVERY_EVIDENCE_(?:MDATA_)?STATUSES\s*=/;

/** Status substring tests — correct by accident on delivered_pending_docs. */
const STATUS_SUBSTRING =
  /(?:load\?\.status|load\.status|row\.status|l\.status)[\s\S]{0,80}\.includes\s*\(\s*["']deliver/i;

const STATUS_LIKE =
  /status::text\s+LIKE\s+['"]%deliver%/i;

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === "dist") continue;
      walk(full, out);
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

export function auditFile(rel, code) {
  const problems = [];
  if (EXEMPT_RELS.has(rel)) return problems;
  const stripped = stripComments(code);
  if (LEGACY_COHORT_A.test(stripped)) {
    problems.push(`${rel} inlines legacy cohort A ('delivered','invoiced','paid','closed') — import delivery-evidence-status.ts`);
  }
  if (REDECLARE_EVIDENCE.test(stripped)) {
    problems.push(`${rel} re-declares DELIVERY_EVIDENCE_STATUSES — import delivery-evidence-status.ts`);
  }
  if (STATUS_SUBSTRING.test(stripped)) {
    problems.push(`${rel} substring-matches load status (.includes("deliver")) — use isDeliveryEvidenceStatus()`);
  }
  if (STATUS_LIKE.test(stripped)) {
    problems.push(`${rel} uses LIKE '%deliver%' on status — use isDeliveryEvidenceStatus()`);
  }
  return problems;
}

export function auditTree(root = ROOT) {
  const problems = [];
  for (const full of walk(join(root, "apps/backend/src"))) {
    const rel = relative(root, full);
    problems.push(...auditFile(rel, readFileSync(full, "utf8")));
  }
  return problems;
}

function selftest() {
  const failures = [];

  const legacyFixture = `
    await client.query("SELECT 1 FROM mdata.loads l WHERE l.status IN ('delivered', 'invoiced', 'paid', 'closed')");
  `;
  if (auditFile("apps/backend/src/factoring/packet-assemble.service.ts", legacyFixture).length === 0) {
    failures.push("case1 FAIL — legacy cohort A IN list was NOT caught");
  }

  const redeclareFixture = `
    export const DELIVERY_EVIDENCE_STATUSES = new Set(["delivered_pending_docs"]);
  `;
  if (auditFile("apps/backend/src/dispatch/stamp-final-delivery-departure.ts", redeclareFixture).length === 0) {
    failures.push("case2 FAIL — local DELIVERY_EVIDENCE_STATUSES re-declaration was NOT caught");
  }

  const substringFixture = `
    actual: String(load?.status ?? "").includes("delivered") ? "Delivered" : "In progress",
  `;
  if (auditFile("apps/backend/src/accounting/invoice-render.routes.ts", substringFixture).length === 0) {
    failures.push("case3 FAIL — status .includes('delivered') was NOT caught");
  }

  const canonicalFixture = `
    export const DELIVERY_EVIDENCE_MDATA_STATUSES = ["delivered_pending_docs", "completed_docs_received"] as const;
    export function isDeliveryEvidenceStatus(status: string) { return true; }
  `;
  if (auditFile(CANONICAL, canonicalFixture).length !== 0) {
    failures.push(`case4 FAIL — canonical file was flagged: ${auditFile(CANONICAL, canonicalFixture).join(" | ")}`);
  }

  const exemptSm = `
    if (status === "delivered") return "delivered_pending_docs";
    const allowedTransitions = { in_transit: ["delivered_pending_docs"] };
  `;
  if (auditFile("apps/backend/src/dispatch/load-state-machine.ts", exemptSm).length !== 0) {
    failures.push(`case5 FAIL — load-state-machine exempt file was flagged`);
  }

  const cleanFixture = `
    import { isDeliveryEvidenceStatus, FACTORING_PATH_LOAD_MDATA_STATUSES } from "../dispatch/delivery-evidence-status.js";
    AND l.status::text = ANY($2::text[])
  `;
  if (auditFile("apps/backend/src/dispatch/factoring-queue.routes.ts", cleanFixture).length !== 0) {
    failures.push(`case6 FAIL — clean import path was flagged: ${auditFile("apps/backend/src/dispatch/factoring-queue.routes.ts", cleanFixture).join(" | ")}`);
  }

  const tree = auditTree();
  if (tree.length !== 0) {
    failures.push(`case7 FAIL — real tree flagged: ${tree.join(" | ")}`);
  }

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(
    `${LABEL}: selftest PASS — legacy cohort, re-declaration, and status substring caught; canonical + exempt clean`
  );
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — delivery evidence predicate imported from ${CANONICAL} only`);
}

main();
