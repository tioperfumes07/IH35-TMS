/**
 * 443.101 posting-gate PROOF — dispatch.detention_evidence (docs/specs/scoreboard/posting-gate-tables.json).
 *
 * Drives the detention approval engine end to end on an isolated company: a closed detention event on a delivered
 * load becomes a pending request through the engine's own sync (listDetentionRequests), and approveDetentionRequest
 * (detention-approval.service.ts) — the only writer of the table — bridges it to billing, builds the load's invoice and
 * records the dwell evidence in ONE transaction. Asserts the evidence row (company, request, event, load, stop,
 * billable minutes) and the request it closes (invoiced, carrying the invoice). The approval commits by design; the
 * rows live on the isolated fixture company of the CI database — never on USMCA (owner laws 2026-09-02 / 2026-10-04).
 */
import { randomUUID } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { approveDetentionRequest, listDetentionRequests } from "../detention-approval.service.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import {
  createIsolatedOperatingCompany,
  ensureIntegrationPrerequisites,
  type IsolatedOperatingCompany,
} from "../../../test-helpers/db-fixture.js";
import { insertLoadForInvoice } from "../../../test-helpers/load-born-invoice.js";
import { connectFixtureClient, fixtureTxn } from "../../../test-helpers/posting-gate-proof.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("posting-gate proof — dispatch.detention_evidence via approveDetentionRequest", () => {
  let db: pg.Client;
  let iso: IsolatedOperatingCompany;
  const customerId = randomUUID();
  const incomeAccountId = randomUUID();
  const stopId = randomUUID();
  const eventId = randomUUID();
  const invoiceId = randomUUID();
  let loadId: string;
  const RATE_CENTS = 100_000;
  const DETENTION_CENTS = 15_000;

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    db = await connectFixtureClient();
    iso = await createIsolatedOperatingCompany({ codePrefix: "PGD", legalNamePrefix: "Posting-gate detention" });
    await fixtureTxn(db, iso.companyId, async () => {
      await db.query(
        `INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable)
         VALUES ($1::uuid, $2::uuid, $3, 'Freight income (posting-gate proof)', 'Income', true)`,
        [incomeAccountId, iso.companyId, `IN${incomeAccountId.slice(0, 6)}`]
      );
      await db.query(
        `INSERT INTO mdata.customers (id, operating_company_id, customer_name) VALUES ($1::uuid, $2::uuid, $3)`,
        [customerId, iso.companyId, `PG detention customer ${customerId.slice(0, 6)}`]
      );
      loadId = await insertLoadForInvoice(db, iso.companyId, customerId, { rateTotalCents: RATE_CENTS });
      await db.query(
        `INSERT INTO mdata.load_stops (id, load_id, sequence_number, stop_type) VALUES ($1::uuid, $2::uuid, 2, 'delivery')`,
        [stopId, loadId]
      );
      // The booking-time proforma invoice the approval re-syncs (ACCT-F5624 precondition).
      await db.query(
        `INSERT INTO accounting.invoices
           (id, operating_company_id, customer_id, display_id, issue_date, due_date, subtotal_cents, tax_cents, total_cents, status, source_load_id)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, CURRENT_DATE, CURRENT_DATE, $5, 0, $5, 'proforma', $6::uuid)`,
        [invoiceId, iso.companyId, customerId, `INV-2026-${String(Math.floor(10000 + Math.random() * 89999))}`, RATE_CENTS, loadId]
      );
      await db.query(
        `INSERT INTO accounting.invoice_lines
           (operating_company_id, invoice_id, source_load_id, line_type, account_id, description, quantity, unit_amount_cents, line_total_cents, display_order)
         VALUES ($1::uuid, $2::uuid, $3::uuid, 'linehaul', $4::uuid, 'Linehaul', 1, $5, $5, 0)`,
        [iso.companyId, invoiceId, loadId, incomeAccountId, RATE_CENTS]
      );
      await db.query(
        `INSERT INTO dispatch.detention_events
           (id, operating_company_id, load_id, stop_id, status, started_at, stopped_at,
            free_time_minutes, rate_per_hour_cents, accrued_minutes, accrued_amount_cents)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'closed', now() - interval '5 hours', now(), 120, 5000, 180, $5)`,
        [eventId, iso.companyId, loadId, stopId, DETENTION_CENTS]
      );
    });
  });

  afterAll(async () => {
    await db?.end();
  });

  it("approval records the dwell evidence for the request and invoices it", async () => {
    const listed = await listDetentionRequests(TEST_OWNER_USER_ID, iso.companyId, "pending_review");
    const request = (listed.requests as Array<Record<string, unknown>>).find((r) => String(r.detention_event_id) === eventId);
    expect(request, "the engine sync turns the closed event into a pending request").toBeTruthy();
    const requestId = String(request!.id);

    const out = await approveDetentionRequest(TEST_OWNER_USER_ID, iso.companyId, requestId, "email");
    expect(out.ok, `approval failed: ${JSON.stringify(out)}`).toBe(true);
    const evidenceId = (out as { evidence_id: string | null }).evidence_id;
    expect(evidenceId).toMatch(/^[0-9a-f-]{36}$/);

    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    const evidence = (
      await db.query(
        `SELECT operating_company_id::text AS company, detention_request_id::text AS request, detention_event_id::text AS event,
                load_id::text AS load, stop_id::text AS stop, billable_minutes, evidence_source
           FROM dispatch.detention_evidence WHERE id = $1::uuid`,
        [evidenceId]
      )
    ).rows[0];
    const closed = (
      await db.query(
        `SELECT status, invoice_id::text AS invoice_id, approval_method FROM dispatch.detention_requests WHERE id = $1::uuid`,
        [requestId]
      )
    ).rows[0];
    await db.query("COMMIT");

    expect(evidence).toMatchObject({
      company: iso.companyId,
      request: requestId,
      event: eventId,
      load: loadId,
      stop: stopId,
      evidence_source: "derived_from_stop_timestamps",
    });
    expect(Number(evidence.billable_minutes)).toBe(Number(request!.billable_minutes));
    expect(closed).toMatchObject({ status: "invoiced", invoice_id: invoiceId, approval_method: "email" });
  });
});
