// R-190 (Lead, 09-25) — load 13541 (settlement 5796). The 5796 company PDF prints no fuel and no expenses, but the
// owner's Dreamline card statement (09-22-2026-FUEL-CARD-PROVIDER-STATEMENT-0807-0921-PARSED.csv) shows T171 / JOSE ANTONIO
// VICENTE on the tour (8/25 Laredo → 8/26 Vinton LA → 8/28 Laredo):
//   2026-08-25 LOVES #471 NATALIA TX   diesel 97.33 gal  gross 540.09
//   2026-08-26 LOVES #362 VINTON LA    diesel 48.63 gal  gross 266.93
//   2026-08-26 LOVES #471 NATALIA TX   qty 1 price 0.00  15.25  (a Love's scale) — live 13541-3, posted Cr 1000 cash, no item
// Basis measured on existing rows: USMCA fuel rows carry the GROSS the settlement PDF prints (e.g. 13600 1,081.17 vs statement
// gross 1,081.15), so the two diesel rows are recorded at statement gross, consistent with every other row.
// Do: 2 fuel purchases → createExpenseFromFuelTransaction (fixed engine) → card rail 2510 → post → read back;
//     13541-3 reversed on its date, voided, reissued as OTR-Scale Expense on 2510. DRY_RUN=1 rolls back.
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { postSourceTransactionInClientTx, reversePostedSourceTransactionInClientTx } from "../../apps/backend/src/accounting/posting-engine.service.js";
import { cascadeVoidChildren } from "../../apps/backend/src/accounting/cascade-void-engine.service.js";
import { appendCrudAudit } from "../../apps/backend/src/audit/crud-audit.js";
import { createExpenseFromFuelTransaction } from "../../apps/backend/src/fuel/fuel-expense-document.service.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const DRY = process.env.DRY_RUN === "1";
const TAG = "R-190";
if (!DRY) { const a = process.env.OWNER_AUTH_ID; if (!a) { console.error("OWNER_AUTH_ID required"); process.exit(1); } execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), a], { stdio: "inherit" }); }
class Rollback extends Error {}
const st: Record<string, any> = { je: [] as string[] };
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect(); await c.query("BEGIN");
await c.query("SET LOCAL app.bypass_rls = 'lucia'");
await c.query("SELECT set_config('app.current_user_id', $1::text, true)", [OWNER]);
await c.query("SELECT set_config('app.operating_company_id', $1::text, true)", [USMCA]);
let ok = false;
const readBack = async (je: string, label: string) => {
  const ls = (await c.query(`SELECT a.account_number n, jep.debit_or_credit dc, jep.amount_cents::bigint amt, j.entry_date::text d FROM accounting.journal_entry_postings jep JOIN accounting.journal_entries j ON j.id=jep.journal_entry_uuid JOIN catalogs.accounts a ON a.id=jep.account_id WHERE jep.journal_entry_uuid=$1::uuid`, [je])).rows;
  st.je.push(`${label} ${ls[0]?.d} ${ls.map((l: any) => `${l.dc === "debit" ? "Dr" : "Cr"} ${l.n} ${(Number(l.amt) / 100).toFixed(2)}`).join(" / ")}`);
  if (ls.some((l: any) => l.n === "2000" || l.n === "1000" || l.n === "9000")) throw new Error(`${label}: bad account in JE`);
};
try {
  const L = (await c.query(`SELECT id::text, assigned_primary_driver_id::text d, assigned_unit_id::text u FROM mdata.loads WHERE operating_company_id=$1 AND load_number='13541'`, [USMCA])).rows[0];
  const A2510 = (await c.query(`SELECT id::text FROM catalogs.accounts WHERE operating_company_id=$1 AND account_number='2510'`, [USMCA])).rows[0].id;
  const loves = (await c.query(`SELECT id::text FROM mdata.vendors WHERE operating_company_id=$1 AND upper(vendor_name) LIKE 'LOVE%' AND deactivated_at IS NULL ORDER BY created_at LIMIT 1`, [USMCA])).rows[0]?.id;
  if (!loves) throw new Error("Love's vendor not found");
  // Measured at 07:20 PM CT: the two diesel purchases ALREADY exist on 13541 (540.11 and 266.92, created 09-25, each with its
  // fuel expense) — not created again. The scale takes the same card rail as the load's own fuel expenses.
  const rail = (await c.query(`SELECT payment_account_uuid::text p FROM accounting.expenses WHERE load_id=$1::uuid AND source_fuel_transaction_id IS NOT NULL AND voided_at IS NULL AND payment_account_uuid IS NOT NULL LIMIT 1`, [L.id])).rows[0]?.p ?? A2510;
  // 13541-3: 15.25 scale on the card, posted Cr 1000 with no item → reissue on OTR-Scale Expense / 2510
  const e = (await c.query(`SELECT * FROM accounting.expenses WHERE operating_company_id=$1 AND expense_number='13541-3' AND voided_at IS NULL`, [USMCA])).rows[0];
  if (e) {
    const rev = (await reversePostedSourceTransactionInClientTx(c as never, { operating_company_id: USMCA, source_transaction_type: "expense", source_transaction_id: e.id } as never, { userId: OWNER }, String(e.transaction_date).slice(0, 10))).journal_entry_id;
    await c.query(`UPDATE accounting.expenses SET status='void', posting_status='reversed', reversed_by_je_id=$2::uuid, voided_at=now(), voided_by_user_id=$3::uuid, void_reason=$4 WHERE id=$1::uuid`, [e.id, rev, OWNER, `${TAG}: Dreamline statement 2026-08-26 LOVES #471 NATALIA qty 1 15.25 = a scale on the card; was Cr 1000 with no item`]);
    await cascadeVoidChildren(c as never, "expense", e.id, USMCA);
    const it = (await c.query(`SELECT id::text, default_expense_account_id::text a FROM catalogs.items WHERE item_name='OTR-Scale Expense' AND deactivated_at IS NULL AND default_expense_account_id IS NOT NULL AND (operating_company_id=$1 OR operating_company_id IS NULL) ORDER BY (operating_company_id IS NULL) LIMIT 1`, [USMCA])).rows[0];
    const used = (await c.query(`SELECT expense_number n FROM accounting.expenses WHERE operating_company_id=$1 AND expense_number LIKE '13541%' UNION SELECT expense_number FROM expense_attribution.expense_load_links WHERE operating_company_id=$1 AND expense_number LIKE '13541%'`, [USMCA])).rows.map((r: any) => String(r.n));
    let mx = 0; for (const u of used) { const m = u.match(/^13541-(\d+)$/); if (m) mx = Math.max(mx, Number(m[1])); }
    const num = `13541-${mx + 1}`;
    const id = (await c.query(`INSERT INTO accounting.expenses (operating_company_id, expense_number, vendor_uuid, driver_uuid, transaction_date, total_amount_cents, memo, load_id, status, posting_status, created_by_user_id, updated_by_user_id, is_sample_data, unit_id, payment_account_uuid)
        VALUES ($1::uuid,$2,$3::uuid,$4::uuid,'2026-08-26',1525,$5,$6::uuid,'draft','unposted',$7::uuid,$7::uuid,false,$8::uuid,$9::uuid) RETURNING id::text`,
      [USMCA, num, loves, L.d, `OTR-Scale Expense · LOVES #471 NATALIA TX · Dreamline statement 2026-08-26 (reissued from 13541-3, ${TAG})`, L.id, OWNER, L.u, rail])).rows[0].id;
    await c.query(`INSERT INTO accounting.expense_lines (operating_company_id, expense_id, line_sequence, amount, amount_cents, description, load_id, load_required, expense_account_uuid, item_id, line_category, quantity, rate_cents, unit_of_measure)
        VALUES ($1::uuid,$2::uuid,1,15.25,1525,'OTR-Scale Expense · load 13541',$3::uuid,true,$4::uuid,$5::uuid,'scale',1,1525,'each')`, [USMCA, id, L.id, it.a, it.id]);
    const seq = (await c.query(`INSERT INTO expense_attribution.expense_seq_per_load (load_id, last_seq) VALUES ($1::uuid, $2) ON CONFLICT (load_id) DO UPDATE SET last_seq = GREATEST(expense_attribution.expense_seq_per_load.last_seq + 1, $2), updated_at = now() RETURNING last_seq`, [L.id, mx + 2])).rows[0].last_seq;
    await c.query(`INSERT INTO expense_attribution.expense_load_links (operating_company_id, expense_id, expense_source, load_id, load_number, expense_seq, expense_number, attribution_method, attribution_confidence, attributed_by_user_id)
        VALUES ($1::uuid,$2::uuid,'accounting',$3::uuid,'13541',$4,$5,'auto_timestamp','high',$6::uuid)`, [USMCA, id, L.id, seq, num, OWNER]);
    const p = await postSourceTransactionInClientTx(c as never, { operating_company_id: USMCA, source_transaction_type: "expense", source_transaction_id: id } as never, { userId: OWNER });
    await c.query(`UPDATE accounting.expenses SET posting_status='posted', status='posted', posted_at=now(), journal_entry_id=$2::uuid WHERE id=$1::uuid`, [id, p.journal_entry_id]);
    await appendCrudAudit(c as never, OWNER, "expense.reissued", { from: e.id, from_number: "13541-3", to: id, to_number: num, round: TAG }, "info", "LEAD-R190");
    await readBack(p.journal_entry_id, `scale 15.25 ${num}`);
  }
  const tb = Number((await c.query(`SELECT COALESCE(sum(CASE WHEN jep.debit_or_credit='debit' THEN jep.amount_cents ELSE -jep.amount_cents END),0) net FROM accounting.journal_entry_postings jep JOIN accounting.journal_entries je ON je.id=jep.journal_entry_uuid WHERE je.operating_company_id=$1 AND je.status='posted'`, [USMCA])).rows[0].net);
  st.tb_net_cents = tb; if (tb !== 0) throw new Error(`TB ${tb}`);
  await c.query("SET CONSTRAINTS ALL IMMEDIATE");
  if (DRY) throw new Rollback("dry");
  await c.query("COMMIT"); ok = true; st.result = "COMMITTED";
} catch (err) {
  st.result = err instanceof Rollback ? "DRY_RUN rolled back" : "FAILED — rolled back: " + (err as Error).message;
} finally { if (!ok) await c.query("ROLLBACK").catch(() => {}); await c.end(); }
console.log(JSON.stringify(st, null, 1));
process.exit(String(st.result).startsWith("FAILED") ? 1 : 0);
