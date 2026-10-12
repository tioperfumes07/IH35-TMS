/**
 * 443.101 posting-gate PROOF — accounting.related_party_loan_schedule (docs/specs/scoreboard/posting-gate-tables.json).
 *
 * Drives the shared related-party loan create writer, createRelatedPartyLoanEntry (create-entry.service.ts), with a
 * payment plan on an isolated company inside the app's own scoped transaction; asserts the entry, its facility and
 * every schedule row (company, loan link, principal amortised to zero), and rolls everything back. Never seeds USMCA
 * (owner laws 2026-09-02 / 2026-10-04).
 */
import { randomUUID } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRelatedPartyLoanEntry } from "../create-entry.service.js";
import { TEST_OWNER_USER_ID } from "../../../../test-helpers/constants.js";
import {
  createIsolatedOperatingCompany,
  ensureIntegrationPrerequisites,
  type IsolatedOperatingCompany,
} from "../../../../test-helpers/db-fixture.js";
import { connectFixtureClient, fixtureTxn, inRolledBackAppTxn } from "../../../../test-helpers/posting-gate-proof.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("posting-gate proof — accounting.related_party_loan_schedule via createRelatedPartyLoanEntry", () => {
  let db: pg.Client;
  let iso: IsolatedOperatingCompany;
  const accountId = randomUUID();
  const PRINCIPAL_CENTS = 300_000;

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    db = await connectFixtureClient();
    iso = await createIsolatedOperatingCompany({ codePrefix: "PGR", legalNamePrefix: "Posting-gate RP loan" });
    await fixtureTxn(db, iso.companyId, async () => {
      await db.query(
        `INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable)
         VALUES ($1::uuid, $2::uuid, $3, 'Due from related party (posting-gate proof)', 'Asset', true)`,
        [accountId, iso.companyId, `RP${accountId.slice(0, 6)}`]
      );
    });
  });

  afterAll(async () => {
    await db?.end();
  });

  it("writes the loan entry, its facility and a 3-row amortised schedule, then rolls back", async () => {
    const proof = await inRolledBackAppTxn(TEST_OWNER_USER_ID, iso.companyId, async (client) => {
      const out = await createRelatedPartyLoanEntry(
        client as never,
        {
          operating_company_id: iso.companyId,
          direction: "out",
          relationship: "related_company",
          counterparty_kind: "other",
          counterparty_name: "Posting-gate related party",
          account_id: accountId,
          target_type: "loan_out",
          principal_cents: PRINCIPAL_CENTS,
          entry_date: "2026-10-01",
          interest_rate_bps: 0,
          interest_method: "none",
          payment_frequency: "monthly",
          payment_count: 3,
          first_payment_date: "2026-11-01",
        },
        TEST_OWNER_USER_ID
      );
      if ("error" in out) return { error: out.error };
      const schedule = (
        await client.query(
          `SELECT operating_company_id::text AS company, loan_id::text AS loan_id, payment_number,
                  principal_cents::bigint AS principal, remaining_balance_cents::bigint AS remaining
             FROM accounting.related_party_loan_schedule WHERE loan_id = $1::uuid ORDER BY payment_number`,
          [out.id]
        )
      ).rows;
      const entry = (
        await client.query(
          `SELECT operating_company_id::text AS company, facility_id::text AS facility_id, account_id::text AS account_id
             FROM accounting.related_party_loan_entries WHERE id = $1::uuid`,
          [out.id]
        )
      ).rows[0];
      return { id: out.id, scheduleRows: out.schedule_rows, facilityId: out.facility_id, schedule, entry };
    });

    expect("error" in proof ? proof.error : null).toBeNull();
    const ok = proof as Exclude<typeof proof, { error: string }>;
    expect(ok.scheduleRows).toBe(3);
    expect(ok.entry).toMatchObject({ company: iso.companyId, facility_id: ok.facilityId, account_id: accountId });
    expect(ok.schedule).toHaveLength(3);
    for (const row of ok.schedule) expect(row).toMatchObject({ company: iso.companyId, loan_id: ok.id });
    expect(ok.schedule.reduce((s, r) => s + Number(r.principal), 0)).toBe(PRINCIPAL_CENTS);
    expect(Number(ok.schedule[2].remaining)).toBe(0);

    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    const left = await db.query(
      `SELECT count(*)::int AS n FROM accounting.related_party_loan_schedule WHERE loan_id = $1::uuid`,
      [ok.id]
    );
    await db.query("COMMIT");
    expect(left.rows[0].n).toBe(0);
  });
});
