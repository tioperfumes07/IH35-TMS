/**
 * 443.101 posting-gate PROOF — banking.equipment_loans (docs/specs/scoreboard/posting-gate-tables.json).
 *
 * Drives the equipment-loan writer, createEquipmentLoan (data-infra.service.ts), exactly as POST
 * /api/v1/data-infra/equipment-loans runs it (its own withCurrentUser transaction, RLS on), on an isolated company
 * with its own trailer and lender vendor, and reads it back through the engine's own list reader (which joins the
 * equipment and the lender inside the company). The writer commits by design and the table has no void writer, so
 * the proof row lives on the isolated fixture company of the CI database — never on USMCA (owner laws 2026-09-02 /
 * 2026-10-04).
 */
import { randomUUID } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createEquipmentLoan, listEquipmentLoans } from "../data-infra.service.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import {
  createIsolatedOperatingCompany,
  ensureIntegrationPrerequisites,
  type IsolatedOperatingCompany,
} from "../../../test-helpers/db-fixture.js";
import { connectFixtureClient, fixtureTxn } from "../../../test-helpers/posting-gate-proof.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("posting-gate proof — banking.equipment_loans via createEquipmentLoan", () => {
  let db: pg.Client;
  let iso: IsolatedOperatingCompany;
  const equipmentId = randomUUID();
  const lenderVendorId = randomUUID();
  const PRINCIPAL_CENTS = 4_500_000;

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    db = await connectFixtureClient();
    iso = await createIsolatedOperatingCompany({ codePrefix: "PGE", legalNamePrefix: "Posting-gate equipment loan" });
    await fixtureTxn(db, iso.companyId, async () => {
      await db.query(
        `INSERT INTO mdata.equipment (id, owner_company_id, equipment_number, equipment_type)
         VALUES ($1::uuid, $2::uuid, $3, 'DryVan')`,
        [equipmentId, iso.companyId, `PGE-${equipmentId.slice(0, 6)}`]
      );
      await db.query(
        `INSERT INTO mdata.vendors (id, operating_company_id, vendor_name, vendor_type) VALUES ($1::uuid, $2::uuid, $3, 'Lender')`,
        [lenderVendorId, iso.companyId, `PG lender ${lenderVendorId.slice(0, 6)}`]
      );
    });
  });

  afterAll(async () => {
    await db?.end();
  });

  it("writes the loan (company, trailer, lender, principal, author) and the engine list reads it back joined", async () => {
    const out = await createEquipmentLoan(TEST_OWNER_USER_ID, {
      operatingCompanyId: iso.companyId,
      equipmentId,
      lenderVendorId,
      principalCents: PRINCIPAL_CENTS,
      aprPercent: 8.5,
      startedOn: "2026-10-01",
      maturityOn: "2029-10-01",
      memo: "posting-gate proof (isolated company)",
    });
    expect(out.id).toMatch(/^[0-9a-f-]{36}$/);

    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    const row = (
      await db.query(
        `SELECT operating_company_id::text AS company, equipment_id::text AS equipment, lender_vendor_id::text AS lender,
                principal_cents::bigint AS principal, status, created_by_user_id::text AS by
           FROM banking.equipment_loans WHERE id = $1::uuid`,
        [out.id]
      )
    ).rows[0];
    await db.query("COMMIT");

    expect(row).toMatchObject({ company: iso.companyId, equipment: equipmentId, lender: lenderVendorId, status: "active", by: TEST_OWNER_USER_ID });
    expect(Number(row.principal)).toBe(PRINCIPAL_CENTS);

    const listed = (await listEquipmentLoans(TEST_OWNER_USER_ID, iso.companyId)) as Array<Record<string, unknown>>;
    expect(listed.some((l) => String(l.id) === out.id)).toBe(true);
  });

  it("refuses a non-positive principal (DB CHECK the writer relies on)", async () => {
    await expect(
      createEquipmentLoan(TEST_OWNER_USER_ID, {
        operatingCompanyId: iso.companyId,
        equipmentId,
        lenderVendorId,
        principalCents: 0,
        aprPercent: 0,
        startedOn: "2026-10-01",
      })
    ).rejects.toThrow();
  });
});
