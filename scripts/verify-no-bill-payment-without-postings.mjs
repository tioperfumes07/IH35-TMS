#!/usr/bin/env node
/**
 * verify-no-bill-payment-without-postings — ROUND 363-CC1-B, CC-1.
 *
 * A bill payment posts WHEN IT IS CREATED, in the same transaction as its row (LAW 363.6, ROUND 369.6): Dr the payable
 * its bill credited / Cr the bank or card it was paid from. Never at the bank match, never after commit.
 *
 * STATIC (every run):
 *   RULE 1 — every file under apps/backend/src that does `INSERT INTO accounting.bill_payments` also posts it on the
 *            same transaction: `postSourceTransactionInClientTx(` with source "bill_payment", or
 *            `postBillPaymentGlIfEnabledInClientTx(`. The QBO-origin puller is the one named exception (parallel books:
 *            QBO already holds that A/P settlement — posting-engine refuses QBO_BILL_PAYMENT_POST_GL_REFUSED).
 *   RULE 2 — no caller outside bill-payment-gl.service.ts calls the post-commit `postBillPaymentGlIfEnabled(` — that
 *            is how a committed payment was left with no postings (the post ran after commit and a failure was logged).
 * LIVE (direct endpoint, unscoped, read-only):
 *   RULE 3 — cash bill payments (not settlement_deduction_noncash, not void, not QBO-origin, not sample) with no
 *            bill_payment posting: may only SHRINK from the committed baseline. The baseline is the 90 written by
 *            scripts/ops/2026-09-28-cc1-round148-ap-adoption-setbased.ts (#22918) — August/September documents, closed
 *            periods (claude/00-AUGUST-AND-SEPTEMBER-ARE-CLOSED-NO-SEAT-TOUCHES-THEM.md) and purge population; they are
 *            never posted by hand. A new one is a writer that regressed.
 * --selftest exercises every rule.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const REQUIRES_LIVE_DB = "unposted bill payments are live money — fails closed without a database";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-no-bill-payment-without-postings";
// Measured 2026-10-03 on prod (direct, bypass): 90 cash bill payments with no posting, all from #22918, all Aug/Sep.
export const UNPOSTED_CASH_BASELINE = 90;
const EXEMPT_INSERTERS = {
  "apps/backend/src/qbo-sync/ap-bill-payments-puller.ts": "QBO-origin mirror — parallel books, QBO already holds the A/P settlement",
};
const INSERT_RE = /INSERT\s+INTO\s+accounting\.bill_payments\b/i;
const IN_TX_POST_RE = /postBillPaymentGlIfEnabledInClientTx\s*\(|postSourceTransactionInClientTx\s*\([\s\S]{0,300}?["']bill_payment["']/;
const POST_COMMIT_RE = /\bpostBillPaymentGlIfEnabled\s*\(/;
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

export function staticFailures(files) {
  const failures = [];
  let inserters = 0;
  for (const { rel, src } of files) {
    const code = stripComments(src);
    if (INSERT_RE.test(code)) {
      inserters++;
      if (!EXEMPT_INSERTERS[rel] && !IN_TX_POST_RE.test(code)) {
        failures.push(`RULE 1 ${rel}: inserts accounting.bill_payments but never posts it on the same transaction`);
      }
    }
    if (rel !== "apps/backend/src/accounting/bill-payment-gl.service.ts" && POST_COMMIT_RE.test(code)) {
      failures.push(`RULE 2 ${rel}: calls the post-commit postBillPaymentGlIfEnabled( — post on the creating transaction instead`);
    }
  }
  return { failures, inserters };
}

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === "node_modules" || name === "__tests__") continue;
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (p.endsWith(".ts") && !/\.test\.ts$/.test(p)) acc.push(p);
  }
  return acc;
}

export function run() {
  const files = walk(join(ROOT, "apps/backend/src")).map((p) => ({ rel: relative(ROOT, p), src: readFileSync(p, "utf8") }));
  const r = staticFailures(files);
  if (r.inserters === 0) r.failures.push("RULE 1: found 0 bill-payment inserters — the matcher is stale");
  return r;
}

export function liveFailures(unposted) {
  return unposted > UNPOSTED_CASH_BASELINE
    ? [`RULE 3 ${unposted} cash bill payment(s) with no posting > baseline ${UNPOSTED_CASH_BASELINE} — a writer committed a payment without its postings`]
    : [];
}

async function measure(client) {
  await client.query("BEGIN READ ONLY");
  await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
  const r = await client.query(`
    SELECT count(*)::int AS n
      FROM accounting.bill_payments bp
      LEFT JOIN accounting.bills b ON b.id = bp.bill_id
     WHERE NOT COALESCE(bp.settlement_deduction_noncash, false)
       AND bp.voided_at IS NULL AND bp.revoked_at IS NULL AND COALESCE(bp.status, '') <> 'void'
       AND COALESCE(bp.is_sample_data, false) = false
       AND lower(COALESCE(b.source_system, '')) <> 'qbo'
       AND bp.qbo_bill_payment_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM accounting.journal_entry_postings p
                        WHERE p.source_transaction_type = 'bill_payment' AND p.source_transaction_id = bp.id::text)`);
  await client.query("ROLLBACK");
  return r.rows[0].n;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    const ins = "q(`INSERT INTO accounting.bill_payments (a) VALUES ($1)`);";
    const f = (files) => staticFailures(files).failures;
    const cases = [
      ["insert + in-tx entrypoint passes", f([{ rel: "x.ts", src: ins + " await postBillPaymentGlIfEnabledInClientTx(client, c, id, a);" }]).length === 0],
      ["insert + engine in-tx bill_payment passes", f([{ rel: "x.ts", src: ins + ' await postSourceTransactionInClientTx(client, { source_transaction_type: "bill_payment", source_transaction_id: id }, a);' }]).length === 0],
      ["insert with no posting fails", f([{ rel: "x.ts", src: ins }]).some((x) => x.startsWith("RULE 1"))],
      ["insert posting only the bill fails", f([{ rel: "x.ts", src: ins + ' await postSourceTransactionInClientTx(client, { source_transaction_type: "bill", source_transaction_id: id }, a);' }]).some((x) => x.startsWith("RULE 1"))],
      ["post-commit caller fails", f([{ rel: "y.ts", src: "await postBillPaymentGlIfEnabled(c, id, a);" }]).some((x) => x.startsWith("RULE 2"))],
      ["QBO puller exempt", f([{ rel: "apps/backend/src/qbo-sync/ap-bill-payments-puller.ts", src: ins }]).length === 0],
      ["live at baseline passes", liveFailures(UNPOSTED_CASH_BASELINE).length === 0],
      ["live above baseline fails", liveFailures(UNPOSTED_CASH_BASELINE + 1).length === 1],
    ];
    for (const [n, ok] of cases) console.log(`  ${ok ? "✓" : "✗"} ${n}`);
    const bad = cases.filter(([, ok]) => !ok).length;
    console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
    process.exit(bad ? 1 : 0);
  }
  const { failures: sf, inserters } = run();
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    const n = await measure(client);
    const all = [...sf, ...liveFailures(n)];
    if (all.length) { console.error(`${LABEL}: FAIL\n  ${all.join("\n  ")}`); process.exitCode = 1; }
    else console.log(`${LABEL}: OK — ${inserters} bill-payment inserters, each posts on its own transaction; ${n} unposted cash bill payment(s) (baseline ${UNPOSTED_CASH_BASELINE}, shrink-only, purge population).`);
  } finally {
    client.release?.();
    await pool?.end?.();
  }
}
