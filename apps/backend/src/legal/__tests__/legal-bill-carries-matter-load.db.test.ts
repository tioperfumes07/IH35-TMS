/**
 * LEAD 443.134 AJK-09 — real Postgres: a legal fee bill posted for a matter carries the matter's load and that load's driver /
 * unit / trailer on the bill AND its line (the synthesized single line used to write load_id NULL always). The legal money
 * paths commit on their own connections, so the fixtures live in an isolated company (deactivated after).
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { createIsolatedOperatingCompany, deactivateIsolatedOperatingCompany, ensureIntegrationPrerequisites, prepareCompanyForLoadInserts } from "../../../test-helpers/db-fixture.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { postMatterLegalFee } from "../legal-money.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("a legal fee bill carries the matter's load / driver / unit / trailer (443.134 AJK-09, real Postgres)", () => {
  let db: pg.Client;
  let companyId: string;
  const tag = `AJK9${randomUUID().slice(0, 6).toUpperCase()}`;
  const ids = { vendor: "", account: "", driver: "", unit: "", trailer: "", load: "", matter: "" };

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    companyId = (await createIsolatedOperatingCompany({ codePrefix: "AJK9", legalNamePrefix: "AJK-09 legal" })).companyId;
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);
    const one = async (sql: string, p: unknown[]) => (await db.query<{ id: string }>(sql, p)).rows[0]!.id;
    await db.query(`INSERT INTO org.user_company_access (user_id, company_id) VALUES ($1::uuid,$2::uuid) ON CONFLICT DO NOTHING`, [TEST_OWNER_USER_ID, companyId]);
    const equipmentType = await prepareCompanyForLoadInserts(db, companyId);
    ids.vendor = await one(`INSERT INTO mdata.vendors (operating_company_id, vendor_name, vendor_type) VALUES ($1, $2, 'other') RETURNING id::text AS id`, [companyId, `Law firm ${tag}`]);
    ids.account = await one(`INSERT INTO catalogs.accounts (operating_company_id, account_name, account_type, account_number, is_postable) VALUES ($1, 'Legal fees', 'Expense', $2, true) RETURNING id::text AS id`, [companyId, `97${tag.slice(-3)}`]);
    ids.driver = await one(`INSERT INTO mdata.drivers (operating_company_id, first_name, last_name, phone) VALUES ($1, 'Legal', $2, '5555550909') RETURNING id::text AS id`, [companyId, tag]);
    ids.unit = await one(`INSERT INTO mdata.units (unit_number, vin, owner_company_id, is_sample_data) VALUES ($1, $2, $3, true) RETURNING id::text AS id`, [`${tag}-U`, `V${tag}`.slice(0, 17), companyId]);
    ids.trailer = await one(`INSERT INTO mdata.equipment (equipment_number, equipment_type, owner_company_id) VALUES ($1, 'Reefer', $2) RETURNING id::text AS id`, [`${tag}-T`, companyId]);
    const customer = await one(`INSERT INTO mdata.customers (operating_company_id, customer_name) VALUES ($1, $2) RETURNING id::text AS id`, [companyId, `Customer ${tag}`]);
    ids.load = await one(
      `INSERT INTO mdata.loads (operating_company_id, load_number, customer_id, dispatcher_user_id, load_trailer_equipment_id, assigned_unit_id, assigned_primary_driver_id, trailer_source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'company') RETURNING id::text AS id`,
      [companyId, `5${String(Date.now()).slice(-9)}`, customer, TEST_OWNER_USER_ID, equipmentType, ids.unit, ids.driver]
    );
    await db.query(`INSERT INTO dispatch.load_assignment_history (operating_company_id, load_id, assignment_method, assigned_by_user_id, new_trailer_id) VALUES ($1, $2, 'inline_quicksave_trailer', $3, $4)`, [companyId, ids.load, TEST_OWNER_USER_ID, ids.trailer]);
    // The matter names its load and vendor only — the bill takes the load's driver / unit / trailer.
    ids.matter = await one(`INSERT INTO legal.matters (operating_company_id, matter_number, type, vendor_id, load_id) VALUES ($1, $2, 'claim', $3, $4) RETURNING id::text AS id`, [companyId, `M-${tag}`, ids.vendor, ids.load]);
    await db.query("COMMIT");
  }, 60_000);

  afterAll(async () => {
    await db?.end();
    if (companyId) await deactivateIsolatedOperatingCompany(companyId).catch(() => {});
  });

  it("the bill header and its line carry the matter's load, the load's driver, unit and trailer", async () => {
    await postMatterLegalFee({
      operatingCompanyId: companyId,
      actor: { userId: TEST_OWNER_USER_ID, role: "Owner" },
      matterId: ids.matter,
      body: { kind: "legal_fee", expense_account_id: ids.account, amount_cents: 125000, bill_date: "2026-10-12" },
    });
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    const bill = (await db.query<{ load_id: string | null; driver_id: string | null; unit_id: string | null; trailer_id: string | null; l_load: string | null; l_unit: string | null; l_equipment: string | null }>(
      `SELECT b.load_id::text, b.driver_id::text, b.unit_id::text, b.trailer_id::text,
              bl.load_id::text AS l_load, bl.unit_id::text AS l_unit, bl.equipment_id::text AS l_equipment
         FROM accounting.bills b JOIN accounting.bill_lines bl ON bl.bill_id = b.id
        WHERE b.operating_company_id = $1 AND b.legal_matter_id = $2`,
      [companyId, ids.matter]
    )).rows;
    await db.query("COMMIT");
    expect(bill).toHaveLength(1);
    expect(bill[0]).toEqual({
      load_id: ids.load, driver_id: ids.driver, unit_id: ids.unit, trailer_id: ids.trailer,
      l_load: ids.load, l_unit: ids.unit, l_equipment: ids.trailer,
    });
  });
});
