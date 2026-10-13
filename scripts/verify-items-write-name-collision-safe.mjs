#!/usr/bin/env node
/**
 * ACCT-F83 — every QBO-sourced write of catalogs.items.item_name must prove the name is FREE first.
 *
 * WHY THIS EXISTS (verified live on prod br-fancy-credit-akjnd07a, 2026-08-02):
 * catalogs.items carries three unique indexes, and only one of them is total:
 *   uq_items_company_item_name    (operating_company_id, item_name)                      [NOT partial]
 *   uq_items_company_item_code    (operating_company_id, item_code)  WHERE code NOT NULL [partial]
 *   uq_items_company_qbo_item_id  (operating_company_id, qbo_item_id) WHERE id NOT NULL  [partial]
 * The sync is keyed on qbo_item_id, so item_name is the constraint nobody is thinking about — and it
 * is the one that fires. A violation aborts the ENTIRE step for that entity, not one row.
 *
 * THREE writes carried this defect. Each was reproduced on a fork of prod before being fixed:
 *   1. reconciler HEAL   `SET item_name = qi.name` renamed a '[QBO n]' twin onto a taken name.
 *                        qbo_sync.step.items_reconcile had last_successful_run_at = NULL — it had
 *                        NEVER succeeded, on TRANSP, since the step existed.
 *   2. reconciler INSERT wrote qi.name raw, deduping only on qbo_item_id. TRK: mirror qbo_id 179
 *                        'Freight' vs local 'Freight' (qbo_id 12).
 *   3. puller INSERT     same bare name, reached whenever ACCT-F77's adopt stands down because the
 *                        name is held by a row bound to a DIFFERENT qbo id. Same TRK row.
 * #3988 fixed a fourth instance (the puller's DO UPDATE) and the class survived in these three. That
 * is the whole reason this guard checks a CLASS and not a line: the previous fix was correct and the
 * bug still shipped, one file over.
 *
 * WHAT IT CHECKS — the EXPANDED SQL, not the source text. The safety lives in helper functions
 * (nameIsFree/codeIsFree), so asserting "the source calls nameIsFree" would pass even if the helper
 * were gutted to `return "TRUE"`. This guard bundles the module and reads the strings the database
 * actually receives.
 *
 * SAFETY PROPERTIES PROTECTED:
 *   a. no QBO-sourced statement assigns item_name without a name-free test in the same statement;
 *   b. the free-test carries BOTH clauses — the cross-row one AND the peer/mirror one that catches the
 *      intra-statement collision two same-named QBO items would cause (no EXISTS can see a write made
 *      by its own statement);
 *   c. the heal gates the rename in its WHERE too, so declined renames are not counted as work done
 *      forever (a drift counter that never converges is a lying counter);
 *   d. the SQL stays in items-write-sql.ts — no qbo-sync file re-inlines a raw catalogs.items write,
 *      which is how instance 3 escaped the fix for instance 4.
 *
 * OUT OF SCOPE, deliberately and on the record: catalogs/items.routes.ts writes item_name from
 * operator input. A duplicate there fails ONE interactive request visibly; it does not abort a batch
 * sync, and it is the operator's own name to choose. Different class, tracked separately — widening
 * this guard to cover it would force a rename convention onto hand-created items that no one has ruled on.
 *
 * ACCT-F4431380 (Lead 443.137 item 9e) — OLD: bundled items-write-sql.ts and proved each QBO-sourced
 * item_name write (HEAL_ITEM_DRIFT_SQL / CREATE_MISSING_ITEMS_SQL / PULLER_UPSERT_ITEM_SQL) carried a
 * name-free test, a peer clause, a WHERE gate, and that no sibling re-inlined a catalogs.items write.
 * NEW: there is no QBO-sourced item_name write left to make safe, so the guard asserts the stronger
 * property: items-write-sql.ts does not exist, no qbo-sync source (recursive, non-test) INSERTs/UPDATEs/
 * DELETEs catalogs.items, and none references the removed statement constants. Check (f) — "no sibling
 * re-inlines a raw catalogs.items write" — is kept and widened from "outside the SQL module" to "anywhere".
 * WHY: QuickBooks is a read-only archive; the native write was removed and the reconciler refuses by name.
 * A collision-safe QBO write is still a QBO write into a native catalog.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SQL_MODULE = "apps/backend/src/qbo-sync/items-write-sql.ts";
const QBO_SYNC_DIR = "apps/backend/src/qbo-sync";
const LABEL = "verify-items-write-name-collision-safe";
const REMOVED_CONSTANTS = ["HEAL_ITEM_DRIFT_SQL", "CREATE_MISSING_ITEMS_SQL", "PULLER_UPSERT_ITEM_SQL"];

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** @param sqlModuleExists boolean  @param files Map<rel, content> of qbo-sync sources */
export function audit(sqlModuleExists, files) {
  const problems = [];
  if (sqlModuleExists) {
    problems.push(
      `${SQL_MODULE} exists again. It was the home of the QBO -> catalogs.items write SQL, removed by ` +
        `ACCT-F4431380; QBO paths write only mdata.qbo_items.`
    );
  }
  if (files.size < 5) problems.push(`only ${files.size} qbo-sync sources found — instrument broken, cannot verify`);
  for (const [rel, content] of files) {
    const code = stripComments(content);
    const w = /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+catalogs\.items\b/i.exec(code);
    if (w) problems.push(`${rel}: writes catalogs.items (\`${w[0]}\`) from a QBO path — forbidden (ACCT-F4431380).`);
    for (const c of REMOVED_CONSTANTS) {
      if (new RegExp(`\\b${c}\\b`).test(code)) problems.push(`${rel}: references removed QBO item write constant ${c}.`);
    }
  }
  return problems;
}

