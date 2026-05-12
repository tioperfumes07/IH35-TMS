import { appendCrudAudit } from "../audit/crud-audit.js";
import { nextCashAdvanceDisplayId } from "./display-id.js";

type PgishClient = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

export type CashAdvanceRepaymentScheduleInput = {
  weekly_installment_amount: number;
  total_periods: number;
  cadence: "weekly" | "biweekly";
};

export type CreateDriverCashAdvanceCoreInput = {
  driver_id: string;
  amount: number;
  purpose: "fuel_deposit" | "border_fee" | "family_emergency" | "vendor_payment" | "other";
  disbursement_method: "direct_bank_transfer" | "wire" | "comdata" | "in_person_check";
  recipient_info: {
    recipient_type: "driver" | "vendor" | "third_party";
    recipient_name?: string | null;
    bank_reference?: string | null;
    notes?: string | null;
  };
  linked_bill_id?: string | null;
  repayment_schedule: CashAdvanceRepaymentScheduleInput;
};

export async function resolveCompanyCashAdvanceThresholdDollars(client: PgishClient, companyId: string) {
  const fallback = Number(process.env.CASH_ADVANCE_THRESHOLD ?? 500);
  const hasColumnRes = await client.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'org'
          AND table_name = 'companies'
          AND column_name = 'cash_advance_threshold'
      ) AS ok
    `
  );
  const hasColumn = Boolean(hasColumnRes.rows[0]?.ok);
  if (!hasColumn) return fallback;
  const thresholdRes = await client.query(
    `
      SELECT cash_advance_threshold
      FROM org.companies
      WHERE id = $1
      LIMIT 1
    `,
    [companyId]
  );
  return Number(thresholdRes.rows[0]?.cash_advance_threshold ?? fallback);
}

export type CreateDriverCashAdvanceCoreResult =
  | { ok: true; advanceId: string; displayId: string; liabilityId: string; data: Record<string, unknown> }
  | { ok: false; code: number; error: string; message?: string };

/**
 * Single code path for booking a driver cash advance (liability + deduction schedule + driver_advances + audit).
 * Call only inside a transaction with app.operating_company_id already set.
 */
export async function createDriverCashAdvanceCore(
  client: PgishClient,
  actorUserUuid: string,
  companyId: string,
  body: CreateDriverCashAdvanceCoreInput
): Promise<CreateDriverCashAdvanceCoreResult> {
  const driverRes = await client.query(
    `
      SELECT id, status
      FROM mdata.drivers
      WHERE id = $1
      LIMIT 1
    `,
    [body.driver_id]
  );
  const driver = driverRes.rows[0];
  if (!driver) return { ok: false, code: 404, error: "driver_not_found" };
  if (String(driver.status ?? "").toLowerCase() !== "active") {
    return { ok: false, code: 400, error: "driver_not_active" };
  }

  let linkedBill: Record<string, unknown> | null = null;
  if (body.linked_bill_id) {
    const billRes = await client.query(
      `
        SELECT id, total_amount, status, vendor_id, display_id
        FROM accounting.bills
        WHERE id = $1
          AND operating_company_id = $2
        LIMIT 1
      `,
      [body.linked_bill_id, companyId]
    );
    linkedBill = billRes.rows[0] ?? null;
    if (!linkedBill) return { ok: false, code: 404, error: "linked_bill_not_found" };
    if (String(linkedBill.status ?? "").toLowerCase() !== "unpaid") {
      return { ok: false, code: 400, error: "linked_bill_must_be_unpaid" };
    }
  }

  const displayId = await nextCashAdvanceDisplayId(client, companyId);
  const liabilityRes = await client.query(
    `
      INSERT INTO driver_finance.driver_liabilities (
        operating_company_id,
        driver_id,
        type,
        source_description,
        original_amount,
        current_balance,
        paid_to_date,
        requires_acknowledgment
      ) VALUES ($1, $2, $3, $4, $5, $5, 0, false)
      RETURNING id
    `,
    [companyId, body.driver_id, "advance", `Cash advance ${displayId}`, body.amount]
  );
  const liabilityId = String(liabilityRes.rows[0]?.id ?? "");
  if (!liabilityId) return { ok: false, code: 500, error: "liability_create_failed" };

  const schedule = body.repayment_schedule;
  await client.query(
    `
      INSERT INTO driver_finance.deduction_schedule (
        operating_company_id,
        liability_id,
        driver_id,
        amount_per_period,
        total_periods,
        cadence,
        starts_on
      ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE)
    `,
    [companyId, liabilityId, body.driver_id, schedule.weekly_installment_amount, schedule.total_periods, schedule.cadence]
  );

  const insertAmount = linkedBill ? Number(linkedBill.total_amount ?? body.amount) : body.amount;
  const advanceRes = await client.query(
    `
      INSERT INTO driver_finance.driver_advances (
        operating_company_id,
        display_id,
        driver_id,
        liability_id,
        amount,
        purpose,
        disbursement_method,
        disbursement_status,
        recipient_type,
        recipient_name,
        linked_bill_id,
        requires_owner_approval,
        created_by_user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'approved', $8, $9, $10, false, $11)
      RETURNING id
    `,
    [
      companyId,
      displayId,
      body.driver_id,
      liabilityId,
      insertAmount,
      body.purpose,
      body.disbursement_method,
      body.recipient_info.recipient_type,
      body.recipient_info.recipient_name ?? null,
      body.linked_bill_id ?? null,
      actorUserUuid,
    ]
  );
  const advanceId = String(advanceRes.rows[0]?.id ?? "");
  if (!advanceId) return { ok: false, code: 500, error: "advance_create_failed" };

  await appendCrudAudit(
    client,
    actorUserUuid,
    "cash_advance.created",
    {
      resource_type: "driver_finance.driver_advances",
      resource_id: advanceId,
      operating_company_id: companyId,
      liability_id: liabilityId,
      linked_bill_id: body.linked_bill_id ?? null,
      display_id: displayId,
    },
    "info",
    "BT-3-CASH-ADVANCE-REBUILD"
  );

  const detailRes = await client
    .query(
      `
        SELECT *
        FROM views.cash_advances_with_context
        WHERE id = $1
        LIMIT 1
      `,
      [advanceId]
    )
    .catch(() => ({ rows: [] as Record<string, unknown>[] }));

  return {
    ok: true,
    advanceId,
    displayId,
    liabilityId,
    data: detailRes.rows[0] ?? { id: advanceId, display_id: displayId },
  };
}
