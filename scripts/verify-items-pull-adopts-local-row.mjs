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
 * Adoption keeps its id, so existing FKs stay valid — accounting.invoice_lines resolves revenue via
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

export function auditPuller(src) {
  const code = stripComments(src);
  const problems = [];
  const upd = /UPDATE\s+catalogs\.items[\s\S]*?RETURNING/i.exec(code);
  if (!upd) {
    problems.push(
      `${SVC}: no adopt step. A QBO item whose name matches an unclaimed local row falls through to an ` +
        `INSERT that violates uq_items_company_item_name, and the whole items pull never succeeds.`
    );
    return problems;
  }
  const adopt = upd[0];
  if (!/qbo_item_id\s+IS\s+NULL/i.test(adopt)) {
    problems.push(
      `${SVC}: the adopt UPDATE does not require qbo_item_id IS NULL. Without it a QBO item can adopt ` +
        `a row already bound to a DIFFERENT QBO item, silently rebinding revenue mappings.`
    );
  }
  if (!/item_name\s*=/.test(adopt)) {
    problems.push(`${SVC}: the adopt UPDATE does not match on item_name — name is the natural key that collides.`);
  }
  if (!/operating_company_id\s*=/.test(adopt)) {
    problems.push(`${SVC}: the adopt UPDATE is not entity-scoped — it could adopt another company's item.`);
  }
  // Adoption must SHORT-CIRCUIT, or the insert still runs and still collides.
  //
  // ACCT-F83 — this check was FAIL-OPEN for one commit and the fix is the anchor below. It located the
  // insert with `code.indexOf("INSERT INTO catalogs.items")`. When ACCT-F83 moved that SQL into
  // items-write-sql.ts, indexOf returned -1, `slice(start, -1)` silently became "everything after the
  // adopt", and the `return` inside pullItemsFromQbo satisfied the test from anywhere in the file. The
  // guard would have reported OK with the short-circuit deleted. A missing anchor must FAIL, never
  // widen the search — that is the difference between a guard and a decoration.
  const tail = code.slice(code.indexOf(adopt) + adopt.length);
  const insertAnchor = /await\s+client\.query\(\s*PULLER_UPSERT_ITEM_SQL|INSERT\s+INTO\s+catalogs\.items/i.exec(tail);
  if (!insertAnchor) {
    problems.push(
      `${SVC}: could not locate the insert that follows adoption (neither an inline INSERT INTO ` +
        `catalogs.items nor a PULLER_UPSERT_ITEM_SQL call). The short-circuit check cannot run, so this ` +
        `guard would be fail-open — re-anchor it to wherever the insert now lives.`
    );
    return problems;
  }
  const after = tail.slice(0, insertAnchor.index);
  if (!/return\b/.test(after)) {
    problems.push(`${SVC}: adoption does not short-circuit before the INSERT — the colliding insert would still run.`);
  }
  return problems;
}

function auditTree() {
  return auditPuller(readFileSync(join(ROOT, SVC), "utf8"));
}

function selftest() {
  const failures = [];
  const noAdopt = `await client.query(\`INSERT INTO catalogs.items (operating_company_id) VALUES ($1) ON CONFLICT (operating_company_id, qbo_item_id) WHERE qbo_item_id IS NOT NULL DO UPDATE SET x=1\`);`;
  if (auditPuller(noAdopt).length === 0) failures.push("case1 FAIL — a puller with no adopt step was NOT caught");

  const unsafe = `
    const adopted = await client.query(\`UPDATE catalogs.items SET qbo_item_id = $3 WHERE operating_company_id = $1 AND item_name = $2 RETURNING id\`);
    if (adopted.rowCount) return;
    await client.query(\`INSERT INTO catalogs.items (operating_company_id) VALUES ($1)\`);
  `;
  if (!auditPuller(unsafe).some((p) => p.includes("does not require qbo_item_id IS NULL")))
    failures.push("case2 FAIL — an adopt without the unclaimed predicate was NOT caught");

  const noShortCircuit = `
    const adopted = await client.query(\`UPDATE catalogs.items SET qbo_item_id = $3 WHERE operating_company_id = $1 AND item_name = $2 AND qbo_item_id IS NULL RETURNING id\`);
    await client.query(\`INSERT INTO catalogs.items (operating_company_id) VALUES ($1)\`);
  `;
  if (!auditPuller(noShortCircuit).some((p) => p.includes("short-circuit")))
    failures.push("case3 FAIL — adoption without a short-circuit was NOT caught");

  // ACCT-F83 case 3b — the same omission, expressed against the CURRENT shape where the insert lives
  // behind PULLER_UPSERT_ITEM_SQL. Without this case, case3 alone would keep passing on a file that no
  // longer contains a literal INSERT, which is precisely how this guard went fail-open.
  const noShortCircuitConst = `
    const adopted = await client.query(\`UPDATE catalogs.items SET qbo_item_id = $3 WHERE operating_company_id = $1 AND item_name = $2 AND qbo_item_id IS NULL RETURNING id\`);
    await client.query(PULLER_UPSERT_ITEM_SQL, [operatingCompanyId]);
  `;
  if (!auditPuller(noShortCircuitConst).some((p) => p.includes("short-circuit")))
    failures.push("case3b FAIL — missing short-circuit was NOT caught when the insert sits behind PULLER_UPSERT_ITEM_SQL");

  // ACCT-F83 case 3c — if the insert anchor disappears entirely, the guard must SAY SO rather than
  // silently widening its search window and passing.
  const noAnchor = `
    const adopted = await client.query(\`UPDATE catalogs.items SET qbo_item_id = $3 WHERE operating_company_id = $1 AND item_name = $2 AND qbo_item_id IS NULL RETURNING id\`);
    if (adopted.rowCount) return;
    await someOtherHelper();
  `;
  if (!auditPuller(noAnchor).some((p) => p.includes("fail-open")))
    failures.push("case3c FAIL — a missing insert anchor did NOT raise the fail-open warning");

  const tree = auditTree();
  if (tree.length !== 0) failures.push(`case4 FAIL — real source flagged: ${tree.join(" | ")}`);
  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS — missing adopt caught, unclaimed-predicate removal caught, missing short-circuit caught`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — the items pull adopts only UNCLAIMED local rows, entity-scoped, and short-circuits the insert`);
}

main();
