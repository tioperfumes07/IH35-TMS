// R-206 (Lead, AUTH-051) — settlement 5792 (GENARO GUERRERO CHAVEZ) to the signed AlwaysTrack Driver Settlement 5792,
// then close it. Owner order 2026-09-26: "fix that .01".
//
// SOURCE (Driver_Settlement_5792.pdf): Load 13562 Empty Miles 44.9 @ $0.45 = 20.21; Salary 1,738.05; Deductions -352.00;
// TOTAL DUE 1,386.05; Start 2026-08-26, End 2026-09-02.
// LIVE BEFORE: settlement line "Load 13562 — Empty Miles" = 20.20; driver bill 13562 loaded 189.19 / deadhead 20.20
// (gross 209.39 = PDF 189.18 + 20.21, split off by a cent each way); JE 728b7677 Dr 6890 1,738.04 / Cr 2170 1,386.04;
// header gross_pay 1,738.04, net_pay 1,386.05; period_end 2026-09-25 (feed date).
//
// CORRECTION (void-never-edit on money):
//   1. VOID the 20.20 line, INSERT its replacement at 20.21 (same load, bill, type).
//   2. Driver bill 13562 split -> loaded 18918 / deadhead 2021 (gross 20939 unchanged; bill has no GL of its own).
//   3. ADJUSTING JE on the settlement: Dr 6890 $0.01 / Cr 2170 $0.01 (entry date 2026-09-02). The original JE stays;
//      live non-reversed 2170 credit for 5792 becomes 1,386.05 = PDF.
//   4. Header gross_pay 1738.05, period_end 2026-09-02, status 'closed' (header only, like R-199).
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { appendCrudAudit } from "../../apps/backend/src/audit/crud-audit.js";
import { createJournalEntryOnClient } from "../../apps/backend/src/accounting/journal-entries.service.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const SETTLEMENT = "51ea6bd4-96e7-4a44-b06f-74169b23a371";
const OLD_LINE = "79ae2f08-bb61-43f0-99b5-2edab5a8830e";
const auth = process.env.OWNER_AUTH_ID;
if (!auth) { console.error("OWNER_AUTH_ID required"); process.exit(1); }
execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), auth], { stdio: "inherit" });

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect(); await c.query("BEGIN");
await c.query("SET LOCAL app.bypass_rls = 'lucia'");
await c.query("SELECT set_config('app.current_user_id', $1::text, true)", [OWNER]);
await c.query("SELECT set_config('app.operating_company_id', $1::text, true)", [USMCA]);
const net2170 = async () => Number((await c.query(
  `SELECT COALESCE(SUM(CASE WHEN p.debit_or_credit='credit' THEN p.amount_cents ELSE -p.amount_cents END),0) n
     FROM accounting.journal_entry_postings p
     JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
     JOIN catalogs.accounts a ON a.id = p.account_id
    WHERE p.operating_company_id=$1 AND p.source_transaction_type='driver_settlement' AND p.source_transaction_id=$2
      AND a.account_number='2170' AND je.reversed_by_je_id IS NULL AND je.reverses_je_id IS NULL`, [USMCA, SETTLEMENT])).rows[0].n);
