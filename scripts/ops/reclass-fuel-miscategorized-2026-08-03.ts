/**
 * ACCT-F101 — one-off reclass of the 20 bank-categorization postings that landed in Fuel Expense but
 * are not fuel. TRANSP only.
 *
 * WHAT IS BEING CORRECTED (verified on prod br-fancy-credit-akjnd07a 2026-08-03; the full instance
 * list is hard-coded below, NOT re-derived by a query, so this can never sweep more than it was
 * reviewed for):
 *   7 LOVE'S TIRE CARE purchases  $3,378.54  -> maintenance/maintenance  (QBO-1150040031)
 *  13 LAREDO BRIDGE tolls         $1,215.40  -> toll/toll                (QBO-38)
 *                                 =========
 *                                 $4,593.94  off 6100 Fuel Expense
 *
 * The toll set INCLUDES a -$309.00 credit (2026-07-11) which moves WITH its debits, so the toll
 * account nets exactly $1,215.40 rather than $1,524.40.
 *
 * WHY THESE ARE NOT FUEL. Plaid labels LOVE'S TIRE CARE as TRANSPORTATION_GAS because it resolves the
 * merchant BRAND (Love's is a truck stop), not the purchase — tires are maintenance. The bridge tolls
 * carry Plaid's correct TRANSPORTATION_TOLLS leaf, but rule selection took the first match by priority
 * and the broad `TRANSPORTATION` rule (priority 20) beat `TOLL` (priority 40). Both root causes are
 * fixed forward in BANK-F02; this script corrects the history those defects produced.
 *
 * METHOD — no SQL touches the ledger, and no new GL math is written:
 *   1. reverseJournalEntryNoFlip() reverses the original posting  (existing reversal primitive)
 *   2. the bank transaction is re-categorized to the correct account (banking data, not the GL)
 *   3. maybePostBankCategorizationToGl() re-posts through the canonical poster
 * Step 2 is the only direct write and it is on banking.bank_transactions, never on
 * accounting.journal_entry* — the general ledger is append-only and is corrected by a reversing entry,
 * exactly as QuickBooks and NetSuite do it, never by editing history.
 *
 * SAFETY:
 *   - DRY RUN BY DEFAULT. Pass --apply to write.
 *   - Every row is re-verified against the database before it is touched: it must still be TRANSP,
 *     still posted to the fuel account, and still carry the JE id recorded here. Any drift aborts that
 *     row rather than guessing.
 *   - Idempotent in practice: a row whose matched_journal_entry_id is already cleared/re-pointed is
 *     skipped, so a re-run after a partial failure resumes rather than double-posting.
 *
 * Run:  DATABASE_URL=... npx tsx scripts/ops/reclass-fuel-miscategorized-2026-08-03.ts [--apply]
 */
import pg from "pg";
import { withCurrentUser } from "../../apps/backend/src/auth/db.js";
import { reverseJournalEntryNoFlip } from "../../apps/backend/src/accounting/journal-entries.service.js";
import { maybePostBankCategorizationToGl } from "../../apps/backend/src/banking/bank-feed-gl-posting.service.js";
import { buildPgClientConfig } from "../../apps/backend/src/lib/pg-connection-options.js";

const TRANSP = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";
const ACTOR = "e4117991-d2c0-406d-8cda-74e98d95bccd"; // owner
const FUEL_ACCOUNT_NUMBER = "6100";

/** Entity-scoped target accounts, resolved from the canonical expense_category_account_map on prod. */
const TARGET = {
  maintenance: "27c4a09a-0d34-4908-9da1-44b6174b5bce", // QBO-1150040031 Repair & Maintenance Expenses
  toll: "7d795152-0883-41ef-80ee-91de1f97f9bb", // QBO-38 OTR-Bridge & Toll Expenses
} as const;

type Target = keyof typeof TARGET;

