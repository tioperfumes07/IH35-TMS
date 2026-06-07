/**
 * Drug & Alcohol Program Management Service — GAP-81
 * FMCSA 49 CFR Part 382: consortium enrollment, test scheduling, result recording.
 * Operates on safety.da_* tables (additive; compliance.drug_alcohol_* tables remain separate).
 */
import type { PoolClient } from "pg";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TestType =
  | "pre_employment"
  | "random"
  | "post_accident"
  | "reasonable_suspicion"
  | "return_to_duty"
  | "follow_up";

export type TestKind = "drug" | "alcohol" | "both";

export type TestResult = "pending" | "negative" | "positive" | "refused" | "cancelled";

export type DaEnrollment = {
  uuid: string;
  operating_company_id: string;
  driver_uuid: string;
  consortium_name: string;
  enrolled_at: string;
  is_active: boolean;
  created_at: string;
};

export type DaTestRecord = {
  uuid: string;
  operating_company_id: string;
  driver_uuid: string;
  test_type: TestType;
  test_kind: TestKind;
  scheduled_at: string | null;
  collected_at: string | null;
  result: TestResult | null;
  chain_of_custody_id: string | null;
  sap_referral_uuid: string | null;
  created_at: string;
};

// ─── Enrollment ───────────────────────────────────────────────────────────────

export async function enrollDriver(
  client: PoolClient,
  operatingCompanyId: string,
  driverUuid: string,
  consortiumName: string,
  enrolledAt: string
): Promise<DaEnrollment> {
  const res = await client.query<DaEnrollment>(
    `
      INSERT INTO safety.da_program_enrollments
        (operating_company_id, driver_uuid, consortium_name, enrolled_at, is_active)
      VALUES ($1, $2::uuid, $3, $4::date, true)
      RETURNING
        uuid::text,
        operating_company_id,
        driver_uuid::text,
        consortium_name,
        enrolled_at::text,
        is_active,
        created_at::text
    `,
    [operatingCompanyId, driverUuid, consortiumName, enrolledAt]
  );
  const row = res.rows[0];
  if (!row) throw new Error("enrollment_insert_failed");
  return row;
}

export async function listEnrollments(
  client: PoolClient,
  operatingCompanyId: string,
  activeOnly = true
): Promise<DaEnrollment[]> {
  const res = await client.query<DaEnrollment>(
    `
      SELECT
        uuid::text,
        operating_company_id,
        driver_uuid::text,
        consortium_name,
        enrolled_at::text,
        is_active,
        created_at::text
      FROM safety.da_program_enrollments
      WHERE operating_company_id = $1
        AND ($2 = false OR is_active = true)
      ORDER BY enrolled_at DESC, created_at DESC
    `,
    [operatingCompanyId, activeOnly]
  );
  return res.rows;
}

export async function deactivateEnrollment(
  client: PoolClient,
  operatingCompanyId: string,
  enrollmentUuid: string
): Promise<boolean> {
  const res = await client.query<{ uuid: string }>(
    `
      UPDATE safety.da_program_enrollments
      SET is_active = false
      WHERE uuid = $1::uuid
        AND operating_company_id = $2
        AND is_active = true
      RETURNING uuid::text
    `,
    [enrollmentUuid, operatingCompanyId]
  );
  return (res.rows[0]?.uuid ?? null) !== null;
}

// ─── Test scheduling ──────────────────────────────────────────────────────────

export async function scheduleTest(
  client: PoolClient,
  operatingCompanyId: string,
  driverUuid: string,
  testType: TestType,
  testKind: TestKind,
  scheduledAt?: string
): Promise<DaTestRecord> {
  const res = await client.query<DaTestRecord>(
    `
      INSERT INTO safety.da_test_records
        (operating_company_id, driver_uuid, test_type, test_kind, scheduled_at, result)
      VALUES ($1, $2::uuid, $3, $4, $5::timestamptz, 'pending')
      RETURNING
        uuid::text,
        operating_company_id,
        driver_uuid::text,
        test_type,
        test_kind,
        scheduled_at::text,
        collected_at::text,
        result,
        chain_of_custody_id,
        sap_referral_uuid::text,
        created_at::text
    `,
    [operatingCompanyId, driverUuid, testType, testKind, scheduledAt ?? null]
  );
  const row = res.rows[0];
  if (!row) throw new Error("test_record_insert_failed");
  return row;
}

