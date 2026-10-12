/**
 * LEAD 443.133 B — Relay deposits post by the owner's card map, which is DATA (integrations.relay_company_cards), and a
 * deposit enters the Relay Fuel Wallet (1295) exactly once (integrations.relay_deposit_postings, database refusal).
 *
 * Old code: the map was a code constant without 1222 / 1993, so a Laura card deposit was HELD ("card_owner_not_named"),
 * the deposit row was never stamped, and nothing stopped a second journal entry for the same deposit.
 */
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../../test-helpers/refuse-production.js";
import { ensureIntegrationPrerequisites } from "../../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../../test-helpers/constants.js";
import { createIsolatedOperatingCompany, deactivateIsolatedOperatingCompany } from "../../../../test-helpers/isolated-company.js";
import { createJournalEntryOnClient } from "../../../accounting/journal-entries.service.js";
import { postRelayDeposit } from "../relay-deposit-post.service.js";

const describeIntegration = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL ? describe : describe.skip;

describeIntegration("Relay deposits post by the owner's card map, once (443.133 B, real Postgres)", () => {
  it("party card posts with its loan document and stamps the row; a second entry is refused; unmapped / no-account cards are held / refused by name", async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    refuseProductionConnectionString(cs);
    await ensureIntegrationPrerequisites();
    const db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await refuseProductionDatabase(db);
    const tag = `RDC${Date.now().toString(36).toUpperCase()}`;
    const opco = (await createIsolatedOperatingCompany({ client: db, codePrefix: tag, legalNamePrefix: "Relay deposit card map test" })).companyId;
    try {
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      const one = async <T = { id: string }>(sql: string, params: unknown[]) => (await db.query<T>(sql, params)).rows[0]!;
      const account = async (num: string, name: string, type: string, purpose: string | null = null) =>
        (await one(
          `INSERT INTO catalogs.accounts (operating_company_id, account_number, account_name, account_type, is_postable, system_purpose)
           VALUES ($1, $2, $3, $4, true, $5) RETURNING id::text AS id`,
          [opco, num, name, type, purpose]
        )).id;
      const wallet = await account("1295", "Relay Fuel Wallet", "Asset", "relay_fuel_wallet");
      const fee = await account("5005", "Fuel Card Fees", "CostOfGoodsSold");
      await account("1000", "Bank of America - Operating", "Asset");
      const laura = await account("2410-00-004", "Due to / from Laura Muñoz", "Liability");
      const vendor = async (name: string) =>
        (await one(`INSERT INTO mdata.vendors (operating_company_id, vendor_name, vendor_type) VALUES ($1, $2, 'other') RETURNING id::text AS id`, [opco, name])).id;
      await vendor("Relay Purchases");
      const lauraVendor = await vendor("Laura Munoz");
      const alberto = await vendor("Alberto Lozano");
      // The owner's map as data (same shape migration 202615870910 seeds for USMCA).
      await db.query(
        `INSERT INTO integrations.relay_company_cards
           (operating_company_id, card_last4, label, is_active, funding_kind, funding_account_number, party_vendor_id, party_relationship)
         VALUES ($1, '1222', 'Laura — PNC personal', true, 'party', '2410-00-004', $2, 'other'),
                ($1, '1993', 'Alberto''s wife — loan from vendor Alberto Lozano', true, 'party', NULL, $3, 'other')`,
        [opco, lauraVendor, alberto]
      );
      const deposit = async (card: string, cents: [string, string, string]) =>
        (await one(
          `INSERT INTO integrations.relay_deposits
             (operating_company_id, deposit_id, relay_created_at, status, total_amount_cents, funding_card_last4, raw_payload, ingest_source)
           VALUES ($1, $2, '2026-10-01T15:00:00Z', 'settled', $3, $4, $5::jsonb, 'csv_import') RETURNING id::text AS id`,
          [opco, `${tag}-${card}`, Math.round(Number(cents[2]) * 100), card, JSON.stringify({ amount: cents[0], fee: cents[1], total: cents[2] })]
        )).id;
      const dLaura = await deposit("1222", ["1000.00", "32.50", "1032.50"]);
      const dAlberto = await deposit("1993", ["500.00", "16.25", "516.25"]);
      const dUnknown = await deposit("4444", ["100.00", "3.25", "103.25"]);
      const actor = { createJournalEntryOnClient: createJournalEntryOnClient as never };
      const post = (id: string) =>
        postRelayDeposit(db as never, { operatingCompanyId: opco, relayDepositId: id, actorUserId: TEST_OWNER_USER_ID, actorRole: "Owner" }, actor);

      // 1. Laura's card: posted, Dr 1295 + Dr 5005 / Cr Due to / from Laura, with its paid-direct loan document.
      const out = await post(dLaura);
      expect(out).toMatchObject({ outcome: "posted", charged_cents: 103250 });
      const je = (out as { journal_entry_id: string }).journal_entry_id;
      const legs = (await db.query<{ account_id: string; dc: string; cents: string }>(
        `SELECT account_id::text, debit_or_credit AS dc, amount_cents::text AS cents FROM accounting.journal_entry_postings
          WHERE journal_entry_uuid = $1::uuid ORDER BY debit_or_credit DESC, amount_cents DESC`, [je])).rows;
      expect(legs).toEqual([
        { account_id: wallet, dc: "debit", cents: "100000" },
        { account_id: fee, dc: "debit", cents: "3250" },
        { account_id: laura, dc: "credit", cents: "103250" },
      ]);
      expect((await one<{ n: number }>(
        `SELECT count(*)::int AS n FROM accounting.related_party_loan_entries
          WHERE operating_company_id = $1::uuid AND target_type = 'paid_direct_vendor' AND target_id = $2::uuid AND je_id = $3::uuid`,
        [opco, dLaura, je])).n).toBe(1);
      // The deposit row records what posted it (old code: posted_to_gl false, 'unclassified', no entry).
      expect(await one(
        `SELECT posted_to_gl, posted_journal_entry_id::text AS je, classification FROM integrations.relay_deposits WHERE id = $1::uuid`, [dLaura]
      )).toEqual({ posted_to_gl: true, je, classification: "party" });

      // 2. Idempotent: a second run is already_posted and writes no second entry.
      expect((await post(dLaura)).outcome).toBe("already_posted");
      expect((await one<{ n: number }>(
        `SELECT count(DISTINCT journal_entry_uuid)::int AS n FROM accounting.journal_entry_postings
          WHERE source_transaction_type = 'relay_deposit' AND source_transaction_id = $1`, [dLaura])).n).toBe(1);

      // 3. The database refuses a second live entry for the same deposit, whoever writes it.
      await db.query("SAVEPOINT dup");
      await expect(
        createJournalEntryOnClient(db as never, {
          operating_company_id: opco, entry_date: "2026-10-01", memo: "second entry for the same deposit", source: "auto",
          source_transaction_type: "relay_deposit", source_transaction_id: dLaura,
          postings: [
            { account_id: wallet, debit_or_credit: "debit", amount_cents: 100, source_transaction_type: "relay_deposit", source_transaction_id: dLaura },
            { account_id: laura, debit_or_credit: "credit", amount_cents: 100, source_transaction_type: "relay_deposit", source_transaction_id: dLaura },
          ],
        } as never, { userId: TEST_OWNER_USER_ID, role: "Owner" })
      ).rejects.toThrow(/relay_deposit_already_posted/);
      await db.query("ROLLBACK TO SAVEPOINT dup");

      // 4. Alberto's card is named but its "Due to / from" account does not exist: refused BY NAME, nothing written.
      const a = await post(dAlberto);
      expect(a).toMatchObject({ outcome: "refused" });
      expect((a as { reason: string }).reason).toMatch(/^party_account_missing \(Alberto/);
      // 5. A card the owner has not named is held, never guessed.
      expect(await post(dUnknown)).toMatchObject({ outcome: "held", reason: "card_owner_not_named" });
      expect((await one<{ n: number }>(
        `SELECT count(*)::int AS n FROM accounting.journal_entry_postings WHERE source_transaction_id = ANY($1::text[])`,
        [[dAlberto, dUnknown]])).n).toBe(0);
    } finally {
      await db.query("ROLLBACK");
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      await deactivateIsolatedOperatingCompany(db, opco);
      await db.query("COMMIT");
      await db.end();
    }
  }, 120_000);
});
