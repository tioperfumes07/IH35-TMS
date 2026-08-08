/**
 * CLS-SUBLEDGER-GL-DARK-TIEOUT — the A/R subledger must TIE OUT to the A/R control account, and the
 * existing tie-out report must be the thing that says so (real Postgres, real routes).
 *
 * WHY THIS EXISTS. `subledger-gl-control-rec.service.ts` already computes control-vs-subledger
 * variance per entity, and `verify-acct-dom-02-subledger-gl-control-rec.mjs` already selftests its
 * pure arithmetic against a fixture. Neither fact protected anything: the report is READ-ONLY and
 * nothing consumes it, so it has been correctly computing a variance nobody reads. Measured on prod
 * br-fancy-credit-akjnd07a 2026-08-07 — USMCA `ar_control` (account 1100) GL closing balance
 * **120000 cents**, while `INV-2026-00003` is **$1,200.00, status 'paid', amount_open_cents 0**. The
 * three customer payments that settled it (PMT-2026-00001/2/3) total **$1,200.00 to the cent** and
 * have **zero** journal_entry_postings between them. The subledger says settled; the control account
 * still carries the invoice in full.
 *
 * WHY A DB-TEST AND NOT A STATIC GUARD. A static scan can prove a poster is CALLED and correctly
 * ORDERED. It structurally cannot prove that a gate returned true, that a flag resolved ON, that the
 * JE balanced, or that a row landed — which is the exact blindness that let this run dark, since the
 * call was wired the whole time and every guard was green.
 *
 * WHY IT DRIVES THE ROUTE AND NEVER THE POSTER DIRECTLY. The defect was never in the posting engine.
 * ACCT-F150 proved the engine works and the ROUTE simply did not call it; ACCT-F165 proved a second
 * route called it on the WRONG connection. A test that invokes `postSourceTransaction` itself asserts
 * the one component that was never broken and would have stayed green through both. So this posts the
 * invoice and receives the payment through their real HTTP handlers, and then asks the tie-out report
 * — not the postings table — whether the books agree.
 *
 * THE SECOND CASE IS THE LOAD-BEARING ONE. Asserting `tied` on a healthy path only proves the report
 * can say yes. The dark case reconstructs the prod situation exactly — invoice posted, payment
 * applied in the subledger, receipt NOT posted — and asserts the report reports a variance equal to
 * the payment. Without that, this file would pass just as happily if the tie-out were hard-coded to
 * "tied", which is the failure mode it exists to make impossible.
 *
 * ISOLATION: owns a UNIQUE org.companies row (createIsolatedOperatingCompany), because it seeds the
 * `ar_control` control singleton and `chart_of_accounts_roles` is UNIQUE per (company, role) — a
 * shared TRANSP row would let parallel forks clobber each other's account_id.
 */
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import {
  createIsolatedOperatingCompany,
  deactivateIsolatedOperatingCompany,
  ensureIntegrationPrerequisites,
  type IsolatedOperatingCompany,
} from "../../../test-helpers/db-fixture.js";
import { testAuthHeaders } from "../../../test-helpers/auth-fixture.js";
import { createIntegrationApp } from "../../../test-helpers/http-app.js";
import { registerPostingEngineRoutes } from "../posting-engine.routes.js";
import { registerCustomerPaymentsRoutes } from "../customer-payments.routes.js";
import { getSubledgerGlControlRecReport } from "../subledger-gl-control-rec.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

const INVOICE_FLAG = "INVOICE_AR_GL_POSTING_ENABLED";
const PAYMENT_FLAG = "CUSTOMER_PAYMENT_GL_POSTING_ENABLED";

