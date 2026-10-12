/**
 * K-10 (443.113 / 443.115-C) — insurance policy wizard creates A/P bills only.
 *
 * OLD code invented banking.bank_transactions against the oldest active bank account, then
 * categorized them into bills. With NO bank account on the isolated company, old code threw
 * `insurance_seed_bank_account_not_found` and created 0 bills. New code creates bills and leaves
 * banking.bank_transactions at 0 (Owner Law B: the real bank line is matched later).
 *
 * Real Postgres. Isolated company. GITHUB_ACTIONS only (local probe: GITHUB_ACTIONS=true).
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import {
  createIsolatedOperatingCompany,
  deactivateIsolatedOperatingCompany,
} from "../../../test-helpers/isolated-company.js";
import { TEST_OWNER_USER_ID } from "../../../test-helpers/constants.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { createInsurancePolicyWithBills } from "../policy-create-atomic.service.js";
import { persistInsuranceDispersalBills } from "../dispersal.routes.js";
import { computeInsuranceDispersal } from "../dispersal.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("K-10 — insurance creates A/P bills only (no synthetic bank_transactions)", () => {
  let db: pg.Client;
  let companyId: string;
  let iso: Awaited<ReturnType<typeof createIsolatedOperatingCompany>>;
  const vendorId = randomUUID();
  const assetId = randomUUID();
  const typeId = randomUUID();
  const suffix = randomUUID().slice(0, 8);

  beforeAll(async () => {
    iso = await createIsolatedOperatingCompany({ label: "k10-ins", codePrefix: "K10" });
    companyId = iso.companyId;
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    refuseProductionConnectionString(cs);
    db = new pg.Client(buildPgClientConfig(cs!));
    await db.connect();
    await refuseProductionDatabase(db);
    await db.query("SET ROLE ih35_app");
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    await db.query(
      `INSERT INTO insurance.type_catalog (id, operating_company_id, code, name, active)
       VALUES ($1::uuid, $2::uuid, 'auto_liability', 'Auto Liability', true)`,
      [typeId, companyId]
    );
    await db.query(
      `INSERT INTO mdata.vendors (id, operating_company_id, vendor_name, is_sample_data)
       VALUES ($1::uuid, $2::uuid, $3, false)`,
      [vendorId, companyId, `K10 Insurer ${suffix}`]
    );
    await db.query(
      `INSERT INTO mdata.assets (id, operating_company_id, unit_code, asset_type, status)
       VALUES ($1::uuid, $2::uuid, $3, 'tractor', 'active')`,
      [assetId, companyId, `K10-${suffix}`]
    );
    // Deliberately NO banking.bank_accounts — old code fails here; new code must not need one.
    await db.query("COMMIT");
  });

  afterAll(async () => {
    if (db) {
      try {
        await db.query("BEGIN");
        await db.query("SET LOCAL app.bypass_rls = 'lucia'");
        await db.query(`DELETE FROM accounting.bill_unit_allocation WHERE operating_company_id = $1::uuid`, [companyId]);
        await db.query(`DELETE FROM accounting.bills WHERE operating_company_id = $1::uuid`, [companyId]);
        await db.query(`DELETE FROM insurance.policy_unit WHERE operating_company_id = $1::uuid`, [companyId]);
        await db.query(`DELETE FROM insurance.policy WHERE operating_company_id = $1::uuid`, [companyId]);
        await db.query(`DELETE FROM mdata.assets WHERE operating_company_id = $1::uuid`, [companyId]);
        await db.query(`DELETE FROM mdata.vendors WHERE operating_company_id = $1::uuid`, [companyId]);
        await db.query(`DELETE FROM insurance.type_catalog WHERE operating_company_id = $1::uuid`, [companyId]);
        await db.query("COMMIT");
      } catch {
        await db.query("ROLLBACK").catch(() => {});
      }
      try {
        if (iso) await deactivateIsolatedOperatingCompany(iso);
      } catch {
        /* best effort */
      }
      await db.end();
    }
  });

  it("createInsurancePolicyWithBills: bills > 0 and synthetic bank_transactions = 0 (fails on old invent path)", async () => {
    const result = await createInsurancePolicyWithBills({
      operatingCompanyId: companyId,
      vendorId,
      userId: TEST_OWNER_USER_ID,
      insurerName: `K10 Insurer ${suffix}`,
      policyNumber: `POL-K10-${suffix}`,
      coverageType: "auto_liability",
      effectiveDate: "2026-01-01",
      expiryDate: "2026-12-31",
      totalPremiumCents: 120_000,
      downPaymentCents: 0,
      termMonths: 3,
      allocationMethod: "equal_split",
      unitIds: [assetId],
    });

    expect(result.billCount).toBe(3);
    expect(result.policyId).toBeTruthy();

    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    const bills = await db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM accounting.bills
       WHERE operating_company_id = $1::uuid
         AND qbo_idempotency_key LIKE $2`,
      [companyId, `ins:${result.policyId}:%`]
    );
    const synthetic = await db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM banking.bank_transactions
       WHERE operating_company_id = $1::uuid
         AND (
           description LIKE 'Insurance dispersal %'
           OR notes LIKE 'Insurance wizard seed transaction%'
           OR notes LIKE '%insurance_dispersal_seed%'
         )`,
      [companyId]
    );
    const anyBankTx = await db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM banking.bank_transactions WHERE operating_company_id = $1::uuid`,
      [companyId]
    );
    await db.query("COMMIT");

    expect(Number(bills.rows[0]?.n)).toBe(3);
    expect(Number(synthetic.rows[0]?.n)).toBe(0);
    expect(Number(anyBankTx.rows[0]?.n)).toBe(0);
  });

  it("persistInsuranceDispersalBills: A/P bills only — no bank invent / no bulkPost path", async () => {
    const policyId = randomUUID();
    const policyNumber = `POL-K10D-${suffix}`;
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query(
      `INSERT INTO insurance.policy (
         id, operating_company_id, vendor_id, insurer_name, policy_number, coverage_type, coverage_type_id,
         effective_date, expiry_date, total_premium_cents, down_payment_cents, installment_count, status
       ) VALUES (
         $1::uuid, $2::uuid, $3::uuid, $4, $5, 'auto_liability', $6::uuid,
         '2026-04-01'::date, '2027-03-31'::date, 90000, 0, 3, 'active'
       )`,
      [policyId, companyId, vendorId, `K10 Insurer ${suffix}`, policyNumber, typeId]
    );
    await db.query(
      `INSERT INTO insurance.policy_unit (operating_company_id, policy_id, asset_id, insured_value_cents, cost_per_month_cents)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 90000, 30000)`,
      [companyId, policyId, assetId]
    );
    await db.query("COMMIT");

    const dispersal = computeInsuranceDispersal(
      {
        id: policyId,
        policy_number: policyNumber,
        insurer_name: `K10 Insurer ${suffix}`,
        coverage_type: "auto_liability",
        effective_date: "2026-04-01",
        expiry_date: "2027-03-31",
        total_premium_cents: 90_000,
        down_payment_cents: 0,
        installment_count: 3,
        due_day: 5,
        pay_day: 10,
      },
      [{ asset_id: assetId, insured_value_cents: 90_000 }]
    );

    const created = await persistInsuranceDispersalBills({
      userId: TEST_OWNER_USER_ID,
      operatingCompanyId: companyId,
      policyId,
      policyNumber,
      insurerName: `K10 Insurer ${suffix}`,
      bills: dispersal.bills,
    });

    expect(created.length).toBeGreaterThan(0);

    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    const synthetic = await db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM banking.bank_transactions
       WHERE operating_company_id = $1::uuid
         AND (
           description LIKE 'Insurance dispersal %'
           OR notes LIKE '%insurance_dispersal_seed%'
         )`,
      [companyId]
    );
    await db.query("COMMIT");
    expect(Number(synthetic.rows[0]?.n)).toBe(0);
  });
});