function qboSyncSources(root = ROOT) {
  const out = new Map();
  const walk = (rel) => {
    for (const ent of readdirSync(join(root, rel), { withFileTypes: true })) {
      const r = `${rel}/${ent.name}`;
      if (ent.isDirectory()) { if (ent.name !== "__tests__") walk(r); continue; }
      if (!ent.name.endsWith(".ts") || /\.test\.ts$/.test(ent.name)) continue;
      out.set(r, readFileSync(join(root, r), "utf8"));
    }
  };
  walk(QBO_SYNC_DIR);
  return out;
}

function auditTree() {
  return audit(existsSync(join(ROOT, SQL_MODULE)), qboSyncSources());
}

function selftest() {
  const failures = [];
  const clean = qboSyncSources();
  const c0 = auditTree();
  if (c0.length !== 0) failures.push(`case0 FAIL — real source flagged: ${c0.join(" | ")}`);

  if (!audit(true, clean).some((p) => p.includes("exists again")))
    failures.push("case1 FAIL — a re-created items-write-sql.ts was NOT caught");

  const plantInsert = new Map(clean);
  const rec = `${QBO_SYNC_DIR}/items-reconciler.ts`;
  plantInsert.set(rec, clean.get(rec) + "\nawait client.query(`INSERT INTO catalogs.items (operating_company_id, item_name) VALUES ($1,$2)`);\n");
  if (!audit(false, plantInsert).some((p) => p.includes("writes catalogs.items")))
    failures.push("case2 FAIL — a planted INSERT INTO catalogs.items in the real reconciler was NOT caught");

  const plantHeal = new Map(clean);
  const pul = `${QBO_SYNC_DIR}/items-puller.ts`;
  plantHeal.set(pul, clean.get(pul) + "\nconst H = `UPDATE catalogs.items ci SET item_name = qi.name FROM mdata.qbo_items qi`;\n");
  if (!audit(false, plantHeal).some((p) => p.includes("writes catalogs.items")))
    failures.push("case3 FAIL — the ACCT-F83 heal shape planted in the real puller was NOT caught");

  const plantConst = new Map(clean);
  plantConst.set(pul, clean.get(pul) + "\nimport { HEAL_ITEM_DRIFT_SQL } from './items-write-sql.js';\n");
  if (!audit(false, plantConst).some((p) => p.includes("HEAL_ITEM_DRIFT_SQL")))
    failures.push("case4 FAIL — a re-import of a removed constant was NOT caught");

  const commentOnly = new Map(clean);
  commentOnly.set(pul, clean.get(pul) + "\n// formerly: INSERT INTO catalogs.items (history)\n");
  if (audit(false, commentOnly).length !== 0) failures.push("case5 FAIL — a comment-only mention was flagged");

  if (!audit(false, new Map()).some((p) => p.includes("instrument broken")))
    failures.push("case6 FAIL — an empty scan did NOT fail closed");

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS — re-created module caught, planted insert/heal caught, removed constant caught, comment ignored, empty scan fails closed`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — no QBO path writes catalogs.items (item_name collisions are impossible because the QBO write is gone)`);
}

main();
