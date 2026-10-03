#!/usr/bin/env node
/**
 * verify-settlement-driver-pay-splits-per-load — ROUND 372.5, CC-1.
 *
 * Driver pay is the largest cost on a load. A settlement covering five loads must put each load's driver pay on that
 * load — one posting line per load, stamped with its load_id, summing to the settlement's gross to the cent, using the
 * settlement's OWN arithmetic (never an invented allocation). The live pay-run close does this through the per-load
 * A/P chain (settlement-ap-chain.service.ts): one A/P bill per load from the settlement's own pay lines, and it refuses
 * to close unless the per-load bills tie to the pay-run gross. #24652 lets each bill's A/P leg carry its load.
 *
 * STATIC:
 *   RULE 1 — the chain still refuses a split that does not tie (GROSS_DOES_NOT_TIE_TO_LOAD_BILLS), still gives every
 *            bill line its load, and the bill header still takes its single load (bills.service.ts).
 * LIVE (direct endpoint, unscoped, read-only):
 *   RULE 2 — every posted settlement GL run: its per-load bills exist and sum to the run's gross to the cent. Excepted by
 *            name, shrink-only: the five 2026-09-28 A/P-adoption runs (settlements 5769, 5773, 5775, 5780, 5786) —
 *            closed settlements (claude/00-CLOSED-USMCA-SETTLEMENTS-5769-TO-5819-TIE-EXACTLY-NEVER-ASK-AGAIN.md), closed
 *            August/September, purge population.
 *   RULE 3 — every live per-load settlement bill carries its load_id.
 *   RULE 4 — legacy driver-pay debit lines from the retired single clearing JE (source driver_settlement, no load):
 *            may only shrink from 141 (purge population). New settlements never post through that JE.
 *   RULE 5 — every bill posting created since 202615350500 for a settlement's per-load bill carries that bill's load.
 * --selftest exercises every rule.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const REQUIRES_LIVE_DB = "driver pay per load is live money — fails closed without a database";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-driver-pay-splits-per-load";
export const LEGACY_UNSPLIT_RUN_DOCS = new Set(["5769", "5773", "5775", "5780", "5786"]);
export const LEGACY_UNSTAMPED_DRIVER_PAY_LINES = 141;

export function staticFailures(read = (p) => readFileSync(join(ROOT, p), "utf8")) {
  const out = [];
  const chain = read("apps/backend/src/driver-finance/settlement-ap-chain.service.ts");
  if (!/GROSS_DOES_NOT_TIE_TO_LOAD_BILLS/.test(chain)) out.push("RULE 1 settlement-ap-chain no longer refuses a per-load split that does not tie to the pay-run gross");
  if (!/loadId:\s*b\.loadId/.test(chain)) out.push("RULE 1 settlement-ap-chain no longer gives every bill line its own load");
  const bills = read("apps/backend/src/accounting/bills.service.ts");
  if (!/ROUND 363-CC1-A follow-through/.test(bills) || !/count\(DISTINCT bl\.load_id\) = 1/.test(bills)) out.push("RULE 1 bills.service no longer gives a single-load bill's header its load");
  return out;
}

export function liveFailures(m) {
  const out = [];
  for (const r of m.runs) {
    const bad = r.nb === 0 || Number(r.split) !== Number(r.gross_cents);
    if (bad && !LEGACY_UNSPLIT_RUN_DOCS.has(String(r.doc))) {
      out.push(`RULE 2 settlement ${r.doc}: per-load bills ${r.nb} sum ${r.split}c vs run gross ${r.gross_cents}c — the split must tie to the cent`);
    }
  }
  if (m.billsWithoutLoad > 0) out.push(`RULE 3 ${m.billsWithoutLoad} live per-load settlement bill(s) carry no load_id`);
  if (m.legacyUnstamped > LEGACY_UNSTAMPED_DRIVER_PAY_LINES) out.push(`RULE 4 ${m.legacyUnstamped} driver-pay lines from the retired clearing JE carry no load > ${LEGACY_UNSTAMPED_DRIVER_PAY_LINES} — a new settlement posted through it`);
  if (m.newMismatch > 0) out.push(`RULE 5 ${m.newMismatch} settlement-bill posting(s) since 202615350500 do not carry their bill's load`);
  return out;
}

async function measure(client) {
  await client.query("BEGIN READ ONLY");
  await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
  const runs = (await client.query(`
    SELECT s.source_document_ref AS doc, r.gross_cents,
           (SELECT coalesce(sum(b.gross_cents),0) FROM driver_finance.driver_settlement_gl_bills b WHERE b.run_id = r.id AND b.superseded_at IS NULL)::bigint AS split,
           (SELECT count(*) FROM driver_finance.driver_settlement_gl_bills b WHERE b.run_id = r.id AND b.superseded_at IS NULL)::int AS nb
      FROM driver_finance.driver_settlement_gl_runs r JOIN driver_finance.driver_settlements s ON s.id = r.settlement_id
     WHERE r.status = 'posted'`)).rows;
  const billsWithoutLoad = (await client.query(`SELECT count(*)::int AS n FROM driver_finance.driver_settlement_gl_bills WHERE superseded_at IS NULL AND load_id IS NULL`)).rows[0].n;
  const legacyUnstamped = (await client.query(`
    SELECT count(*)::int AS n FROM accounting.journal_entry_postings p
     WHERE p.source_transaction_type = 'driver_settlement' AND p.debit_or_credit = 'debit' AND p.reversal_of_line_id IS NULL
       AND p.load_id IS NULL
       AND p.account_id IN (SELECT r.account_id FROM accounting.chart_of_accounts_roles r WHERE r.role = 'driver_pay_expense')`)).rows[0].n;
  const applied = (await client.query(`SELECT applied_at FROM _system._schema_migrations WHERE filename LIKE '202615350500%'`)).rows[0]?.applied_at ?? null;
  const newMismatch = applied ? (await client.query(`
    SELECT count(*)::int AS n FROM accounting.journal_entry_postings p
      JOIN driver_finance.driver_settlement_gl_bills b ON b.accounting_bill_id::text = p.source_transaction_id AND b.superseded_at IS NULL
     WHERE p.source_transaction_type = 'bill' AND p.created_at >= $1 AND p.load_id IS DISTINCT FROM b.load_id`, [applied])).rows[0].n : 0;
  await client.query("ROLLBACK");
  return { runs, billsWithoutLoad, legacyUnstamped, newMismatch };
}

export function run() {
  return staticFailures();
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    const goodSrc = { "apps/backend/src/driver-finance/settlement-ap-chain.service.ts": "GROSS_DOES_NOT_TIE_TO_LOAD_BILLS ... loadId: b.loadId", "apps/backend/src/accounting/bills.service.ts": "ROUND 363-CC1-A follow-through ... count(DISTINCT bl.load_id) = 1" };
    const ok = { runs: [{ doc: "5900", gross_cents: 100, split: 100, nb: 2 }, { doc: "5775", gross_cents: 72257, split: 130415, nb: 3 }], billsWithoutLoad: 0, legacyUnstamped: 141, newMismatch: 0 };
    const cases = [
      ["static clean passes", staticFailures((p) => goodSrc[p]).length === 0],
      ["dropping the tie refusal fails", staticFailures((p) => goodSrc[p].replace("GROSS_DOES_NOT_TIE_TO_LOAD_BILLS", "")).some((x) => x.startsWith("RULE 1"))],
      ["live clean (+ named legacy) passes", liveFailures(ok).length === 0],
      ["a new run that does not tie fails", liveFailures({ ...ok, runs: [{ doc: "5901", gross_cents: 100, split: 90, nb: 2 }] }).some((x) => x.startsWith("RULE 2"))],
      ["a new run with no per-load bills fails", liveFailures({ ...ok, runs: [{ doc: "5902", gross_cents: 100, split: 0, nb: 0 }] }).some((x) => x.startsWith("RULE 2"))],
      ["a bill without a load fails", liveFailures({ ...ok, billsWithoutLoad: 1 }).some((x) => x.startsWith("RULE 3"))],
      ["legacy unstamped growing fails", liveFailures({ ...ok, legacyUnstamped: 142 }).some((x) => x.startsWith("RULE 4"))],
      ["a new unstamped settlement-bill posting fails", liveFailures({ ...ok, newMismatch: 1 }).some((x) => x.startsWith("RULE 5"))],
    ];
    for (const [n, pass] of cases) console.log(`  ${pass ? "✓" : "✗"} ${n}`);
    const bad = cases.filter(([, pass]) => !pass).length;
    console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
    process.exit(bad ? 1 : 0);
  }
  const sf = run();
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    const m = await measure(client);
    const all = [...sf, ...liveFailures(m)];
    const tie = m.runs.filter((r) => r.nb > 0 && Number(r.split) === Number(r.gross_cents)).length;
    if (all.length) { console.error(`${LABEL}: FAIL\n  ${all.join("\n  ")}`); process.exitCode = 1; }
    else console.log(`${LABEL}: OK — ${m.runs.length} posted settlement runs: ${tie} split per load to the cent, ${m.runs.length - tie} named 09-28 adoption runs (closed, purge population); ${m.billsWithoutLoad} per-load bills without a load; ${m.legacyUnstamped} legacy clearing-JE driver-pay lines (≤ ${LEGACY_UNSTAMPED_DRIVER_PAY_LINES}, shrink-only); ${m.newMismatch} unstamped settlement-bill postings since 202615350500.`);
  } finally {
    client.release?.();
    await pool?.end?.();
  }
}
