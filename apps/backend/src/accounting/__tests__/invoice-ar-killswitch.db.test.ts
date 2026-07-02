/**
 * BLOCK-04 / CHAIN-06 GAP #1 — Invoice→A/R kill switch END-TO-END (real Postgres, route level).
 *
 * Proves the per-entity INVOICE_AR_GL_POSTING_ENABLED feature flag (default OFF) actually gates the
 * generic posting-engine MVP route for source_transaction_type='invoice':
 *   - flag OFF  -> POST /posting-engine-mvp/post {invoice} returns 409 posting_disabled and writes
 *                  NOTHING to accounting.journal_entry_postings (the kill switch — the whole point).
 *   - flag ON   -> same route posts the BALANCED accrual JE the existing engine already builds:
 *                  DR ar_control (Σ revenue + tax) · CR each invoice_lines income account. SUM(dr)=SUM(cr).
 *   - flag ON, re-post -> idempotent (200 already_posted, still exactly one JE).
 *
 * NO new GL math is exercised here — buildInvoiceLines/postSourceTransaction are unchanged; this test
 * only proves the flag gate wired in this block. Runs only in CI (GITHUB_ACTIONS=true) with a migrated PG.
 */
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites, getOperatingCompanyId } from "../../../test-helpers/db-fixture.js";
import { createIntegrationApp } from "../../../test-helpers/http-app.js";
import { testAuthHeaders } from "../../../test-helpers/auth-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { registerPostingEngineRoutes } from "../posting-engine.routes.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
const FLAG_KEY = "INVOICE_AR_GL_POSTING_ENABLED";