/** The reviewed instance list. Hard-coded on purpose — a query here would be a bulk sweep. */
const ROWS: Array<{ bankTxnId: string; jeId: string; target: Target; cents: number; descr: string }> = [
  { bankTxnId: "cad733a1-3449-4efc-b29a-bfd9ea061dd9", jeId: "7e628a40-5e61-46a9-9e1c-8c53a3fa20af", target: "maintenance", cents: 32329, descr: "LOVE'S TIRE CARE 06/23" },
  { bankTxnId: "2d9f0cab-ee2d-4799-97c0-23c1c1d42d28", jeId: "677bed24-7968-4641-bacc-c7ed9605dad6", target: "maintenance", cents: 54451, descr: "LOVE'S TIRE CARE 06/27" },
  { bankTxnId: "0bfc0c2c-0ac6-4275-b384-73f11adf85d3", jeId: "d1cd721d-2867-4304-8e99-c33c24b1e6d0", target: "maintenance", cents: 44990, descr: "LOVE'S TIRE CARE #04WEIMAR" },
  { bankTxnId: "cc4d1e00-b166-4460-a0a7-f6a54f4d78bd", jeId: "590ff549-5d46-4780-9ac7-09646e5ad8ca", target: "maintenance", cents: 56221, descr: "Love's Tire TOMS BROOK VA" },
  { bankTxnId: "7fccb6c3-19bc-47e7-8478-b0b98f57f315", jeId: "03175010-fbd4-4f0e-b763-c695d81b2e84", target: "maintenance", cents: 56221, descr: "LOVE'S TIRE CARE 07/15" },
  { bankTxnId: "d0e0cc44-ed36-4157-9023-da8ecacb0b11", jeId: "c8861f9f-a738-4478-ba93-aa7ffbca3d54", target: "maintenance", cents: 40574, descr: "LOVE'S TIRE CARE #07HAZEN" },
  { bankTxnId: "0894576b-f6ee-452b-9208-6237f7eba463", jeId: "60ea818a-df32-4b6a-8e06-92ba76a0573c", target: "maintenance", cents: 53068, descr: "Love's Tire HILLSBORO TX" },

  { bankTxnId: "76b6f9be-da0b-4e8f-a63e-abe5c1a22b20", jeId: "bf717184-08f6-45b9-8c73-7330dfe08f83", target: "toll", cents: 10300, descr: "LAREDO BRIDGE 03/11" },
  { bankTxnId: "628deb2b-0262-46b1-ba9e-b614c24a7569", jeId: "53c555d5-4e01-4960-9b06-962f107845b0", target: "toll", cents: 4120, descr: "LAREDO BRIDGE 03/26" },
  { bankTxnId: "5219db2f-835c-4c5e-ad80-aa3f9d51068f", jeId: "024e5e7e-a9b7-4590-b3a8-30f20eda570d", target: "toll", cents: 10300, descr: "LAREDO BRIDGE 04/17" },
  { bankTxnId: "6ba14a5a-77fb-4594-9d3e-4abf5e6b38f9", jeId: "388874f7-0ca3-42aa-b301-fed1346fd5ed", target: "toll", cents: 10300, descr: "LAREDO BRIDGE SYSTEM" },
  { bankTxnId: "375f986f-c3a4-41fb-8edf-8b0908c47796", jeId: "6dfe1598-3228-48c1-a040-74267d93201f", target: "toll", cents: 20600, descr: "LAREDO BRIDGE 07/01" },
  { bankTxnId: "32f37b43-9625-47cf-a5ad-d37c76273cb3", jeId: "d31fa9be-08be-4b91-97f9-24f7c1667698", target: "toll", cents: 20600, descr: "LAREDO BRIDG CARD9104" },
  { bankTxnId: "7798cdd4-2e3b-4111-ad1f-1e59a1a5d190", jeId: "5d43f84f-b656-4b6c-ac3a-107a60e1ea47", target: "toll", cents: -30900, descr: "LAREDO BRIDGE (CREDIT)" },
  { bankTxnId: "17e57532-d392-4fba-9abc-15d4857701b3", jeId: "b514bd1e-19a3-4b23-b443-2ad797766f38", target: "toll", cents: 20600, descr: "LAREDO BRIDG CARD9104 07/12" },
  { bankTxnId: "22032eae-9409-406b-a462-fcaef1081e3c", jeId: "db92e324-3730-4b0d-8d62-378d8789f58e", target: "toll", cents: 20600, descr: "LAREDO BRIDGE 07/11" },
  { bankTxnId: "787405ed-eeb8-4cdb-b050-785ac128892e", jeId: "8a1f9c0d-1f4c-49ef-bd3b-b641b32da915", target: "toll", cents: 10300, descr: "LAREDO BRIDG CARD9104 07/17" },
  { bankTxnId: "0f3f8682-51f5-4d37-8181-2fa0fadd5945", jeId: "0aa1624a-928a-41c0-862b-f72539f3b992", target: "toll", cents: 10300, descr: "LAREDO BRIDGE 07/17" },
  { bankTxnId: "0032bc2d-b97e-449a-8bf5-461e045e40fc", jeId: "7a0fda15-6fc4-4f6d-9852-bbcb684e3522", target: "toll", cents: 4120, descr: "LAREDO BRIDG CARD1354" },
  { bankTxnId: "61869c8a-4c84-4387-96d9-645dbd91ed28", jeId: "d4201f60-04e8-48b6-b919-af380dde1a8f", target: "toll", cents: 10300, descr: "LAREDO BRIDGE 07/27" },
];

const APPLY = process.argv.includes("--apply");

async function balances(db: pg.Client) {
  // POOLER LANDMINE: the Neon connection is the -pooler endpoint (transaction pooling), so a
  // SESSION-scoped set_config does NOT reliably persist across statements — a later statement can land
  // on a different backend without the GUC. Under FORCE-RLS that returns ZERO ROWS, silently. This is
  // not hypothetical: the first dry run reported "bank transaction not found" for a row that provably
  // exists on prod. Every read here is therefore wrapped in its own transaction with a
  // TRANSACTION-LOCAL bypass, which pins one backend for the duration.
  await db.query("BEGIN");
  await db.query(`SELECT set_config('app.bypass_rls','lucia',true)`);
  const { rows } = await db.query<{ account_number: string; net: string; lines: string }>(
    `SELECT a.account_number,
            (SUM(CASE WHEN p.debit_or_credit='debit' THEN p.amount_cents ELSE -p.amount_cents END))::text AS net,
            COUNT(*)::text AS lines
       FROM accounting.journal_entry_postings p
       JOIN catalogs.accounts a ON a.id = p.account_id
       JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
      WHERE a.operating_company_id = $1::uuid
        AND a.account_number IN ('6100','QBO-38','QBO-1150040031')
        AND je.voided_at IS NULL
      GROUP BY 1 ORDER BY 1`,
    [TRANSP]
  );
  await db.query("COMMIT");
  return rows;
}

