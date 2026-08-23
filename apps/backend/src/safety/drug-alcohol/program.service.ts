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
  driver_name: string | null;
  consortium_name: string;
  enrolled_at: string;
  is_active: boolean;
  created_at: string;
};

export type DaTestRecord = {
  uuid: string;
  operating_company_id: string;
  driver_uuid: string;
  driver_name: string | null;
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
        e.uuid::text,
        e.operating_company_id,
        e.driver_uuid::text,
        NULLIF(TRIM(COALESCE(d.first_name, '') || ' ' || COALESCE(d.last_name, '')), '') AS driver_name,
        e.consortium_name,
        e.enrolled_at::text,
        e.is_active,
        e.created_at::text
      FROM safety.da_program_enrollments e
      LEFT JOIN mdata.drivers d
        ON d.id = e.driver_uuid
       AND (
         d.operating_company_id::text = e.operating_company_id::text
         OR EXISTS (
           SELECT 1
           FROM mdata.driver_company_authorizations da_enrollment_label_dca
           WHERE da_enrollment_label_dca.driver_id = d.id
             AND da_enrollment_label_dca.company_id = e.operating_company_id
             AND da_enrollment_label_dca.is_authorized = true
             AND da_enrollment_label_dca.deactivated_at IS NULL
         )
       )
      WHERE e.operating_company_id::text = $1::uuid::text
        AND ($2 = false OR e.is_active = true)
      ORDER BY e.enrolled_at DESC, e.created_at DESC
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
        AND operating_company_id::text = $2::uuid::text
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
      SELECT $1, d.id, $3, $4, $5::timestamptz, 'pending'
      FROM mdata.drivers d
      WHERE d.id = $2::uuid
        AND d.operating_company_id = $1::uuid
        AND d.status = 'Active'
        AND d.deactivated_at IS NULL
        AND d.archived_at IS NULL
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
  if (!row) throw new Error("active_driver_not_in_operating_company");
  return row;
}

export async function listTestRecords(
  client: PoolClient,
  operatingCompanyId: string,
  options: { driverUuid?: string; result?: TestResult; limit?: number } = {}
): Promise<DaTestRecord[]> {
  const conditions: string[] = ["t.operating_company_id::text = $1::uuid::text"];
  const values: unknown[] = [operatingCompanyId];
  let idx = 2;

  if (options.driverUuid) {
    conditions.push(`t.driver_uuid = $${idx}::uuid`);
    values.push(options.driverUuid);
    idx += 1;
  }
  if (options.result) {
    conditions.push(`t.result = $${idx}`);
    values.push(options.result);
    idx += 1;
  }

  const limitClause = `LIMIT ${options.limit ?? 200}`;
  const where = conditions.join(" AND ");

  const res = await client.query<DaTestRecord>(
    `
      SELECT
        t.uuid::text,
        t.operating_company_id,
        t.driver_uuid::text,
        NULLIF(TRIM(COALESCE(d.first_name, '') || ' ' || COALESCE(d.last_name, '')), '') AS driver_name,
        t.test_type,
        t.test_kind,
        t.scheduled_at::text,
        t.collected_at::text,
        t.result,
        t.chain_of_custody_id,
        t.sap_referral_uuid::text,
        t.created_at::text
      FROM safety.da_test_records t
      LEFT JOIN mdata.drivers d
        ON d.id = t.driver_uuid
       AND (
         d.operating_company_id::text = t.operating_company_id::text
         OR EXISTS (
           SELECT 1
           FROM mdata.driver_company_authorizations da_test_label_dca
           WHERE da_test_label_dca.driver_id = d.id
             AND da_test_label_dca.company_id = t.operating_company_id
             AND da_test_label_dca.is_authorized = true
             AND da_test_label_dca.deactivated_at IS NULL
         )
       )
      WHERE ${where}
      ORDER BY t.created_at DESC
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
        AND operating_company_id::text = $2::uuid::text
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
        AND operating_company_id::text = $2::uuid::text
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
