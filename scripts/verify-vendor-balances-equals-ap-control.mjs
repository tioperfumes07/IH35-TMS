#!/usr/bin/env node
/**
 * KILL THE SECOND SYSTEM table 12 (CC-3) — FAILS IF accounting.vendor_balances and A/P control disagree.
 * vendor_balances is a VIEW over open bills (never a stored balance). The GL is A/P control: the account bound to role
 * ap_control. Two facts, both on USMCA (TRANSPORTATION / TRUCKING are frozen and never read):
 *   1. PER VENDOR — the view's balance equals the A/P GL attributed to that vendor (by the posting's vendor entity or its
 *      source bill's vendor), for every vendor on either side.
 *   2. NOTHING OWED TO NOBODY — A/P control net equals the sum of the view. A/P that no vendor owes is a defect.
 *      Named debt (shrink-only): the 60 AUTH-138 re-reversals measured 2026-10-03 (2,976.63) — awaiting the owner AUTH
 *      for scripts/ops/2026-10-03-cc3-table12-undo-auth138-double-reversal.mts. The allowance is computed from the
 *      listed entries that are STILL unreversed, so it shrinks to 0 by itself when the AUTH runs; once all are reversed
 *      the list must be deleted (an exemption with nothing left to exempt FAILS).
 * Run: node scripts/verify-vendor-balances-equals-ap-control.mjs [--selftest]
 */
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const REQUIRES_LIVE_DB = "the A/P GL and the vendor subledger are live facts";
const LABEL = "verify-vendor-balances-equals-ap-control";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

/** The 60 AUTH-138 entries (Dr 9000 / Cr 2000, source journal_entry, no vendor). Shrink-only.
 * 2026-10-05: 60 -> 0 — every one reversed by the AUTH-400 void stage; the guard measured 0 open and asked for the
 * list to go. From here any A/P owed to no vendor fails with no allowance. */
export const KNOWN_VENDORLESS_JES = [];

export function evaluate({ perVendor, apNet, viewTotal, debtListed, debtOpenCents }) {
  const problems = [];
  for (const v of perVendor) {
    if (Number(v.gl_cents) !== Number(v.view_cents)) problems.push(`vendor ${v.vendor_id} (${v.name ?? "?"}): view ${v.view_cents} ≠ A/P GL ${v.gl_cents}`);
  }
  const vendorless = Number(apNet) - Number(viewTotal);
  if (vendorless !== Number(debtOpenCents)) {
    problems.push(`A/P control nets ${apNet} but the vendor subledger totals ${viewTotal}: ${vendorless} owed to no vendor (named debt still open: ${debtOpenCents})`);
  }
  if (debtListed > 0 && Number(debtOpenCents) === 0) problems.push("every named AUTH-138 entry is reversed — delete KNOWN debt from this guard (shrink-only)");
  return problems;
}

if (process.argv.includes("--selftest")) {
  const ok = evaluate({ perVendor: [{ vendor_id: "a", gl_cents: 5, view_cents: 5 }], apNet: 105, viewTotal: 5, debtListed: 60, debtOpenCents: 100 });
  const drift = evaluate({ perVendor: [{ vendor_id: "a", gl_cents: 6, view_cents: 5 }], apNet: 6, viewTotal: 5, debtListed: 0, debtOpenCents: 0 });
  const nobody = evaluate({ perVendor: [], apNet: 50, viewTotal: 0, debtListed: 0, debtOpenCents: 0 });
  const stale = evaluate({ perVendor: [], apNet: 0, viewTotal: 0, debtListed: 60, debtOpenCents: 0 });
  const cases = [
    ["ties, with the named debt still open, passes", ok.length === 0],
    ["a per-vendor drift FAILS", drift.length === 2 || drift.some((p) => p.includes("view 5 ≠ A/P GL 6"))],
    ["A/P owed to no vendor FAILS", nobody.length === 1],
    ["a fully-reversed named debt FAILS until removed", stale.length === 1],
  ];
  const bad = cases.filter(([, v]) => !v);
  if (bad.length) { console.error(`${LABEL} selftest FAIL: ${bad.map(([n]) => n).join("; ")}`); process.exit(1); }
  console.log(`${LABEL} selftest ${cases.length}/${cases.length}`);
  process.exit(0);
}

