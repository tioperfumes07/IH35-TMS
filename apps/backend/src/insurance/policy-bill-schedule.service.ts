/**
 * Block 5 / GAP-86 — Insurance policy bill schedule writer (forward-fix).
 *
 * Called after a new insurance.policy is created (inside the SAME transaction as
 * the policy insert, so a failure rolls the policy back — see policy.routes.ts).
 * Writes the premium schedule: 1 down-payment bill (when down_payment_cents > 0)
 * + N installment bills, so down_payment + sum(installments) === total_premium.
 * Every bill is created via the canonical createBill() and its id is persisted to
 * insurance.payment_schedule.bill_uuid.
 *
 * FINANCIAL RULE: ONLY createBill()/voidBill() from bills.service.ts are used.
 *                 NO NEW FINANCIAL CODE is introduced here.
 *
 * Hardening (forward-fix for the #687 double-bill vulnerability):
 *   - Replay-skip: if the policy already has billed schedule rows (bill_uuid set),
 *     this is a no-op so a retry never double-bills (complements the HTTP
 *     idempotency middleware now covering POST /api/v1/insurance/policies).
 *   - Pre-flight validation BEFORE the first createBill() (vendor resolvable +
 *     amounts sane) so a mid-loop failure is near-impossible.
 *   - On failure AFTER any bill committed: void the committed bills via voidBill();
 *     any that cannot be voided are reported as a CRITICAL Sentry alert (never a
 *     silent orphan), then the error is rethrown so the policy transaction rolls back.
 */

