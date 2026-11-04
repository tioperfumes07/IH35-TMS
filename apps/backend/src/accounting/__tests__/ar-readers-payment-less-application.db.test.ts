/**
 * ACCT-F11103 — the TS A/R readers count a payment-less relief application (real Postgres).
 *
 * Runs the readers' REAL SQL (ar-aging.service, counterparty-statements.service, customer-activity.service) against a
 * migrated database inside one rolled-back transaction: withCurrentUser is routed to the test's own client.
 * Scenario: $50,000.00 invoice issued 2026-01-01, $20,000.00 relief application (payment_id NULL) applied 2026-02-10.
 * On the old INNER JOIN SQL the A/R aging reads 5,000,000 and the statement closes at 5,000,000; both must be 3,000,000.
 *
 * Runs only in CI (GITHUB_ACTIONS=true) where a migrated Postgres is available.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";
import { insertInvoiceLine, insertLoadForInvoice } from "../../../test-helpers/load-born-invoice.js";

const shared: { db: pg.Client | null } = { db: null };

vi.mock("../../auth/db.js", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return {
    ...real,
    withCurrentUser: async (_userId: string, fn: (client: unknown) => Promise<unknown>) => {
      if (!shared.db) throw new Error("test db not connected");
      return fn(shared.db);
    },
  };
});

const { getArAgingReport } = await import("../ar-aging.service.js");
const { getCustomerStatementOfAccount } = await import("../counterparty-statements.service.js");
const { getCustomerActivity } = await import("../customer-activity.service.js");

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("ACCT-F11103 A/R readers count payment-less applications (real Postgres)", () => {
  let db: pg.Client;
  let companyId: string;
  const n5 = () => String(Math.floor(10000 + Math.random() * 89999));
  const invDisplay = `INV-2026-${n5()}`;
  const customerId = randomUUID();
  const invoiceId = randomUUID();
  const USER = randomUUID();

  beforeAll(async () => {
    companyId = await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    shared.db = db;

    await db.query(`INSERT INTO mdata.customers (id, operating_company_id, customer_name) VALUES ($1::uuid,$2::uuid,$3)`, [
      customerId,
      companyId,
      `F11103R Cust ${invDisplay}`,
    ]);
    const loadId = await insertLoadForInvoice(db, companyId, customerId, { rateTotalCents: 5000000 });
    await db.query(
      `INSERT INTO accounting.invoices (id, operating_company_id, customer_id, display_id, issue_date, due_date, total_cents, status, source_load_id)
       VALUES ($1::uuid,$2::uuid,$3::uuid,$4,DATE '2026-01-01',DATE '2026-01-31',5000000,'draft',$5::uuid)`,
      [invoiceId, companyId, customerId, invDisplay, loadId]
    );
    await insertInvoiceLine(db, companyId, invoiceId, 5000000, { loadId, status: "sent" });
    await db.query(
      `INSERT INTO accounting.payment_applications
         (operating_company_id, payment_id, invoice_id, amount_cents, amount_applied, target_kind, target_id, applied_at)
       VALUES ($1::uuid, NULL, $2::uuid, 2000000, 20000.00, 'invoice', $2::uuid, TIMESTAMPTZ '2026-02-10 12:00:00+00')`,
      [companyId, invoiceId]
    );
  });

  afterAll(async () => {
    shared.db = null;
    if (db) {
      await db.query("ROLLBACK").catch(() => {});
      await db.end().catch(() => {});
    }
  });

  it("A/R aging service: $30,000.00 open as of 2026-02-15 (was $50,000.00)", async () => {
    const r = await getArAgingReport({ userId: USER, operating_company_id: companyId, as_of_date: "2026-02-15", customer_id: customerId });
    const row = r.customers.find((c) => c.customer_id === customerId);
    expect(row?.total_outstanding).toBe(3000000);
  });

  it("A/R aging service: still $50,000.00 as of 2026-02-05, before the relief", async () => {
    const r = await getArAgingReport({ userId: USER, operating_company_id: companyId, as_of_date: "2026-02-05", customer_id: customerId });
    expect(r.customers.find((c) => c.customer_id === customerId)?.total_outstanding).toBe(5000000);
  });

  it("customer statement: the relief is a line dated 2026-02-10 and the closing equals the aging", async () => {
    const s = await getCustomerStatementOfAccount({ userId: USER, operating_company_id: companyId, customer_id: customerId, from_date: "2026-01-01", to_date: "2026-02-15" });
    const relief = s!.lines.find((l) => l.type === "payment");
    expect(relief?.date).toBe("2026-02-10");
    expect(relief?.credit_cents).toBe(2000000);
    expect(relief?.link_kind).toBe("invoice");
    expect(s!.closing_balance_cents).toBe(3000000);
  });

  it("customer statement: an opening balance from 2026-02-11 already nets the relief", async () => {
    const s = await getCustomerStatementOfAccount({ userId: USER, operating_company_id: companyId, customer_id: customerId, from_date: "2026-02-11", to_date: "2026-02-15" });
    expect(s!.opening_balance_cents).toBe(3000000);
  });

  it("customer activity: the relief appears as a -$20,000.00 event", async () => {
    const a = await getCustomerActivity({ userId: USER, operating_company_id: companyId, customer_id: customerId });
    const ev = a!.rows.find((r) => r.type === "payment");
    expect(ev?.amount_cents).toBe(-2000000);
    expect(ev?.reference).toBe(invDisplay);
  });
});
