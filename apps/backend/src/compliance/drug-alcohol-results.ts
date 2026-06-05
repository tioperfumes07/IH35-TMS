import type { PoolClient } from "pg";

export type TestResultType = "negative" | "positive" | "refusal" | "dilute";
export type TestReason =
  | "pre_employment"
  | "random"
  | "post_accident"
  | "reasonable_suspicion"
  | "return_to_duty"
  | "follow_up";

export type AnnualRateStatus = {
  year: number;
  pool_size: number;
  drug_tests_completed: number;
  alcohol_tests_completed: number;
  drug_rate_pct: number;
  alcohol_rate_pct: number;
  drug_minimum_pct: number;
  alcohol_minimum_pct: number;
  drug_on_track: boolean;
  alcohol_on_track: boolean;
};

const DRUG_ANNUAL_MIN = 50;
const ALCOHOL_ANNUAL_MIN = 10;

export function computeAnnualRateStatus(
  year: number,
  poolSize: number,
  drugTests: number,
  alcoholTests: number
): AnnualRateStatus {
  const drugRate = poolSize > 0 ? (drugTests / poolSize) * 100 : 0;
  const alcoholRate = poolSize > 0 ? (alcoholTests / poolSize) * 100 : 0;
  return {
    year,
    pool_size: poolSize,
    drug_tests_completed: drugTests,
    alcohol_tests_completed: alcoholTests,
    drug_rate_pct: Math.round(drugRate * 10) / 10,
    alcohol_rate_pct: Math.round(alcoholRate * 10) / 10,
    drug_minimum_pct: DRUG_ANNUAL_MIN,
    alcohol_minimum_pct: ALCOHOL_ANNUAL_MIN,
    drug_on_track: drugRate >= DRUG_ANNUAL_MIN,
    alcohol_on_track: alcoholRate >= ALCOHOL_ANNUAL_MIN,
  };
}

export async function recordTestResult(
  client: PoolClient,
  operatingCompanyId: string,
  input: {
    driver_id: string;
    test_date: string;
    test_type: "drug" | "alcohol";
    test_reason: TestReason;
    result: TestResultType;
    lab_id?: string | null;
    mro_verified_at?: string | null;
    notes?: string | null;
    clearinghouse_pending?: boolean;
  }
): Promise<{ id: string; rtd_process_id: string | null }> {
  const clearinghousePending = input.result === "positive" ? (input.clearinghouse_pending ?? true) : false;
  const res = await client.query<{ id: string }>(
    `
      INSERT INTO compliance.drug_alcohol_test_results (
        operating_company_id,
        driver_id,
        test_date,
        test_type,
        test_reason,
        result,
        lab_id,
        mro_verified_at,
        clearinghouse_pending,
        notes
      )
      VALUES ($1::uuid, $2::uuid, $3::date, $4, $5, $6, $7, $8::timestamptz, $9, $10)
      RETURNING id::text
    `,
    [
      operatingCompanyId,
      input.driver_id,
      input.test_date,
      input.test_type,
      input.test_reason,
      input.result,
      input.lab_id ?? null,
      input.mro_verified_at ?? null,
      clearinghousePending,
      input.notes ?? null,
    ]
  );
  const testId = res.rows[0]?.id;
  if (!testId) throw new Error("test_insert_failed");

  let rtdId: string | null = null;
  if (input.result === "positive") {
    const rtd = await client.query<{ id: string }>(
      `
        INSERT INTO compliance.return_to_duty_processes (
          operating_company_id,
          driver_id,
          test_result_id,
          status,
          follow_up_test_schedule
        )
        VALUES ($1::uuid, $2::uuid, $3::uuid, 'open', '[]'::jsonb)
        RETURNING id::text
      `,
      [operatingCompanyId, input.driver_id, testId]
    );
    rtdId = rtd.rows[0]?.id ?? null;
  }

  return { id: testId, rtd_process_id: rtdId };
}

export async function fetchAnnualRateStatus(
  client: PoolClient,
  operatingCompanyId: string,
  year: number
): Promise<AnnualRateStatus> {
  const poolRes = await client.query<{ c: string }>(
    `
      SELECT COUNT(*)::text AS c
      FROM compliance.drug_alcohol_pool_members
      WHERE operating_company_id = $1::uuid
        AND removed_at IS NULL
    `,
    [operatingCompanyId]
  );
  const poolSize = Number(poolRes.rows[0]?.c ?? 0);

  const countsRes = await client.query<{ test_type: string; c: string }>(
    `
      SELECT test_type, COUNT(*)::text AS c
      FROM compliance.drug_alcohol_test_results
      WHERE operating_company_id = $1::uuid
        AND EXTRACT(YEAR FROM test_date)::int = $2
        AND result IN ('negative', 'positive', 'refusal', 'dilute')
      GROUP BY test_type
    `,
    [operatingCompanyId, year]
  );
  let drugTests = 0;
  let alcoholTests = 0;
  for (const row of countsRes.rows) {
    if (row.test_type === "drug") drugTests = Number(row.c);
    if (row.test_type === "alcohol") alcoholTests = Number(row.c);
  }

  return computeAnnualRateStatus(year, poolSize, drugTests, alcoholTests);
}

export async function listOpenRtdProcesses(client: PoolClient, operatingCompanyId: string) {
  const res = await client.query(
    `
      SELECT
        r.id::text,
        r.driver_id::text,
        r.test_result_id::text,
        r.started_at::text,
        r.sap_assigned,
        r.follow_up_test_schedule,
        r.status,
        r.completed_at::text
      FROM compliance.return_to_duty_processes r
      WHERE r.operating_company_id = $1::uuid
        AND r.status IN ('open', 'in_progress')
      ORDER BY r.started_at DESC
    `,
    [operatingCompanyId]
  );
  return res.rows;
}
