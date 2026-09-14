#!/usr/bin/env node
/**
 * ROUND 24.5 EXECUTE — move Relay Fuel Wallet's post-cutover USMCA transactions out of
 * TRANSPORTATION, per 3 Lead rulings (owner-authorized 2026-09-14):
 *
 * RULING 1 — move now, do not wait on the 08-07..08-12 gap. That gap is a SEPARATE, still-open
 * defect (confirmed live at the source-ingest level too, integrations.relay_fuel_transactions
 * ingest_source='daily_pull' shows the identical hole; no integrations.integration_sync_log entry
 * exists for 'relay' at all to explain it). NOT closed by this script -- reported as its own named
 * line item, not reconstructed from anything but a real Relay statement.
 *
 * RULING 2 — move 75, hold 1. Bank transaction 60677401-b034-40aa-a492-55b760906d5f ($684.35,
 * 2026-09-10) carries matched_load_id pointing at TRANSPORTATION's own load L-20260627-0036
 * (the same load from ROUND 24.4's void-register finding). Moving it would make that match
 * cross-entity -- held in place, reported, not moved.
 *
 * RULING 3 — kill the test card, don't map a new one yet. USMCA's only relay_company_cards row
 * (ad441106-..., "CASCADE USMCA-WIRE test card", funding_bank_account_id NULL) is a standing-law
 * violation (never write test/sample/demo records into USMCA) -- VOIDED here (void-not-delete,
 * register kept), never relabeled/reused. Mapping a REAL USMCA card is explicitly NOT done by
 * this script: Relay's own transaction payload (integrations.relay_fuel_transactions.raw_payload)
 * carries no card number field at all, and TRANSP's 3 real relay_company_cards rows were each
 * populated via "live-verified vs banking.bank_transactions" cross-reference against a KNOWN real
 * card number appearing in a real bank statement -- a method this script cannot reproduce for
 * USMCA (its own Relay-fuel transactions carry no card identifier either, live-checked). Inventing
 * a card_last4 would be exactly the guess this build exists to prevent. Reported as a named
 * blocker, not invented.
 *
 * EXECUTE, this script:
 * 1. Re-points the 75 (all matching rows EXCEPT the held one) to USMCA:
 *    operating_company_id -> 5c854333-6ea5-4faa-af31-67cb272fef80,
 *    bank_account_id -> 809fcfbb-738e-471c-8fc1-a38f0f9b814a (USMCA's own Relay Fuel Wallet,
 *    already exists, already active, 0 prior transactions). Entity attribution correction only --
 *    nothing voided, nothing un-voided, nothing deleted, no duplicate row created, no GL math
 *    invented. Appends a note to every moved row recording the old account/entity and why it
 *    moved, so the register survives independent of this script's own commit history.
 * 2. Bank matching stays SUGGEST-ONLY: no matched_ or reconciliation_ field is written by this
 *    script for the moved rows (all 75 already carry zero matches, asserted before moving --
 *    the held 76th is exactly the one WITH a match, which is why it is held).
 * 3. Voids the test card. Does not create a replacement.
 * 4. Posts NOTHING to the GL. The intercompany question (whose money actually funded the wallet)
 *    is with the owner, not decided here.
 *
 * Usage:
 *   DATABASE_URL="postgres://…" npx tsx apps/backend/scripts/r245-relay-usmca-repoint.mts            # PREVIEW
 *   DATABASE_URL="postgres://…" npx tsx apps/backend/scripts/r245-relay-usmca-repoint.mts --commit   # write
 */
import pg from "pg";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const TRANSP = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";
const USMCA_RELAY_ACCOUNT = "809fcfbb-738e-471c-8fc1-a38f0f9b814a";
const HELD_TXN_ID = "60677401-b034-40aa-a492-55b760906d5f"; // matched to TRANSP's own load L-20260627-0036, held
const TEST_CARD_ID = "ad441106-b310-4e09-95b5-a928361644a6"; // "CASCADE USMCA-WIRE test card"
const ACTOR_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd"; // same actor used throughout this session
const CUTOVER_DATE = "2026-08-07";

