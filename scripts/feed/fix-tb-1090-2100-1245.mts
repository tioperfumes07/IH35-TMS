#!/usr/bin/env tsx
/**
 * Close TB residues that block verify-trial-balance-and-balance-sheet after Aug+Sep AT close:
 *   F 2100 — orphan escrow RELEASE posted to parent 2100 (debit $125); real escrow lives on 2100-00-*.
 *   F 1245 — historical_backfill CAs recovered at pay-run (CR 1245) never had issuance DR 1245.
 *   E 1090 — Faro factoring advances sit in Undeposited Funds after fuel wash; deposit residual to 1000.
 *
 *   E11_LEAD_AUTH=1 npx tsx scripts/feed/fix-tb-1090-2100-1245.mts --apply
 */
import { withCurrentUser } from "../../apps/backend/src/auth/db.js";
import { setScopedCompanyContext } from "../../apps/backend/src/_helpers/scoped-company-context.js";
import {
  createJournalEntry,
  reverseJournalEntryNoFlip,
} from "../../apps/backend/src/accounting/journal-entries.service.js";
import { companyBusinessDate } from "../../apps/backend/src/lib/company-business-date.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const APPLY = process.argv.includes("--apply");
const REASON = "ACCT-F20260925i TB close: reverse orphan 2100 release; backfill CA issuance DR 1245; deposit 1090→1000";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL");
if (APPLY && process.env.E11_LEAD_AUTH !== "1") throw new Error("E11_LEAD_AUTH=1");

async function acctId(
  c: { query: (sql: string, v?: unknown[]) => Promise<{ rows: Array<{ id: string }> }> },
  num: string
): Promise<string> {
  const r = await c.query(
    `SELECT id::text AS id FROM catalogs.accounts
      WHERE operating_company_id=$1::uuid AND account_number=$2 LIMIT 1`,
    [USMCA, num]
  );
  const id = r.rows[0]?.id;
  if (!id) throw new Error(`missing account ${num}`);
  return id;
}

