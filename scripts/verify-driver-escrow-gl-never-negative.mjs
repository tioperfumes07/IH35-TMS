#!/usr/bin/env node
/**
 * verify-driver-escrow-gl-never-negative — ROUND 374, CC-1.
 *
 * A driver escrow is money held in trust for the driver; its balance is the GL (2100-00-nnn, credits minus debits of
 * posted lines — driver_finance.v_driver_escrow_balance). It is never below zero.
 *
 * LIVE (direct endpoint, unscoped, read-only):
 *   RULE 1 — driver escrow sub-accounts whose GL balance is below zero may only be the three named below, at no more
 *            than their measured amounts, and may only shrink. Measured 2026-10-03: every contribution on them was
 *            voided, then on 2026-09-24 19:58Z accounting/escrow/service.ts released 2 / 1 / 6 deductions of $25 that no
 *            longer existed. Closed September period and purge population — never hand-reversed.
 *   RULE 2 — once migration 202615360300 is applied, its refusal is live: trg_driver_escrow_gl_never_negative on
 *            accounting.journal_entry_postings exists, is enabled, and is a deferrable constraint trigger, initially
 *            deferred. Rehearsed with real commits on a Neon fork: a $200.00 release from a $150.00 escrow is refused;
 *            $100.00 commits.
 * --selftest exercises both rules.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const REQUIRES_LIVE_DB = "driver escrow balances are live money held in trust — fails closed without a database";
const LABEL = "verify-driver-escrow-gl-never-negative";
// account_number -> the most negative GL balance it may hold (cents). Shrink-only: an account leaves this list when it
// stops being negative, and no account is ever added.
export const KNOWN_NEGATIVE = { "2100-00-002": -5000, "2100-00-004": -2500, "2100-00-027": -15000 };

export function liveFailures({ negatives, refusal }) {
  const out = [];
  for (const n of negatives) {
    const floor = KNOWN_NEGATIVE[n.account_number];
    if (floor === undefined) out.push(`RULE 1 ${n.account_number} (${n.company}) holds ${n.balance_cents} cents — a driver escrow below zero that is not the measured Sep-24 purge population`);
    else if (Number(n.balance_cents) < floor) out.push(`RULE 1 ${n.account_number} fell to ${n.balance_cents} cents, below its measured ${floor}`);
  }
  if (refusal.applied) {
    const t = refusal.trigger;
    if (!t) out.push("RULE 2 migration 202615360300 is applied but trg_driver_escrow_gl_never_negative does not exist");
    else if (t.enabled === "D" || !t.deferrable || !t.initdeferred) out.push(`RULE 2 trg_driver_escrow_gl_never_negative is not a live deferred constraint trigger (enabled=${t.enabled}, deferrable=${t.deferrable}, initially_deferred=${t.initdeferred})`);
  }
  return out;
}

async function measure(client) {
  await client.query("BEGIN READ ONLY");
  await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
  const negatives = (await client.query(`
    WITH acct AS (
      SELECT DISTINCT ea.coa_account_id AS id
        FROM accounting.escrow_accounts ea
       WHERE ea.holder_type = 'driver'
         AND NOT EXISTS (SELECT 1 FROM accounting.chart_of_accounts_roles r WHERE r.account_id = ea.coa_account_id AND r.role = 'escrow_liability_default'))
    SELECT a.account_number, c.code AS company,
           COALESCE(sum(CASE WHEN p.debit_or_credit = 'credit' THEN p.amount_cents ELSE -p.amount_cents END), 0)::bigint AS balance_cents
      FROM acct JOIN catalogs.accounts a ON a.id = acct.id
      JOIN org.companies c ON c.id = a.operating_company_id
      LEFT JOIN (accounting.journal_entry_postings p
                 JOIN accounting.journal_entries j ON j.id = p.journal_entry_uuid AND j.status = 'posted') ON p.account_id = acct.id
     GROUP BY 1, 2
    HAVING COALESCE(sum(CASE WHEN p.debit_or_credit = 'credit' THEN p.amount_cents ELSE -p.amount_cents END), 0) < 0`)).rows;
  const applied = (await client.query(`SELECT 1 FROM _system._schema_migrations WHERE filename LIKE '202615360300%'`)).rows.length > 0;
  const trigger = (await client.query(`
    SELECT t.tgenabled AS enabled, t.tgdeferrable AS deferrable, t.tginitdeferred AS initdeferred
      FROM pg_trigger t WHERE t.tgrelid = 'accounting.journal_entry_postings'::regclass AND t.tgname = 'trg_driver_escrow_gl_never_negative'`)).rows[0] ?? null;
  await client.query("ROLLBACK");
  return { negatives, refusal: { applied, trigger } };
}

export async function runLive() {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    return await measure(client);
  } finally {
    client.release?.();
    await pool?.end?.();
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    const live = { applied: true, trigger: { enabled: "O", deferrable: true, initdeferred: true } };
    const cases = [
      ["the three measured negatives pass", liveFailures({ negatives: [{ account_number: "2100-00-027", company: "USMCA", balance_cents: -15000 }], refusal: live }).length === 0],
      ["a new negative escrow fails", liveFailures({ negatives: [{ account_number: "2100-00-001", company: "USMCA", balance_cents: -2500 }], refusal: live }).some((x) => x.startsWith("RULE 1"))],
      ["a known one going further negative fails", liveFailures({ negatives: [{ account_number: "2100-00-004", company: "USMCA", balance_cents: -5000 }], refusal: live }).some((x) => x.startsWith("RULE 1"))],
      ["applied refusal missing fails", liveFailures({ negatives: [], refusal: { applied: true, trigger: null } }).some((x) => x.startsWith("RULE 2"))],
      ["applied refusal not deferred fails", liveFailures({ negatives: [], refusal: { applied: true, trigger: { enabled: "O", deferrable: false, initdeferred: false } } }).some((x) => x.startsWith("RULE 2"))],
      ["not yet applied passes", liveFailures({ negatives: [], refusal: { applied: false, trigger: null } }).length === 0],
    ];
    for (const [n, ok] of cases) console.log(`  ${ok ? "✓" : "✗"} ${n}`);
    const bad = cases.filter(([, ok]) => !ok).length;
    console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
    process.exit(bad ? 1 : 0);
  }
  const m = await runLive();
  const f = liveFailures(m);
  if (f.length) { console.error(`${LABEL}: FAIL\n  ${f.join("\n  ")}`); process.exitCode = 1; }
  else console.log(`${LABEL}: OK — ${m.negatives.length} driver escrow(s) below zero, all measured Sep-24 purge population (${m.negatives.map((n) => `${n.account_number} ${n.balance_cents}`).join(", ") || "none"}); refusal ${m.refusal.applied ? "LIVE (deferred, fires at COMMIT)" : "not yet applied on this database"}.`);
}
