// R-212 (Lead, AUTH-072) — complete the void on the settlement lines that were switched off but never voided.
// Measured 2026-09-26: 113 driver_finance.settlement_lines ($3,010.50; 77 escrow_contribution x $25, 19 deduction,
// 15 extra_pay, 1 reimbursement, 1 earnings $0) across 35 settlements are is_active=false with voided_at NULL
// (flipped 2026-09-24 18:48Z .. 2026-09-25 01:13Z). The pay-run engine already excluded them (the GL is right);
// every void-keyed reader counted them: CC-3's "duplicate escrow lines", 5812's 4 lines vs the PDF's 2,
// S-5816 closed with no JE while carrying a $25 escrow line its AlwaysTrack PDF (TOTAL DUE 0.00) does not have.
// Fix: stamp voided_at / void_reason / voided_by_user_id on exactly those rows. No amount changes, no JE, no
// posted-money row touched. Refuses unless the population is exactly 113 / $3,010.50 and nothing posts from them.
import { execFileSync } from "node:child_process";
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

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect(); await c.query("BEGIN");
await c.query("SET LOCAL app.bypass_rls = 'lucia'");
await c.query("SELECT set_config('app.current_user_id', $1::text, true)", [OWNER]);
await c.query("SELECT set_config('app.operating_company_id', $1::text, true)", [USMCA]);
const q = (sql: string, v: unknown[] = []) => c.query(sql, v);
const tbSql = `SELECT COALESCE(SUM(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END),0)::bigint n, count(*)::bigint rows FROM accounting.journal_entry_postings WHERE operating_company_id=$1`;
try {
  const pop = (await q(`SELECT array_agg(id) ids, count(*)::int n, COALESCE(SUM(amount),0)::text amt FROM driver_finance.settlement_lines
      WHERE operating_company_id=$1 AND is_active=false AND voided_at IS NULL`, [USMCA])).rows[0];
  if (pop.n !== 113 || pop.amt !== "3010.50") throw new Error(`population moved: ${pop.n} rows / ${pop.amt} (expected 113 / 3010.50) — re-measure`);
  const refs = (await q(`SELECT
      (SELECT count(*)::int FROM accounting.journal_entry_postings WHERE source_transaction_line_id::text = ANY($1::text[])) postings,
      (SELECT count(*)::int FROM driver_finance.escrow_ledger WHERE settlement_line_id = ANY($1::uuid[])) escrow_ledger,
      (SELECT count(*)::int FROM driver_finance.driver_reimbursements WHERE settlement_line_id = ANY($1::uuid[])) reimbursements`, [pop.ids])).rows[0];
  if (refs.postings || refs.escrow_ledger || refs.reimbursements) throw new Error(`lines are referenced: ${JSON.stringify(refs)} — refusing`);
  const tb0 = (await q(tbSql, [USMCA])).rows[0];

  const upd = await q(`UPDATE driver_finance.settlement_lines
      SET voided_at = now(), voided_by_user_id = $2::uuid,
          void_reason = 'R-212 (AUTH-072): switched off (is_active=false) without a void stamp; engine already excluded it — void completed, no amount or GL change',
          updated_at = now()
    WHERE id = ANY($1::uuid[]) AND operating_company_id = $3 AND is_active = false AND voided_at IS NULL
    RETURNING settlement_id::text`, [pop.ids, OWNER, USMCA]);
  if (upd.rowCount !== 113) throw new Error(`stamped ${upd.rowCount}, expected 113`);

  const tb1 = (await q(tbSql, [USMCA])).rows[0];
  if (tb1.n !== "0" || tb1.n !== tb0.n || tb1.rows !== tb0.rows) throw new Error(`ledger moved: ${JSON.stringify({ tb0, tb1 })}`);
  const left = (await q(`SELECT count(*)::int n FROM driver_finance.settlement_lines WHERE operating_company_id=$1 AND is_active=false AND voided_at IS NULL`, [USMCA])).rows[0].n;
  if (left !== 0) throw new Error(`${left} still off-not-voided`);
  const s5816 = (await q(`SELECT COALESCE(SUM(sl.amount),0)::text t FROM driver_finance.settlement_lines sl JOIN driver_finance.driver_settlements s ON s.id=sl.settlement_id
      WHERE s.operating_company_id=$1 AND s.display_id='S-5816' AND sl.voided_at IS NULL`, [USMCA])).rows[0].t;
  const s5812 = (await q(`SELECT count(*)::int n, COALESCE(SUM(sl.amount),0)::text t FROM driver_finance.settlement_lines sl JOIN driver_finance.driver_settlements s ON s.id=sl.settlement_id
      WHERE s.operating_company_id=$1 AND s.display_id='S-5812' AND sl.voided_at IS NULL AND sl.line_type='escrow_contribution'`, [USMCA])).rows[0];
  const settlements = [...new Set(upd.rows.map((r) => r.settlement_id))];
  await appendCrudAudit(c as never, OWNER, "driver_finance.settlement_lines.void_completed",
    { round: "R-212", auth, lines: 113, amount: "3010.50", settlements: settlements.length, s5816_active_total: s5816, s5812_escrow: s5812 }, "info", "LEAD-R212");
  await c.query("COMMIT");
  console.log(JSON.stringify({ result: "COMMITTED", stamped: upd.rowCount, settlements: settlements.length, tb_before: tb0, tb_after: tb1, off_not_voided_left: left, s5816_active_total: s5816, s5812_escrow: s5812 }, null, 1));
} catch (err) {
  await c.query("ROLLBACK"); console.log(JSON.stringify({ result: "FAILED — rolled back: " + (err as Error).message })); process.exitCode = 1;
} finally { await c.end(); }
