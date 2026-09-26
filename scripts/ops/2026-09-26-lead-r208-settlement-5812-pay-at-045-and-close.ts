// R-208 (Lead, AUTH-056) — settlement 5812 (LUIS ARMANDO SOSA PEREZ). Owner 2026-09-25 ~10:05 PM CT: AlwaysTrack printed
// every mile @ $0.00 (an AlwaysTrack error); "check other loads by sosa, the rpm is there" — his rate on 5779 and 5795 is
// $0.45/mile, loaded and empty. Owner confirmed booking 5812 at $0.45.
//   Load 13588 Loaded 1,855.1 @ 0.45 = 834.80 · Load 13600 Loaded 1,486.5 @ 0.45 = 668.93 · Empty 497.2 @ 0.45 = 223.74
//   Salary 1,727.47 · Escrow 2 x 25.00 · TOTAL DUE 1,677.47 (per-line rounding, the way AlwaysTrack rounds).
// Path: price the two $0 driver bills, void+reissue the two $0 earnings lines, add the empty-miles line, then post through
// the REAL pay-run close (closeSettlementPayRun on this transaction) and close the header; walk the 2 loads forward.
// Refuses unless the active escrow lines are exactly 2 x 25.00 (CC-3 ROUND 203 removes the duplicates first).
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { appendCrudAudit } from "../../apps/backend/src/audit/crud-audit.js";
import { closeSettlementPayRun } from "../../apps/backend/src/driver-finance/settlement-payrun-close.service.js";
import { syncLoadStatusToBillingInClientTx } from "../../apps/backend/src/dispatch/load-billing-lifecycle.service.js";
import { recomputeSettlementHeader } from "../../apps/backend/src/driver-finance/settlement-load-reassignment.service.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const SETTLEMENT = "e45eb50a-f64b-4b7f-a999-5e61e6af22d5";
const BILL_13588 = "289af2c2-e759-499b-bbb2-e32d6f0be7c4";
const BILL_13600 = "c8e643f0-7ecc-4fb7-a89a-00f3f5e7630a";
// The payment method every USMCA pay-run close used (139 closes in 7 days, incl. Luis's own 5779 and 5795; audit
// driver_finance.settlement.payrun_closed). Its GL account is asserted below (net must land on 2170).
const PAYMENT_METHOD = "81f95ee0-fb05-4b73-a0b6-867e02ed2117";
const auth = process.env.OWNER_AUTH_ID;
if (!auth) { console.error("OWNER_AUTH_ID required"); process.exit(1); }
execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), auth], { stdio: "inherit" });

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect(); await c.query("BEGIN");
await c.query("SET LOCAL app.bypass_rls = 'lucia'");
await c.query("SELECT set_config('app.current_user_id', $1::text, true)", [OWNER]);
await c.query("SELECT set_config('app.operating_company_id', $1::text, true)", [USMCA]);
const q = (sql: string, v: unknown[] = []) => c.query(sql, v);
try {
  const esc = (await q(`SELECT COALESCE(SUM(amount),0)::text s, count(*)::int n FROM driver_finance.settlement_lines WHERE settlement_id=$1 AND voided_at IS NULL AND line_type='escrow_contribution'`, [SETTLEMENT])).rows[0];
  if (esc.s !== "50.00" || esc.n !== 2) throw new Error(`escrow lines must be exactly 2 x 25.00 first (CC-3 ROUND 203); live ${esc.n} rows ${esc.s}`);
  const je = (await q(`SELECT count(*)::int n FROM accounting.journal_entry_postings WHERE operating_company_id=$1 AND source_transaction_type='driver_settlement' AND source_transaction_id=$2`, [USMCA, SETTLEMENT])).rows[0].n;
  if (je !== 0) throw new Error(`5812 already has ${je} postings`);

  // 1. price the bills (open, never posted on their own)
  const b1 = await q(`UPDATE driver_finance.driver_bills SET miles_basis=1855.1, miles_basis_type='practical', rate_per_mile_cents=45, loaded_pay_cents=83480, deadhead_pay_cents=0, gross_amount_cents=83480, updated_at=now()
      WHERE id=$1 AND operating_company_id=$2 AND voided_at IS NULL AND gross_amount_cents=0 RETURNING bill_number`, [BILL_13588, USMCA]);
  const b2 = await q(`UPDATE driver_finance.driver_bills SET miles_basis=1486.5, miles_basis_type='practical', rate_per_mile_cents=45, miles_deadhead=497.2, rate_empty_per_mile_cents=45, loaded_pay_cents=66893, deadhead_pay_cents=22374, gross_amount_cents=89267, updated_at=now()
      WHERE id=$1 AND operating_company_id=$2 AND voided_at IS NULL AND gross_amount_cents=0 RETURNING bill_number`, [BILL_13600, USMCA]);
  if (b1.rowCount !== 1 || b2.rowCount !== 1) throw new Error("bills not in the expected $0 state");

  // 2. void the $0 earnings lines, reissue at the PDF miles x 0.45, add the empty-miles line
  const zero = (await q(`SELECT id::text, source_driver_bill_id::text bill FROM driver_finance.settlement_lines WHERE settlement_id=$1 AND voided_at IS NULL AND line_type='earnings' AND amount=0`, [SETTLEMENT])).rows;
  if (zero.length !== 2) throw new Error(`expected 2 zero earnings lines, found ${zero.length}`);
  for (const z of zero) {
    await q(`UPDATE driver_finance.settlement_lines SET voided_at=now(), void_reason=$2, voided_by_user_id=$3, is_active=false, updated_at=now() WHERE id=$1`,
      [z.id, "R-208: AlwaysTrack printed $0.00/mi; owner-confirmed rate $0.45 (5779/5795), reissued", OWNER]);
  }
  const ins = async (bill: string, type: string, desc: string, amt: string) => (await q(
    `INSERT INTO driver_finance.settlement_lines (settlement_id, operating_company_id, line_type, description, amount, source_driver_bill_id, load_id, is_active)
     SELECT $1, $2, $3, $4, $5::numeric, b.id, b.load_id, true FROM driver_finance.driver_bills b WHERE b.id=$6 RETURNING id::text`,
    [SETTLEMENT, USMCA, type, desc, amt, bill])).rows[0].id;
  const l1 = await ins(BILL_13588, "earnings", "Load 13588 — Loaded Miles 1,855.1 @ $0.45", "834.80");
  const l2 = await ins(BILL_13600, "earnings", "Load 13600 — Loaded Miles 1,486.5 @ $0.45", "668.93");
  const l3 = await ins(BILL_13600, "deadhead_pay", "Load 13600 — Empty Miles 497.2 @ $0.45", "223.74");

  // 2b. the pay-run close reads the HEADER gross (settlement.gross_pay); roll the header up from the active lines with
  //     the canonical rollup (aggregateSettlementTotals via recomputeSettlementHeader) — first run refused "net -5000c"
  //     because the header still carried the $0 gross.
  const hdr = await recomputeSettlementHeader(c as never, SETTLEMENT, USMCA);
  const h = (await q(`SELECT gross_pay::text g, deductions_total::text d, net_pay::text n FROM driver_finance.driver_settlements WHERE id=$1`, [SETTLEMENT])).rows[0];
  if (h.g !== "1727.47") throw new Error(`header gross ${h.g} after ${hdr.method} rollup, expected 1727.47`);

  // 3. post through the real pay-run close on this transaction
  const pay = await closeSettlementPayRun({ operatingCompanyId: USMCA, settlementId: SETTLEMENT, paymentMethodId: PAYMENT_METHOD } as never, { userId: OWNER, role: "Owner" } as never, { client: c as never });

  // 4. read back the GL for 5812
  const gl = (await q(`SELECT a.account_number n, SUM(CASE WHEN p.debit_or_credit='debit' THEN p.amount_cents ELSE -p.amount_cents END)::bigint v
      FROM accounting.journal_entry_postings p JOIN accounting.journal_entries j ON j.id=p.journal_entry_uuid JOIN catalogs.accounts a ON a.id=p.account_id
     WHERE p.operating_company_id=$1 AND p.source_transaction_type='driver_settlement' AND p.source_transaction_id=$2 AND j.reversed_by_je_id IS NULL AND j.reverses_je_id IS NULL
     GROUP BY 1 ORDER BY 1`, [USMCA, SETTLEMENT])).rows;
  const m = Object.fromEntries(gl.map((r) => [r.n, Number(r.v)]));
  if (m["6890"] !== 172747 || m["2170"] !== -167747 || m["2100-00-001"] !== -5000) throw new Error(`GL does not tie to 1,727.47 / 1,677.47 / 50.00: ${JSON.stringify(m)}`);

  // 5. header close (period from the PDF) + loads
  await q(`UPDATE driver_finance.driver_settlements SET status='closed', period_start='2026-09-08', period_end='2026-09-21', updated_at=now() WHERE id=$1 AND operating_company_id=$2`, [SETTLEMENT, USMCA]);
  const loads = [];
  for (const bill of [BILL_13588, BILL_13600]) {
    const lid = (await q(`SELECT load_id::text FROM driver_finance.driver_bills WHERE id=$1`, [bill])).rows[0].load_id;
    loads.push(await syncLoadStatusToBillingInClientTx(c as never, { operatingCompanyId: USMCA, loadId: lid, actorUserId: OWNER }));
  }
  await appendCrudAudit(c as never, OWNER, "settlement.priced_at_owner_rate_and_closed",
    { settlement: "5812", rate_cents: 45, bills: [b1.rows[0].bill_number, b2.rows[0].bill_number], voided_lines: zero.map((z) => z.id), new_lines: [l1, l2, l3], gl: m, round: "R-208" }, "info", "LEAD-R208");
  const tb = Number((await q(`SELECT COALESCE(SUM(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END),0) n FROM accounting.journal_entry_postings WHERE operating_company_id=$1`, [USMCA])).rows[0].n);
  if (tb !== 0) throw new Error(`TB ${tb}`);
  await c.query("COMMIT");
  console.log(JSON.stringify({ result: "COMMITTED", settlement: "5812", payrun: pay, gl: m, loads, tb }, null, 1));
} catch (err) {
  await c.query("ROLLBACK"); console.log(JSON.stringify({ result: "FAILED — rolled back: " + (err as Error).message })); process.exitCode = 1;
} finally { await c.end(); }
