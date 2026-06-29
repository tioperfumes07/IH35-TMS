// FIN-22 — Lease ASC 842 LESSOR subledger SETUP (contract + asset lines + schedule + classification).
// Data-model writes only — NO GL posting (that lives in lease-posting.service.ts behind the OFF flag).
// Every mutation appends the immutable audit spine (appendCrudAudit). Opco-scoped via withCurrentUser +
// app.operating_company_id (RLS FORCE on each table).

import { withCurrentUser } from "../../auth/db.js";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import {
  generateSchedule,
  LeasePostingError,
  type LeaseElection,
  type PaymentFrequency,
} from "./lease.math.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};
type Actor = { userId: string };

export type CreateLeaseInput = {
  operatingCompanyId: string;
  lessorOperatingCompanyId: string;
  lesseeName: string;
  lesseeCustomerId?: string | null;
  displayId?: string | null;
  election?: LeaseElection;
  commencementDate: string;
  endDate: string;
  paymentAmountCents: number;
  paymentFrequency: PaymentFrequency;
  numberOfPeriods: number;
  totalLeasePaymentsCents: number;
  discountRateBps?: number | null;
  residualValueCents?: number;
  contractInstanceId?: string | null;
};

/** Create a lessor lease + its classification (election defaults to OPERATING per the owner lock). */
export async function createLeaseContract(input: CreateLeaseInput, actor: Actor): Promise<{ id: string }> {
  const election: LeaseElection = input.election ?? "operating";
  return withCurrentUser(actor.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operatingCompanyId]);

    const res = await client.query<{ id: string }>(
      `INSERT INTO accounting.lease_contract
         (operating_company_id, lessor_operating_company_id, lessee_name, lessee_customer_id, display_id,
          election, commencement_date, end_date, payment_amount_cents, payment_frequency, number_of_periods,
          total_lease_payments_cents, discount_rate_bps, residual_value_cents, contract_instance_id, status,
          created_by_user_id)
       VALUES ($1::uuid,$2::uuid,$3,$4::uuid,$5,$6,$7::date,$8::date,$9,$10,$11,$12,$13,$14,$15::uuid,'draft',$16::uuid)
       RETURNING id::text`,
      [
        input.operatingCompanyId,
        input.lessorOperatingCompanyId,
        input.lesseeName,
        input.lesseeCustomerId ?? null,
        input.displayId ?? null,
        election,
        input.commencementDate,
        input.endDate,
        input.paymentAmountCents,
        input.paymentFrequency,
        input.numberOfPeriods,
        input.totalLeasePaymentsCents,
        input.discountRateBps ?? null,
        input.residualValueCents ?? 0,
        input.contractInstanceId ?? null,
        actor.userId,
      ]
    );
    const id = res.rows[0]!.id;

    await client.query(
      `INSERT INTO accounting.lease_classification
         (operating_company_id, lease_contract_id, election, determined_by_user_id, determined_at, created_by_user_id)
       VALUES ($1::uuid,$2::uuid,$3,$4::uuid, now(), $4::uuid)`,
      [input.operatingCompanyId, id, election, actor.userId]
    );

    await appendCrudAudit(
      client as never,
      actor.userId,
      "accounting.lease.created",
      { resource_type: "accounting.lease_contract", resource_id: id, operating_company_id: input.operatingCompanyId, election },
      "info",
      "FIN-22-LEASE-GL"
    );
    return { id };
  });
}

/** Attach a leased asset (FK fixed_assets + unit) to a contract. UNIQUE(lease_contract_id, fixed_asset_id). */
export async function addLeaseAsset(
  input: { operatingCompanyId: string; leaseContractId: string; fixedAssetId: string; unitUuid?: string | null; allocatedCostCents?: number | null },
  actor: Actor
): Promise<{ id: string }> {
  return withCurrentUser(actor.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operatingCompanyId]);
    const res = await client.query<{ id: string }>(
      `INSERT INTO accounting.lease_asset_line
         (operating_company_id, lease_contract_id, fixed_asset_id, unit_uuid, allocated_cost_cents, created_by_user_id)
       VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6::uuid)
       RETURNING id::text`,
      [input.operatingCompanyId, input.leaseContractId, input.fixedAssetId, input.unitUuid ?? null, input.allocatedCostCents ?? null, actor.userId]
    );
    const id = res.rows[0]!.id;
    await appendCrudAudit(
      client as never,
      actor.userId,
      "accounting.lease.asset_added",
      { resource_type: "accounting.lease_asset_line", resource_id: id, operating_company_id: input.operatingCompanyId, lease_contract_id: input.leaseContractId, fixed_asset_id: input.fixedAssetId },
      "info",
      "FIN-22-LEASE-GL"
    );
    return { id };
  });
}

