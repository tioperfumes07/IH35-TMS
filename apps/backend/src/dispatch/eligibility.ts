import { isBlockingDrugTestResult } from "../safety/drug-program.shared.js";
import { isDispatchBlockedByRtd, type RtdStage } from "../safety/rtd.shared.js";

export type DriverEligibilityReason =
  | "missing_negative_drug_test"
  | "drug_test_blocked"
  | "open_rtd_case"
  | "dqf_incomplete"
  | "insurance_not_verified";

export type DriverEligibilityResult = {
  eligible: boolean;
  reasons: DriverEligibilityReason[];
  details: {
    has_negative_drug_test: boolean;
    drug_dispatch_blocked: boolean;
    rtd_dispatch_blocked: boolean;
    dqf_complete: boolean;
    insurance_verified: boolean;
    insurance_gate_enabled: boolean;
  };
};

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export function isInsuranceGateEnabled() {
  return String(process.env.SAFETY_INSURANCE_GATE ?? "off").toLowerCase() === "on";
}

export function evaluateDriverEligibility(input: {
  hasNegativeDrugTest: boolean;
  latestDrugResult: string | null;
  rtdStage: RtdStage | null;
  rtdClearinghouseUpdated: boolean;
  dqfComplete: boolean;
  insuranceVerified: boolean;
  insuranceGateEnabled?: boolean;
}): DriverEligibilityResult {
  const insuranceGateEnabled = input.insuranceGateEnabled ?? isInsuranceGateEnabled();
  const reasons: DriverEligibilityReason[] = [];

  const drugDispatchBlocked = isBlockingDrugTestResult(String(input.latestDrugResult ?? ""));
  const rtdDispatchBlocked =
    input.rtdStage != null ? isDispatchBlockedByRtd(input.rtdStage, input.rtdClearinghouseUpdated) : false;

  if (!input.hasNegativeDrugTest) reasons.push("missing_negative_drug_test");
  if (drugDispatchBlocked) reasons.push("drug_test_blocked");
  if (rtdDispatchBlocked) reasons.push("open_rtd_case");
  if (!input.dqfComplete) reasons.push("dqf_incomplete");
  if (insuranceGateEnabled && !input.insuranceVerified) reasons.push("insurance_not_verified");

  return {
    eligible: reasons.length === 0,
    reasons,
    details: {
      has_negative_drug_test: input.hasNegativeDrugTest,
      drug_dispatch_blocked: drugDispatchBlocked,
      rtd_dispatch_blocked: rtdDispatchBlocked,
      dqf_complete: input.dqfComplete,
      insurance_verified: input.insuranceVerified,
      insurance_gate_enabled: insuranceGateEnabled,
    },
  };
}

export async function loadDriverEligibility(
  client: Queryable,
  operatingCompanyId: string,
  driverId: string
): Promise<DriverEligibilityResult> {
  const negativeRes = await client.query<{ count: number }>(
    `
      SELECT COUNT(*)::int AS count
      FROM safety.drug_test
      WHERE operating_company_id = $1
        AND driver_id = $2
        AND voided_at IS NULL
        AND result = 'negative'
    `,
    [operatingCompanyId, driverId]
  );

  const latestDrugRes = await client.query<{ result: string }>(
    `
      SELECT result::text
      FROM safety.drug_test
      WHERE operating_company_id = $1
        AND driver_id = $2
        AND voided_at IS NULL
      ORDER BY test_date DESC, created_at DESC
      LIMIT 1
    `,
    [operatingCompanyId, driverId]
  );

  const rtdRes = await client.query<{ stage: RtdStage; clearinghouse_updated: boolean }>(
    `
      SELECT stage::text AS stage, clearinghouse_updated
      FROM safety.rtd_case
      WHERE operating_company_id = $1
        AND driver_id = $2
        AND voided_at IS NULL
      ORDER BY
        CASE WHEN stage = 'complete' THEN 1 ELSE 0 END,
        opened_at DESC,
        created_at DESC
      LIMIT 1
    `,
    [operatingCompanyId, driverId]
  );

  const dqfRes = await client.query<{ missing_or_expired: number }>(
    `
      SELECT COUNT(*)::int AS missing_or_expired
      FROM safety.driver_qualification_files
      WHERE operating_company_id = $1
        AND driver_id = $2
        AND voided_at IS NULL
        AND status IN ('missing', 'expired')
    `,
    [operatingCompanyId, driverId]
  );

  const insuranceGateEnabled = isInsuranceGateEnabled();
  let insuranceVerified = true;
  if (insuranceGateEnabled) {
    const insuranceRes = await client.query<{ covered: number }>(
      `
        SELECT COUNT(*)::int AS covered
        FROM insurance.policy_unit pu
        JOIN insurance.policy p ON p.id = pu.policy_id
        JOIN mdata.assets a ON a.id = pu.asset_id
        WHERE pu.operating_company_id = $1
          AND p.status = 'active'
          AND a.primary_driver_id = $2
      `,
      [operatingCompanyId, driverId]
    ).catch(() => ({ rows: [{ covered: 0 }] }));
    insuranceVerified = Number(insuranceRes.rows[0]?.covered ?? 0) > 0;
  }

  const rtdRow = rtdRes.rows[0];
  return evaluateDriverEligibility({
    hasNegativeDrugTest: Number(negativeRes.rows[0]?.count ?? 0) > 0,
    latestDrugResult: latestDrugRes.rows[0]?.result ?? null,
    rtdStage: rtdRow?.stage ?? null,
    rtdClearinghouseUpdated: Boolean(rtdRow?.clearinghouse_updated),
    dqfComplete: Number(dqfRes.rows[0]?.missing_or_expired ?? 0) === 0,
    insuranceVerified,
  });
}
