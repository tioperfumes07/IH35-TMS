/**
 * ACCT-F5624 — bridgeDetentionToBilling raises a load's rate_total_cents when detention is bridged to
 * billing, but a draft/proforma invoice minted at booking time is a snapshot that is never re-read on
 * its own. Both callers then either called buildInvoiceFromLoad directly (a pure idempotent LOOKUP —
 * it does not update an existing invoice's line/total) or nothing at all, so the detention amount
 * never reached the invoice.
 *
 * This drives the REAL bridgeDetentionToBilling function against REAL Postgres: seeds a load with an
 * existing proforma invoice (the exact precondition the bug needs), bridges a detention accrual, and
 * asserts the invoice's linehaul line and total actually moved by the detention amount — not just that
 * mdata.loads.rate_total_cents moved (which the bug already got right on its own).
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import {
  createIsolatedOperatingCompany,
  deactivateIsolatedOperatingCompany,
  ensureIntegrationPrerequisites,
  type IsolatedOperatingCompany,
} from "../../../test-helpers/db-fixture.js";
import { bridgeDetentionToBilling } from "../detention.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("ACCT-F5624 — detention billing bridge re-syncs an existing proforma invoice", () => {
  let db: pg.Client;
  let isolated: IsolatedOperatingCompany;
  let companyId: string;

  const suffix = randomUUID().slice(0, 8);
  const userId = "00000000-0000-4000-8000-0000000000da";
  const customerId = randomUUID();
  const incomeAccountId = randomUUID();

  const RATE_CENTS = 100_000;
  const DETENTION_CENTS = 15_000;

  async function bypass<T>(fn: () => Promise<T>): Promise<T> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    try {
      const out = await fn();
      await db.query("COMMIT");
      return out;
    } catch (err) {
      await db.query("ROLLBACK").catch(() => {});
      throw err;
    }
  }

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required for this db.test");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();

    await bypass(async () => {
      await db.query(
        `INSERT INTO identity.users (id, email, role, preferred_language)
         VALUES ($1::uuid,$2,'Owner','en') ON CONFLICT (id) DO NOTHING`,
        [userId, `f5624-${suffix}@example.test`]
      );
    });

    isolated = await createIsolatedOperatingCompany({
      codePrefix: "F64",
      legalNamePrefix: "F5624 Detention Resync",
      actorUserId: userId,
    });
    companyId = isolated.companyId;

    await bypass(async () => {
      await db.query(
        `INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable)
         VALUES ($1::uuid,$2::uuid,$3,'Income F5624 Test','Income',true)`,
        [incomeAccountId, companyId, `IN${suffix}`]
      );
      await db.query(
        `INSERT INTO mdata.customers (id, operating_company_id, customer_name) VALUES ($1::uuid,$2::uuid,$3)`,
        [customerId, companyId, `F5624 Cust ${suffix}`]
      );
    });
  });

  afterAll(async () => {
    if (!db) return;
    try {
      if (isolated) await deactivateIsolatedOperatingCompany(isolated);
    } catch {
      /* best-effort cleanup — never mask a real assertion failure */
    }
    await db.end();
  });

  it("bridging a detention accrual raises the load's proforma invoice total, not just rate_total_cents", async () => {
    const loadId = randomUUID();
    const stopId = randomUUID();
    const eventId = randomUUID();
    const invoiceId = randomUUID();
    const lineId = randomUUID();

    await bypass(async () => {
      await db.query(
        `INSERT INTO mdata.loads (id, operating_company_id, load_number, customer_id, status, rate_total_cents, dispatcher_user_id, load_trailer_equipment_id)
         VALUES ($1::uuid,$2::uuid,$3,$4::uuid,'delivered',$5,$6::uuid,(SELECT id FROM catalogs.load_trailer_equipment WHERE operating_company_id = $2::uuid AND code = 'DRY_VAN' LIMIT 1))`,
        [loadId, companyId, `L-F5624-${suffix}`, customerId, RATE_CENTS, userId]
      );
      await db.query(
        `INSERT INTO mdata.load_stops (id, load_id, sequence_number, stop_type) VALUES ($1::uuid, $2::uuid, 2, 'delivery')`,
        [stopId, loadId]
      );

      // The proforma invoice — this is the exact precondition the bug needs: a booking-time invoice
      // that ALREADY exists when detention is later bridged to billing.
      await db.query(
        `INSERT INTO accounting.invoices
           (id, operating_company_id, customer_id, display_id, issue_date, due_date,
            subtotal_cents, tax_cents, total_cents, status, source_load_id)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,CURRENT_DATE,CURRENT_DATE,$5,0,$5,'proforma',$6::uuid)`,
        [invoiceId, companyId, customerId, `INV-2026-${String(Math.floor(Math.random() * 90000) + 10000)}`, RATE_CENTS, loadId]
      );
      await db.query(
        `INSERT INTO accounting.invoice_lines
           (id, operating_company_id, invoice_id, line_type, account_id, description, quantity, unit_amount_cents, line_total_cents, display_order)
         VALUES ($1::uuid,$2::uuid,$3::uuid,'linehaul',$4::uuid,'Linehaul',1,$5,$5,0)`,
        [lineId, companyId, invoiceId, incomeAccountId, RATE_CENTS]
      );

      await db.query(
        `INSERT INTO dispatch.detention_events
           (id, operating_company_id, load_id, stop_id, status, started_at, stopped_at,
            free_time_minutes, rate_per_hour_cents, accrued_minutes, accrued_amount_cents)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'closed', now() - interval '5 hours', now(),
                 120, 5000, 180, $5)`,
        [eventId, companyId, loadId, stopId, DETENTION_CENTS]
      );
    });

    const bridge = await bridgeDetentionToBilling(userId, companyId, eventId);
    expect(bridge.ok, `bridge failed: ${JSON.stringify(bridge)}`).toBe(true);

    const loadRow = await bypass(async () => {
      const res = await db.query<{ rate_total_cents: string }>(
        `SELECT rate_total_cents FROM mdata.loads WHERE id = $1::uuid`,
        [loadId]
      );
      return res.rows[0];
    });
    expect(Number(loadRow.rate_total_cents)).toBe(RATE_CENTS + DETENTION_CENTS);

    // THE BUG THIS TEST EXISTS TO CATCH: before the fix, rate_total_cents moved (asserted above) but
    // NOTHING re-read it into the pre-existing proforma invoice — both assertions below would have
    // failed (line stuck at RATE_CENTS, total stuck at RATE_CENTS).
    const invoiceState = await bypass(async () => {
      const lineRes = await db.query<{ unit_amount_cents: string; line_total_cents: string }>(
        `SELECT unit_amount_cents, line_total_cents FROM accounting.invoice_lines WHERE id = $1::uuid`,
        [lineId]
      );
      const invRes = await db.query<{ total_cents: string; subtotal_cents: string }>(
        `SELECT total_cents, subtotal_cents FROM accounting.invoices WHERE id = $1::uuid`,
        [invoiceId]
      );
      return { line: lineRes.rows[0], invoice: invRes.rows[0] };
    });
    expect(Number(invoiceState.line.unit_amount_cents)).toBe(RATE_CENTS + DETENTION_CENTS);
    expect(Number(invoiceState.line.line_total_cents)).toBe(RATE_CENTS + DETENTION_CENTS);
    expect(Number(invoiceState.invoice.total_cents)).toBe(RATE_CENTS + DETENTION_CENTS);
  });
});
