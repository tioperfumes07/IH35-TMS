#!/usr/bin/env tsx
/**
 * R-149 (Lead, AUTH-079) — repair the 245 document expenses seeded under AUTH-076 BEFORE they post.
 *
 * MEASURED DEFECT (live, 2026-09-28 05:30Z): all 245 carry payment_account_uuid = 1000 Bank of
 * America Operating and driver_uuid = NULL. They are status='draft', posting_status='unposted', so
 * NOTHING has reached the GL yet. Posting them as-is would credit the operating bank $12,764.22 for
 * cash that never left it — the exact defect R-185 fixed once for 27 rows, repeated 245 times.
 *
 * THE CORRECT CREDIT, from the source and the precedent — never guessed:
 *   - feed-input/r145-document-expenses-255.json carries `is_reimbursable`, which is the AlwaysTrack
 *     company-settlement "Reimb." vs "Comp.Exp." column. 41 rows true / $1,580.15, 214 false / $11,184.12.
 *   - is_reimbursable TRUE  -> the DRIVER paid -> Cr his own 2175-00-NNN "Driver Reimbursements" leaf.
 *   - is_reimbursable FALSE -> the COMPANY paid. The 75 already-posted document expenses use ONLY
 *     2510 Dreamline Diesel Card Payable (63) and 1295 Relay Fuel Wallet (12) — never 1000. Owner,
 *     2026-09-28: the settlement-PDF expenses are what relieves the Dreamline payable. A row whose
 *     invoice/date/amount matches a live Relay purchase -> 1295; every other company row -> 2510.
 *   - driver_uuid comes from the expense's own settlement (source_settlement_ref -> driver_settlements).
 *
 * REFUSES (never guesses, never partially applies — one transaction):
 *   - if any of the 245 is no longer draft/unposted (something posted underneath us)
 *   - if a reimbursable row's driver has no 2175 leaf
 *   - if any row ends with payment_account_uuid = 1000 or NULL
 *   - if the trial balance or posting row count moves at all (this round writes NO journal line)
 *
 * Usage: OWNER_AUTH_ID=AUTH-079 npx tsx scripts/ops/2026-09-28-lead-r149-fix-funding-and-driver-on-245.ts
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { appendCrudAudit } from "../../apps/backend/src/audit/crud-audit.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const auth = process.env.OWNER_AUTH_ID;
if (!auth) { console.error("OWNER_AUTH_ID required"); process.exit(1); }
execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), auth], { stdio: "inherit" });

const FEED = path.join(ROOT, "feed-input/r145-document-expenses-255.json");
const rows: Array<{ doc: string; date: string; vendor: string; amt: number; invoice: string; is_reimbursable: boolean }> =
  JSON.parse(fs.readFileSync(fs.existsSync(FEED) ? FEED : path.join(process.env.HOME!, "IH35-TMS-clean/feed-input/r145-document-expenses-255.json"), "utf8"));
// natural key -> reimbursable flag, exactly as seeded (doc|date|amount cents|invoice)
const flag = new Map<string, boolean>();
for (const r of rows) flag.set(`${r.doc}|${r.date}|${Math.round(r.amt * 100)}|${r.invoice ?? ""}`, !!r.is_reimbursable);

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect(); await c.query("BEGIN");
await c.query("SET LOCAL app.bypass_rls = 'lucia'");
await c.query("SELECT set_config('app.current_user_id', $1::text, true)", [OWNER]);
await c.query("SELECT set_config('app.operating_company_id', $1::text, true)", [USMCA]);
const q = (sql: string, v: unknown[] = []) => c.query(sql, v);
const TB = `SELECT COALESCE(SUM(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END),0)::text n, count(*)::text rows FROM accounting.journal_entry_postings WHERE operating_company_id=$1`;
try {
  const tb0 = (await q(TB, [USMCA])).rows[0];

  const target = (await q(
    `SELECT e.id::text, e.source_settlement_ref doc, e.transaction_date::text d, e.total_amount_cents cents, e.vendor_document_number inv
       FROM accounting.expenses e
      WHERE e.operating_company_id=$1 AND e.voided_at IS NULL AND e.status='draft' AND e.posting_status='unposted'
        AND e.source_settlement_ref IS NOT NULL`, [USMCA])).rows as Array<Record<string, string>>;
  if (target.length !== 245) throw new Error(`expected 245 draft/unposted document expenses, found ${target.length} — re-measure`);

  // 1. driver from the settlement
  const drv = await q(
    `UPDATE accounting.expenses e SET driver_uuid = s.driver_id, updated_at = now()
       FROM driver_finance.driver_settlements s
      WHERE s.operating_company_id=$1 AND s.voided_at IS NULL AND s.source_document_ref = e.source_settlement_ref
        AND e.operating_company_id=$1 AND e.voided_at IS NULL AND e.status='draft' AND e.posting_status='unposted'
        AND e.driver_uuid IS NULL`, [USMCA]);

  // 2. resolve the accounts
  const acct = async (num: string) => {
    const r = await q(`SELECT id::text FROM catalogs.accounts WHERE operating_company_id=$1 AND account_number=$2`, [USMCA, num]);
    if (r.rowCount !== 1) throw new Error(`account ${num}: ${r.rowCount} matches`);
    return r.rows[0]!.id as string;
  };
  const A2510 = await acct("2510");
  const A1295 = await acct("1295");

  // PRE-FLIGHT: every reimbursable row's driver must already have a 2175 leaf. Report ALL missing at
  // once and refuse the whole run — never create an account on the fly, never post one row to 1000.
  {
    const missing: string[] = [];
    for (const t of target) {
      if (flag.get(`${t.doc}|${t.d}|${t.cents}|${t.inv ?? ""}`) !== true) continue;
      const leaf = await q(
        `SELECT 1 FROM accounting.expenses e JOIN mdata.drivers d ON d.id=e.driver_uuid
           JOIN catalogs.accounts a ON a.operating_company_id=$1 AND a.account_number LIKE '2175-00-%'
            AND upper(btrim(split_part(a.account_name,'\u2014',1))) = upper(btrim(d.first_name||' '||d.last_name))
          WHERE e.id=$2::uuid`, [USMCA, t.id]);
      if ((leaf.rowCount ?? 0) !== 1) missing.push(`doc ${t.doc} exp ${t.id.slice(0, 8)}`);
    }
    if (missing.length) throw new Error(`${missing.length} reimbursable row(s) have no single 2175 leaf for their driver — create those leaves first: ${missing.slice(0, 25).join(" | ")}`);
  }

  let reimb = 0, relay = 0, dream = 0;
  for (const t of target) {
    const key = `${t.doc}|${t.d}|${t.cents}|${t.inv ?? ""}`;
    const isReimb = flag.get(key);
    if (isReimb === undefined) throw new Error(`no source row for ${key} — refusing to guess its funding`);
    if (isReimb) {
      const leaf = await q(
        `SELECT a.id::text FROM accounting.expenses e JOIN mdata.drivers d ON d.id=e.driver_uuid
           JOIN catalogs.accounts a ON a.operating_company_id=$1 AND a.account_number LIKE '2175-00-%'
            AND upper(btrim(split_part(a.account_name,'—',1))) = upper(btrim(d.first_name||' '||d.last_name))
          WHERE e.id=$2::uuid`, [USMCA, t.id]);
      if (leaf.rowCount !== 1) throw new Error(`reimbursable expense ${t.id} (doc ${t.doc}): ${leaf.rowCount} matching 2175 leaves — STOP, create the leaf first`);
      await q(`UPDATE accounting.expenses SET payment_account_uuid=$2::uuid, recover_from_driver=false, updated_at=now() WHERE id=$1::uuid`, [t.id, leaf.rows[0]!.id]);
      reimb++;
    } else {
      const isRelay = (await q(
        `SELECT 1 FROM integrations.relay_fuel_transactions r
          WHERE r.operating_company_id=$1 AND r.total_amount_paid_cents = $2::bigint
            AND r.relay_created_at::date = $3::date LIMIT 1`, [USMCA, t.cents, t.d])).rowCount ?? 0;
      await q(`UPDATE accounting.expenses SET payment_account_uuid=$2::uuid, updated_at=now() WHERE id=$1::uuid`, [t.id, isRelay ? A1295 : A2510]);
      if (isRelay) relay++; else dream++;
    }
  }

  // 3. assertions
  const bad = (await q(
    `SELECT count(*)::int n FROM accounting.expenses e LEFT JOIN catalogs.accounts a ON a.id=e.payment_account_uuid
      WHERE e.operating_company_id=$1 AND e.voided_at IS NULL AND e.status='draft' AND e.posting_status='unposted'
        AND (e.payment_account_uuid IS NULL OR a.account_number='1000' OR e.driver_uuid IS NULL)`, [USMCA])).rows[0].n;
  if (bad !== 0) throw new Error(`${bad} rows still on 1000 / NULL account / NULL driver`);
  const tb1 = (await q(TB, [USMCA])).rows[0];
  if (tb1.n !== tb0.n || tb1.rows !== tb0.rows) throw new Error(`ledger moved: ${JSON.stringify({ tb0, tb1 })}`);

  await appendCrudAudit(c as never, OWNER, "accounting.expenses.funding_corrected",
    { round: "R-149", auth, rows: target.length, drivers_set: drv.rowCount, reimbursable_to_2175: reimb, relay_1295: relay, dreamline_2510: dream }, "info", "LEAD-R149");
  await c.query("COMMIT");
  console.log(JSON.stringify({ result: "COMMITTED", rows: target.length, drivers_set: drv.rowCount, to_2175_driver: reimb, to_1295_relay: relay, to_2510_dreamline: dream, tb_before: tb0, tb_after: tb1 }, null, 1));
} catch (err) {
  await c.query("ROLLBACK"); console.log(JSON.stringify({ result: "FAILED — rolled back: " + (err as Error).message })); process.exitCode = 1;
} finally { await c.end(); }