describeIntegration("CLS-SUBLEDGER-GL-DARK-TIEOUT — A/R subledger ties to the control account", () => {
  let db: pg.Client;
  let app: FastifyInstance;
  let isolated: IsolatedOperatingCompany;
  let companyId: string;

  const suffix = randomUUID().slice(0, 6);
  const userId = "00000000-0000-4000-8000-0000000000d7";
  const arAccountId = randomUUID();
  const incomeAccountId = randomUUID();
  const undepositedAccountId = randomUUID();
  const customerId = randomUUID();

  /** Invoice total, and the payment that settles it in full. */
  const INVOICE_CENTS = 120_000;

  async function bypass(fn: () => Promise<void>) {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    if (companyId) await db.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
    try {
      await fn();
      await db.query("COMMIT");
    } catch (e) {
      await db.query("ROLLBACK").catch(() => {});
      throw e;
    }
  }

  /** Write a USER-scoped flag override for this file's dedicated actor — immune to cross-file tenant contention. */
  async function setFlag(flagKey: string, enabled: boolean) {
    await bypass(async () => {
      await db.query(
        `INSERT INTO lib.feature_flag_overrides (flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid)
         VALUES ($1,$2::uuid,$3::uuid,$4,$3::uuid)
         ON CONFLICT (flag_key, user_uuid) WHERE user_uuid IS NOT NULL DO UPDATE SET enabled = EXCLUDED.enabled`,
        [flagKey, companyId, userId, enabled]
      );
    });
  }

  async function seedInvoice(): Promise<{ invoiceId: string; loadId: string }> {
    const invoiceId = randomUUID();
    const loadId = randomUUID();
    await bypass(async () => {
      // P-INVOICE P0: a linehaul line requires source_load_id (fail-closed), so the load comes first.
      await db.query(
        `INSERT INTO mdata.loads (id, operating_company_id, load_number, customer_id, status, rate_total_cents, dispatcher_user_id)
         VALUES ($1::uuid,$2::uuid,$3,$4::uuid,'delivered',$5,$6::uuid)`,
        [loadId, companyId, `L-TIE-${suffix}-${invoiceId.slice(0, 4)}`, customerId, INVOICE_CENTS, userId]
      );
      await db.query(
        // amount_open_cents is GENERATED ALWAYS AS (total_cents - amount_paid_cents) — inserting into
        // it raises "cannot insert a non-DEFAULT value". Leaving it to the database is not a
        // workaround, it is the point: the A/R subledger balance this test asserts on is maintained
        // by the column itself as payments apply, so nothing here can fake the subledger side moving.
        `INSERT INTO accounting.invoices
           (id, operating_company_id, customer_id, display_id, issue_date, due_date,
            subtotal_cents, tax_cents, total_cents, status, source_load_id)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,CURRENT_DATE,CURRENT_DATE,$5,0,$5,'sent',$6::uuid)`,
        [invoiceId, companyId, customerId, `INV-TIE-${suffix}-${invoiceId.slice(0, 4)}`, INVOICE_CENTS, loadId]
      );
      await db.query(
        `INSERT INTO accounting.invoice_lines
           (operating_company_id, invoice_id, line_type, account_id, description, quantity, unit_amount_cents, line_total_cents, display_order)
         VALUES ($1::uuid,$2::uuid,'linehaul',$3::uuid,'Linehaul',1,$4,$4,0)`,
        [companyId, invoiceId, incomeAccountId, INVOICE_CENTS]
      );
    });
    return { invoiceId, loadId };
  }

  async function postInvoice(invoiceId: string) {
    return app.inject({
      method: "POST",
      url: `/api/v1/accounting/posting-engine-mvp/post?operating_company_id=${companyId}`,
      headers: testAuthHeaders(userId),
      payload: { source_transaction_type: "invoice", source_transaction_id: invoiceId },
    });
  }

  async function receivePayment(invoiceId: string, amountCents: number) {
    return app.inject({
      method: "POST",
      url: `/api/v1/customers/${customerId}/payments?operating_company_id=${companyId}`,
      headers: { "content-type": "application/json", ...testAuthHeaders(userId, "Owner") },
      payload: {
        received_at: new Date().toISOString().slice(0, 10),
        amount_cents: amountCents,
        payment_method: "ach",
        applications: [{ invoice_id: invoiceId, amount_cents: amountCents }],
      },
    });
  }

  /**
   * The A/R row of the EXISTING tie-out report — the thing under test.
   *
   * `control_balance_cents` is nullable in the report (null when the role is unmapped). Every case
   * here seeds `ar_control`, so a null means the role lookup broke rather than that the balance is
   * zero — and silently coercing that to 0 would make a broken lookup read as a perfect tie. Fail loud.
   */
  async function arTieOut(): Promise<{
    control: number;
    subledger: number;
    variance: number;
    status: string;
  }> {
    const report = await getSubledgerGlControlRecReport({
      userId,
      operating_company_id: companyId,
      as_of_date: new Date().toISOString().slice(0, 10),
    });
    const row = report.rows.find((r) => r.role === "ar_control");
    if (!row) throw new Error("tie-out report returned no ar_control row");
    if (row.control_account_id == null) {
      throw new Error("ar_control resolved to NO account — the seeded role binding is not visible to the report");
    }
    if (row.control == null) {
      throw new Error("ar_control control_balance_cents is NULL — treating that as 0 would fake a tie");
    }
    return {
      control: row.control,
      subledger: row.subledger,
      variance: row.variance,
      status: row.status,
    };
  }

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    // buildPgClientConfig REQUIRES the connection string. Calling it bare compiled clean and then
    // fell through to pg's localhost default, so this suite was the only one of 865 that could not
    // reach the CI Postgres (ECONNREFUSED ::1:5432) — beforeAll threw, all three tests reported as
    // skipped, and the suite failed on the hooks. Read it explicitly and fail with a sentence that
    // says what is missing, exactly as the sibling db.tests do.
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required for this db.test");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();

    // The actor must EXIST before createIsolatedOperatingCompany({actorUserId}) — that helper is
    // fail-loud on a missing user rather than silently skipping the grant, which is the behaviour we
    // want and the reason this insert comes first.
    await bypass(async () => {
      await db.query(
        `INSERT INTO identity.users (id, email, role, preferred_language)
         VALUES ($1::uuid,$2,'Owner','en') ON CONFLICT (id) DO NOTHING`,
        [userId, `tieout-${suffix}@example.test`]
      );
    });

    isolated = await createIsolatedOperatingCompany({
      codePrefix: "TIE",
      legalNamePrefix: "Tieout AR",
      actorUserId: userId,
    });
    companyId = isolated.companyId;

    await bypass(async () => {
      await db.query(
        `INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable)
         VALUES ($1::uuid,$2::uuid,$3,'A/R Tieout Test','Asset',true)`,
        [arAccountId, companyId, `AR${suffix}`]
      );
      await db.query(
        `INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable)
         VALUES ($1::uuid,$2::uuid,$3,'Income Tieout Test','Income',true)`,
        [incomeAccountId, companyId, `IN${suffix}`]
      );
      await db.query(
        `INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable)
         VALUES ($1::uuid,$2::uuid,$3,'Undeposited Tieout Test','Asset',true)`,
        [undepositedAccountId, companyId, `UF${suffix}`]
      );
      await db.query(
        `INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
         VALUES ($1::uuid,'ar_control',$2::uuid,true)`,
        [companyId, arAccountId]
      );
      // The receipt's debit leg. Without it the payment poster has nowhere to put the cash and the
      // test would be measuring a mapping gap rather than the tie-out.
      await db.query(
        `INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
         VALUES ($1::uuid,'undeposited_funds',$2::uuid,true)`,
        [companyId, undepositedAccountId]
      );
      await db.query(
        `INSERT INTO mdata.customers (id, operating_company_id, customer_name) VALUES ($1::uuid,$2::uuid,$3)`,
        [customerId, companyId, `Tieout Cust ${suffix}`]
      );
    });

    app = await createIntegrationApp(async (a) => {
      await registerPostingEngineRoutes(a);
      await registerCustomerPaymentsRoutes(a);
    });
  });

  afterAll(async () => {
    if (app) await app.close();
    if (!db) return;
    try {
      await bypass(async () => {
        await db.query(`DELETE FROM lib.feature_flag_overrides WHERE flag_key = ANY($1::text[]) AND operating_company_id=$2::uuid`, [[INVOICE_FLAG, PAYMENT_FLAG], companyId]);
      });
      if (isolated) await deactivateIsolatedOperatingCompany(isolated);
    } catch {
      /* best-effort cleanup — never mask a real assertion failure */
    }
    await db.end();
  });

  it("posted invoice, no payment yet → subledger and control BOTH carry it, and the report says tied", async () => {
    await setFlag(INVOICE_FLAG, true);
    const { invoiceId } = await seedInvoice();

    const posted = await postInvoice(invoiceId);
    expect(posted.statusCode).toBe(200);

    const row = await arTieOut();
    // Both sides must be the invoice — a tie at ZERO on both sides would be a vacuous pass, and is
    // exactly what a mis-scoped query returns.
    expect(row.control).toBe(INVOICE_CENTS);
    expect(row.subledger).toBe(INVOICE_CENTS);
    expect(row.variance).toBe(0);
    expect(row.status).toBe("tied");
  });

  it("payment received WITH posting enabled → subledger and control move TOGETHER, still tied", async () => {
    await setFlag(INVOICE_FLAG, true);
    await setFlag(PAYMENT_FLAG, true);
    const { invoiceId } = await seedInvoice();
    expect((await postInvoice(invoiceId)).statusCode).toBe(200);

    const before = await arTieOut();
    const paid = await receivePayment(invoiceId, INVOICE_CENTS);
    expect(paid.statusCode).toBe(201);

    const after = await arTieOut();
    // The invoice left BOTH sides. Asserting the delta rather than an absolute keeps this honest when
    // a sibling case has already added its own invoice to the same company.
    expect(before.control - after.control).toBe(INVOICE_CENTS);
    expect(before.subledger - after.subledger).toBe(INVOICE_CENTS);
    expect(after.variance).toBe(0);
    expect(after.status).toBe("tied");
  });

  it("★ payment received with posting DISABLED → the subledger moves ALONE and the report REPORTS the variance", async () => {
    // This is the prod situation, reconstructed: A/R settled in the subledger, nothing in the ledger.
    // If this case passes trivially the whole file is theatre — a tie-out that cannot SEE a dark
    // receipt is worth nothing, and that is precisely the state USMCA has been in.
    await setFlag(INVOICE_FLAG, true);
    await setFlag(PAYMENT_FLAG, false);
    const { invoiceId } = await seedInvoice();
    expect((await postInvoice(invoiceId)).statusCode).toBe(200);

    const before = await arTieOut();
    const paid = await receivePayment(invoiceId, INVOICE_CENTS);
    expect(paid.statusCode).toBe(201);

    const after = await arTieOut();
    // The subledger dropped the invoice; the control account did NOT.
    expect(before.subledger - after.subledger).toBe(INVOICE_CENTS);
    expect(after.control).toBe(before.control);
    // variance = control - subledger, so the ledger now overstates A/R by exactly the receipt.
    expect(after.variance - before.variance).toBe(INVOICE_CENTS);
    expect(after.status).toBe("variance");
  });
});
