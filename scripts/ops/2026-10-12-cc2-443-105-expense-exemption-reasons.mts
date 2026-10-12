// LEAD 443.105 #2 — the 5 USMCA expense lines with neither a load nor a load_exemption_reason (EXP-2026-00001..00005,
// written by bank-line categorization 2026-10-07) get their reason through the engine
// (apps/backend/src/accounting/expense-line-exemption-stamp.service.ts). Metadata only — no amount, account, item or
// journal entry changes; one audit row per line. Each reason is built from the line's own record: vendor, account, the
// bank line's text and date, all company overhead with no load on the source bank line.
//   default          DRY RUN (one transaction, rolled back): prints what it would stamp
//   --fork-commit    apply on a throwaway fork (assertNotProduction) and commit
//   --apply --auth AUTH-NNN   apply on production (assertIsIntendedProduction + verify-owner-authorization)
// Run: node --env-file=<env> --import tsx scripts/ops/2026-10-12-cc2-443-105-expense-exemption-reasons.mts [--fork-commit | --apply --auth AUTH-NNN]
import { execFileSync } from "node:child_process";
import pg from "pg";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";
import { stampExpenseLineLoadExemption } from "../../apps/backend/src/accounting/expense-line-exemption-stamp.service.ts";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const EXPECTED = ["EXP-2026-00001", "EXP-2026-00002", "EXP-2026-00003", "EXP-2026-00004", "EXP-2026-00005"];
const APPLY = process.argv.includes("--apply");
const FORK = process.argv.includes("--fork-commit");
let auth = "";
if (APPLY) {
  const i = process.argv.indexOf("--auth");
  auth = i > 0 ? process.argv[i + 1] ?? "" : "";
  if (!/^AUTH-\d+$/.test(auth)) throw new Error("--apply requires --auth AUTH-NNN");
  execFileSync("node", ["scripts/verify-owner-authorization.mjs", auth], { stdio: "inherit" });
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
if (APPLY) await assertIsIntendedProduction(db, { label: "443.105 expense exemption reasons" });
else if (FORK) await assertNotProduction(db, { label: "443.105 expense exemption reasons (fork)" });

await db.query("BEGIN");
try {
  await db.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await db.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);
  const rows = (
    await db.query<{ line_id: string; expense_number: string; vendor: string | null; account: string | null; memo: string | null; bank_date: string | null; amount_cents: string; je: string | null }>(
      `SELECT l.id::text AS line_id, e.expense_number, v.vendor_name AS vendor,
              trim(coalesce(a.account_number, '') || ' ' || coalesce(a.account_name, '')) AS account,
              coalesce(nullif(l.description, ''), e.memo) AS memo,
              e.transaction_date::date::text AS bank_date, l.amount_cents::text, e.journal_entry_id::text AS je
         FROM accounting.expense_lines l
         JOIN accounting.expenses e ON e.id = l.expense_id
         LEFT JOIN mdata.vendors v ON v.id = e.vendor_uuid
         LEFT JOIN catalogs.accounts a ON a.id = l.expense_account_uuid
        WHERE e.operating_company_id = $1::uuid AND e.voided_at IS NULL
          AND l.load_id IS NULL AND l.load_exemption_reason IS NULL
        ORDER BY e.expense_number, l.line_sequence`,
      [USMCA]
    )
  ).rows;
  const numbers = rows.map((r) => r.expense_number);
  if (numbers.length !== EXPECTED.length || numbers.some((n, i) => n !== EXPECTED[i])) {
    throw new Error(`REFUSE: expected exactly ${EXPECTED.join(", ")}; found ${numbers.join(", ") || "(none)"} — re-measure before stamping`);
  }
  // Money identity before / after: the stamp must not move a cent or a journal entry.
  const moneyBefore = rows.map((r) => `${r.line_id}:${r.amount_cents}:${r.je}`).join("|");
  for (const r of rows) {
    const reason = `Company cost — ${r.vendor ?? "bank"} — ${r.account} — "${(r.memo ?? "").slice(0, 70)}" (bank line ${r.bank_date}); no load on the source bank line`;
    const out = await stampExpenseLineLoadExemption(db as never, {
      operatingCompanyId: USMCA, expenseLineId: r.line_id, reason, actorUserId: OWNER, authorization: auth || (FORK ? "fork-rehearsal" : "dry-run"),
    });
    console.log(`${out.expense_number}  ${r.amount_cents}c  -> ${out.reason}`);
  }
  const after = (
    await db.query<{ line_id: string; amount_cents: string; je: string | null; reason: string | null }>(
      `SELECT l.id::text AS line_id, l.amount_cents::text, e.journal_entry_id::text AS je, l.load_exemption_reason AS reason
         FROM accounting.expense_lines l JOIN accounting.expenses e ON e.id = l.expense_id
        WHERE l.id = ANY($1::uuid[]) ORDER BY e.expense_number, l.line_sequence`,
      [rows.map((r) => r.line_id)]
    )
  ).rows;
  const moneyAfter = after.map((r) => `${r.line_id}:${r.amount_cents}:${r.je}`).join("|");
  if (moneyAfter !== moneyBefore) throw new Error("REFUSE: amounts / journal entries moved — rolled back");
  if (after.some((r) => !r.reason)) throw new Error("REFUSE: a line is still unexplained — rolled back");
  const left = (
    await db.query<{ n: string }>(
      `SELECT count(*)::text n FROM accounting.expense_lines l JOIN accounting.expenses e ON e.id = l.expense_id
        WHERE e.operating_company_id = $1::uuid AND e.voided_at IS NULL AND l.load_id IS NULL AND l.load_exemption_reason IS NULL`,
      [USMCA]
    )
  ).rows[0]!.n;
  console.log(`read-back: ${after.length} stamped, money identical, USMCA lines with neither load nor reason left: ${left}`);
  await db.query(APPLY || FORK ? "COMMIT" : "ROLLBACK");
  console.log(APPLY || FORK ? "COMMITTED" : "DRY RUN — rolled back");
} catch (e) {
  await db.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  await db.end();
}
