#!/usr/bin/env node
/**
 * ACCT-F68 — the QBO items pull must ADOPT an unclaimed local item rather than insert a twin.
 *
 * WHY THIS EXISTS (prod br-fancy-credit-akjnd07a, 2026-08-01):
 * catalogs.items carries TWO unique indexes with different shapes —
 *   uq_items_company_qbo_item_id (operating_company_id, qbo_item_id) WHERE qbo_item_id IS NOT NULL
 *   uq_items_company_item_name   (operating_company_id, item_name)                    [NOT partial]
 * The puller's ON CONFLICT targets the PARTIAL one, so a locally-created row (qbo_item_id NULL) can
 * never match it; the statement falls through to a fresh INSERT and collides with the NAME index.
 * qbo_sync.step.items_pull and .items_reconcile both showed last_successful_run_at = NULL with
 * "duplicate key value violates unique constraint uq_items_company_item_name" — NO QBO item has ever
 * reached catalogs.items for TRANSP. Live shape: 190 items / 180 with a qbo_item_id / 190 distinct
 * names, so the 10 unclaimed rows are the collision surface, and they are the core revenue items
 * (Linehaul Service, Fuel Surcharge, Detention, Layover, Lumper, Relay fuel).
 *
 * WHY ADOPTION AND NOT A RENAME: the local row is the SAME product the operator created by hand.
 * Adoption keeps its id, so existing foreign-key references stay valid — accounting.invoice_lines resolves revenue via
 * catalogs.items.default_income_account_id, and inserting a twin would strand lines on an orphaned
 * item while the QBO-linked copy held the mapping. Renaming to dodge the constraint would silently
 * diverge the operator's catalogue from QuickBooks.
 *
 * THE SAFETY PROPERTY THIS GUARD PROTECTS: only an UNCLAIMED row may be adopted. Dropping the
 * `qbo_item_id IS NULL` predicate would let one QBO item steal a row already bound to another —
 * silent cross-item rebinding of revenue mappings. It is a one-clause deletion that looks like
 * cleanup, so it is exactly what a guard is for.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SVC = "apps/backend/src/qbo-sync/items-puller.ts";
const LABEL = "verify-items-pull-adopts-local-row";

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1").replace(/--[^\n]*/g, "");
}

// ACCT-F4431380 (Lead 443.137 item 9e) — OLD: asserted the puller's catalogs.items ADOPT step (unclaimed
// predicate, entity scope, short-circuit before the INSERT). NEW: asserts the puller writes NO catalogs.items
// row at all (no adopt UPDATE, no INSERT, no PULLER_UPSERT_ITEM_SQL) and still fills its mirror
// mdata.qbo_items. WHY: QuickBooks is a read-only archive; the native write was removed and the reconciler
// refuses by name. "Adopt only unclaimed rows" is subsumed by "never touch catalogs.items": a puller that
// cannot write the native catalog cannot rebind a revenue mapping.
export function auditPuller(src) {
  const code = stripComments(src);
  const problems = [];
  const write = /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+catalogs\.items\b/i.exec(code);
  if (write) {
    problems.push(
      `${SVC}: writes catalogs.items (\`${write[0]}\`). A QBO pull must write only mdata.qbo_items — ` +
        `adopting or inserting a native item from QuickBooks is forbidden (ACCT-F4431380).`
    );
  }
  if (/PULLER_UPSERT_ITEM_SQL|items-write-sql/.test(code)) {
    problems.push(`${SVC}: references the removed QBO item write SQL (PULLER_UPSERT_ITEM_SQL / items-write-sql).`);
  }
  if (!/INSERT\s+INTO\s+mdata\.qbo_items\b/i.test(code)) {
    problems.push(`${SVC}: no INSERT INTO mdata.qbo_items — the pull no longer fills its mirror (instrument/anchor lost).`);
  }
  return problems;
}

function auditTree() {
  return auditPuller(readFileSync(join(ROOT, SVC), "utf8"));
}

function selftest() {
  const failures = [];
  const mirror = `await client.query(\`INSERT INTO mdata.qbo_items (operating_company_id, qbo_id) VALUES ($1,$2)\`);`;
  // ACCT-F4431380 — plants are now the forbidden native writes; the mirror-only shape must pass.
  const adoptPlant = mirror + `
    const adopted = await client.query(\`UPDATE catalogs.items SET qbo_item_id = $3 WHERE operating_company_id = $1 AND item_name = $2 AND qbo_item_id IS NULL RETURNING id\`);
    if (adopted.rowCount) return;`;
  if (!auditPuller(adoptPlant).some((p) => p.includes("writes catalogs.items")))
    failures.push("case1 FAIL — a planted catalogs.items adopt UPDATE was NOT caught");
  const insertPlant = mirror + `await client.query(\`INSERT INTO catalogs.items (operating_company_id) VALUES ($1)\`);`;
  if (!auditPuller(insertPlant).some((p) => p.includes("writes catalogs.items")))
    failures.push("case2 FAIL — a planted INSERT INTO catalogs.items was NOT caught");
  const constPlant = mirror + `await client.query(PULLER_UPSERT_ITEM_SQL, [operatingCompanyId]);`;
  if (!auditPuller(constPlant).some((p) => p.includes("removed QBO item write SQL")))
    failures.push("case3 FAIL — a re-introduced PULLER_UPSERT_ITEM_SQL call was NOT caught");
  const noMirror = `await someOtherHelper();`;
  if (!auditPuller(noMirror).some((p) => p.includes("no INSERT INTO mdata.qbo_items")))
    failures.push("case4 FAIL — a puller with no mirror write did NOT fail (instrument would be blind)");
  const commentOnly = mirror + `\n// formerly: INSERT INTO catalogs.items ...\n`;
  if (auditPuller(commentOnly).length !== 0) failures.push("case5 FAIL — a comment-only mention was flagged");
  // Real-file plant: the actual puller with an adopt UPDATE appended must fail.
  const real = readFileSync(join(ROOT, SVC), "utf8");
  if (!auditPuller(real + "\nconst P = `UPDATE catalogs.items SET qbo_item_id = $2 WHERE id = $1`;\n").length)
    failures.push("case6 FAIL — real puller with a planted catalogs.items UPDATE was NOT caught");
  const tree = auditTree();
  if (tree.length !== 0) failures.push(`case7 FAIL — real source flagged: ${tree.join(" | ")}`);
  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS — planted adopt/insert/const writes caught, missing mirror caught, comment ignored, real tree clean`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — the items pull writes only mdata.qbo_items; it never adopts, inserts or updates a catalogs.items row`);
}

main();
