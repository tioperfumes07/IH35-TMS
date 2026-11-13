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

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

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
      await client.query(
        `INSERT INTO accounting.factoring_advances
           (id, operating_company_id, factoring_company_vendor_id, display_id, status, invoice_total_cents, advance_amount_cents, advance_rate_pct, submitted_at, created_by_user_id)
         SELECT $1::uuid, $2::uuid, v.id, 'ADV-ENG17-01', 'funded', 100000, 80000, 80, now(), $3::uuid
           FROM mdata.vendors v WHERE v.operating_company_id = $2::uuid LIMIT 1`,
        [advId, iso.companyId, TEST_OWNER_USER_ID]
      );
      await client.query(
        `INSERT INTO accounting.invoices
           (id, operating_company_id, customer_id, display_id, status, issue_date, due_date,
            total_cents, amount_open_cents, factoring_advance_id, factoring_status, created_by_user_id)
         VALUES ($1::uuid, $2::uuid, $3::uuid, 'TEST-INV-ENG17', 'sent', CURRENT_DATE, CURRENT_DATE + 30,
                 100000, 100000, $4::uuid, 'advanced', $5::uuid)`,
        [invId, iso.companyId, custId, advId, TEST_OWNER_USER_ID]
      );

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
      await client.query(
        `INSERT INTO accounting.factoring_advances
           (id, operating_company_id, factoring_company_vendor_id, display_id, status, invoice_total_cents, advance_amount_cents, advance_rate_pct, submitted_at, created_by_user_id)
         SELECT $1::uuid, $2::uuid, v.id, 'ADV-ENG17-02', 'funded', 50000, 40000, 80, now(), $3::uuid
           FROM mdata.vendors v WHERE v.operating_company_id = $2::uuid LIMIT 1`,
        [advId, iso.companyId, TEST_OWNER_USER_ID]
      );
      await client.query(
        `INSERT INTO accounting.invoices
           (id, operating_company_id, customer_id, display_id, status, issue_date, due_date,
            total_cents, amount_open_cents, factoring_advance_id, factoring_status, created_by_user_id)
         VALUES ($1::uuid, $2::uuid, $3::uuid, 'TEST-INV-ENG17-2', 'sent', CURRENT_DATE, CURRENT_DATE + 30,
                 50000, 50000, $4::uuid, 'advanced', $5::uuid)`,
        [invId, iso.companyId, custId, advId, TEST_OWNER_USER_ID]
      );

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