try {
  const s = (await c.query(`SELECT status, gross_pay::text g, net_pay::text n FROM driver_finance.driver_settlements WHERE id=$1 AND operating_company_id=$2 FOR UPDATE`, [SETTLEMENT, USMCA])).rows[0];
  if (!s || s.status !== "approved") throw new Error(`settlement not approved: ${JSON.stringify(s)}`);
  if ((await net2170()) !== 138604) throw new Error(`2170 before is not 138604 — already corrected?`);

  // 1. line void + reissue
  const old = (await c.query(`SELECT * FROM driver_finance.settlement_lines WHERE id=$1 AND settlement_id=$2 AND voided_at IS NULL AND amount=20.20 FOR UPDATE`, [OLD_LINE, SETTLEMENT])).rows[0];
  if (!old) throw new Error("20.20 line not found / already voided");
  await c.query(`UPDATE driver_finance.settlement_lines SET voided_at=now(), void_reason=$2, voided_by_user_id=$3, is_active=false, updated_at=now() WHERE id=$1`,
    [OLD_LINE, "R-206: AlwaysTrack 5792 Load 13562 Empty Miles 44.9 @ $0.45 = 20.21, reissued", OWNER]);
  const ins = await c.query(
    `INSERT INTO driver_finance.settlement_lines (settlement_id, operating_company_id, line_type, description, amount, load_id, source_driver_bill_id, is_active, category, source_type, source_id, posting_account_id, item_id, quantity, rate_cents, unit_of_measure, driver_visible)
     SELECT settlement_id, operating_company_id, line_type, description, 20.21, load_id, source_driver_bill_id, true, category, source_type, source_id, posting_account_id, item_id, quantity, rate_cents, unit_of_measure, driver_visible
       FROM driver_finance.settlement_lines WHERE id=$1 RETURNING id::text`, [OLD_LINE]);

  // 2. bill split
  const b = await c.query(`UPDATE driver_finance.driver_bills SET loaded_pay_cents=18918, deadhead_pay_cents=2021, updated_at=now()
     WHERE id=$1 AND operating_company_id=$2 AND voided_at IS NULL AND gross_amount_cents=20939 AND loaded_pay_cents=18919 AND deadhead_pay_cents=2020 RETURNING bill_number`, [old.source_driver_bill_id, USMCA]);
  if (b.rowCount !== 1) throw new Error("bill 13562 split not in the expected state");

  // 3. adjusting JE
  const acct = async (n: string) => (await c.query(`SELECT id::text FROM catalogs.accounts WHERE operating_company_id=$1 AND account_number=$2 AND deactivated_at IS NULL`, [USMCA, n])).rows[0].id as string;
  const je = await createJournalEntryOnClient(c as never, {
    operating_company_id: USMCA,
    entry_date: "2026-09-02",
    memo: "Settlement 5792 — correction to AlwaysTrack 5792: Load 13562 Empty Miles 20.21 (was 20.20), driver pay 1,738.05 / net 1,386.05",
    source: "auto",
    source_transaction_type: "driver_settlement",
    source_transaction_id: SETTLEMENT,
    postings: [
      { account_id: await acct("6890"), debit_or_credit: "debit", amount_cents: 1, description: "Settlement 5792 — driver pay correction +$0.01 (load 13562 empty miles)" },
      { account_id: await acct("2170"), debit_or_credit: "credit", amount_cents: 1, description: "Settlement 5792 — net driver pay correction +$0.01" },
    ],
  } as never, { userId: OWNER, role: "system" });

  // 4. header + close
  await c.query(`UPDATE driver_finance.driver_settlements SET gross_pay=1738.05, period_end='2026-09-02', status='closed', updated_at=now() WHERE id=$1 AND operating_company_id=$2`, [SETTLEMENT, USMCA]);
  await appendCrudAudit(c as never, OWNER, "settlement.alwaystrack_cent_correction_and_close",
    { settlement: "5792", voided_line: OLD_LINE, new_line: ins.rows[0].id, bill: b.rows[0].bill_number, adjusting_je: je.id, before: s, round: "R-206" }, "info", "LEAD-R206");

  const after = await net2170();
  const tb = Number((await c.query(`SELECT COALESCE(SUM(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END),0) n FROM accounting.journal_entry_postings WHERE operating_company_id=$1`, [USMCA])).rows[0].n);
  const lines = (await c.query(`SELECT COALESCE(SUM(amount) FILTER (WHERE line_type IN ('earnings','deadhead_pay')),0)::text g FROM driver_finance.settlement_lines WHERE settlement_id=$1 AND voided_at IS NULL`, [SETTLEMENT])).rows[0].g;
  if (after !== 138605) throw new Error(`2170 after ${after} != 138605`);
  if (tb !== 0) throw new Error(`TB ${tb} != 0`);
  if (lines !== "1738.05") throw new Error(`pay lines ${lines} != 1738.05`);
  await c.query("COMMIT");
  console.log(JSON.stringify({ result: "COMMITTED", settlement: "5792", net_2170_cents: after, pay_lines: lines, adjusting_je: je.id, tb }));
} catch (err) {
  await c.query("ROLLBACK"); console.log(JSON.stringify({ result: "FAILED — rolled back: " + (err as Error).message })); process.exitCode = 1;
} finally { await c.end(); }