async function main() {
  const cs = process.env.DATABASE_URL;
  if (!cs) throw new Error("DATABASE_URL required");
  const db = new pg.Client(buildPgClientConfig(cs));
  await db.connect();

  const expected = ROWS.reduce((s, r) => s + r.cents, 0);
  console.log(`ACCT-F101 reclass — ${ROWS.length} rows, ${(expected / 100).toFixed(2)} USD off Fuel Expense`);
  console.log(`mode: ${APPLY ? "APPLY (writes)" : "DRY RUN (no writes)"}`);
  console.log("BEFORE:", await balances(db));

  let reversed = 0;
  let reposted = 0;
  const newJeIds: Array<{ bankTxnId: string; descr: string; newJeId: string }> = [];

  for (const row of ROWS) {
    // Re-verify against the database before touching anything — never act on the hard-coded list alone.
    await db.query("BEGIN");
    await db.query(`SELECT set_config('app.bypass_rls','lucia',true)`);
    const { rows: check } = await db.query<{ opco: string; matched: string | null; acct: string | null }>(
      `SELECT bt.operating_company_id::text AS opco,
              bt.matched_journal_entry_id::text AS matched,
              a.account_number AS acct
         FROM banking.bank_transactions bt
         LEFT JOIN catalogs.accounts a ON a.id = bt.categorization_gl_account_id
        WHERE bt.id = $1::uuid`,
      [row.bankTxnId]
    );
    await db.query("COMMIT");
    const cur = check[0];
    if (!cur) { console.log(`SKIP ${row.descr}: bank transaction not found`); continue; }
    if (cur.opco !== TRANSP) { console.log(`SKIP ${row.descr}: not TRANSP (${cur.opco})`); continue; }
    if (cur.matched !== row.jeId) {
      console.log(`SKIP ${row.descr}: JE link is ${cur.matched ?? "null"}, expected ${row.jeId} — already handled or drifted`);
      continue;
    }
    if (cur.acct !== FUEL_ACCOUNT_NUMBER) {
      console.log(`SKIP ${row.descr}: categorized to ${cur.acct ?? "null"}, expected ${FUEL_ACCOUNT_NUMBER}`);
      continue;
    }

    if (!APPLY) { console.log(`WOULD RECLASS ${row.descr} ${(row.cents / 100).toFixed(2)} -> ${row.target}`); continue; }

    // 1. reverse the original posting (existing primitive; no new GL math)
    await withCurrentUser(ACTOR, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [TRANSP]);
      await reverseJournalEntryNoFlip(client, {
        operatingCompanyId: TRANSP,
        journalEntryId: row.jeId,
        reason: `ACCT-F101 reclass: ${row.descr} is ${row.target}, not fuel`,
        actorUserId: ACTOR,
      });
      // 2. re-categorize (banking data only — never the ledger)
      await client.query(
        `UPDATE banking.bank_transactions
            SET categorization_gl_account_id = $2::uuid,
                status = 'categorized',
                matched_journal_entry_id = NULL,
                updated_at = now()
          WHERE id = $1::uuid AND operating_company_id = $3::uuid`,
        [row.bankTxnId, TARGET[row.target], TRANSP]
      );
    });
    reversed += 1;

    // 3. re-post through the canonical poster
    const posted = await maybePostBankCategorizationToGl({
      companyId: TRANSP,
      actorUserUuid: ACTOR,
      bankTransactionId: row.bankTxnId,
    });
    if (posted.posted) {
      reposted += 1;
      const { rows: je } = await db.query<{ id: string }>(
        `SELECT matched_journal_entry_id::text AS id FROM banking.bank_transactions WHERE id = $1::uuid`,
        [row.bankTxnId]
      );
      newJeIds.push({ bankTxnId: row.bankTxnId, descr: row.descr, newJeId: je[0]?.id ?? "(unknown)" });
      console.log(`RECLASSED ${row.descr} -> ${row.target}  newJE=${je[0]?.id}`);
    } else {
      console.error(`POST FAILED ${row.descr}: ${posted.reason} ${("message" in posted && posted.message) || ""}`);
    }
  }

  console.log("AFTER:", await balances(db));
  console.log(`reversed=${reversed} reposted=${reposted}`);
  if (newJeIds.length) console.log("NEW JE IDS:\n" + newJeIds.map((j) => `  ${j.descr}: ${j.newJeId}`).join("\n"));
  await db.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
