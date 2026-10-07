#!/usr/bin/env node
// ROUND 336 rule 7 — "A FACTORED INVOICE'S AMOUNT IS NOT EDITABLE WHILE THE PURCHASE IS OPEN" — enforced in the DATABASE.
// Static: migration 202615300600 defines the lock function and both refusal triggers (invoices + invoice_lines), and the
// refusal names the purchase + Faro invoice number and points at the reason-coded credit memo.
// Live (DATABASE_URL): both triggers exist and are enabled on prod; the lock function exists. A live check that cannot run
// FAILS. --selftest plants each regression.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";


export const REQUIRES_LIVE_DB = "Neon live verification required";
const LABEL = "verify-factored-invoice-amount-locked";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG = "db/migrations/202615300600_factored_invoice_amount_lock.sql";

export function check(sql) {
  const fails = [];
  if (!/CREATE TRIGGER trg_refuse_factored_invoice_amount_edit BEFORE UPDATE OF total_cents, subtotal_cents, tax_cents ON accounting\.invoices/.test(sql)) fails.push("invoice amount trigger missing or narrowed");
  if (!/CREATE TRIGGER trg_refuse_factored_invoice_line_edit BEFORE INSERT OR UPDATE OR DELETE ON accounting\.invoice_lines/.test(sql)) fails.push("invoice line trigger missing or narrowed");
  if (!/p\.status = 'posted' AND p\.voided_at IS NULL/.test(sql) || !/AND l\.voided_at IS NULL/.test(sql)) fails.push("lock no longer scoped to a live line of a posted, unvoided purchase");
  if (!/'purchase %s \(Faro Inv %s\)'/.test(sql) || !/reason-coded credit memo/.test(sql)) fails.push("refusal no longer names the purchase / Faro invoice number or the credit memo path");
  return fails.map((f) => `${MIG}: ${f}`);
}

if (process.argv.includes("--selftest")) {
  const g = fs.readFileSync(path.join(ROOT, MIG), "utf8");
  const plants = [
    ["line trigger dropped", g.replace("BEFORE INSERT OR UPDATE OR DELETE ON accounting.invoice_lines", "BEFORE UPDATE ON accounting.invoice_lines")],
    ["tax not watched", g.replace("BEFORE UPDATE OF total_cents, subtotal_cents, tax_cents", "BEFORE UPDATE OF total_cents")],
    ["message anonymous", g.replace("'purchase %s (Faro Inv %s)'", "'a purchase'")],
  ];
  if (check(g).length) { console.error(`${LABEL} --selftest FAIL: tree not clean: ${check(g).join("; ")}`); process.exit(1); }
  const missed = plants.filter(([, s]) => check(s).length === 0).map(([n]) => n);
  if (missed.length) { console.error(`${LABEL} --selftest FAIL: not caught: ${missed.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${plants.length}/${plants.length}`);
  process.exit(0);
}

const fails = check(fs.readFileSync(path.join(ROOT, MIG), "utf8"));
if (fails.length) { console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`); process.exit(1); }
if (!process.env.DATABASE_URL) { console.error(`${LABEL}: FAIL — static passed; the live check needs DATABASE_URL`); process.exit(1); }
const { default: pg } = await import("pg");
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000, statement_timeout: 30000 });
try {
  await c.connect();
  const r = (await c.query(`
    SELECT (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled <> 'D'
              AND tgname IN ('trg_refuse_factored_invoice_amount_edit', 'trg_refuse_factored_invoice_line_edit'))::int AS triggers,
           (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'accounting' AND p.proname = 'factored_invoice_amount_lock')::int AS fn`)).rows[0];
  if (r.triggers !== 2 || r.fn !== 1) {
    console.error(`${LABEL}: LIVE FAIL — ${r.triggers}/2 enabled lock triggers, ${r.fn}/1 lock function on prod (migration 202615300600 applied?)`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — static 4/4; live: 2/2 lock triggers enabled, lock function present`);
} catch (err) {
  console.error(`${LABEL}: FAIL — live check could not run: ${err.message}`);
  process.exit(1);
} finally {
  await c.end().catch(() => {});
}
