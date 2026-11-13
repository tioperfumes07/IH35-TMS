#!/usr/bin/env node
/**
 * verify-period-lock-engine-covers-money-documents — ENG-38 PERIOD-LOCK ENGINE (ROUND 8.20).
 * Owner 2026-11-02: build the lock engine, do not lock a period. When a month IS closed it must mean what a QuickBooks
 * closing date means. Root cause it guards (pg_trigger 2026-11-13): only 6 tables refused closed-period writes, and
 * those only on INSERT / UPDATE OF <date> — amounts, voids, deletes and every expense / deposit / transfer / credit /
 * factoring document and every line table were unguarded.
 *   1. every money document table has a doc lock: INSERT, UPDATE and DELETE, checking OLD and NEW dates;
 *   2. every document line table has a line lock that reads its parent's date;
 *   3. the migration closes nothing (no UPDATE of accounting.periods, no status = 'closed');
 *   4. the API answers a closed-period refusal with 423 period_locked and the close date (never a 500).
 * Usage: node scripts/verify-period-lock-engine-covers-money-documents.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-period-lock-engine-covers-money-documents";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG = "db/migrations/202616580100_period_lock_engine_all_money_documents.sql";
const HANDLER = "apps/backend/src/lib/zod-error-handler.ts";

const DOCS = [
  "accounting.journal_entries", "accounting.invoices", "accounting.bills", "accounting.bill_payments", "accounting.payments",
  "accounting.expenses", "accounting.deposits", "banking.transfers", "accounting.credit_memos", "accounting.vendor_credits",
  "accounting.factoring_advances", "accounting.factoring_purchases",
];
const LINES = ["accounting.invoice_lines", "accounting.bill_lines", "accounting.expense_lines", "accounting.deposit_lines"];

export function check(files) {
  const f = [];
  const mig = files[MIG] ?? "";
  const handler = files[HANDLER] ?? "";
  if (!mig) return ["ENG-38 migration missing"];
  for (const t of DOCS) if (!new RegExp(`ARRAY\\['${t.replace(".", "\\.")}',`).test(mig)) f.push(`no doc lock on ${t}`);
  for (const t of LINES) if (!new RegExp(`ARRAY\\['${t.replace(".", "\\.")}',`).test(mig)) f.push(`no line lock on ${t}`);
  if (!/BEFORE INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION accounting\.tg_period_lock_doc\(%s\)/.test(mig)) f.push("doc lock is not INSERT + UPDATE + DELETE");
  if (!/BEFORE INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION accounting\.tg_period_lock_line\(%s\)/.test(mig)) f.push("line lock is not INSERT + UPDATE + DELETE");
  if (!/raise_if_txn_in_closed_period\(\(v_old->>'operating_company_id'\)::uuid, \(v_old->>v_date_col\)::date\);\s+PERFORM accounting\.raise_if_txn_in_closed_period\(\(v_new->>'operating_company_id'\)::uuid, \(v_new->>v_date_col\)::date\)/.test(mig)) f.push("an UPDATE does not check both the old and the new date");
  if (!/IF TG_OP = 'DELETE' THEN\s+PERFORM accounting\.raise_if_txn_in_closed_period\(\(v_old/.test(mig)) f.push("DELETE of a closed-month document is not refused");
  if (/UPDATE\s+accounting\.periods/i.test(mig) || /status\s*=\s*'closed'/i.test(mig)) f.push("the engine migration closes a period (owner 2026-11-02: do not lock)");
  if (!/return reply\.code\(423\)\.send\(locked\)/.test(handler) || !/IH35_CLOSED_PERIOD closed_through=/.test(handler)) f.push("API does not answer a closed-period refusal with 423 period_locked");
  return f;
}

function readAll() {
  const out = {};
  for (const rel of [MIG, HANDLER]) {
    const abs = path.join(ROOT, rel);
    out[rel] = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "";
  }
  return out;
}

function selftest() {
  const live = readAll();
  const mut = (key, from, to) => ({ ...live, [key]: live[key].replace(from, to) });
  const cases = [
    ["expenses unguarded", mut(MIG, "ARRAY['accounting.expenses',", "ARRAY['accounting.expensez',")],
    ["deposit lines unguarded", mut(MIG, "ARRAY['accounting.deposit_lines',", "ARRAY['accounting.deposit_linez',")],
    ["doc lock insert-only", mut(MIG, "BEFORE INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION accounting.tg_period_lock_doc(%s)", "BEFORE INSERT ON %s FOR EACH ROW EXECUTE FUNCTION accounting.tg_period_lock_doc(%s)")],
    ["update checks only NEW", mut(MIG, "PERFORM accounting.raise_if_txn_in_closed_period((v_old->>'operating_company_id')::uuid, (v_old->>v_date_col)::date);\n    PERFORM", "PERFORM")],
    ["engine closes a month", { ...live, [MIG]: live[MIG] + "\nUPDATE accounting.periods SET status = 'closed';\n" }],
    ["refusal is a 500", mut(HANDLER, "return reply.code(423).send(locked)", "return reply.send(locked)")],
    ["migration deleted", { ...live, [MIG]: "" }],
  ];
  let pass = 0;
  const liveF = check(live);
  if (liveF.length === 0) pass += 1; else console.error(`${LABEL} --selftest: live tree fails`, liveF);
  for (const [name, files] of cases) {
    if (check(files).length > 0) pass += 1; else console.error(`${LABEL} --selftest: did not catch "${name}"`);
  }
  const total = cases.length + 1;
  if (pass !== total) { console.error(`${LABEL} --selftest FAIL ${pass}/${total}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${pass}/${total}`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const f = check(readAll());
  if (f.length) { for (const x of f) console.error(`${LABEL}: FAIL — ${x}`); process.exit(1); }
  console.log(`${LABEL}: PASS — ${DOCS.length} document tables + ${LINES.length} line tables refuse create / money edit / delete in a closed period; no period closed; API answers 423 period_locked`);
}
