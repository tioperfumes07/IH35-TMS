/**
 * ROUND 443.66-C — read-only live measure of Relay wallet + Dreamline list-suggest helpers.
 * Never categorizes or matches. Owner Law B.
 *
 *   DATABASE_URL=<neon-owner> node --import tsx scripts/ops/2026-10-12-cursor-44366-suggest-measure.mts
 */
import pg from "pg";
import { suggestRelayWalletLine } from "../../apps/backend/src/accounting/bank-recon/relay-wallet-suggest.service.ts";
import { suggestDreamlineCardLine } from "../../apps/backend/src/accounting/bank-recon/dreamline-card-suggest.service.ts";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
await c.query(`SELECT set_config('app.operating_company_id', $1, true)`, [USMCA]);

const wallet = (
  await c.query<{ id: string; is_credit: boolean }>(
    `SELECT bt.id::text, bt.is_credit
       FROM banking.bank_transactions bt
       JOIN banking.bank_accounts ba ON ba.id = bt.bank_account_id
       LEFT JOIN catalogs.accounts a ON a.id = ba.ledger_account_id
      WHERE bt.operating_company_id = $1::uuid AND bt.voided_at IS NULL
        AND (a.account_number = '1295' OR ba.account_name ILIKE '%relay%fuel%wallet%')
        AND bt.review_state IS DISTINCT FROM 'matched' AND bt.status::text <> 'categorized'
      ORDER BY bt.transaction_date`,
    [USMCA],
  )
).rows;

const dream = (
  await c.query<{ id: string }>(
    `SELECT bt.id::text
       FROM banking.bank_transactions bt
       JOIN banking.bank_accounts ba ON ba.id = bt.bank_account_id
       LEFT JOIN catalogs.accounts a ON a.id = ba.ledger_account_id
      WHERE bt.operating_company_id = $1::uuid AND bt.voided_at IS NULL
        AND (a.account_number = '2510' OR ba.account_name ILIKE '%dreamline%')
        AND bt.review_state IS DISTINCT FROM 'matched' AND bt.status::text <> 'categorized'
      ORDER BY bt.transaction_date`,
    [USMCA],
  )
).rows;
await c.end();

const walletGap: Record<string, number> = {};
let outN = 0;
let inN = 0;
let outSug = 0;
let inSug = 0;
for (const r of wallet) {
  const s = await suggestRelayWalletLine({
    operating_company_id: USMCA,
    bank_transaction_id: r.id,
  });
  if (r.is_credit) {
    inN++;
    if (s.suggestion) inSug++;
    else if (s.gap_reason) {
      const k = s.gap_reason.split(":")[0] ?? "unknown";
      walletGap[k] = (walletGap[k] ?? 0) + 1;
    }
  } else {
    outN++;
    if (s.suggestion) outSug++;
    else if (s.gap_reason) {
      const k = s.gap_reason.split(":")[0] ?? "unknown";
      walletGap[k] = (walletGap[k] ?? 0) + 1;
    }
  }
}

const dreamGap: Record<string, number> = {};
let dSug = 0;
let dApplies = 0;
for (const r of dream) {
  const s = await suggestDreamlineCardLine({
    operating_company_id: USMCA,
    bank_transaction_id: r.id,
  });
  if (!s.applies) continue;
  dApplies++;
  if (s.suggestion) dSug++;
  else {
    const k = (s.gap_reason ?? "unknown").split(":")[0] ?? "unknown";
    dreamGap[k] = (dreamGap[k] ?? 0) + 1;
  }
}

console.log(
  JSON.stringify(
    {
      wallet: {
        pending: wallet.length,
        out: outN,
        out_suggested: outSug,
        in: inN,
        in_suggested: inSug,
        total_suggested: outSug + inSug,
        gap: walletGap,
      },
      dreamline: {
        pending: dream.length,
        applies: dApplies,
        suggested: dSug,
        none: dApplies - dSug,
        gap: dreamGap,
      },
    },
    null,
    2,
  ),
);
process.exit(0);
