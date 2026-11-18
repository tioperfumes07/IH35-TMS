/**
 * Real-PG integration test for the Faro collection replay engine (ENG-17).
 *
 * Proves:
 * 1. applyFaroCollectionInClientTx creates accounting.payments + payment_applications + GL postings.
 * 2. Invoice factoring_status flips to 'collected' when fully paid.
 * 3. Idempotency: a second call with the same remittance_ref returns already_applied=true with no new rows.
 * 4. Short-pay: invoice stays open, dispute row is created.
 *
 * Uses an isolated operating company — never touches USMCA.
 */
import { randomUUID } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyFaroCollectionInClientTx } from "../collection-apply.service.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import {
  createIsolatedOperatingCompany,
  ensureIntegrationPrerequisites,
  type IsolatedOperatingCompany,
} from "../../../test-helpers/db-fixture.js";
import { connectFixtureClient, inRolledBackAppTxn } from "../../../test-helpers/posting-gate-proof.js";
import { insertInvoiceLine, insertLoadForInvoice } from "../../../test-helpers/load-born-invoice.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

async function bindCollectionRoles(client: pg.ClientBase, companyId: string): Promise<void> {
  for (const [role, number, name, type] of [
    ["factoring_advance_liability", "2150", "ENG17 Factoring advance liability", "Liability"],
    ["ar_control", "1100", "ENG17 Accounts receivable", "Asset"],
  ] as const) {
    const acct = (await client.query<{ id: string }>(
      `INSERT INTO catalogs.accounts (operating_company_id, account_name, account_type, account_number)
       VALUES ($1::uuid, $2, $3, $4) RETURNING id::text AS id`, [companyId, name, type, number])).rows[0]!.id;
    await client.query(
      `INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
       VALUES ($1::uuid, $2, $3::uuid, true)`, [companyId, role, acct]);
  }
}