export async function listTestRecords(
  client: PoolClient,
  operatingCompanyId: string,
  options: { driverUuid?: string; result?: TestResult; limit?: number } = {}
): Promise<DaTestRecord[]> {
  const conditions: string[] = ["operating_company_id = $1"];
  const values: unknown[] = [operatingCompanyId];
  let idx = 2;

  if (options.driverUuid) {
    conditions.push(`driver_uuid = $${idx}::uuid`);
    values.push(options.driverUuid);
    idx += 1;
  }
  if (options.result) {
    conditions.push(`result = $${idx}`);
    values.push(options.result);
    idx += 1;
  }

  const limitClause = `LIMIT ${options.limit ?? 200}`;
  const where = conditions.join(" AND ");

  const res = await client.query<DaTestRecord>(
    `
      SELECT
        uuid::text,
        operating_company_id,
        driver_uuid::text,
        test_type,
        test_kind,
        scheduled_at::text,
        collected_at::text,
        result,
        chain_of_custody_id,
        sap_referral_uuid::text,
        created_at::text
      FROM safety.da_test_records
      WHERE ${where}
      ORDER BY created_at DESC
      ${limitClause}
    `,
    values
  );
  return res.rows;
}

// ─── Result recording ─────────────────────────────────────────────────────────

export async function recordResult(
  client: PoolClient,
  operatingCompanyId: string,
  testUuid: string,
  result: TestResult,
  chainOfCustodyId?: string,
  collectedAt?: string
): Promise<DaTestRecord> {
  const res = await client.query<DaTestRecord>(
    `
      UPDATE safety.da_test_records
      SET
        result              = $3,
        chain_of_custody_id = COALESCE($4, chain_of_custody_id),
        collected_at        = COALESCE($5::timestamptz, collected_at)
      WHERE uuid = $1::uuid
        AND operating_company_id = $2
      RETURNING
        uuid::text,
        operating_company_id,
        driver_uuid::text,
        test_type,
        test_kind,
        scheduled_at::text,
        collected_at::text,
        result,
        chain_of_custody_id,
        sap_referral_uuid::text,
        created_at::text
    `,
    [testUuid, operatingCompanyId, result, chainOfCustodyId ?? null, collectedAt ?? null]
  );
  const row = res.rows[0];
  if (!row) throw new Error("test_record_not_found");
  return row;
}

/**
 * Flag a positive result: marks the SAP referral slot.
 * The SAP workflow itself lives downstream (GAP-68 Safety Officer home feeds this).
 */
export async function flagPositive(
  client: PoolClient,
  operatingCompanyId: string,
  testUuid: string,
  sapReferralUuid?: string
): Promise<DaTestRecord> {
  const res = await client.query<DaTestRecord>(
    `
      UPDATE safety.da_test_records
      SET
        result            = 'positive',
        sap_referral_uuid = COALESCE($3::uuid, sap_referral_uuid)
      WHERE uuid = $1::uuid
        AND operating_company_id = $2
      RETURNING
        uuid::text,
        operating_company_id,
        driver_uuid::text,
        test_type,
        test_kind,
        scheduled_at::text,
        collected_at::text,
        result,
        chain_of_custody_id,
        sap_referral_uuid::text,
        created_at::text
    `,
    [testUuid, operatingCompanyId, sapReferralUuid ?? null]
  );
  const row = res.rows[0];
  if (!row) throw new Error("test_record_not_found");
  return row;
}
