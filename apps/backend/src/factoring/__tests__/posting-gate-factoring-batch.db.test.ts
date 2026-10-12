/**
 * 443.101 posting-gate PROOF — factoring.batch (docs/specs/scoreboard/posting-gate-tables.json).
 *
 * Drives the batch engine's writer, createDraftBatch (batch.service.ts), over a real SENT, open, unfactored invoice of
 * an isolated company inside the app's own scoped transaction; asserts the draft batch names that invoice, carries its
 * face value and the company, and rolls everything back. Never seeds USMCA (owner laws 2026-09-02 / 2026-10-04).
 */
import { randomUUID } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDraftBatch } from "../batch.service.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import {
  createIsolatedOperatingCompany,
  ensureIntegrationPrerequisites,
  type IsolatedOperatingCompany,
} from "../../../test-helpers/db-fixture.js";
import { insertInvoiceLine, insertLoadForInvoice } from "../../../test-helpers/load-born-invoice.js";
import { connectFixtureClient, fixtureTxn, inRolledBackAppTxn } from "../../../test-helpers/posting-gate-proof.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("posting-gate proof — factoring.batch via createDraftBatch", () => {
  let db: pg.Client;
  let iso: IsolatedOperatingCompany;
  const customerId = randomUUID();
  const invoiceId = randomUUID();
  const FACE_CENTS = 250_000;

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    db = await connectFixtureClient();
    iso = await createIsolatedOperatingCompany({ codePrefix: "PGB", legalNamePrefix: "Posting-gate factoring batch" });
    await fixtureTxn(db, iso.companyId, async () => {
      await db.query(
        `INSERT INTO mdata.customers (id, operating_company_id, customer_name) VALUES ($1::uuid, $2::uuid, $3)`,
        [customerId, iso.companyId, `PG batch customer ${customerId.slice(0, 6)}`]
      );
      const loadId = await insertLoadForInvoice(db, iso.companyId, customerId, { rateTotalCents: FACE_CENTS });
      await db.query(
        `INSERT INTO accounting.invoices
           (id, operating_company_id, customer_id, display_id, issue_date, due_date, subtotal_cents, tax_cents, total_cents, status, source_load_id)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, CURRENT_DATE, CURRENT_DATE + 30, $5, 0, $5, 'draft', $6::uuid)`,
        [invoiceId, iso.companyId, customerId, `INV-2026-${String(Math.floor(10000 + Math.random() * 89999))}`, FACE_CENTS, loadId]
      );
      await insertInvoiceLine(db, iso.companyId, invoiceId, FACE_CENTS, { loadId, status: "sent" });
    });
  });

  afterAll(async () => {
    await db?.end();
  });

  it("writes a draft batch for the sent invoice (company, invoice, face, expected advance/fee), then rolls back", async () => {
    const proof = await inRolledBackAppTxn(TEST_OWNER_USER_ID, iso.companyId, async (client) => {
      const batch = await createDraftBatch(iso.companyId, [invoiceId], { client: client as never, advanceRate: 0.97, feeRate: 0.015 });
      const row = (
        await client.query(
          `SELECT operating_company_id::text AS company, status, invoice_ids::text[] AS invoice_ids,
                  total_face_cents::bigint AS face, expected_advance_cents::bigint AS advance, expected_fee_cents::bigint AS fee
             FROM factoring.batch WHERE id = $1::uuid`,
          [batch.id]
        )
      ).rows[0];
      return { id: String(batch.id), row };
    });

    expect(proof.row).toMatchObject({ company: iso.companyId, status: "draft", invoice_ids: [invoiceId] });
    expect(Number(proof.row.face)).toBe(FACE_CENTS);
    expect(Number(proof.row.advance)).toBe(Math.round(FACE_CENTS * 0.97));
    expect(Number(proof.row.fee)).toBe(Math.round(FACE_CENTS * 0.015));

    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    const left = await db.query(`SELECT count(*)::int AS n FROM factoring.batch WHERE id = $1::uuid`, [proof.id]);
    await db.query("COMMIT");
    expect(left.rows[0].n).toBe(0);
  });

  it("refuses an invoice that is not sent/open (the writer's own eligibility gate)", async () => {
    const err = await inRolledBackAppTxn(TEST_OWNER_USER_ID, iso.companyId, async (client) =>
      createDraftBatch(iso.companyId, [randomUUID()], { client: client as never }).then(
        () => null,
        (e: unknown) => e as { code?: string; message?: string }
      )
    );
    expect(String((err as { code?: string })?.code ?? (err as Error)?.message)).toContain("invoice_not_eligible");
  });
});