async function main(): Promise<void> {
  const commit = process.argv.includes("--commit");
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL required");

  const pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("RESET ROLE");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    await client.query("SELECT set_config('app.operating_company_id',$1,true)", [TRANSP]);

    // Resolve the TRANSP Relay account id live (never hardcode a second UUID unverified).
    const { rows: transpAcct } = await client.query(
      `SELECT id::text FROM banking.bank_accounts WHERE operating_company_id = $1::uuid AND account_name ILIKE '%relay%'`,
      [TRANSP]
    );
    if (transpAcct.length !== 1) throw new Error(`Expected exactly 1 TRANSP Relay account, found ${transpAcct.length}`);
    const transpAccountId = transpAcct[0].id as string;

    const { rows: usmcaAcct } = await client.query(
      `SELECT id::text FROM banking.bank_accounts WHERE id = $1::uuid AND operating_company_id = $2::uuid AND account_name ILIKE '%relay%'`,
      [USMCA_RELAY_ACCOUNT, USMCA]
    );
    if (usmcaAcct.length !== 1) throw new Error(`USMCA Relay account ${USMCA_RELAY_ACCOUNT} not found or wrong entity.`);

    // Candidate set: post-cutover (>= 2026-08-07), non-voided, on TRANSP's Relay account.
    const { rows: candidates } = await client.query(
      `SELECT t.id, t.transaction_date, t.amount_cents,
              t.matched_load_id, t.matched_bill_id, t.matched_settlement_id, t.matched_invoice_id,
              t.matched_payment_id, t.matched_bill_payment_id, t.matched_transfer_id,
              t.matched_journal_entry_id, t.matched_expense_id, t.matched_advance_id
         FROM banking.bank_transactions t
        WHERE t.bank_account_id = $1::uuid AND t.voided_at IS NULL AND t.transaction_date >= $2::date
        ORDER BY t.transaction_date`,
      [transpAccountId, CUTOVER_DATE]
    );
    console.log(`Candidate post-cutover TRANSP Relay txns: ${candidates.length} (expect 76)`);
    if (candidates.length !== 76) {
      throw new Error(`Expected 76 candidates, found ${candidates.length} -- state changed since verification, refusing.`);
    }

    const held = candidates.find((r) => r.id === HELD_TXN_ID);
    if (!held) throw new Error(`Held transaction ${HELD_TXN_ID} not found among candidates -- refusing.`);
    const anyMatchField = (r: Record<string, unknown>) =>
      r.matched_load_id || r.matched_bill_id || r.matched_settlement_id || r.matched_invoice_id ||
      r.matched_payment_id || r.matched_bill_payment_id || r.matched_transfer_id ||
      r.matched_journal_entry_id || r.matched_expense_id || r.matched_advance_id;
    if (!anyMatchField(held)) throw new Error(`Held transaction ${HELD_TXN_ID} has no match on re-check -- state changed, refusing.`);

    const toMove = candidates.filter((r) => r.id !== HELD_TXN_ID);
    for (const r of toMove) {
      if (anyMatchField(r)) {
        throw new Error(`Row ${r.id} unexpectedly carries a match -- refusing to move an unexamined match. State changed since verification.`);
      }
    }
    console.log(`To move: ${toMove.length} (expect 75). Held: 1 (${HELD_TXN_ID}).`);
    if (toMove.length !== 75) throw new Error(`Expected 75 to move, computed ${toMove.length}.`);

    const moveIds = toMove.map((r) => r.id);
    const noteText =
      `ROUND 24.5 entity attribution correction 2026-09-14: was TRANSPORTATION's Relay Fuel Wallet ` +
      `(bank_account_id ${transpAccountId}), post-2026-08-07-cutover fuel belongs to USMCA per ` +
      `standing law. Re-pointed operating_company_id/bank_account_id only -- not voided, not ` +
      `un-voided, not duplicated, no GL math invented. Bank matching untouched (suggest-only).`;

    const { rows: moved } = await client.query(
      `UPDATE banking.bank_transactions
          SET operating_company_id = $2::uuid,
              bank_account_id = $3::uuid,
              notes = COALESCE(notes,'') || CASE WHEN notes IS NULL OR notes = '' THEN '' ELSE E'\n' END || $4,
              updated_at = now()
        WHERE id = ANY($1::uuid[])
        RETURNING id, transaction_date, amount_cents`,
      [moveIds, USMCA, USMCA_RELAY_ACCOUNT, noteText]
    );
    console.log(`Moved ${moved.length} rows.`);

    // Void the test card -- void-not-delete, register kept, never relabeled/reused.
    const { rows: cardBefore } = await client.query(
      `SELECT id, operating_company_id, label, is_active, voided_at, funding_bank_account_id
         FROM integrations.relay_company_cards WHERE id = $1::uuid`,
      [TEST_CARD_ID]
    );
    if (cardBefore.length !== 1 || cardBefore[0].operating_company_id !== USMCA || cardBefore[0].voided_at !== null) {
      throw new Error(`Test card ${TEST_CARD_ID} not in expected state: ${JSON.stringify(cardBefore)}`);
    }
    await client.query(
      `UPDATE integrations.relay_company_cards
          SET voided_at = now(), is_active = false, updated_at = now(),
              source_hint = COALESCE(source_hint,'') ||
                'VOIDED 2026-09-14 (ROUND 24.5): standing law violation -- test/sample/demo card ' ||
                'in USMCA. Not relabeled or reused. A real USMCA card is NOT mapped by this script ' ||
                '-- no card_last4 exists anywhere in evidence (Relay''s own transaction payload ' ||
                'carries no card number field; the real-card cross-reference method used for ' ||
                'TRANSP''s 3 cards has nothing to cross-reference against for USMCA yet). Reported ' ||
                'as a named blocker, not invented.'
        WHERE id = $1::uuid`,
      [TEST_CARD_ID]
    );
    console.log(`Test card ${TEST_CARD_ID} voided.`);

    // DONE-proof, exact query from the round directive.
    const { rows: proof } = await client.query(
      `SELECT ba.operating_company_id::text AS opco, ba.account_name,
              count(t.id) AS txns, (sum(t.amount_cents)/100.0)::numeric(14,2) AS total,
              min(t.transaction_date) AS first_date, max(t.transaction_date) AS last_date
         FROM banking.bank_accounts ba
         LEFT JOIN banking.bank_transactions t ON t.bank_account_id = ba.id AND t.voided_at IS NULL
        WHERE ba.account_name ILIKE '%relay%'
        GROUP BY 1, 2 ORDER BY 1`
    );
    console.log("\nDONE-proof:");
    console.table(proof);

    const usmcaRow = proof.find((r) => r.opco === USMCA);
    const transpRow = proof.find((r) => r.opco === TRANSP);
    if (usmcaRow?.txns !== "75" || usmcaRow?.total !== "32042.10") {
      throw new Error(`USMCA proof mismatch: ${JSON.stringify(usmcaRow)}`);
    }
    if (transpRow?.txns !== "1664" || transpRow?.total !== "1075653.41") {
      throw new Error(`TRANSP proof mismatch: ${JSON.stringify(transpRow)}`);
    }
    console.log("PASS: USMCA 75 / $32,042.10, TRANSP 1,664 / $1,075,653.41.");

    // Held transaction re-check, live, post-move.
    const { rows: heldCheck } = await client.query(
      `SELECT id, operating_company_id, bank_account_id, matched_load_id FROM banking.bank_transactions WHERE id = $1::uuid`,
      [HELD_TXN_ID]
    );
    console.log("\nHeld transaction (unmoved):", JSON.stringify(heldCheck[0]));
    if (heldCheck[0]?.operating_company_id !== TRANSP) {
      throw new Error(`Held transaction moved unexpectedly: ${JSON.stringify(heldCheck[0])}`);
    }

    const { rows: cardsAfter } = await client.query(
      `SELECT id, operating_company_id, card_last4, label, is_active, voided_at, funding_bank_account_id
         FROM integrations.relay_company_cards WHERE operating_company_id = $1::uuid`,
      [USMCA]
    );
    console.log("\nUSMCA relay_company_cards after:");
    console.table(cardsAfter);

    if (commit) {
      await client.query("COMMIT");
      console.log("\nCOMMITTED.");
    } else {
      await client.query("ROLLBACK");
      console.log("\nPREVIEW ONLY -- rolled back. Re-run with --commit to persist.");
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
