#!/usr/bin/env tsx
/** Clear residual 1090 Undeposited Funds to absolute $0. E11_LEAD_AUTH=1 npx tsx scripts/feed/clear-1090-dust.mts --apply */
import { withCurrentUser } from "../../apps/backend/src/auth/db.js";
import { setScopedCompanyContext } from "../../apps/backend/src/_helpers/scoped-company-context.js";
import { createJournalEntry } from "../../apps/backend/src/accounting/journal-entries.service.js";
import { companyBusinessDate } from "../../apps/backend/src/lib/company-business-date.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const APPLY = process.argv.includes("--apply");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL");
if (APPLY && process.env.E11_LEAD_AUTH !== "1") throw new Error("E11_LEAD_AUTH=1");

async function main() {
  await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    await c.query(`SELECT set_config('app.bypass_rls','lucia',true)`);
    const bal = await c.query<{ bal: string }>(
      `SELECT COALESCE(SUM(CASE WHEN p.debit_or_credit='debit' THEN p.amount_cents ELSE -p.amount_cents END),0)::text AS bal
         FROM accounting.journal_entry_postings p
         JOIN catalogs.accounts a ON a.id=p.account_id
         JOIN accounting.journal_entries je ON je.id=p.journal_entry_uuid
        WHERE p.operating_company_id=$1::uuid AND a.account_number='1090' AND je.voided_at IS NULL`,
      [USMCA]
    );
    const cents = Number(bal.rows[0]?.bal ?? 0);
    console.log(`1090_before_cents=${cents} apply=${APPLY}`);
    if (cents === 0) {
      console.log("DONE already_zero");
      return;
    }
    if (cents < 0) throw new Error(`unexpected credit balance on 1090: ${cents}`);
    if (!APPLY) return;
    const ids = await c.query<{ account_number: string; id: string }>(
      `SELECT account_number, id::text AS id FROM catalogs.accounts
        WHERE operating_company_id=$1::uuid AND account_number IN ('1000','1090')`,
      [USMCA]
    );
    const map = Object.fromEntries(ids.rows.map((r) => [r.account_number, r.id]));
    const je = await createJournalEntry(
      {
        operating_company_id: USMCA,
        entry_date: companyBusinessDate(),
        memo: "ACCT-F20260925j clear residual Undeposited Funds (escrow-release counterpart after TB close)",
        source: "manual",
        is_sample_data: false,
        postings: [
          {
            account_id: map["1000"],
            debit_or_credit: "debit",
            amount_cents: cents,
            description: "Deposit residual Undeposited Funds to Operating",
          },
          {
            account_id: map["1090"],
            debit_or_credit: "credit",
            amount_cents: cents,
            description: "Clear residual Undeposited Funds",
          },
        ],
      },
      { userId: OWNER, role: "Owner" },
      { suppressSideEffects: true }
    );
    const after = await c.query<{ bal: string }>(
      `SELECT COALESCE(SUM(CASE WHEN p.debit_or_credit='debit' THEN p.amount_cents ELSE -p.amount_cents END),0)::text AS bal
         FROM accounting.journal_entry_postings p
         JOIN catalogs.accounts a ON a.id=p.account_id
         JOIN accounting.journal_entries je ON je.id=p.journal_entry_uuid
        WHERE p.operating_company_id=$1::uuid AND a.account_number='1090' AND je.voided_at IS NULL`,
      [USMCA]
    );
    console.log(`JE ${je.id} 1090_after_cents=${after.rows[0].bal}`);
    console.log("DONE");
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
