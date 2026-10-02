#!/usr/bin/env node
// ROUND 326 item 3 (CC-1) — A/P is a real subledger: the ap_control GL balance equals the open bills (amount - paid,
// not voided). USMCA measured 2026-10-02: GL credit $3,542.98 vs open bills $566.35 — variance $2,976.63, exactly the 60
// orphan expense-JE chains the 2026-09-30 purge left in A/P (expense deleted, its JE + void reversal + re-reversal kept).
// Shrink-only against the baseline variance until the orphan-postings scope of the complete-delete engine runs; then 0.
// Live, read-only, FAIL-CLOSED without DATABASE_URL. USMCA (TRANSP / TRK bills are QBO parallel-book clones, not GL-posted).
import { readFileSync } from "node:fs";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-ap-control-ties-subledger";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const base = JSON.parse(readFileSync(new URL("./verify-ap-control-ties-subledger.baseline.json", import.meta.url), "utf8"));

const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
try {
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");
  const r = (await client.query(
    `SELECT (SELECT account_id::text FROM accounting.chart_of_accounts_roles WHERE operating_company_id = $1::uuid AND role = 'ap_control' AND is_active LIMIT 1) AS acct,
            (SELECT COALESCE(sum(CASE WHEN p.debit_or_credit::text = 'credit' THEN p.amount_cents ELSE -p.amount_cents END), 0)
               FROM accounting.journal_entry_postings p
              WHERE p.operating_company_id = $1::uuid
                AND p.account_id = (SELECT account_id FROM accounting.chart_of_accounts_roles WHERE operating_company_id = $1::uuid AND role = 'ap_control' AND is_active LIMIT 1))::bigint AS gl,
            (SELECT COALESCE(sum(amount_cents - COALESCE(paid_cents, 0)), 0) FROM accounting.bills
              WHERE operating_company_id = $1::uuid AND voided_at IS NULL AND status::text <> 'paid')::bigint AS open`, [USMCA])).rows[0];
  await client.query("ROLLBACK");
  if (!r.acct) { console.error(`${LABEL}: LIVE FAIL — USMCA has no ap_control account bound`); process.exit(1); }
  const variance = Math.abs(Number(r.gl) - Number(r.open));
  if (variance > base.variance_cents) {
    console.error(`${LABEL}: LIVE FAIL — A/P control ${r.gl} vs open bills ${r.open}: variance ${variance} cents (baseline ${base.variance_cents}, measured_at ${base.measured_at})`);
    process.exit(1);
  }
  console.log(`${LABEL}: LIVE PASS — A/P control ${r.gl} vs open bills ${r.open} cents: variance ${variance} (baseline ${base.variance_cents}, measured_at ${base.measured_at})${variance === 0 ? " — TIED" : variance < base.variance_cents ? " — SHRINK the baseline" : ""}`);
} finally {
  client.release();
  await pool.end();
}
