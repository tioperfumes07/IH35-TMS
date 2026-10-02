#!/usr/bin/env node
/**
 * A LOAD'S 'invoiced' STATUS FOLLOWS ITS INVOICE — IN THE DATABASE (Lead ROUND 332 item 3, CC-1, migration 202615300100).
 *
 * Measured on prod 2026-10-02: loads 13503 / 13504 / 13539 sat at 'invoiced' with no live invoice. 18 backend files write
 * mdata.loads.status and only one (POST /invoices/:id/void) reverted a load when its invoice died. Both halves now live
 * in the database; this guard keeps them there.
 *
 *   1. The effective definition (last migration that touches it) of trg_load_invoiced_requires_live_invoice is a
 *      CONSTRAINT TRIGGER, DEFERRABLE INITIALLY DEFERRED, on mdata.loads — deferred so write order inside a transaction
 *      never matters, only the committed state.
 *   2. trg_invoice_death_reverts_load exists on accounting.invoices for UPDATE OF voided_at / status and DELETE.
 *   3. The revert never lands on paid / closed / cancelled (owner ruling, ACCT-F13579).
 *   4. No later migration drops either trigger without re-creating it.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIG = resolve(ROOT, "db/migrations");
const LABEL = "verify-load-invoiced-follows-invoice";
const stripSql = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");

export function collectFailures({ files, read }) {
  const failures = [];
  const sorted = [...files].filter((f) => /^\d{12}_.*\.sql$/.test(f)).sort();
  const last = (re) => { let hit = null; for (const f of sorted) { const s = stripSql(read(f)); if (re.test(s)) hit = { file: f, sql: s }; } return hit; };

  const a = last(/trg_load_invoiced_requires_live_invoice/i);
  if (!a) failures.push("RULE 1: no migration defines trg_load_invoiced_requires_live_invoice");
  else if (!/CREATE\s+CONSTRAINT\s+TRIGGER\s+trg_load_invoiced_requires_live_invoice[\s\S]{0,200}?ON\s+mdata\.loads[\s\S]{0,120}?DEFERRABLE\s+INITIALLY\s+DEFERRED/i.test(a.sql)) {
    failures.push(`RULE 1/4: ${a.file} — trg_load_invoiced_requires_live_invoice must be (re)created as a CONSTRAINT TRIGGER on mdata.loads, DEFERRABLE INITIALLY DEFERRED. A load may sit at 'invoiced' only with a live issued invoice, checked at commit.`);
  }

  const b = last(/trg_invoice_death_reverts_load/i);
  if (!b) failures.push("RULE 2: no migration defines trg_invoice_death_reverts_load");
  else if (!/CREATE\s+TRIGGER\s+trg_invoice_death_reverts_load\s+AFTER\s+UPDATE\s+OF\s+[^;]*voided_at[^;]*status[^;]*OR\s+DELETE\s+ON\s+accounting\.invoices/i.test(b.sql)) {
    failures.push(`RULE 2/4: ${b.file} — trg_invoice_death_reverts_load must be (re)created AFTER UPDATE OF voided_at, status ... OR DELETE ON accounting.invoices. An invoice that stops being live must revert the load it billed.`);
  }

  const c = last(/FUNCTION\s+accounting\.load_status_before_invoiced/i);
  if (!c) failures.push("RULE 3: no migration defines accounting.load_status_before_invoiced");
  else if (!/IN\s*\(\s*'paid'\s*,\s*'closed'\s*,\s*'cancelled'/i.test(c.sql)) {
    failures.push(`RULE 3: ${c.file} — accounting.load_status_before_invoiced must never revert to paid / closed / cancelled (owner ruling, ACCT-F13579).`);
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
      "CREATE CONSTRAINT TRIGGER trg_load_invoiced_requires_live_invoice AFTER INSERT OR UPDATE OF status ON mdata.loads DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION f();" +
      "CREATE TRIGGER trg_invoice_death_reverts_load AFTER UPDATE OF voided_at, status, source_load_id OR DELETE ON accounting.invoices FOR EACH ROW EXECUTE FUNCTION g();" +
      "CREATE OR REPLACE FUNCTION accounting.load_status_before_invoiced(p uuid) RETURNS text AS $$ SELECT CASE WHEN x IN ('paid', 'closed', 'cancelled') THEN NULL END $$;";
    const mk = (m) => ({ files: Object.keys(m), read: (f) => m[f] });
    const cases = [
      ["good passes", collectFailures(mk({ "202601010000_a.sql": good })).length === 0],
      ["immediate trigger fails", collectFailures(mk({ "202601010000_a.sql": good.replace("DEFERRABLE INITIALLY DEFERRED ", "") })).some((f) => f.startsWith("RULE 1"))],
      ["later drop fails", collectFailures(mk({ "202601010000_a.sql": good, "202601020000_b.sql": "DROP TRIGGER trg_load_invoiced_requires_live_invoice ON mdata.loads;" })).some((f) => f.startsWith("RULE 1"))],
      ["no delete arm fails", collectFailures(mk({ "202601010000_a.sql": good.replace(" OR DELETE", "") })).some((f) => f.startsWith("RULE 2"))],
      ["revert to paid fails", collectFailures(mk({ "202601010000_a.sql": good.replace("('paid', 'closed', 'cancelled')", "('closed')") })).some((f) => f.startsWith("RULE 3"))],
    ];
    for (const [n, ok] of cases) console.log(`  ${ok ? "✓" : "✗"} ${n}`);
    const bad = cases.filter(([, ok]) => !ok).length;
    console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
    process.exit(bad ? 1 : 0);
  }
  const failures = run();
  if (failures.length) { console.error(`${LABEL}: FAIL\n`); for (const f of failures) console.error(`  ${f}\n`); process.exit(1); }
  console.log(`${LABEL}: OK — 'invoiced' requires a live issued invoice at commit (deferred), invoice death reverts the load, never to paid / closed / cancelled.`);
}