const { client: c, pool } = await requireLiveDbOrExit({ label: LABEL });
let problems = [];
try {
  await c.query("BEGIN READ ONLY");
  await c.query("SET LOCAL app.bypass_rls = 'lucia'");
  const ap = (await c.query(
    `SELECT r.account_id::text id, a.account_number FROM accounting.chart_of_accounts_roles r JOIN catalogs.accounts a ON a.id = r.account_id
      WHERE r.operating_company_id = $1::uuid AND r.role = 'ap_control' AND r.is_active`, [USMCA])).rows;
  if (ap.length !== 1) throw new Error(`expected one active ap_control binding for USMCA, found ${ap.length}`);
  const AP = ap[0].id;
  const perVendor = (await c.query(
    `WITH gl AS (
       SELECT COALESCE(CASE WHEN p.entity_type ILIKE 'vendor%' THEN p.entity_uuid::text END,
                       (SELECT COALESCE(NULLIF(b.vendor_id, ''), NULLIF(b.vendor_uuid, '')) FROM accounting.bills b
                         WHERE p.source_transaction_type = 'bill' AND b.id::text = p.source_transaction_id::text)) vendor_id,
              sum(CASE WHEN p.debit_or_credit = 'credit' THEN p.amount_cents ELSE -p.amount_cents END)::bigint gl_cents
         FROM accounting.journal_entry_postings p
        WHERE p.account_id = $1::uuid AND p.operating_company_id = $2::uuid GROUP BY 1),
     vw AS (SELECT vendor_id, balance_cents FROM accounting.vendor_balances WHERE operating_company_id = $2::uuid)
     SELECT COALESCE(gl.vendor_id, vw.vendor_id) vendor_id,
            (SELECT vendor_name FROM mdata.vendors v WHERE v.id::text = COALESCE(gl.vendor_id, vw.vendor_id)) name,
            COALESCE(gl.gl_cents, 0) gl_cents, COALESCE(vw.balance_cents, 0) view_cents
       FROM gl FULL JOIN vw ON vw.vendor_id = gl.vendor_id
      WHERE COALESCE(gl.vendor_id, vw.vendor_id) IS NOT NULL
        AND (COALESCE(gl.gl_cents, 0) <> 0 OR COALESCE(vw.balance_cents, 0) <> 0)`, [AP, USMCA])).rows;
  const apNet = (await c.query(
    `SELECT COALESCE(sum(CASE WHEN debit_or_credit = 'credit' THEN amount_cents ELSE -amount_cents END), 0)::bigint n
       FROM accounting.journal_entry_postings WHERE account_id = $1::uuid AND operating_company_id = $2::uuid`, [AP, USMCA])).rows[0].n;
  const viewTotal = (await c.query(`SELECT COALESCE(sum(balance_cents), 0)::bigint s FROM accounting.vendor_balances WHERE operating_company_id = $1::uuid`, [USMCA])).rows[0].s;
  const debtOpenCents = (await c.query(
    `SELECT COALESCE(sum(p.amount_cents), 0)::bigint s
       FROM accounting.journal_entries j JOIN accounting.journal_entry_postings p ON p.journal_entry_uuid = j.id AND p.account_id = $1::uuid
      WHERE j.operating_company_id = $2::uuid AND j.reversed_by_je_id IS NULL AND j.id = ANY($3::uuid[])
        AND p.source_transaction_type = 'journal_entry' AND p.debit_or_credit = 'credit'`, [AP, USMCA, KNOWN_VENDORLESS_JES])).rows[0].s;
  await c.query("ROLLBACK");
  problems = evaluate({ perVendor, apNet, viewTotal, debtListed: KNOWN_VENDORLESS_JES.length, debtOpenCents });
  console.log(`${LABEL}: USMCA A/P ${ap[0].account_number} nets ${apNet}; vendor subledger ${viewTotal} across ${perVendor.length} vendor(s); named AUTH-138 debt still open ${debtOpenCents}`);
} finally {
  c.release();
  await pool.end();
}
if (problems.length) { for (const p of problems) console.error(`FAIL ${p}`); process.exit(1); }
console.log(`${LABEL}: PASS — the vendor subledger is the A/P GL, vendor by vendor`);