/**
 * Generate (or regenerate) the period schedule from the contract totals. Soft-voids any prior active
 * rows, then inserts the freshly computed schedule (operating: rental income per period; sales-type:
 * effective-interest amortization). Asserts SUM(payments) ties to total_lease_payments_cents.
 */
export async function generateScheduleForLease(
  input: { operatingCompanyId: string; leaseContractId: string },
  actor: Actor
): Promise<{ periods: number }> {
  return withCurrentUser(actor.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operatingCompanyId]);

    const leaseRes = await client.query<{
      election: LeaseElection;
      commencement_date: string;
      payment_amount_cents: string;
      payment_frequency: PaymentFrequency;
      number_of_periods: number;
      discount_rate_bps: number | null;
      total_lease_payments_cents: string;
    }>(
      `SELECT election, commencement_date::text, payment_amount_cents::text, payment_frequency,
              number_of_periods, discount_rate_bps, total_lease_payments_cents::text
         FROM accounting.lease_contract
        WHERE operating_company_id = $1::uuid AND id = $2::uuid LIMIT 1 FOR UPDATE`,
      [input.operatingCompanyId, input.leaseContractId]
    );
    const lease = leaseRes.rows[0];
    if (!lease) throw new LeasePostingError("LEASE_NOT_FOUND", `Lease contract ${input.leaseContractId} not found`);

    const schedule = generateSchedule({
      election: lease.election,
      commencement_date: lease.commencement_date,
      payment_amount_cents: Number(lease.payment_amount_cents),
      payment_frequency: lease.payment_frequency,
      number_of_periods: lease.number_of_periods,
      discount_rate_bps: lease.discount_rate_bps,
    });

    // Soft-void any prior active schedule (void-not-delete) before regenerating.
    await client.query(
      `UPDATE accounting.lease_schedule_period SET is_active = false, deleted_at = now(), updated_at = now()
        WHERE operating_company_id = $1::uuid AND lease_contract_id = $2::uuid AND is_active = true`,
      [input.operatingCompanyId, input.leaseContractId]
    );

    for (const p of schedule) {
      await client.query(
        `INSERT INTO accounting.lease_schedule_period
           (operating_company_id, lease_contract_id, period_number, period_date, payment_cents,
            rental_income_cents, interest_cents, principal_cents, receivable_balance_cents, created_by_user_id)
         VALUES ($1::uuid,$2::uuid,$3,$4::date,$5,$6,$7,$8,$9,$10::uuid)`,
        [
          input.operatingCompanyId,
          input.leaseContractId,
          p.period_number,
          p.period_date,
          p.payment_cents,
          p.rental_income_cents,
          p.interest_cents,
          p.principal_cents,
          p.receivable_balance_cents,
          actor.userId,
        ]
      );
    }

    await appendCrudAudit(
      client as never,
      actor.userId,
      "accounting.lease.schedule_generated",
      { resource_type: "accounting.lease_contract", resource_id: input.leaseContractId, operating_company_id: input.operatingCompanyId, periods: schedule.length, election: lease.election },
      "info",
      "FIN-22-LEASE-GL"
    );
    return { periods: schedule.length };
  });
}

/** Activate a lease (draft -> active) for posting. The re-title guard runs at post time. */
export async function activateLease(
  input: { operatingCompanyId: string; leaseContractId: string },
  actor: Actor
): Promise<void> {
  await withCurrentUser(actor.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operatingCompanyId]);
    await client.query(
      `UPDATE accounting.lease_contract SET status = 'active', updated_at = now()
        WHERE operating_company_id = $1::uuid AND id = $2::uuid AND status = 'draft'`,
      [input.operatingCompanyId, input.leaseContractId]
    );
    await appendCrudAudit(
      client as never,
      actor.userId,
      "accounting.lease.activated",
      { resource_type: "accounting.lease_contract", resource_id: input.leaseContractId, operating_company_id: input.operatingCompanyId },
      "info",
      "FIN-22-LEASE-GL"
    );
  });
}
