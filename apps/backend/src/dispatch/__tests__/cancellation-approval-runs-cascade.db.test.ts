/**
 * 443.113 AJK-10 + AJK-11 (Codex deep-wiring audit 2026-10-12) — real Postgres, one transaction, ROLLED BACK.
 *
 * AJK-10: a cancellation whose reason requires Owner approval is first only REQUESTED; the Owner's later approval must
 *   run the SAME financial finalization as an immediate cancel (load cancelled + the load's live documents unwound +
 *   the billable TONU charge raised). Before the fix approval stamped the load cancelled, settled revrec and stopped,
 *   leaving the load's invoice live and the earned TONU charge never raised.
 * AJK-11: an immediate billable cancellation raises the TONU invoice and then ran the "void every live invoice of this
 *   load" loop — which selected and voided the TONU it had just raised. The charge must survive (canonical backlink).
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { createIsolatedOperatingCompany, deactivateIsolatedOperatingCompany } from "../../../test-helpers/isolated-company.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { insertInvoiceLine, insertLoadForInvoice } from "../../../test-helpers/load-born-invoice.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { approveCancellationInClientTx, cancelLoadInClientTx } from "../cancellation.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("443.113 AJK-10/11 — Owner approval runs the cancellation cascade; the TONU charge survives", () => {
  let db: pg.Client;
  let companyId: string;
  const customerId = randomUUID();
  const reasonCode = `AJK10-${randomUUID().slice(0, 8)}`;
  const notes = "Customer cancelled the load after dispatch (AJK-10 test)";

  async function liveInvoice(loadId: string) {
    const invoiceId = randomUUID();
    await db.query(
      `INSERT INTO accounting.invoices (id, operating_company_id, customer_id, display_id, issue_date, due_date, total_cents, status, source_load_id)
       VALUES ($1::uuid,$2::uuid,$3::uuid,$4,CURRENT_DATE,CURRENT_DATE + 30,120000,'draft',$5::uuid)`,
      [invoiceId, companyId, customerId, `INV-2026-${String(Math.floor(10000 + Math.random() * 89999))}`, loadId]
    );
    await insertInvoiceLine(db, companyId, invoiceId, 120000, { loadId });
    return invoiceId;
  }
  async function newLoad() {
    const loadId = await insertLoadForInvoice(db, companyId, customerId, { rateTotalCents: 120000 });
    await db.query(`UPDATE mdata.loads SET status = 'dispatched' WHERE id = $1::uuid`, [loadId]);
    return loadId;
  }
  const status = async (sql: string, id: string) => (await db.query<{ s: string }>(sql, [id])).rows[0]?.s;

  let iso: Awaited<ReturnType<typeof createIsolatedOperatingCompany>>;
  const incomeAccountId = randomUUID();

  beforeAll(async () => {
    // An isolated company (never USMCA / TRANSP / TRK). The TONU writer resolves the company's revenue/accessorial
    // account through its own connection (resolveInvoiceLineRevenueAccountId), so that one mapping is committed here,
    // as USMCA carries it on prod (4200 Accessorial / Detention Income). Everything else runs in ONE rolled-back txn.
    iso = await createIsolatedOperatingCompany({ label: "ajk10", codePrefix: "AJK" });
    companyId = iso.companyId;
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    refuseProductionConnectionString(cs);
    db = new pg.Client(buildPgClientConfig(cs!));
    await db.connect();
    await refuseProductionDatabase(db);
    await db.query("SET ROLE ih35_app");
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query(
      `INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable)
       VALUES ($1::uuid,$2::uuid,'4200','Accessorial / Detention Income','Income',true)`,
      [incomeAccountId, companyId]
    );
    await db.query(
      `INSERT INTO accounting.expense_category_account_map (operating_company_id, category_kind, category_code, account_id, posting_side, is_active)
       VALUES ($1::uuid,'revenue','accessorial',$2::uuid,'credit',true)`,
      [companyId, incomeAccountId]
    );
    await db.query("COMMIT");
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    await db.query("SELECT set_config('app.user_id', $1::text, true)", [TEST_OWNER_USER_ID]);
    await db.query(`INSERT INTO mdata.customers (id, operating_company_id, customer_name) VALUES ($1::uuid,$2::uuid,$3)`, [
      customerId,
      companyId,
      `AJK10 Cust ${reasonCode}`,
    ]);
    await db.query(
      `INSERT INTO catalogs.load_cancellation_reasons
         (operating_company_id, reason_code, display_name, category, created_by_user_id, requires_owner_approval, billable_to_customer_default)
       VALUES ($1::uuid, $2, $3, 'customer_initiated', $4::uuid, true, true)`,
      [companyId, reasonCode, `AJK10 ${reasonCode}`, TEST_OWNER_USER_ID]
    );
    await db.query(
      `INSERT INTO lib.feature_flag_overrides (flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid)
       VALUES ('TONU_CANCELLATION_AR_POSTING_ENABLED', $1::uuid, NULL, true, $2::uuid)`,
      [companyId, TEST_OWNER_USER_ID]
    );
  });

  afterAll(async () => {
    await db?.query("ROLLBACK").catch(() => {});
    if (db && iso) {
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      await db.query(`UPDATE accounting.expense_category_account_map SET is_active = false WHERE operating_company_id = $1::uuid`, [companyId]);
      await db.query("COMMIT");
      await deactivateIsolatedOperatingCompany(db, iso).catch(() => {});
    }
    await db?.end().catch(() => {});
  });

  it("AJK-10: requested cancellation leaves the documents; the Owner's approval runs the same cascade (invoice voided, TONU raised)", async () => {
    const loadId = await newLoad();
    const invoiceId = await liveInvoice(loadId);
    const req = await cancelLoadInClientTx(db as never, TEST_OWNER_USER_ID, "Dispatcher", {
      operating_company_id: companyId,
      load_id: loadId,
      reason_code: reasonCode,
      cancellation_notes: notes,
      billable_to_customer: true,
      cancellation_charge_cents: 25000,
    } as never);
    expect(req.status).toBe("pending_owner_approval");
    expect(await status(`SELECT status::text AS s FROM accounting.invoices WHERE id = $1::uuid`, invoiceId)).toBe("draft");

    await approveCancellationInClientTx(db as never, TEST_OWNER_USER_ID, "Owner", {
      operating_company_id: companyId,
      cancellation_id: req.cancellation_id,
    });
    expect(await status(`SELECT status::text AS s FROM mdata.loads WHERE id = $1::uuid`, loadId)).toBe("cancelled");
    expect(await status(`SELECT status::text AS s FROM accounting.invoices WHERE id = $1::uuid`, invoiceId)).toBe("void");
    const charge = await db.query<{ charge_invoice_id: string | null; s: string | null }>(
      `SELECT lc.charge_invoice_id::text, i.status::text AS s
         FROM dispatch.load_cancellations lc LEFT JOIN accounting.invoices i ON i.id = lc.charge_invoice_id
        WHERE lc.id = $1::uuid`,
      [req.cancellation_id]
    );
    expect(charge.rows[0]?.charge_invoice_id).toBeTruthy();
    expect(charge.rows[0]?.s).not.toBe("void");
  });

  it("AJK-11: an immediate billable cancellation keeps the TONU it raised; the load's original invoice is voided", async () => {
    const loadId = await newLoad();
    const invoiceId = await liveInvoice(loadId);
    const res = await cancelLoadInClientTx(db as never, TEST_OWNER_USER_ID, "Owner", {
      operating_company_id: companyId,
      load_id: loadId,
      reason_code: reasonCode,
      cancellation_notes: notes,
      billable_to_customer: true,
      cancellation_charge_cents: 25000,
    } as never);
    expect(res.status).toBe("cancelled");
    expect(await status(`SELECT status::text AS s FROM accounting.invoices WHERE id = $1::uuid`, invoiceId)).toBe("void");
    const charge = await db.query<{ charge_invoice_id: string | null; s: string | null }>(
      `SELECT lc.charge_invoice_id::text, i.status::text AS s
         FROM dispatch.load_cancellations lc LEFT JOIN accounting.invoices i ON i.id = lc.charge_invoice_id
        WHERE lc.id = $1::uuid`,
      [res.cancellation_id]
    );
    expect(charge.rows[0]?.charge_invoice_id).toBeTruthy();
    expect(charge.rows[0]?.s).not.toBe("void");
  });
});