import * as Sentry from "@sentry/node";
import { createBill, voidBill } from "../accounting/bills.service.js";

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
  const targetMonth = ((month % 12) + 12) % 12;
  const rawDay = dueDay ?? base.getUTCDate();
  // Clamp day to last day of target month
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const day = Math.min(rawDay, lastDay);
  return `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export type CreatePolicyBillScheduleResult = {
  scheduleIds: string[];
  billUuids: string[];
  skipped: boolean;
};

type PlannedBill = {
  kind: "down_payment" | "installment";
  billNumber: string;
  dueDate: string;
  amountCents: number;
  memo: string;
};

/** Plan the bill rows: 1 down payment (if > 0) + N installments, remainder on installment 1. */
function planBills(policy: PolicyRow): PlannedBill[] {
  const bills: PlannedBill[] = [];

  if (Number(policy.down_payment_cents) > 0) {
    bills.push({
      kind: "down_payment",
      billNumber: `INS-${policy.policy_number}-DP`,
      // Down payment is due at policy inception.
      dueDate: policy.effective_date,
      amountCents: Number(policy.down_payment_cents),
      memo: `Insurance premium down payment — ${policy.insurer_name} policy ${policy.policy_number}`,
    });
  }

  const installable = Math.max(0, Number(policy.total_premium_cents) - Number(policy.down_payment_cents));
  if (policy.installment_count > 0 && installable > 0) {
    const baseAmount = Math.floor(installable / policy.installment_count);
    const remainder = installable - baseAmount * policy.installment_count;
    for (let i = 1; i <= policy.installment_count; i += 1) {
      const amountCents = i === 1 ? baseAmount + remainder : baseAmount;
      if (amountCents <= 0) continue;
      bills.push({
        kind: "installment",
        billNumber: `INS-${policy.policy_number}-${String(i).padStart(2, "0")}`,
        dueDate: computeDueDate(policy.effective_date, i, policy.due_day),
        amountCents,
        memo: `Insurance premium installment ${i}/${policy.installment_count} — ${policy.insurer_name} policy ${policy.policy_number}`,
      });
    }
  }

  return bills;
}

/** Void bills committed before a failure; CRITICAL-alert any that cannot be voided. Never silent. */
async function voidCommittedBills(billIds: string[], operatingCompanyId: string, userId: string): Promise<void> {
  const orphaned: string[] = [];
  for (const billId of billIds) {
    try {
      await voidBill(operatingCompanyId, billId, "insurance_policy_bill_schedule_rollback", userId);
    } catch {
      orphaned.push(billId);
    }
  }
  if (orphaned.length > 0) {
    const message = `CRITICAL: orphaned insurance premium bills could not be voided after schedule rollback: ${orphaned.join(", ")}`;
    // Never silent: log AND raise a CRITICAL Sentry alert listing the orphaned bill IDs.
    console.error(message, { operating_company_id: operatingCompanyId });
    Sentry.captureMessage(message, {
      level: "fatal",
      tags: { subsystem: "insurance", phase: "bill_schedule_rollback" },
      extra: { orphaned_bill_ids: orphaned, operating_company_id: operatingCompanyId },
    });
  }
}

/**
 * Generate the premium bill schedule for a newly created insurance policy.
 * Must be called with `client` already scoped to the tenant AND inside the same
 * transaction as the policy insert (so a thrown error rolls the policy back).
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

  // ---- Replay-skip: never double-bill a policy that already has billed rows. ----
  const existing = await client.query<{ count: string }>(
    `
      SELECT count(*)::text AS count
      FROM insurance.payment_schedule
      WHERE tenant_id = $1::uuid AND policy_id = $2::uuid AND bill_uuid IS NOT NULL
    `,
    [policy.operating_company_id, policyId]
  );
  if (Number(existing.rows[0]?.count ?? 0) > 0) {
    return { scheduleIds: [], billUuids: [], skipped: true };
  }

  // ---- Pre-flight validation BEFORE the first createBill() (make mid-loop failure near-impossible). ----
  if (!policy.vendor_id) throw new Error("insurance_policy_vendor_id_required_for_bill_schedule");

  const vendorRes = await client.query<{ id: string }>(
    `
      SELECT id::text
      FROM mdata.vendors
      WHERE id = $1::uuid AND operating_company_id = $2::uuid AND deactivated_at IS NULL
      LIMIT 1
    `,
    [policy.vendor_id, policy.operating_company_id]
  );
  if (!vendorRes.rows[0]) throw new Error("insurance_vendor_not_resolvable");

  if (Number(policy.total_premium_cents) < 0 || Number(policy.down_payment_cents) < 0) {
    throw new Error("insurance_amounts_invalid");
  }
  if (Number(policy.down_payment_cents) > Number(policy.total_premium_cents)) {
    throw new Error("insurance_amounts_invalid_down_exceeds_total");
  }

  // NOTE: createBill() resolves its own default AP/expense account; no per-policy COA
  // is plumbed through this #687-compatible path, so there is no COA to pre-validate here.

  const planned = planBills(policy);
  if (planned.length === 0) return { scheduleIds: [], billUuids: [], skipped: false };

  const scheduleIds: string[] = [];
  const billUuids: string[] = [];
  const committedBillIds: string[] = [];

  try {
    for (const row of planned) {
      const bill = await createBill(
        {
          operatingCompanyId: policy.operating_company_id,
          vendorId: policy.vendor_id,
          billNumber: row.billNumber,
          billDate: row.dueDate,
          dueDate: row.dueDate,
          amountCents: row.amountCents,
          memo: row.memo,
        },
        userId
      );
      committedBillIds.push(bill.id);

      const schedRes = await client.query<{ id: string }>(
        `
          INSERT INTO insurance.payment_schedule (
            tenant_id,
            policy_id,
            due_date,
            amount_cents,
            status,
            bill_status,
            bill_uuid
          )
          VALUES ($1::uuid, $2::uuid, $3::date, $4, 'scheduled', 'issued', $5::uuid)
          RETURNING id::text
        `,
        [policy.operating_company_id, policyId, row.dueDate, row.amountCents, bill.id]
      );
      if (schedRes.rows[0]) scheduleIds.push(schedRes.rows[0].id);
      billUuids.push(bill.id);
    }
  } catch (err) {
    // Hard-fail: void any bills already committed by createBill() (separate connection),
    // alerting on any that cannot be voided, then rethrow so the policy txn rolls back.
    await voidCommittedBills(committedBillIds, policy.operating_company_id, userId);
    throw err;
  }

  return { scheduleIds, billUuids, skipped: false };
}