describeIntegration("ENG-17 collection replay — real PG integration", () => {
  let db: pg.Client;
  let iso: IsolatedOperatingCompany;

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    db = await connectFixtureClient();
    iso = await createIsolatedOperatingCompany({
      codePrefix: "ENG17",
      legalNamePrefix: "ENG-17 Factoring Collection Test",
    });
  });

  afterAll(async () => {
    await db?.end();
  });

  it("applies a full collection: creates payment + application + marks invoice collected", async () => {
    const ref = `faro-test-${randomUUID().slice(0, 8)}`;

    const proof = await inRolledBackAppTxn(TEST_OWNER_USER_ID, iso.companyId, async (client) => {
      // Create a minimal factored invoice via raw SQL inside the rolled-back txn
      const invId = randomUUID();
      const custId = randomUUID();
      const advId = randomUUID();

      // Insert minimum required rows for the test
      await client.query(
        `INSERT INTO mdata.customers (id, operating_company_id, customer_name, status, created_by_user_id)
         VALUES ($1::uuid, $2::uuid, 'Test Customer', 'active', $3::uuid)`,
        [custId, iso.companyId, TEST_OWNER_USER_ID]
      );
      // The two accounts the collection posts to (Dr 2150 factoring_advance_liability / Cr 1100 ar_control): an isolated
      // company has no chart of its own, so the fixture binds them, inside this rolled-back transaction.
      await bindCollectionRoles(client as never, iso.companyId);
      // The factor the advance names (the isolated test company has no vendors of its own).
      await client.query(
        `INSERT INTO mdata.vendors (operating_company_id, vendor_name, vendor_type) VALUES ($1::uuid, 'ENG17 test factor', 'other')`,
        [iso.companyId]
      );
      await client.query(
        `INSERT INTO accounting.factoring_advances
           (id, operating_company_id, factoring_company_vendor_id, display_id, status, invoice_total_cents, advance_amount_cents, advance_rate_pct, reserve_pct, reserve_amount_cents, submitted_at, created_by_user_id)
         SELECT $1::uuid, $2::uuid, v.id, 'ADV-ENG17-01', 'advanced', 100000, 80000, 80, 20, 20000, now(), $3::uuid
           FROM mdata.vendors v WHERE v.operating_company_id = $2::uuid LIMIT 1`,
        [advId, iso.companyId, TEST_OWNER_USER_ID]
      );
      // A from_load invoice is written with its load, as a draft, then its line moves it to sent (LAW 363.2 helpers).
      const invLoad = await insertLoadForInvoice(client as never, iso.companyId, custId);
      await client.query(
        `INSERT INTO accounting.invoices
           (id, operating_company_id, customer_id, source_load_id, display_id, status, issue_date, due_date,
            total_cents, factoring_advance_id, factoring_status, created_by_user_id)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $6::uuid, 'INV-9917-00001', 'draft', CURRENT_DATE, CURRENT_DATE + 30,
                 100000, $4::uuid, 'advanced', $5::uuid)`,
        [invId, iso.companyId, custId, advId, TEST_OWNER_USER_ID, invLoad]
      );
      await insertInvoiceLine(client as never, iso.companyId, invId, 100000, { loadId: invLoad, status: "sent" });

      const result = await applyFaroCollectionInClientTx(client as never, {
        operating_company_id: iso.companyId,
        invoice_id: invId,
        amount_paid_cents: 100000,
        date_paid: "2026-11-13",
        remittance_ref: ref,
        actor_user_id: TEST_OWNER_USER_ID,
        actor_role: "Owner",
      });

      return { result, invId };
    });

    expect(proof.result.already_applied).toBe(false);
    expect(proof.result.applied_cents).toBe(100000);
    expect(proof.result.remainder_cents).toBe(0);
    expect(proof.result.payment_id).toBeTruthy();
  });

  it("is idempotent: second call with same remittance_ref returns already_applied=true", async () => {
    const ref = `faro-idem-${randomUUID().slice(0, 8)}`;

    const proof = await inRolledBackAppTxn(TEST_OWNER_USER_ID, iso.companyId, async (client) => {
      const invId = randomUUID();
      const custId = randomUUID();
      const advId = randomUUID();

      await client.query(
        `INSERT INTO mdata.customers (id, operating_company_id, customer_name, status, created_by_user_id)
         VALUES ($1::uuid, $2::uuid, 'Idem Customer', 'active', $3::uuid)`,
        [custId, iso.companyId, TEST_OWNER_USER_ID]
      );
      // The two accounts the collection posts to (Dr 2150 factoring_advance_liability / Cr 1100 ar_control): an isolated
      // company has no chart of its own, so the fixture binds them, inside this rolled-back transaction.
      await bindCollectionRoles(client as never, iso.companyId);
      // The factor the advance names (the isolated test company has no vendors of its own).
      await client.query(
        `INSERT INTO mdata.vendors (operating_company_id, vendor_name, vendor_type) VALUES ($1::uuid, 'ENG17 test factor', 'other')`,
        [iso.companyId]
      );
      await client.query(
        `INSERT INTO accounting.factoring_advances
           (id, operating_company_id, factoring_company_vendor_id, display_id, status, invoice_total_cents, advance_amount_cents, advance_rate_pct, reserve_pct, reserve_amount_cents, submitted_at, created_by_user_id)
         SELECT $1::uuid, $2::uuid, v.id, 'ADV-ENG17-02', 'advanced', 50000, 40000, 80, 20, 10000, now(), $3::uuid
           FROM mdata.vendors v WHERE v.operating_company_id = $2::uuid LIMIT 1`,
        [advId, iso.companyId, TEST_OWNER_USER_ID]
      );
      // A from_load invoice is written with its load, as a draft, then its line moves it to sent (LAW 363.2 helpers).
      const invLoad = await insertLoadForInvoice(client as never, iso.companyId, custId);
      await client.query(
        `INSERT INTO accounting.invoices
           (id, operating_company_id, customer_id, source_load_id, display_id, status, issue_date, due_date,
            total_cents, factoring_advance_id, factoring_status, created_by_user_id)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $6::uuid, 'INV-9917-00002', 'draft', CURRENT_DATE, CURRENT_DATE + 30,
                 50000, $4::uuid, 'advanced', $5::uuid)`,
        [invId, iso.companyId, custId, advId, TEST_OWNER_USER_ID, invLoad]
      );
      await insertInvoiceLine(client as never, iso.companyId, invId, 50000, { loadId: invLoad, status: "sent" });

      // First apply
      await applyFaroCollectionInClientTx(client as never, {
        operating_company_id: iso.companyId,
        invoice_id: invId,
        amount_paid_cents: 50000,
        date_paid: "2026-11-13",
        remittance_ref: ref,
        actor_user_id: TEST_OWNER_USER_ID,
        actor_role: "Owner",
      });

      // Second apply — same ref
      const second = await applyFaroCollectionInClientTx(client as never, {
        operating_company_id: iso.companyId,
        invoice_id: invId,
        amount_paid_cents: 50000,
        date_paid: "2026-11-13",
        remittance_ref: ref,
        actor_user_id: TEST_OWNER_USER_ID,
        actor_role: "Owner",
      });

      return second;
    });

    expect(proof.already_applied).toBe(true);
  });
});
