/**
 * LEAD 443.151 (b) — real Postgres: a VOIDED invoice releases its number ("<number>-V<n>", audited) so a corrected reissue
 * can carry the SAME number (the one submitted to Faro). On the old schema invoices_display_id_check refuses "-V1" and the
 * unique (operating_company_id, display_id) index refuses the reissue — this test fails there (migration 202615960910 +
 * invoice-number-release.service.ts).
 *
 * Fixtures are committed under an isolated company — never the shared company, never production.
 */
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { createIsolatedOperatingCompany } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { INVOICE_NUMBER_RELEASED_EVENT, InvoiceReissueRefused, releaseVoidedInvoiceNumber } from "../invoice-number-release.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("a voided invoice releases its number for the reissue (443.151 b, real Postgres)", () => {
  it("void → <n>-V1 (audited) → the same number is free again; live / already-released refused; -V only on void rows", async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    refuseProductionConnectionString(cs);
    const { companyId: co } = await createIsolatedOperatingCompany({ codePrefix: "INR", legalNamePrefix: "443.151 b invoice number release" });
    const db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await refuseProductionDatabase(db);
    const scope = async () => {
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [co]);
    };
    const one = async <T = { id: string }>(sql: string, p: unknown[]) => (await db.query<T>(sql, p)).rows[0]!;
    // A voided invoice row as voidDocument leaves it (status void, voided_at set; WORM — never deleted).
    const voidedInvoice = async (customer: string, displayId: string) =>
      (await one(
        `INSERT INTO accounting.invoices (operating_company_id, customer_id, display_id, status, issue_date, due_date, currency_code,
           created_by_user_id, updated_by_user_id, invoice_type, bill_to_entity_type, voided_at, void_reason)
         VALUES ($1, $2, $3, 'void', current_date, current_date, 'USD', $4, $4, 'manual', 'customer', now(), 'test void')
         RETURNING id::text AS id`,
        [co, customer, displayId, TEST_OWNER_USER_ID])).id;
    try {
      await scope();
      const customer = (await one(`INSERT INTO mdata.customers (operating_company_id, customer_name) VALUES ($1, $2) RETURNING id::text AS id`, [co, `INR${Date.now()} customer`])).id;
      const first = await voidedInvoice(customer, "52-13570");
      await db.query("COMMIT");

      // 1. The voided invoice releases its number, audited with the original.
      await scope();
      const r1 = await releaseVoidedInvoiceNumber(db as never, { operatingCompanyId: co, invoiceId: first, actorUserId: TEST_OWNER_USER_ID, reason: "443.151 b reissue under the Faro number" });
      await db.query("COMMIT");
      expect(r1).toEqual({ original_display_id: "52-13570", released_display_id: "52-13570-V1" });
      await scope();
      expect((await one<{ d: string }>(`SELECT display_id AS d FROM accounting.invoices WHERE id = $1::uuid`, [first])).d).toBe("52-13570-V1");
      const audit = await one<{ n: string }>(`SELECT count(*)::text AS n FROM audit.audit_events WHERE event_class = $1 AND payload->>'resource_id' = $2 AND payload->>'original_display_id' = '52-13570'`, [INVOICE_NUMBER_RELEASED_EVENT, first]);
      await db.query("ROLLBACK");
      expect(Number(audit.n)).toBe(1);

      // 2. The number is free: a second document can carry 52-13570 (old code: unique violation). Its own release takes -V2.
      await scope();
      const second = await voidedInvoice(customer, "52-13570");
      const r2 = await releaseVoidedInvoiceNumber(db as never, { operatingCompanyId: co, invoiceId: second, actorUserId: TEST_OWNER_USER_ID, reason: "second reissue of the same number" });
      await db.query("COMMIT");
      expect(r2.released_display_id).toBe("52-13570-V2");

      // 3. An already-released number is refused; the CHECK refuses "-V" on a live (non-void) row.
      await scope();
      await expect(releaseVoidedInvoiceNumber(db as never, { operatingCompanyId: co, invoiceId: first, actorUserId: TEST_OWNER_USER_ID, reason: "again" })).rejects.toBeInstanceOf(InvoiceReissueRefused);
      await db.query("ROLLBACK");
      await scope();
      await expect(db.query(`UPDATE accounting.invoices SET status = 'draft', voided_at = NULL, display_id = '52-13570-V9' WHERE id = $1::uuid`, [second])).rejects.toThrow(/invoices_display_id_check|void_state/);
      await db.query("ROLLBACK");
    } finally {
      await db.query("ROLLBACK").catch(() => undefined);
      await db.end();
    }
  }, 60_000);
});
