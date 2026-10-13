/**
 * LEAD 443.134 #1 — the app creates a related party's ONE running "Due to / from <party>" account.
 *
 * Old code: no engine could create it — a party with no account (vendor Alberto Lozano, Relay card 1993) was refused by
 * name and waited on the owner (party_account_missing). Now ensureRelatedPartyAccount creates it under 2410, numbered by
 * the allocator, links it to the vendor and points the party's card-map rows at it; the deposit then posts.
 */
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../../test-helpers/refuse-production.js";
import { ensureIntegrationPrerequisites } from "../../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../../test-helpers/constants.js";
import { createIsolatedOperatingCompany, deactivateIsolatedOperatingCompany } from "../../../../test-helpers/isolated-company.js";
import { createJournalEntryOnClient } from "../../journal-entries.service.js";
import { postRelayDeposit } from "../../../integrations/relay-payments/relay-deposit-post.service.js";
import { ensureRelatedPartyAccount, refuseNonOwnerRelatedPartyAccount } from "../party-account.service.js";

const describeIntegration = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL ? describe : describe.skip;

describeIntegration("ensureRelatedPartyAccount — one running Due to / from account per party (443.134 #1, real Postgres)", () => {
  it("creates 2410-00-nnn linked to the vendor, idempotent, card map pointed at it, and the card-1993 deposit then posts", async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    refuseProductionConnectionString(cs);
    await ensureIntegrationPrerequisites();
    const db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await refuseProductionDatabase(db);
    const tag = `RPA${Date.now().toString(36).toUpperCase()}`;
    const opco = (await createIsolatedOperatingCompany({ client: db, codePrefix: tag, legalNamePrefix: "Related party account test" })).companyId;
    try {
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      const one = async <T = { id: string }>(sql: string, params: unknown[]) => (await db.query<T>(sql, params)).rows[0]!;
      const account = async (num: string, name: string, type: string, purpose: string | null = null, parent: string | null = null) =>
        (await one(
          `INSERT INTO catalogs.accounts (operating_company_id, account_number, account_name, account_type, is_postable, system_purpose, parent_account_id)
           VALUES ($1, $2, $3, $4, true, $5, $6::uuid) RETURNING id::text AS id`,
          [opco, num, name, type, purpose, parent]
        )).id;
      const wallet = await account("1295", "Relay Fuel Wallet", "Asset", "relay_fuel_wallet");
      const fee = await account("5005", "Fuel Card Fees", "CostOfGoodsSold");
      await account("1000", "Bank of America - Operating", "Asset");
      const parent = await account("2410", "Owner / Related-Party Loan Payable", "Liability");
      // Two existing party accounts; one retired number above them so the allocator never reuses it.
      await account("2410-00-001", "Due to / from Jorge", "Liability", null, parent);
      await account("2410-00-002", "Due to / from Scentsx", "Liability", null, parent);
      const retired = await account("2410-00-003", "Due to / from Retired Party", "Liability", null, parent);
      await db.query(`UPDATE catalogs.accounts SET deactivated_at = now() WHERE id = $1::uuid`, [retired]);
      const vendor = async (name: string) =>
        (await one(`INSERT INTO mdata.vendors (operating_company_id, vendor_name, vendor_type) VALUES ($1, $2, 'other') RETURNING id::text AS id`, [opco, name])).id;
      await vendor("Relay Purchases");
      const alberto = await vendor("Alberto Lozano");
      await db.query(
        `INSERT INTO integrations.relay_company_cards
           (operating_company_id, card_last4, label, is_active, funding_kind, funding_account_number, party_vendor_id, party_relationship)
         VALUES ($1, '1993', 'Alberto''s wife — loan from vendor Alberto Lozano', true, 'party', NULL, $2, 'other')`,
        [opco, alberto]
      );
      const dAlberto = (await one(
        `INSERT INTO integrations.relay_deposits
           (operating_company_id, deposit_id, relay_created_at, status, total_amount_cents, funding_card_last4, raw_payload, ingest_source)
         VALUES ($1, $2, '2026-10-01T15:00:00Z', 'settled', 51625, '1993', $3::jsonb, 'csv_import') RETURNING id::text AS id`,
        [opco, `${tag}-1993`, JSON.stringify({ amount: "500.00", fee: "16.25", total: "516.25" })]
      )).id;
      const actor = { createJournalEntryOnClient: createJournalEntryOnClient as never };
      const post = () =>
        postRelayDeposit(db as never, { operatingCompanyId: opco, relayDepositId: dAlberto, actorUserId: TEST_OWNER_USER_ID, actorRole: "Owner" }, actor);

      // Before: the deposit is refused by name — no account exists (the old world).
      expect(await post()).toMatchObject({ outcome: "refused" });

      // Non-Owner: refused (403) and the refusal is audited.
      await expect(refuseNonOwnerRelatedPartyAccount(db as never, { userId: TEST_OWNER_USER_ID, role: "Dispatcher" }, opco))
        .rejects.toMatchObject({ code: "owner_only", status: 403 });

      // Dry run: plans 2410-00-004 (after the retired 003), writes nothing.
      const dry = await ensureRelatedPartyAccount(db as never, { operatingCompanyId: opco, partyType: "vendor", partyId: alberto, actorUserId: TEST_OWNER_USER_ID, dryRun: true });
      expect(dry).toMatchObject({ outcome: "planned_create", account_number: "2410-00-004", account_name: "Due to / from Alberto Lozano", account_id: null });
      expect((await one<{ n: number }>(`SELECT count(*)::int AS n FROM catalogs.accounts WHERE operating_company_id = $1::uuid AND account_number = '2410-00-004'`, [opco])).n).toBe(0);

      // Real: one Liability account under 2410, linked to the vendor, card-map row pointed at it, one audit event.
      const made = await ensureRelatedPartyAccount(db as never, { operatingCompanyId: opco, partyType: "vendor", partyId: alberto, actorUserId: TEST_OWNER_USER_ID, dryRun: false });
      expect(made).toMatchObject({ outcome: "created", account_number: "2410-00-004", card_map_rows_linked: 1 });
      expect(await one(
        `SELECT a.account_type, a.parent_account_id::text AS parent, a.account_name FROM catalogs.accounts a WHERE a.id = $1::uuid`, [made.account_id]
      )).toEqual({ account_type: "Liability", parent, account_name: "Due to / from Alberto Lozano" });
      expect((await one<{ n: number }>(
        `SELECT count(*)::int AS n FROM accounting.related_party_accounts WHERE operating_company_id = $1::uuid AND party_vendor_id = $2::uuid AND account_id = $3::uuid`,
        [opco, alberto, made.account_id])).n).toBe(1);
      expect((await one<{ n: string | null }>(
        `SELECT funding_account_number AS n FROM integrations.relay_company_cards WHERE operating_company_id = $1::uuid AND card_last4 = '1993'`, [opco])).n
      ).toBe("2410-00-004");

      // Idempotent: a second call returns the same account, creates nothing.
      const again = await ensureRelatedPartyAccount(db as never, { operatingCompanyId: opco, partyType: "vendor", partyId: alberto, actorUserId: TEST_OWNER_USER_ID, dryRun: false });
      expect(again).toMatchObject({ outcome: "exists", account_id: made.account_id });
      expect((await one<{ n: number }>(`SELECT count(*)::int AS n FROM catalogs.accounts WHERE operating_company_id = $1::uuid AND account_name = 'Due to / from Alberto Lozano'`, [opco])).n).toBe(1);

      // The card-1993 deposit now posts: Dr 1295 principal + Dr 5005 fee / Cr Due to / from Alberto Lozano.
      const out = await post();
      expect(out).toMatchObject({ outcome: "posted", charged_cents: 51625 });
      const legs = (await db.query<{ account_id: string; dc: string; cents: string }>(
        `SELECT account_id::text, debit_or_credit AS dc, amount_cents::text AS cents FROM accounting.journal_entry_postings
          WHERE journal_entry_uuid = $1::uuid ORDER BY debit_or_credit DESC, amount_cents DESC`, [(out as { journal_entry_id: string }).journal_entry_id])).rows;
      expect(legs).toEqual([
        { account_id: wallet, dc: "debit", cents: "50000" },
        { account_id: fee, dc: "debit", cents: "1625" },
        { account_id: made.account_id, dc: "credit", cents: "51625" },
      ]);
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
