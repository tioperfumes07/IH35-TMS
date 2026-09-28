#!/usr/bin/env tsx
/**
 * R-150 (Lead, AUTH-087) — create the 6 missing 2175-00-NNN "Driver Reimbursements" leaves.
 *
 * WHY: AUTH-079 (R-149) refused its whole run on its own pre-flight — "1 reimbursable row(s) have no
 * single 2175 leaf for their driver: doc 5800 exp f4056ff7". Measured live, the real population is 6
 * drivers who carry a live settlement but have no leaf, so a reimbursable expense of theirs has nowhere
 * to credit:
 *   ANGEL ALFONSO SOSA PEREZ · CONCEPCION CORDOVA DOMINGUEZ · LUIS ARMANDO SOSA PEREZ ·
 *   RAFAEL ROGELIO RIVERO REYNOSO · RUBEN PEDRO PEREZ GARCIA · VICENTE SANTOS CONTRERAS
 *
 * SHAPE — copied from the 10 leaves already live (2175-00-001..010), never invented:
 *   account_number  2175-00-NNN (next free, zero-padded)
 *   account_name    "<DRIVER NAME AS STORED> — Driver Reimbursements"   (em dash, as the others use)
 *   account_type    Liability · account_subtype "Other Current Liabilities"
 *   parent_account_id  e91e1781-c980-4983-b398-43a2c28fe25a  (2175-00 Driver Reimbursements)
 *   is_postable true · currency USD · notes "Auto-provisioned driver reimbursement sub-account (driver <uuid>)"
 *
 * Creates accounts only. No journal line, no posting, no balance. Refuses if the population moved, if a
 * leaf already exists for that driver, or if the trial balance or posting count changes.
 *
 * Usage: OWNER_AUTH_ID=AUTH-087 npx tsx scripts/ops/2026-09-28-lead-r150-create-6-missing-2175-leaves.ts
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { appendCrudAudit } from "../../apps/backend/src/audit/crud-audit.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const PARENT = "e91e1781-c980-4983-b398-43a2c28fe25a";
const auth = process.env.OWNER_AUTH_ID;
if (!auth) { console.error("OWNER_AUTH_ID required"); process.exit(1); }
execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), auth], { stdio: "inherit" });

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect(); await c.query("BEGIN");
await c.query("SET LOCAL app.bypass_rls = 'lucia'");
await c.query("SELECT set_config('app.current_user_id', $1::text, true)", [OWNER]);
await c.query("SELECT set_config('app.operating_company_id', $1::text, true)", [USMCA]);
const q = (sql: string, v: unknown[] = []) => c.query(sql, v);
const TB = `SELECT COALESCE(SUM(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END),0)::text n, count(*)::text rows FROM accounting.journal_entry_postings WHERE operating_company_id=$1`;
try {
  const tb0 = (await q(TB, [USMCA])).rows[0];

  // the parent must be the real 2175-00
  const parent = await q(`SELECT account_number FROM catalogs.accounts WHERE id=$1::uuid AND operating_company_id=$2`, [PARENT, USMCA]);
  if (parent.rows[0]?.account_number !== "2175-00") throw new Error(`parent ${PARENT} is not 2175-00`);

  // drivers on a live settlement with no leaf of their own
  const missing = (await q(
    `SELECT DISTINCT d.id::text, btrim(d.first_name||' '||d.last_name) nm
       FROM driver_finance.driver_settlements s JOIN mdata.drivers d ON d.id = s.driver_id
      WHERE s.operating_company_id = $1 AND s.voided_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM catalogs.accounts a
           WHERE a.operating_company_id = $1 AND a.account_number LIKE '2175-00-%'
             AND upper(btrim(split_part(a.account_name, '—', 1))) = upper(btrim(d.first_name||' '||d.last_name)))
      ORDER BY 2`, [USMCA])).rows as Array<{ id: string; nm: string }>;
  if (missing.length !== 6) throw new Error(`expected 6 drivers without a leaf, found ${missing.length}: ${missing.map((m) => m.nm).join(", ")}`);

  const maxRes = await q(`SELECT COALESCE(MAX(substring(account_number from '\\d+$')::int), 0) mx FROM catalogs.accounts WHERE operating_company_id=$1 AND account_number LIKE '2175-00-%'`, [USMCA]);
  let next = Number(maxRes.rows[0].mx);
  const made: Array<Record<string, string>> = [];
  for (const d of missing) {
    next += 1;
    const numStr = `2175-00-${String(next).padStart(3, "0")}`;
    const dup = await q(`SELECT 1 FROM catalogs.accounts WHERE operating_company_id=$1 AND account_number=$2`, [USMCA, numStr]);
    if (dup.rowCount) throw new Error(`${numStr} already exists`);
    const ins = await q(
      `INSERT INTO catalogs.accounts
         (account_number, account_name, account_type, account_subtype, parent_account_id, is_postable,
          currency_code, notes, operating_company_id, created_by_user_id, updated_by_user_id)
       VALUES ($1,$2,'Liability','Other Current Liabilities',$3::uuid,true,'USD',$4,$5,$6::uuid,$6::uuid)
       RETURNING id::text`,
      [numStr, `${d.nm} — Driver Reimbursements`, PARENT,
       `Auto-provisioned driver reimbursement sub-account (driver ${d.id})`, USMCA, OWNER]);
    made.push({ account_number: numStr, name: d.nm, driver_id: d.id, id: ins.rows[0].id });
  }

  const left = (await q(
    `SELECT count(*)::int n FROM (SELECT DISTINCT d.id FROM driver_finance.driver_settlements s JOIN mdata.drivers d ON d.id=s.driver_id
      WHERE s.operating_company_id=$1 AND s.voided_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM catalogs.accounts a WHERE a.operating_company_id=$1 AND a.account_number LIKE '2175-00-%'
          AND upper(btrim(split_part(a.account_name,'—',1))) = upper(btrim(d.first_name||' '||d.last_name)))) x`, [USMCA])).rows[0].n;
  if (left !== 0) throw new Error(`${left} drivers still have no leaf`);

  const tb1 = (await q(TB, [USMCA])).rows[0];
  if (tb1.n !== tb0.n || tb1.rows !== tb0.rows) throw new Error(`ledger moved: ${JSON.stringify({ tb0, tb1 })}`);

  await appendCrudAudit(c as never, OWNER, "catalogs.accounts.driver_reimbursement_leaves_created",
    { round: "R-150", auth, created: made }, "info", "LEAD-R150");
  await c.query("COMMIT");
  console.log(JSON.stringify({ result: "COMMITTED", created: made.length, accounts: made, tb_before: tb0, tb_after: tb1, drivers_without_leaf_left: left }, null, 1));
} catch (err) {
  await c.query("ROLLBACK"); console.log(JSON.stringify({ result: "FAILED — rolled back: " + (err as Error).message })); process.exitCode = 1;
} finally { await c.end(); }