async function main() {
  await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);
    await c.query(`SELECT set_config('app.bypass_rls','lucia',true)`);
    const biz = companyBusinessDate();
    const a1000 = await acctId(c, "1000");
    const a1090 = await acctId(c, "1090");
    const a1245 = await acctId(c, "1245");

    // --- measure ---
    const bal = async (num: string) => {
      const r = await c.query<{ bal: string }>(
        `SELECT COALESCE(SUM(CASE WHEN p.debit_or_credit='debit' THEN p.amount_cents ELSE -p.amount_cents END),0)::text AS bal
           FROM accounting.journal_entry_postings p
           JOIN catalogs.accounts a ON a.id=p.account_id
           JOIN accounting.journal_entries je ON je.id=p.journal_entry_uuid
          WHERE p.operating_company_id=$1::uuid AND a.account_number=$2 AND je.voided_at IS NULL`,
        [USMCA, num]
      );
      return Number(r.rows[0]?.bal ?? 0);
    };
    const before = {
      "1090": await bal("1090"),
      "1245": await bal("1245"),
      "2100": await bal("2100"),
      "1000": await bal("1000"),
    };
    console.log("BEFORE_CENTS", before);

    const orphan = await c.query<{ id: string; memo: string }>(
      `SELECT je.id::text, je.memo
         FROM accounting.journal_entries je
         JOIN accounting.journal_entry_postings p ON p.journal_entry_uuid=je.id
         JOIN catalogs.accounts a ON a.id=p.account_id
        WHERE je.operating_company_id=$1::uuid
          AND a.account_number='2100'
          AND je.voided_at IS NULL
          AND je.reversed_by_je_id IS NULL
          AND je.memo ILIKE 'Escrow release%'
        GROUP BY je.id, je.memo
        ORDER BY je.id`,
      [USMCA]
    );
    console.log(
      `orphan_2100_releases=${orphan.rows.length}`,
      orphan.rows.map((r) => `${r.id.slice(0, 8)}:${r.memo}`).join(" | ")
    );

    const advances = await c.query<{ id: string; display_id: string; amount_cents: string }>(
      `SELECT da.id::text, da.display_id, (ROUND(da.amount::numeric,2)*100)::bigint::text AS amount_cents
         FROM driver_finance.driver_advances da
        WHERE da.operating_company_id=$1::uuid AND da.voided_at IS NULL AND da.status='recovered'
          AND NOT EXISTS (
            SELECT 1 FROM accounting.journal_entry_postings p
             WHERE p.source_transaction_id=da.id::text
               AND p.source_transaction_type IN ('cash_advance','driver_advance','driver_cash_advance')
               AND p.reversal_of_line_id IS NULL AND p.reversed_by_line_id IS NULL
               AND p.debit_or_credit='debit'
          )
        ORDER BY da.display_id`,
      [USMCA]
    );
    const caCents = advances.rows.reduce((s, r) => s + Number(r.amount_cents), 0);
    console.log(`ca_issuance_missing=${advances.rows.length} cents=${caCents}`);

    const undeposited = before["1090"];
    console.log(`undeposited_1090_cents=${undeposited} apply=${APPLY}`);
    if (!APPLY) return;

    // 1) Reverse orphan parent-2100 escrow release(s)
    for (const row of orphan.rows) {
      await c.query("BEGIN");
      try {
        await c.query(`SELECT set_config('app.bypass_rls','lucia',true)`);
        const rev = await reverseJournalEntryNoFlip(c as never, {
          operatingCompanyId: USMCA,
          journalEntryId: row.id,
          reason: REASON,
          actorUserId: OWNER,
          currentBusinessDate: biz,
        });
        await c.query("COMMIT");
        console.log(`REVERSED_2100 ${row.id} → ${rev.reversal.reversal_journal_entry_id}`);
      } catch (e) {
        await c.query("ROLLBACK");
        console.error(`FAIL_2100 ${row.id} ${(e as Error).message}`);
        throw e;
      }
    }

    // 2) Backfill CA issuance: DR 1245 / CR 1000 (historical cash out), one line-pair per advance
    if (caCents > 0) {
      const postings: Array<{
        account_id: string;
        debit_or_credit: "debit" | "credit";
        amount_cents: number;
        description: string;
        source_transaction_type: string;
        source_transaction_id: string;
      }> = [];
      for (const adv of advances.rows) {
        const amt = Number(adv.amount_cents);
        postings.push({
          account_id: a1245,
          debit_or_credit: "debit",
          amount_cents: amt,
          description: `CA issuance backfill ${adv.display_id}`,
          source_transaction_type: "driver_cash_advance",
          source_transaction_id: adv.id,
        });
        postings.push({
          account_id: a1000,
          debit_or_credit: "credit",
          amount_cents: amt,
          description: `CA issuance backfill ${adv.display_id} (historical cash)`,
          source_transaction_type: "driver_cash_advance",
          source_transaction_id: adv.id,
        });
      }
      const je = await createJournalEntry(
        {
          operating_company_id: USMCA,
          entry_date: biz,
          memo: `${REASON} — CA issuance backfill ${advances.rows.length} advances`,
          source: "manual",
          is_sample_data: false,
          postings,
        },
        { userId: OWNER, role: "Owner" },
        { suppressSideEffects: true }
      );
      console.log(`CA_ISSUANCE_JE ${je.id} cents=${caCents}`);
    }

    // 3) Deposit Undeposited Funds residual → Operating bank
    if (undeposited > 0) {
      const je = await createJournalEntry(
        {
          operating_company_id: USMCA,
          entry_date: biz,
          memo: `${REASON} — deposit Faro Undeposited Funds residual to Operating`,
          source: "manual",
          is_sample_data: false,
          postings: [
            {
              account_id: a1000,
              debit_or_credit: "debit",
              amount_cents: undeposited,
              description: "Deposit Undeposited Funds (Faro advance residual) to Operating",
            },
            {
              account_id: a1090,
              debit_or_credit: "credit",
              amount_cents: undeposited,
              description: "Clear Undeposited Funds residual after Faro/fuel wash",
            },
          ],
        },
        { userId: OWNER, role: "Owner" },
        { suppressSideEffects: true }
      );
      console.log(`DEPOSIT_1090_JE ${je.id} cents=${undeposited}`);
    }

    const after = {
      "1090": await bal("1090"),
      "1245": await bal("1245"),
      "2100": await bal("2100"),
      "1000": await bal("1000"),
    };
    console.log("AFTER_CENTS", after);
    console.log("DONE");
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
