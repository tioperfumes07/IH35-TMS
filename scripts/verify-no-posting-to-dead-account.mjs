#!/usr/bin/env node
/**
 * NOTHING POSTS TO A DEAD ACCOUNT (Lead ROUND 339 order 1 — CC-1, migration 202615310100).
 * Owner: "FIX NOTHING SHOULD POST WERE IT SHOULD NOT".
 *
 * Measured on prod 2026-10-02: 223 postings on deactivated 5010, an active role on a deactivated Office Expense, two
 * active roles on header accounts, 6 item defaults on dead accounts. The account is SELECTED through config (roles,
 * item defaults, templates) that carried no guard; the database now refuses each road. This guard keeps the four
 * triggers in place — read from the migration that touches each one LAST, so a later drop fails the push.
 *
 *   1. trg_refuse_posting_to_dead_account   BEFORE INSERT OR UPDATE OF account_id ON accounting.journal_entry_postings
 *   2. trg_refuse_active_role_on_dead_account BEFORE INSERT OR UPDATE ... ON accounting.chart_of_accounts_roles
 *   3. trg_refuse_item_default_on_dead_account BEFORE INSERT OR UPDATE ... ON catalogs.items
 *   4. trg_refuse_killing_a_referenced_account BEFORE UPDATE OF deactivated_at, is_postable ON catalogs.accounts
 *   5. catalogs.account_is_dead treats BOTH deactivated_at IS NOT NULL and is_postable <> true as dead.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIG = resolve(ROOT, "db/migrations");
const LABEL = "verify-no-posting-to-dead-account";
const stripSql = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");

const TRIGGERS = [
  ["trg_refuse_posting_to_dead_account", /BEFORE\s+INSERT\s+OR\s+UPDATE\s+OF\s+account_id\s+ON\s+accounting\.journal_entry_postings/i],
  ["trg_refuse_active_role_on_dead_account", /BEFORE\s+INSERT\s+OR\s+UPDATE\s+OF\s+[^;]*ON\s+accounting\.chart_of_accounts_roles/i],
  ["trg_refuse_item_default_on_dead_account", /BEFORE\s+INSERT\s+OR\s+UPDATE\s+OF\s+[^;]*ON\s+catalogs\.items/i],
  ["trg_refuse_killing_a_referenced_account", /BEFORE\s+UPDATE\s+OF\s+[^;]*deactivated_at[^;]*is_postable[^;]*ON\s+catalogs\.accounts/i],
];

export function collectFailures({ files, read }) {
  const failures = [];
  const sorted = [...files].filter((f) => /^\d{12}_.*\.sql$/.test(f)).sort();
  const last = (re) => { let hit = null; for (const f of sorted) { const s = stripSql(read(f)); if (re.test(s)) hit = { file: f, sql: s }; } return hit; };
  TRIGGERS.forEach(([name, shape], i) => {
    const hit = last(new RegExp(name, "i"));
    if (!hit) { failures.push(`RULE ${i + 1}: no migration defines ${name}`); return; }
    const create = new RegExp(`CREATE\\s+TRIGGER\\s+${name}\\s+([^;]*)`, "i").exec(hit.sql);
    if (!create || !shape.test(`${create[1]}`.replace(/^/, ""))) {
      failures.push(`RULE ${i + 1}: ${hit.file} — ${name} must be (re)created with its full shape (${shape.source}); the last migration touching it does not.`);
    }
  });
  const dead = last(/FUNCTION\s+catalogs\.account_is_dead/i);
  if (!dead) failures.push("RULE 5: no migration defines catalogs.account_is_dead");
  else if (!/deactivated_at\s+IS\s+NOT\s+NULL/i.test(dead.sql) || !/is_postable\s+IS\s+NOT\s+TRUE/i.test(dead.sql)) {
    failures.push(`RULE 5: ${dead.file} — catalogs.account_is_dead must treat deactivated_at IS NOT NULL and is_postable IS NOT TRUE as dead.`);
  }
  return failures;
}

export function run() {
  return collectFailures({ files: readdirSync(MIG), read: (f) => readFileSync(resolve(MIG, f), "utf8") });
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    const good =
      "CREATE OR REPLACE FUNCTION catalogs.account_is_dead(p uuid) RETURNS boolean AS $$ SELECT a.deactivated_at IS NOT NULL OR a.is_postable IS NOT TRUE $$;" +
      "CREATE TRIGGER trg_refuse_posting_to_dead_account BEFORE INSERT OR UPDATE OF account_id ON accounting.journal_entry_postings FOR EACH ROW EXECUTE FUNCTION f();" +
      "CREATE TRIGGER trg_refuse_active_role_on_dead_account BEFORE INSERT OR UPDATE OF account_id, is_active ON accounting.chart_of_accounts_roles FOR EACH ROW EXECUTE FUNCTION f();" +
      "CREATE TRIGGER trg_refuse_item_default_on_dead_account BEFORE INSERT OR UPDATE OF default_expense_account_id ON catalogs.items FOR EACH ROW EXECUTE FUNCTION f();" +
      "CREATE TRIGGER trg_refuse_killing_a_referenced_account BEFORE UPDATE OF deactivated_at, is_postable ON catalogs.accounts FOR EACH ROW EXECUTE FUNCTION f();";
    const mk = (m) => ({ files: Object.keys(m), read: (f) => m[f] });
    const cases = [
      ["good passes", collectFailures(mk({ "202601010000_a.sql": good })).length === 0],
      ["later drop fails", collectFailures(mk({ "202601010000_a.sql": good, "202601020000_b.sql": "DROP TRIGGER trg_refuse_posting_to_dead_account ON accounting.journal_entry_postings;" })).some((f) => f.startsWith("RULE 1"))],
      ["insert-only posting guard fails", collectFailures(mk({ "202601010000_a.sql": good.replace("BEFORE INSERT OR UPDATE OF account_id ON accounting.journal_entry_postings", "BEFORE INSERT ON accounting.journal_entry_postings") })).some((f) => f.startsWith("RULE 1"))],
      ["deactivated-only predicate fails", collectFailures(mk({ "202601010000_a.sql": good.replace(" OR a.is_postable IS NOT TRUE", "") })).some((f) => f.startsWith("RULE 5"))],
      ["missing kill guard fails", collectFailures(mk({ "202601010000_a.sql": good.replace(/CREATE TRIGGER trg_refuse_killing[^;]*;/, "") })).some((f) => f.startsWith("RULE 4"))],
    ];
    for (const [n, ok] of cases) console.log(`  ${ok ? "✓" : "✗"} ${n}`);
    const bad = cases.filter(([, ok]) => !ok).length;
    console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
    process.exit(bad ? 1 : 0);
  }
  const failures = run();
  if (failures.length) { console.error(`${LABEL}: FAIL\n`); for (const f of failures) console.error(`  ${f}\n`); process.exit(1); }
  console.log(`${LABEL}: OK — postings, active roles and item defaults refuse dead accounts; an account still selected cannot be killed.`);
}