describeIntegration("CHAIN-06 invoice→A/R kill switch (real Postgres, route level)", () => {
  let app: FastifyInstance;
  let db: pg.Client;
  let companyId: string;
  const suffix = randomUUID().slice(0, 6);
  const incomeAccountId = randomUUID();
  const arAccountId = randomUUID();
  const customerId = randomUUID();
  const invoiceId = randomUUID();
  const invoiceDisplayId = `INV-2026-${String(Math.floor(10000 + Math.random() * 89999))}`; // INV-YYYY-NNNNN
  const revenueCents = 340000; // $3,400.00 linehaul, no tax

  async function bypass(fn: () => Promise<void>) {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
    try { await fn(); await db.query("COMMIT"); }
    catch (e) { await db.query("ROLLBACK").catch(() => {}); throw e; }
  }

  async function scopedRead<T = Record<string, unknown>>(sql: string, params: unknown[]): Promise<T[]> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
    try { const r = await db.query(sql, params); await db.query("COMMIT"); return r.rows as T[]; }
    catch (e) { await db.query("ROLLBACK").catch(() => {}); throw e; }
  }

  // Read whatever ar_control the resolver would use for this entity (may be a pre-existing designation).
  async function liveArAccountId(): Promise<string> {
    const r = await scopedRead<{ account_id: string }>(
      `SELECT account_id::text AS account_id FROM accounting.chart_of_accounts_roles
        WHERE operating_company_id=$1::uuid AND role='ar_control' AND is_active=true ORDER BY updated_at DESC LIMIT 1`,
      [companyId]
    );
    const id = r[0]?.account_id;
    if (!id) throw new Error(`no mapped ar_control role for company ${companyId}`);
    return id;
  }

  async function postedRowCount(): Promise<number> {
    const rows = await scopedRead<{ c: string }>(
      `SELECT count(*)::text AS c FROM accounting.journal_entry_postings
        WHERE source_transaction_id = $1 AND source_transaction_type='invoice'`,
      [invoiceId]
    );
    return Number(rows[0].c);
  }

  beforeAll(async () => {
    companyId = await ensureIntegrationPrerequisites();
    companyId = getOperatingCompanyId();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");

    await bypass(async () => {
      // Income (revenue) account for the invoice line + an A/R account for the ar_control role.
      await db.query(
        `INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable)
         VALUES ($1::uuid,$2::uuid,$3,'CHAIN06 Freight Revenue','Income',true)`,
        [incomeAccountId, companyId, `R${suffix}`]
      );
      await db.query(
        `INSERT INTO catalogs.accounts (id, operating_company_id, account_number, account_name, account_type, is_postable)
         VALUES ($1::uuid,$2::uuid,$3,'CHAIN06 A/R','Asset',true)`,
        [arAccountId, companyId, `AR${suffix}`]
      );
      // Designate ar_control (kept if the entity already has one — resolver + liveArAccountId read the active row).
      await db.query(
        `INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
         VALUES ($1::uuid,'ar_control',$2::uuid,true)
         ON CONFLICT (operating_company_id, role) WHERE is_active = true DO NOTHING`,
        [companyId, arAccountId]
      );
      // Customer + a 'sent' (posting-eligible) invoice with one revenue line mapped to the income account.
      await db.query(
        `INSERT INTO mdata.customers (id, operating_company_id, customer_name) VALUES ($1::uuid,$2::uuid,$3)`,
        [customerId, companyId, `CHAIN06 Cust ${suffix}`]
      );
      await db.query(
        `INSERT INTO accounting.invoices (id, operating_company_id, customer_id, display_id, issue_date, due_date, subtotal_cents, tax_cents, total_cents, status)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,CURRENT_DATE,CURRENT_DATE,$5,0,$5,'sent')`,
        [invoiceId, companyId, customerId, invoiceDisplayId, revenueCents]
      );
      await db.query(
        `INSERT INTO accounting.invoice_lines (operating_company_id, invoice_id, line_type, account_id, description, quantity, unit_amount_cents, line_total_cents, display_order)
         VALUES ($1::uuid,$2::uuid,'linehaul',$3::uuid,'Linehaul',1,$4,$4,0)`,
        [companyId, invoiceId, incomeAccountId, revenueCents]
      );
      // Ensure the flag starts OFF for this entity (remove any leftover override from a prior run).
      await db.query(
        `DELETE FROM lib.feature_flag_overrides WHERE flag_key=$1 AND operating_company_id=$2::uuid`,
        [FLAG_KEY, companyId]
      );
    });

    app = await createIntegrationApp(async (a) => {
      await registerPostingEngineRoutes(a);
    });
  });

  afterAll(async () => {
    if (app) await app.close();
    if (!db) return;
    try {
      await bypass(async () => {
        await db.query(`DELETE FROM accounting.journal_entry_postings WHERE source_transaction_id=$1 AND source_transaction_type='invoice'`, [invoiceId]);
        await db.query(`DELETE FROM accounting.posting_batches WHERE source_transaction_id=$1 AND source_transaction_type='invoice'`, [invoiceId]);
        await db.query(`DELETE FROM accounting.invoice_lines WHERE invoice_id=$1::uuid`, [invoiceId]);
        await db.query(`DELETE FROM accounting.invoices WHERE id=$1::uuid`, [invoiceId]);
        await db.query(`DELETE FROM mdata.customers WHERE id=$1::uuid`, [customerId]);
        await db.query(`DELETE FROM lib.feature_flag_overrides WHERE flag_key=$1 AND operating_company_id=$2::uuid`, [FLAG_KEY, companyId]);
        await db.query(`DELETE FROM accounting.chart_of_accounts_roles WHERE operating_company_id=$1::uuid AND account_id=$2::uuid`, [companyId, arAccountId]);
        await db.query(`DELETE FROM catalogs.accounts WHERE id = ANY($1::uuid[])`, [[incomeAccountId, arAccountId]]);
      });
    } catch { /* best-effort cleanup */ }
    await db.end();
  });

  async function postInvoice() {
    return app.inject({
      method: "POST",
      url: `/api/v1/accounting/posting-engine-mvp/post?operating_company_id=${companyId}`,
      headers: testAuthHeaders(),
      payload: { source_transaction_type: "invoice", source_transaction_id: invoiceId },
    });
  }

  it("flag OFF (default) → 409 posting_disabled and NOTHING is written (the kill switch)", async () => {
    const res = await postInvoice();
    expect(res.statusCode).toBe(409);
    expect((res.json() as { error?: string }).error).toBe("posting_disabled");
    expect(await postedRowCount()).toBe(0);
  });

  it("flag ON (per-entity override) → posts the BALANCED DR ar_control / CR income JE", async () => {
    await bypass(async () => {
      await db.query(
        `INSERT INTO lib.feature_flag_overrides (flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid)
         VALUES ($1,$2::uuid,NULL,true,$3::uuid)`,
        [FLAG_KEY, companyId, TEST_OWNER_USER_ID]
      );
    });

    const res = await postInvoice();
    expect(res.statusCode).toBe(201);

    const arId = await liveArAccountId();
    const rows = await scopedRead<{ account_id: string; debit_or_credit: string; amount_cents: string }>(
      `SELECT p.account_id::text AS account_id, p.debit_or_credit, p.amount_cents::text AS amount_cents
         FROM accounting.journal_entry_postings p
        WHERE p.source_transaction_id=$1 AND p.source_transaction_type='invoice'`,
      [invoiceId]
    );
    const debits = rows.filter((r) => r.debit_or_credit === "debit");
    const credits = rows.filter((r) => r.debit_or_credit === "credit");
    // eslint-disable-next-line no-console
    console.log("CHAIN-06 posted JE (flag ON):\n" + rows.map((r) => `  ${r.debit_or_credit.toUpperCase().padEnd(6)} ${r.account_id}  $${(Number(r.amount_cents) / 100).toFixed(2)}`).join("\n"));

    expect(debits).toHaveLength(1);                       // single DR to ar_control
    expect(debits[0].account_id).toBe(arId);
    expect(Number(debits[0].amount_cents)).toBe(revenueCents);
    expect(credits).toHaveLength(1);                      // single CR to the invoice-line income account
    expect(credits[0].account_id).toBe(incomeAccountId);
    expect(Number(credits[0].amount_cents)).toBe(revenueCents);
    const dr = debits.reduce((s, r) => s + Number(r.amount_cents), 0);
    const cr = credits.reduce((s, r) => s + Number(r.amount_cents), 0);
    expect(dr).toBe(cr);                                  // balanced
  });

  it("flag ON, re-post → idempotent (200 already_posted, still exactly one JE)", async () => {
    const res = await postInvoice();
    expect(res.statusCode).toBe(200);
    expect((res.json() as { result?: string }).result).toBe("already_posted");
    // still balanced 2-line JE (1 DR + 1 CR) — no duplicate postings.
    expect(await postedRowCount()).toBe(2);
  });
});
