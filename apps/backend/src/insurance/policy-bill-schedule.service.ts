/**
 * Block 5 / GAP-86 — Insurance policy bill schedule writer
 *
 * Called after a new insurance.policy is created.  When installment_count > 0
 * and the policy has a vendor_id, this service generates one accounting.bills
 * row per installment via the canonical createBill() function and persists each
 * bill_uuid back onto the insurance.payment_schedule row.
 *
 * FINANCIAL RULE: ONLY createBill() from bills.service.ts is used.
 *                 NO new financial ledger code is introduced here.
 */

import { createBill } from "../accounting/bills.service.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

type PolicyRow = {
  id: string;
  operating_company_id: string;
  vendor_id: string | null;
  insurer_name: string;
  policy_number: string;
  effective_date: string;
  installment_count: number;
  due_day: number | null;
  total_premium_cents: number;
  down_payment_cents: number;
};

/**
 * Compute the Nth installment due date:
 *   start from effective_date, advance N months, then clamp to due_day.
 */
function computeDueDate(effectiveDate: string, monthOffset: number, dueDay: number | null): string {
  const base = new Date(`${effectiveDate}T00:00:00.000Z`);
  const year = base.getUTCFullYear();
  const month = base.getUTCMonth() + monthOffset; // 0-indexed, may overflow
  const targetYear = year + Math.floor(month / 12);
  const targetMonth = month % 12;
  const rawDay = dueDay ?? base.getUTCDate();
  // Clamp day to last day of target month
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const day = Math.min(rawDay, lastDay);
  return `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export type CreatePolicyBillScheduleResult = {
  scheduleIds: string[];
  billUuids: string[];
};

/**
 * Generate installment bills for a newly created insurance policy.
 *
 * @param policyId  UUID of the insurance.policy row
 * @param userId    Caller's user UUID (passed to createBill)
 * @param client    Active DB client with app.operating_company_id already set
 * @returns List of created payment_schedule IDs and bill UUIDs
 */
export async function createPolicyBillSchedule(
  policyId: string,
  userId: string,
  client: DbClient
): Promise<CreatePolicyBillScheduleResult> {
  const policyRes = await client.query<PolicyRow>(
    `
      SELECT
        id::text,
        tenant_id::text AS operating_company_id,
        vendor_id,
        insurer_name,
        policy_number,
        effective_date::text,
        installment_count::int,
        due_day::int,
        total_premium_cents::bigint,
        down_payment_cents::bigint
      FROM insurance.policy
      WHERE id = $1::uuid
      LIMIT 1
    `,
    [policyId]
  );

  const policy = policyRes.rows[0];
  if (!policy) throw new Error("insurance_policy_not_found");
  if (!policy.vendor_id) throw new Error("insurance_policy_vendor_id_required_for_bill_schedule");
  if (policy.installment_count <= 0) return { scheduleIds: [], billUuids: [] };

  const installableAmount = Math.max(0, Number(policy.total_premium_cents) - Number(policy.down_payment_cents));

  // Distribute cents evenly; add remainder to first installment
  const baseAmount = Math.floor(installableAmount / policy.installment_count);
  const remainder = installableAmount - baseAmount * policy.installment_count;

  const scheduleIds: string[] = [];
  const billUuids: string[] = [];

  for (let i = 1; i <= policy.installment_count; i++) {
    const installmentCents = i === 1 ? baseAmount + remainder : baseAmount;
    if (installmentCents <= 0) continue;

    const dueDate = computeDueDate(policy.effective_date, i, policy.due_day);

    const bill = await createBill(
      {
        operatingCompanyId: policy.operating_company_id,
        vendorId: policy.vendor_id,
        billNumber: `INS-${policy.policy_number}-${String(i).padStart(2, "0")}`,
        billDate: dueDate,
        dueDate,
        amountCents: installmentCents,
        memo: `Insurance premium installment ${i}/${policy.installment_count} — ${policy.insurer_name} policy ${policy.policy_number}`,
      },
      userId
    );

    const schedRes = await client.query<{ id: string }>(
      `
        INSERT INTO insurance.payment_schedule (
          tenant_id,
          policy_id,
          due_date,
          amount_cents,
          status,
          bill_uuid
        )
        VALUES ($1::uuid, $2::uuid, $3::date, $4, 'scheduled', $5::uuid)
        RETURNING id::text
      `,
      [
        policy.operating_company_id,
        policyId,
        dueDate,
        installmentCents,
        bill.id,
      ]
    );

    if (schedRes.rows[0]) scheduleIds.push(schedRes.rows[0].id);
    billUuids.push(bill.id);
  }

  return { scheduleIds, billUuids };
}
