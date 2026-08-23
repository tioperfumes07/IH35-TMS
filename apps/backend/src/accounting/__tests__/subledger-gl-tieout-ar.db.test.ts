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
import { companyBusinessDate } from "../../lib/company-business-date.js";
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

  /**
   * accounting.invoices.display_id is CHECK-constrained to ^INV-[0-9]{4}-[0-9]{5}$ and UNIQUE per
   * (operating_company_id, display_id). A descriptive id like `INV-TIE-<suffix>` is rejected outright,
   * so the format is generated rather than written. A plain counter is safe BECAUSE this suite owns an
   * isolated company — uniqueness is per-company, so it cannot collide with the seeded INV-2026-000xx
   * rows on a shared entity.
   */
  let invoiceSeq = 0;

  async function bypass(fn: () => Promise<void>) {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    if (companyId) await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
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
        `INSERT INTO mdata.loads (id, operating_company_id, load_number, customer_id, status, rate_total_cents, dispatcher_user_id, load_trailer_equipment_id)
         VALUES ($1::uuid,$2::uuid,$3,$4::uuid,'delivered',$5,$6::uuid,(SELECT id FROM catalogs.load_trailer_equipment WHERE operating_company_id = $2::uuid AND code = 'DRY_VAN' LIMIT 1))`,
        [loadId, companyId, `L-TIE-${suffix}-${invoiceId.slice(0, 4)}`, customerId, INVOICE_CENTS, userId]
      );
      await db.query(
        // amount_open_cents is GENERATED ALWAYS AS (total_cents - amount_paid_cents) — inserting into
        // it raises "cannot insert a non-DEFAULT value". Leaving it to the database is not a
        // workaround, it is the point: the A/R subledger balance this test asserts on is maintained
        // by the column itself as payments apply, so nothing here can fake the subledger side moving.
        // ACCT-DOM-02-TZ — issue_date is bound to the same companyBusinessDate() this file's own
        // as_of_date uses (below), not SQL CURRENT_DATE. CURRENT_DATE resolves in the CI Postgres
        // server's own default timezone (UTC), while getArAgingReport's as-of clamp reconstructs
        // "today" in America/Chicago (the same convention every real issue_date-writing route —
        // invoices.routes.ts, credit-memos.routes.ts, vendor-credits.routes.ts — already uses via
        // `body.data.issue_date ?? companyBusinessDate()`). For ~5h/day (UTC has rolled to the next
        // calendar day, Chicago has not — live at 2026-08-23T02:xx UTC), CURRENT_DATE outran the
        // as-of clamp and `issue_date <= $2::date` excluded a same-day, wholly-unpaid invoice —
        // subledger read $0 against a real $1,200 control balance, a false CLS-SUBLEDGER-GL-DARK-
        // TIEOUT flag on a test fixture bug, not the report under test.
        `INSERT INTO accounting.invoices
           (id, operating_company_id, customer_id, display_id, issue_date, due_date,
            subtotal_cents, tax_cents, total_cents, status, source_load_id)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$7::date,$7::date,$5,0,$5,'sent',$6::uuid)`,
        [invoiceId, companyId, customerId, `INV-2026-${String(++invoiceSeq).padStart(5, "0")}`, INVOICE_CENTS, loadId, companyBusinessDate()]
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

  /**
   * Post an invoice through the real route and assert it actually POSTED.
   *
   * The route answers 201 for a fresh post and 200 only for `already_posted`
   * (posting-engine.routes.ts:142), so a bare 2xx check would pass on a no-op re-post and this whole
   * file would then measure a control account that never moved. Assert the semantic result, not the
   * status code.
   */
  async function postInvoice(invoiceId: string) {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/accounting/posting-engine-mvp/post?operating_company_id=${companyId}`,
      headers: testAuthHeaders(userId),
      payload: { source_transaction_type: "invoice", source_transaction_id: invoiceId },
    });
    expect(res.statusCode, `post failed: ${res.body}`).toBe(201);
    expect((res.json() as { result?: string }).result).toBe("posted");
    return res;
  }

  async function receivePayment(invoiceId: string, amountCents: number) {
    return app.inject({
      method: "POST",
      url: `/api/v1/customers/${customerId}/payments?operating_company_id=${companyId}`,
      headers: { "content-type": "application/json", ...testAuthHeaders(userId, "Owner") },
      payload: {
        // ACCT-DOM-02-TZ — same companyBusinessDate() as issue_date/as_of_date above, not the raw
        // UTC date: p.payment_date feeds the same as-of-dated aging reconstruction (ar-aging.
        // service.ts's `p.payment_date <= $2::date`), so a UTC-vs-Chicago day mismatch here would
        // silently drop the payment application on the same ~5h/day boundary.
        received_at: companyBusinessDate(),
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
      as_of_date: companyBusinessDate(),
    });
    const row = report.rows.find((r) => r.role === "ar_control");
    if (!row) throw new Error("tie-out report returned no ar_control row");
    if (row.control_account_id == null) {
      throw new Error("ar_control resolved to NO account — the seeded role binding is not visible to the report");
    }
    // A NULL control balance means ZERO, and that is not a fudge — it is the documented behaviour of
    // `accounting.fn_account_balances_as_of`, whose HAVING clause EXCLUDES any account whose closing
    // balance nets to zero. A fully-settled A/R control therefore returns no row at all. The service
    // itself coerces the same way (`input.control_balance_cents ?? 0`,
    // subledger-gl-control-rec.service.ts:61), so reading it differently here would test something the
    // product does not do.
    //
    // The protection against a broken role lookup silently reading as a perfect tie is kept, and it is
    // the check ABOVE this one: control_account_id must resolve. With the role bound, a null balance
    // is a real zero; with the role unbound it is a lookup failure, and those are now distinguished
    // rather than conflated. CI taught me this — my first version threw on NULL and failed case 1.
    return {
      control: row.control_balance_cents ?? 0,
      subledger: row.subledger_balance_cents,
      variance: row.variance_cents,
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

  /**
   * Why the GL side might read zero when a post just succeeded — dumped on failure rather than guessed.
   *
   * `accounting.fn_account_balances_as_of` counts a posting only when its batch is `posted`/`reversed`
   * and its entry_date is on or before the as-of date, and it drops the account entirely when the
   * closing balance nets to zero. Any of those produces a legitimate-looking zero and they are
   * indistinguishable from outside. So when the control side is not what the test expects, print the
   * postings and their batch status rather than leaving the next reader to re-derive it.
   */
  async function glDiagnostic(): Promise<string> {
    const res = await db.query<Record<string, unknown>>(
      `SELECT jp.debit_or_credit, jp.amount_cents::text AS amount_cents, je.entry_date::text AS entry_date,
              je.status AS je_status, COALESCE(pb.batch_status, '(no batch)') AS batch_status,
              a.account_number
         FROM accounting.journal_entry_postings jp
         JOIN accounting.journal_entries je ON je.id = jp.journal_entry_uuid
         LEFT JOIN accounting.posting_batches pb ON pb.id = jp.posting_batch_id
         LEFT JOIN catalogs.accounts a ON a.id = jp.account_id
        WHERE jp.operating_company_id = $1::uuid
        ORDER BY je.entry_date DESC, a.account_number`,
      [companyId]
    );
    return `\npostings for this company (${res.rows.length}):\n${res.rows.map((r) => JSON.stringify(r)).join("\n")}`;
  }

  it("posted invoice, no payment yet → subledger and control BOTH carry it, and the report says tied", async () => {
    await setFlag(INVOICE_FLAG, true);
    const { invoiceId } = await seedInvoice();

    await postInvoice(invoiceId);

    const row = await arTieOut();
    // Both sides must be the invoice — a tie at ZERO on both sides would be a vacuous pass, and is
    // exactly what a mis-scoped query returns.
    expect(row.control, `ar_control read ${row.control}, expected ${INVOICE_CENTS}${await glDiagnostic()}`).toBe(
      INVOICE_CENTS
    );
    expect(row.subledger).toBe(INVOICE_CENTS);
    expect(row.variance).toBe(0);
    expect(row.status).toBe("tied");
  });

  it("payment received WITH posting enabled → subledger and control move TOGETHER, still tied", async () => {
    await setFlag(INVOICE_FLAG, true);
    await setFlag(PAYMENT_FLAG, true);
    const { invoiceId } = await seedInvoice();
    await postInvoice(invoiceId);

    const before = await arTieOut();
    const paid = await receivePayment(invoiceId, INVOICE_CENTS);
    // Carry the body into the message: a bare status assertion that fails tells you nothing, and this
    // file has already cost three CI round-trips on things a one-line message would have named.
    expect(paid.statusCode, `payment failed: ${paid.body}`).toBe(201);

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
    await postInvoice(invoiceId);

    const before = await arTieOut();
    const paid = await receivePayment(invoiceId, INVOICE_CENTS);
    // Carry the body into the message: a bare status assertion that fails tells you nothing, and this
    // file has already cost three CI round-trips on things a one-line message would have named.
    expect(paid.statusCode, `payment failed: ${paid.body}`).toBe(201);

    const after = await arTieOut();
    // The subledger dropped the invoice; the control account did NOT.
    expect(before.subledger - after.subledger).toBe(INVOICE_CENTS);
    expect(after.control).toBe(before.control);
    // variance = control - subledger, so the ledger now overstates A/R by exactly the receipt.
    expect(after.variance - before.variance).toBe(INVOICE_CENTS);
    expect(after.status).toBe("variance");
  });
});
