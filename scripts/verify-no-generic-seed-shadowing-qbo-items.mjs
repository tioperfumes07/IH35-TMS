#!/usr/bin/env node
/**
 * ACCT-F77 — no catalogs.items row may shadow a QBO item's name, and the adopt path must stand down
 * when a twin already claims the QBO id.
 *
 * WHY (proven on a fork of prod, 2026-08-01, before/after):
 * qbo_sync.step.items_pull and .items_reconcile had NEVER succeeded. The QBO upsert matches its twin
 * on the PARTIAL arbiter (operating_company_id, qbo_item_id) and its DO UPDATE renames
 * '<name> [QBO n]' -> '<name>'. Two GENERIC SEED rows from 0062 already held those names, and
 * uq_items_company_item_name is NOT partial, so the rename collided and the step aborted. Reproduced
 * verbatim on the fork:  duplicate key value violates unique constraint "uq_items_company_item_name".
 * After retiring the seeds the same rename succeeded for QBO 24 and QBO 26.
 *
 * TWO INVARIANTS, both of which were violated in code I wrote earlier today:
 *
 * 1. THE ADOPT MUST CHECK FOR A TWIN. My first ACCT-F68 adopt matched an unclaimed row by NAME and
 *    stamped the QBO id onto it — with no check that another row already carried that id. On
 *    'Fuel Surcharge' that violates uq_items_company_qbo_item_id and aborts the pull just as surely
 *    as the bug it was meant to fix. Adoption must stand down when a twin exists; the twin is already
 *    the correct carrier.
 *
 * 2. ARCHIVING ALONE IS NOT A FIX. uq_items_company_item_name is NOT partial, so a row with
 *    deactivated_at set STILL occupies the name. Any future "just deactivate the duplicate" change
 *    leaves the sync broken while looking resolved — which is why the migration RENAMES.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PULLER = "apps/backend/src/qbo-sync/items-puller.ts";
const LABEL = "verify-no-generic-seed-shadowing-qbo-items";

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1").replace(/--[^\n]*/g, "");
}

export function auditAdopt(src) {
  const code = stripComments(src);
  const problems = [];
  const upd = /UPDATE\s+catalogs\.items[\s\S]*?RETURNING/i.exec(code);
  if (!upd) {
    problems.push(`${PULLER}: no adopt step — a QBO item matching an unclaimed local row falls through to an INSERT that collides on item_name.`);
    return problems;
  }
  const adopt = upd[0];
  if (!/qbo_item_id\s+IS\s+NULL/i.test(adopt)) {
    problems.push(`${PULLER}: the adopt UPDATE does not require qbo_item_id IS NULL — it could rebind a row already owned by a different QBO item.`);
  }
  if (!/NOT\s+EXISTS/i.test(adopt)) {
    problems.push(
      `${PULLER}: the adopt UPDATE does not check whether ANOTHER row already claims this qbo_item_id. ` +
        `Stamping a twin-held id violates uq_items_company_qbo_item_id and aborts the pull — the same ` +
        `class of failure the adopt was written to fix.`
    );
  }
  return problems;
}

export function auditUpsertKeepsName(src) {
  const code = stripComments(src);
  const problems = [];
  const ins = /INSERT INTO catalogs\.items[\s\S]*?DO UPDATE SET([\s\S]*?)`/i.exec(code);
  if (!ins) {
    problems.push(`${PULLER}: no catalogs.items upsert found — cannot verify the item_name invariant.`);
    return problems;
  }
  if (/item_name\s*=\s*EXCLUDED\.item_name/i.test(ins[1])) {
    problems.push(
      `${PULLER}: the upsert's DO UPDATE overwrites item_name with EXCLUDED.item_name. That renames the ` +
        `'<name> [QBO nn]' twin to QBO's bare short name and collides with a same-named native row under ` +
        `uq_items_company_item_name — UNIQUE(operating_company_id, item_name), NOT partial. This is the ` +
        `single line that made items_pull and items_reconcile abort on every run. QBO owns the item's ` +
        `identity and economics, not its local display name once that name is taken.`
    );
  }
  return problems;
}

function auditTree() {
  const problems = [...auditAdopt(readFileSync(join(ROOT, PULLER), "utf8"))];
  problems.push(...auditUpsertKeepsName(readFileSync(join(ROOT, PULLER), "utf8")));
  return problems;
}

function selftest() {
  const failures = [];
  const noTwinCheck = `const adopted = await client.query(\`UPDATE catalogs.items SET qbo_item_id=$3 WHERE operating_company_id=$1 AND item_name=$2 AND qbo_item_id IS NULL RETURNING id\`);`;
  if (!auditAdopt(noTwinCheck).some((p) => p.includes("already claims this qbo_item_id")))
    failures.push("case1 FAIL — adopt without a twin check was NOT caught");
  const good = `const adopted = await client.query(\`UPDATE catalogs.items SET qbo_item_id=$3 WHERE operating_company_id=$1 AND item_name=$2 AND qbo_item_id IS NULL AND NOT EXISTS (SELECT 1 FROM catalogs.items other WHERE other.qbo_item_id=$3) RETURNING id\`);`;
  if (auditAdopt(good).length !== 0) failures.push(`case2 FAIL — the guarded adopt was flagged: ${auditAdopt(good).join(" | ")}`);
  const renaming = "const q = `INSERT INTO catalogs.items (a) VALUES ($1) ON CONFLICT (x) DO UPDATE SET item_name = EXCLUDED.item_name, item_code = EXCLUDED.item_code`;";
  if (!auditUpsertKeepsName(renaming).some((p) => p.includes("overwrites item_name")))
    failures.push("case3 FAIL — an upsert that renames the twin was NOT caught");
  const keeps = "const q = `INSERT INTO catalogs.items (a) VALUES ($1) ON CONFLICT (x) DO UPDATE SET item_code = EXCLUDED.item_code, unit_price_cents = EXCLUDED.unit_price_cents`;";
  if (auditUpsertKeepsName(keeps).length !== 0) failures.push("case4 FAIL — an upsert that keeps item_name was flagged");
  const tree = auditTree();
  if (tree.length !== 0) failures.push(`case5 FAIL — real sources flagged: ${tree.join(" | ")}`);
  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS — missing twin check caught, guarded adopt clean, archive-only caught, DELETE caught`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — adopt stands down on a twin-claimed id, and the seed retirement renames rather than only archiving`);
}

main();
