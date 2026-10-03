#!/usr/bin/env node
/**
 * A DRIVER'S ESCROW NEVER RELEASES MORE THAN IT HOLDS (standing order F-1 / Lead ROUND 358 — CC-1, migration
 * 202615340100). Owner: "THE DRIVER DAMAGE IS THE ESCROW ACCOUNT FOR THE DRIVERS THEY ONLY HAVE ONE, IT IS WHERE THE 25
 * DOLLAR DEDUCTIONS GO TO." The 2100-00-<nnn> sub-account is the driver's damage fund: drawn to zero, never below.
 *
 * LIVE (fails closed without a database), every company, under the bypass:
 *   1-3. (retired 2026-10-03 — KILL THE SECOND SYSTEM tables 1-5: the stored escrow_balances amounts and
 *        escrow_accounts.balance_cents no longer exist; rule 4 reads the same fact from the books)
 *   4. no driver escrow GL sub-account (accounting.escrow_accounts.coa_account_id, holder driver) with a DEBIT balance
 * STATIC:
 *   5. the last migration touching it (re)creates the DEFERRABLE trg_refuse_driver_escrow_gl_debit_balance; the two
 *      refusals on stored amounts — trg_refuse_driver_escrow_account_negative (202615380000) and
 *      trg_refuse_escrow_over_release (202615380100) — are retired with their columns and must stay DROPPED.
 *
 * DEBT — shrink-only, every entry named and reasoned. A new over-released driver fails; an entry that no longer
 * violates FAILS too ("remove it so the ceiling drops") — a debt list that cannot shrink is not a ratchet.
 *   The three over-released on 2026-09-24/25 by settlement escrow-contribution reversals (ACCT-F20260924/25, R-161)
 *   that reversed contributions a "sync projection to GL after AT escrow excess release" had already partly released.
 *   They are purge population (ROUND 350); the database now refuses the writer that made them. Ceiling 3 -> 0 when the
 *   governed purge removes their postings.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const REQUIRES_LIVE_DB = "escrow balances are live money — fails closed without a database";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIG = resolve(ROOT, "db/migrations");
const LABEL = "verify-escrow-never-over-releases";

/** key = "<company code>:<GL account number>" */
export const DEBT = {
  "USMCA:2100-00-027": "Jorge Luis Infante Corona — over-released $150.00 by the 2026-09-25 R-161 contribution reversals; purge population",
  "USMCA:2100-00-002": "Neftali Coronado Urbano — over-released $50.00 by the 2026-09-25 R-161 contribution reversals; purge population",
  "USMCA:2100-00-004": "Rafael Rogelio Rivero Reynoso — over-released $25.00 by the 2026-09-25 R-161 contribution reversals; purge population",
};
export const CEILING = Object.keys(DEBT).length;

const stripSql = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");
const TRIGGERS = [
  ["trg_refuse_driver_escrow_gl_debit_balance", /CREATE\s+CONSTRAINT\s+TRIGGER\s+trg_refuse_driver_escrow_gl_debit_balance\s+AFTER\s+INSERT\s+OR\s+UPDATE[^;]*ON\s+accounting\.journal_entry_postings\s+DEFERRABLE\s+INITIALLY\s+DEFERRED/i],
];

/** KILL THE SECOND SYSTEM table 1 (202615380000): refusals on the stored escrow_accounts.balance_cents died with the
 *  column; the GL refusals (trg_refuse_driver_escrow_gl_debit_balance, trg_driver_escrow_gl_never_negative) own the fact.
 *  The last migration touching each must DROP it, so it can never come back. */
const RETIRED = [
  ["trg_refuse_escrow_over_release", /DROP\s+TRIGGER\s+IF\s+EXISTS\s+trg_refuse_escrow_over_release\s+ON\s+driver_finance\.escrow_balances/i],
  ["trg_refuse_driver_escrow_account_negative", /DROP\s+TRIGGER\s+IF\s+EXISTS\s+trg_refuse_driver_escrow_account_negative\s+ON\s+accounting\.escrow_accounts/i],
];

