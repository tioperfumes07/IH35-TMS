#!/usr/bin/env tsx
/**
 * cursor-2026-09-22-faro-8-direct-legs.mts — ROUND 30.5/30.6, owner rulings #22185/#22188.
 *
 * The 8 "Faro Internal Transfer" legs from docs/reconciliation/2026-09-22-PAYMENTS-TO-USMCA-FROM-FARO.csv
 * ($35,730.00, ties exactly) are INTERCOMPANY — USMCA's Faro reserve funds IH35 Transportation's
 * reserve. Each is ONE economic event, posted individually, never netted:
 *   DR 8000 Inter-company - IH35 Transportation
 *   CR 1230 Factoring Reserves
 * 8000 not 8001 is evidenced (Faro's exports are named FARO-IH-35-Transportation-export-*.csv,
 * the settlement letterhead is IH35 Transportation), not inferred.
 *
 * The 5 "Rsv Deposit" rows are NOT a separate population (owner's own correction, #22188): 4 of
 * them are the FUNDING side already inside 4 of these 8 legs (RESERVE-REPORT.csv's own running
 * Balance column proves each deposit is matched by an equal, opposite payment to IH35 days later,
 * returning the balance to ~0) — posting them again would double-count $26,840.00. The 8/12
 * $1,649.00 "appears in both lists" question is moot under this ruling: it was never two events.
 * Only these 8 legs are posted.
 *
 * Usage:
 *   DATABASE_URL=<neon-usmca> npx tsx scripts/ops/cursor-2026-09-22-faro-8-direct-legs.mts             # dry-run
 *   DATABASE_URL=<neon-usmca> npx tsx scripts/ops/cursor-2026-09-22-faro-8-direct-legs.mts --apply
 */
import pg from "pg";
import { ensureOpenPeriod } from "../../apps/backend/src/accounting/posting-engine.service.js";
import { hasJournalEntryTypeColumn, resolveJournalEntryTypeId } from "../../apps/backend/src/accounting/journal-entry-type-resolver.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const APPLY = process.argv.includes("--apply");

const IC_8000_ID = "b1bc0529-20cd-46ea-a2e6-12d6792a45c5"; // 8000 Inter-company - IH35 Transportation
const FACTORING_RESERVES_ID = "165cc317-5c8b-4296-8aab-f5101f4a6815"; // 1230

const LEGS: Array<{ date: string; cents: number; memo: string }> = [
  { date: "2026-09-21", cents: 200000, memo: "Pago Reserva Negativa IH35" },
  { date: "2026-09-15", cents: 800000, memo: "Pago a Reserva Negativa IH35 09/15/26" },
  { date: "2026-09-09", cents: 1184000, memo: "Pago a IH35 Reserva Negativa - Facturas Larralde Transport pagadas a ellos directamente" },
  { date: "2026-09-02", cents: 500000, memo: "USMCA Reserve to IH 35 Reserve" },
  { date: "2026-08-14", cents: 68800, memo: "Transfer to IH35 neg res 08/14/26 (1 of 2)" },
  { date: "2026-08-14", cents: 475300, memo: "Transfer to IH35 neg res 08/14/26 (2 of 2)" },
  { date: "2026-08-13", cents: 180000, memo: "USMCA Internal Transfer IH35 08/13/26" },
  { date: "2026-08-12", cents: 164900, memo: "Internal Transfer to IH35 Reserves 08/12/26" },
];
const TOTAL_CENTS = LEGS.reduce((s, l) => s + l.cents, 0);

async function main() {
  console.log(`${LEGS.length} legs, total $${(TOTAL_CENTS / 100).toFixed(2)} (expect $35,730.00).`);
  if (TOTAL_CENTS !== 3573000) throw new Error(`Sum mismatch: ${TOTAL_CENTS} !== 3573000`);

  if (!APPLY) {
    console.log("DRY-RUN — would post 8 individual JEs, DR 8000 / CR 1230, each leg's own date and memo.");
    for (const l of LEGS) console.log(`  ${l.date}  $${(l.cents / 100).toFixed(2)}  ${l.memo}`);
    return;
  }

  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [USMCA]);

    const jeIds: string[] = [];
    for (const leg of LEGS) {
      const memo = `Faro intercompany reserve transfer, USMCA -> IH35 Transportation. Source: docs/reconciliation/2026-09-22-PAYMENTS-TO-USMCA-FROM-FARO.csv, Pmt Type 'Faro Internal Transfer', Pmt Ref "${leg.memo}". Owner ruling #22185/#22188: DR 8000 / CR 1230, posted individually, never netted.`;

      const existing = await client.query(
        `SELECT id FROM accounting.journal_entries WHERE operating_company_id = $1::uuid AND entry_date = $2::date AND memo = $3 AND voided_at IS NULL`,
        [USMCA, leg.date, memo]
      );
      if (existing.rows[0]) {
        console.log(`${leg.date} $${(leg.cents / 100).toFixed(2)}: already posted (${existing.rows[0].id}). Skipping.`);
        continue;
      }

      await ensureOpenPeriod(client, USMCA, leg.date);
      const typeColPresent = await hasJournalEntryTypeColumn(client);
      const typeId = typeColPresent ? await resolveJournalEntryTypeId(client, { source: "manual", memo }) : null;

      const jeInsert = typeColPresent
        ? await client.query<{ id: string }>(
            `INSERT INTO accounting.journal_entries
               (operating_company_id, entry_date, memo, status, source, journal_entry_type_id,
                created_by_user_id, qbo_sync_pending, created_at, updated_at, is_sample_data)
             VALUES ($1::uuid, $2::date, $3, 'posted', 'manual', $4::uuid, $5::uuid, true, now(), now(), false)
             RETURNING id::text`,
            [USMCA, leg.date, memo, typeId, OWNER]
          )
        : await client.query<{ id: string }>(
            `INSERT INTO accounting.journal_entries
               (operating_company_id, entry_date, memo, status, source, created_by_user_id, qbo_sync_pending,
                created_at, updated_at, is_sample_data)
             VALUES ($1::uuid, $2::date, $3, 'posted', 'manual', $4::uuid, true, now(), now(), false)
             RETURNING id::text`,
            [USMCA, leg.date, memo, OWNER]
          );
      const jeId = jeInsert.rows[0].id;

      const lines = [
        { account_id: IC_8000_ID, debit_or_credit: "debit" as const, description: `Inter-company transfer to IH35 Transportation — ${leg.memo}` },
        { account_id: FACTORING_RESERVES_ID, debit_or_credit: "credit" as const, description: `Faro reserve drawn — ${leg.memo}` },
      ];
      let seq = 1;
      for (const line of lines) {
        await client.query(
          `INSERT INTO accounting.journal_entry_postings
             (operating_company_id, journal_entry_uuid, line_sequence, account_id, debit_or_credit,
              amount_cents, description, source_transaction_type, source_transaction_id, created_at, updated_at)
           VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5, $6, $7, 'faro_intercompany_leg', $8, now(), now())`,
          [USMCA, jeId, seq, line.account_id, line.debit_or_credit, leg.cents, line.description, jeId]
        );
        seq += 1;
      }
      console.log(`${leg.date} $${(leg.cents / 100).toFixed(2)}: posted ${jeId}.`);
      jeIds.push(jeId);
    }

    await client.query("COMMIT");
    console.log(`Done. ${jeIds.length} new JEs posted.`);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
