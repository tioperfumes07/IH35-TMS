/**
 * 443.101 posting-gate PROOF — accounting.tax_document (docs/specs/scoreboard/posting-gate-tables.json).
 *
 * The table's only writer is POST /api/v1/tax-documents/1099-nec/generate-batch (tax-documents.routes.ts). This drives
 * that route on an isolated company whose 1099 flag is ON, with one driver paid above the year's 1099-NEC threshold
 * through a PAID settlement and a US-person payee tax profile, and asserts the batch, the tax_document (company, year,
 * batch, payee profile, draft) and its form_1099_nec Box-1 amount. The route commits by design; the rows live on the
 * isolated fixture company of the CI database — never on USMCA (owner laws 2026-09-02 / 2026-10-04). It also proves
 * the writer's own gates: flag OFF -> 409 and nothing written.
 */
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerTaxDocumentRoutes } from "../tax-documents.routes.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { testAuthHeaders } from "../../../test-helpers/auth-fixture.js";
import { createIntegrationApp } from "../../../test-helpers/http-app.js";
import {
  createIsolatedOperatingCompany,
  ensureIntegrationPrerequisites,
  type IsolatedOperatingCompany,
} from "../../../test-helpers/db-fixture.js";
import { connectFixtureClient, fixtureTxn } from "../../../test-helpers/posting-gate-proof.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
const FLAG_KEY = "TAX_DOC_1099_ENABLED";
const TAX_YEAR = 2025;
const EARNINGS_DOLLARS = 1_500; // above the 2025 1099-NEC threshold ($600) seeded in catalogs.tax_form_thresholds

describeIntegration("posting-gate proof — accounting.tax_document via POST /tax-documents/1099-nec/generate-batch", () => {
  let db: pg.Client;
  let iso: IsolatedOperatingCompany;
  let app: FastifyInstance;
  const driverId = randomUUID();
  const settlementId = randomUUID();
  const profileId = randomUUID();

  const generate = () =>
    app.inject({
      method: "POST",
      url: `/api/v1/tax-documents/1099-nec/generate-batch?operating_company_id=${iso.companyId}&tax_year=${TAX_YEAR}`,
      headers: testAuthHeaders(),
      payload: {},
    });

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    db = await connectFixtureClient();
    iso = await createIsolatedOperatingCompany({ codePrefix: "PGT", legalNamePrefix: "Posting-gate 1099" });
    const s = driverId.slice(0, 6);
    await fixtureTxn(db, iso.companyId, async () => {
      await db.query(
        `INSERT INTO mdata.drivers (id, operating_company_id, first_name, last_name, phone) VALUES ($1::uuid, $2::uuid, 'Proof', 'Payee', $3)`,
        [driverId, iso.companyId, `95606${s.replace(/[^0-9]/g, "0").slice(0, 5)}`]
      );
      await db.query(
        `INSERT INTO driver_finance.driver_settlements
           (id, operating_company_id, display_id, driver_id, period_start, period_end, status, paid_at, settlement_model, payment_state)
         VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5::date, $6::date, 'paid', $7::timestamptz, 'week_calendar', 'cleared')`,
        [settlementId, iso.companyId, `SET-PG-${s}`, driverId, `${TAX_YEAR}-06-01`, `${TAX_YEAR}-06-07`, `${TAX_YEAR}-06-10T12:00:00Z`]
      );
      await db.query(
        `INSERT INTO driver_finance.settlement_lines (settlement_id, operating_company_id, line_type, description, amount)
         VALUES ($1::uuid, $2::uuid, 'earnings', 'Linehaul pay (posting-gate proof)', $3)`,
        [settlementId, iso.companyId, EARNINGS_DOLLARS]
      );
      await db.query(
        `INSERT INTO catalogs.payee_tax_profile (id, operating_company_id, payee_type, payee_id, tax_status, effective_tax_year, created_by_user_id)
         VALUES ($1::uuid, $2::uuid, 'driver', $3, 'us_person', $4, $5::uuid)`,
        [profileId, iso.companyId, driverId, TAX_YEAR, TEST_OWNER_USER_ID]
      );
    });
    app = await createIntegrationApp(async (a) => {
      await registerTaxDocumentRoutes(a);
    });
  });

  afterAll(async () => {
    if (app) await app.close();
    await db?.end();
  });

  async function countDocs(): Promise<number> {
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    const r = await db.query(`SELECT count(*)::int AS n FROM accounting.tax_document WHERE operating_company_id = $1::uuid`, [iso.companyId]);
    await db.query("COMMIT");
    return r.rows[0].n;
  }

  it("flag OFF: the writer refuses (409) and writes nothing", async () => {
    const res = await generate();
    expect(res.statusCode).toBe(409);
    expect(await countDocs()).toBe(0);
  });

  it("flag ON: writes the batch, one draft tax_document for the payee profile, and its 1099-NEC Box-1 amount", async () => {
    await fixtureTxn(db, iso.companyId, async () => {
      await db.query(
        `INSERT INTO lib.feature_flag_overrides (flag_key, operating_company_id, enabled, set_by_user_uuid)
         VALUES ($1, $2::uuid, true, $3::uuid)`,
        [FLAG_KEY, iso.companyId, TEST_OWNER_USER_ID]
      );
    });

    const res = await generate();
    expect(res.statusCode, res.body).toBe(201);
    const body = res.json() as { batch_id: string; payee_count: number; total_comp_cents: number };
    expect(body.payee_count).toBe(1);
    expect(body.total_comp_cents).toBe(EARNINGS_DOLLARS * 100);

    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    const docs = (
      await db.query(
        `SELECT td.operating_company_id::text AS company, td.document_kind, td.tax_year, td.batch_id::text AS batch,
                td.subject_payee_id::text AS payee, td.status, f.box1_nonemployee_comp_cents::bigint AS box1
           FROM accounting.tax_document td
           JOIN accounting.form_1099_nec f ON f.tax_document_id = td.id AND f.operating_company_id = td.operating_company_id
          WHERE td.operating_company_id = $1::uuid`,
        [iso.companyId]
      )
    ).rows;
    await db.query("COMMIT");

    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({
      company: iso.companyId,
      document_kind: "form_1099_nec",
      tax_year: TAX_YEAR,
      batch: body.batch_id,
      payee: profileId,
      status: "draft",
    });
    expect(Number(docs[0].box1)).toBe(EARNINGS_DOLLARS * 100);
  });
});