export function staticFailures({ files, read }) {
  const out = [];
  const sorted = [...files].filter((f) => /^\d{12}_.*\.sql$/.test(f)).sort();
  for (const [name, shape] of TRIGGERS) {
    let hit = null;
    for (const f of sorted) { const s = stripSql(read(f)); if (new RegExp(name, "i").test(s)) hit = { f, s }; }
    if (!hit || !shape.test(hit.s)) out.push(`RULE 5: ${hit?.f ?? "no migration"} — ${name} must be (re)created with its full shape by the last migration touching it.`);
  }
  for (const [name, dropped] of RETIRED) {
    let hit = null;
    for (const f of sorted) { const s = stripSql(read(f)); if (new RegExp(name, "i").test(s)) hit = { f, s }; }
    if (hit && !dropped.test(hit.s)) out.push(`RULE 5: ${hit.f} — ${name} was retired with its stored column (KILL THE SECOND SYSTEM); the last migration touching it must DROP it.`);
  }
  return out;
}

/** violations: [{ key, kind, detail }] */
export function liveFailures(violations) {
  const failures = [];
  const seen = new Set();
  for (const v of violations) {
    seen.add(v.key);
    if (!DEBT[v.key]) failures.push(`${v.kind}: ${v.key} ${v.detail} — a driver's escrow never releases more than it holds.`);
  }
  for (const k of Object.keys(DEBT)) {
    if (!seen.has(k)) failures.push(`DEBT RATCHET: ${k} no longer violates — remove it from DEBT so the ceiling drops (${CEILING} -> ${CEILING - 1}).`);
  }
  return failures;
}

export function run() {
  return staticFailures({ files: readdirSync(MIG), read: (f) => readFileSync(resolve(MIG, f), "utf8") });
}

async function measure(client) {
  await client.query("BEGIN READ ONLY");
  await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
  const { rows } = await client.query(`
    WITH acct AS (
      SELECT ea.id AS ea_id, ea.holder_id, ea.operating_company_id, ea.coa_account_id,
             c.code || ':' || a.account_number AS key
        FROM accounting.escrow_accounts ea
        JOIN catalogs.accounts a ON a.id = ea.coa_account_id
        JOIN org.companies c ON c.id = ea.operating_company_id
       WHERE ea.holder_type = 'driver'
    )
    -- rules 1-3 (stored escrow_balances / escrow_accounts amounts) died with their columns — 202615380000 / 202615380100
    SELECT acct.key, 'GL_DEBIT_BALANCE', 'GL net debit ' || sum(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END) || ' cents'
      FROM acct JOIN accounting.journal_entry_postings p ON p.account_id = acct.coa_account_id
      JOIN accounting.journal_entries j ON j.id = p.journal_entry_uuid AND j.status = 'posted'
     GROUP BY acct.key
    HAVING sum(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END) > 0

     ORDER BY 1, 2`);
  const drivers = await client.query(`SELECT count(*)::int AS n FROM accounting.escrow_accounts WHERE holder_type = 'driver'`);
  await client.query("ROLLBACK");
  return { rows, driverAccounts: drivers.rows[0].n };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    const debtRows = Object.keys(DEBT).map((k) => ({ key: k, kind: "GL_DEBIT_BALANCE", detail: "x" }));
    const cases = [
      ["named debt only passes", liveFailures(debtRows).length === 0],
      ["a new over-released driver fails", liveFailures([...debtRows, { key: "USMCA:2100-00-099", kind: "NEGATIVE_BALANCE", detail: "-1" }]).length === 1],
      ["a debt entry that went green fails (shrink)", liveFailures(debtRows.slice(1)).some((f) => f.startsWith("DEBT RATCHET"))],
      ["ceiling is the named debt", CEILING === 3],
    ];
    for (const [n, ok] of cases) console.log(`  ${ok ? "✓" : "✗"} ${n}`);
    const bad = cases.filter(([, ok]) => !ok).length;
    console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
    process.exit(bad ? 1 : 0);
  }
  const sf = run();
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    const { rows, driverAccounts } = await measure(client);
    const all = [...sf, ...liveFailures(rows)];
    if (driverAccounts === 0) all.push("no driver escrow account visible — a guard that sees nothing proves nothing");
    if (all.length) {
      console.error(`${LABEL}: FAIL\n  ${all.join("\n  ")}`);
      process.exitCode = 1;
    } else {
      console.log(`${LABEL}: OK — ${driverAccounts} driver escrow accounts; over-released: only the ${CEILING} named debt entries (${Object.keys(DEBT).join(", ")}), ceiling ${CEILING}; the GL debit-balance refusal is in place and the stored-amount refusals stay dropped.`);
    }
  } finally {
    client.release?.();
    await pool?.end?.();
  }
}
