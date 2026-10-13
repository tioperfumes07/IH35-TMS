// K-10 (443.113 / 443.115-C) — insurance generate-bills creates A/P bills only.
// Never invent banking.bank_transactions. The real bank line is matched later (Owner Law B).
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import {
  buildInsuranceGenerateBillsResponse,
  computeInsuranceDispersal,
  INSURANCE_PS_CATEGORY,
  type InsuranceDispersalBill,
  type InsuranceDispersalPolicy,
  type InsuranceDispersalUnit,
} from "./dispersal.service.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const policyIdParamsSchema = z.object({
  id: z.string().uuid(),
});

const generateBillsBodySchema = z.object({
  dry_run: z.boolean().optional().default(false),
});

type Queryable = {
  query: <R = Record<string, unknown>>(
    sql: string,
    values?: unknown[]
  ) => Promise<{ rows: R[]; rowCount?: number }>;
};

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function canMutate(role: string) {
  return ["Owner", "Administrator", "Manager", "Accountant"].includes(role);
}

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: Queryable) => Promise<T>
) {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [operatingCompanyId]);
    return fn(client as Queryable);
  });
}

function policySelectColumns() {
  return `
    id::text,
    insurer_name,
    policy_number,
    coverage_type,
    effective_date::text,
    expiry_date::text,
    total_premium_cents::bigint,
    down_payment_cents::bigint,
    installment_count::int,
    due_day::int,
    pay_day::int
  `;
}

function policyUnitSelectColumns() {
  return `
    asset_id::text,
    insured_value_cents::bigint
  `;
}

function normalizePolicyRow(row: Record<string, unknown>): InsuranceDispersalPolicy {
  return {
    id: String(row.id),
    policy_number: String(row.policy_number),
    insurer_name: String(row.insurer_name),
    coverage_type: String(row.coverage_type),
    effective_date: String(row.effective_date),
    expiry_date: String(row.expiry_date),
    total_premium_cents: Number(row.total_premium_cents),
    down_payment_cents: Number(row.down_payment_cents),
    installment_count: Number(row.installment_count),
    due_day: row.due_day == null ? null : Number(row.due_day),
    pay_day: row.pay_day == null ? null : Number(row.pay_day),
  };
}

export async function persistInsuranceDispersalBills(input: {
  userId: string;
  operatingCompanyId: string;
  policyId: string;
  policyNumber: string;
  insurerName: string;
  bills: InsuranceDispersalBill[];
}) {
  if (!input.bills.length) return [];

  return withCompanyScope(input.userId, input.operatingCompanyId, async (client) => {
    const vendorRes = await client.query<{ id: string; is_sample_data: boolean | null }>(
      `
        SELECT id::text, is_sample_data
        FROM mdata.vendors
        WHERE operating_company_id = $1::uuid
          AND deactivated_at IS NULL
          AND lower(trim(vendor_name)) = lower(trim($2))
        ORDER BY created_at ASC
        LIMIT 1
      `,
      [input.operatingCompanyId, input.insurerName]
    );
    const vendorId = vendorRes.rows[0]?.id;
    if (!vendorId) throw new Error("insurance_vendor_not_found");
    const vendorIsSampleData = vendorRes.rows[0]?.is_sample_data === true;

    // K-10 — A/P bills only. No synthetic bank-line invent; no bank-feed bulk-post path.
    const created: Array<{ bill_id: string; sequence: number; amount_cents: number }> = [];
    for (const bill of input.bills) {
      const idempotencyKey = `ins:${input.policyId}:${bill.sequence}`;

      const billRes = await client.query<{ id: string }>(
        `
          INSERT INTO accounting.bills (
            operating_company_id, vendor_id, vendor_uuid, mdata_vendor_id,
            bill_date, due_date, amount_cents, total_amount,
            paid_cents, paid_amount, status, memo,
            qbo_idempotency_key, created_by_user_id, created_at, updated_at,
            is_sample_data
          )
          VALUES ($1,$2,$2,$2::uuid,$3,$3,$4,$5,0,0,'unpaid',$6,$7,$8,now(),now(),$9)
          ON CONFLICT (operating_company_id, qbo_idempotency_key)
            WHERE qbo_idempotency_key IS NOT NULL DO NOTHING
          RETURNING id::text
        `,
        [
          input.operatingCompanyId,
          vendorId,
          bill.due_date,
          Math.abs(bill.amount_cents),
          Math.abs(bill.amount_cents) / 100,
          `Insurance dispersal bill — policy ${input.policyNumber}, installment ${bill.sequence} (${bill.phase}) · ${INSURANCE_PS_CATEGORY}::${bill.ps_item ?? "Insurance Premium"}`,
          idempotencyKey,
          input.userId,
          vendorIsSampleData,
        ]
      );
      const createdBillId = billRes.rows[0]?.id;
      if (!createdBillId) throw new Error("insurance_created_bill_not_found");

      await client.query(
        `
          UPDATE accounting.bills
          SET bill_number = $3,
              memo = $4,
              updated_at = now()
          WHERE id = $1
            AND operating_company_id = $2::uuid
        `,
        [
          createdBillId,
          input.operatingCompanyId,
          `${input.policyNumber}-INS-${String(bill.sequence).padStart(2, "0")}`,
          bill.memo,
        ]
      );

      for (const allocation of bill.allocations) {
        await client.query(
          `
            INSERT INTO accounting.bill_unit_allocation (
              operating_company_id,
              bill_id,
              asset_id,
              allocation_method,
              allocation_pct,
              allocated_amount_cents
            )
            VALUES ($1, $2, $3, $4, $5, $6)
          `,
          [
            input.operatingCompanyId,
            createdBillId,
            allocation.asset_id,
            allocation.allocation_method,
            allocation.allocation_pct,
            allocation.allocated_amount_cents,
          ]
        );
      }

      created.push({
        bill_id: createdBillId,
        sequence: bill.sequence,
        amount_cents: bill.amount_cents,
      });
    }

    return created.sort((a, b) => a.sequence - b.sequence);
  });
}

export async function registerInsuranceDispersalRoutes(app: FastifyInstance) {
  app.post("/api/v1/insurance/policies/:id/generate-bills", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });

    const params = policyIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    const body = generateBillsBodySchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const loaded = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const policyRes = await client.query(
        `
          SELECT ${policySelectColumns()}
          FROM insurance.policy
          WHERE operating_company_id = $1::uuid AND id = $2::uuid
        `,
        [query.data.operating_company_id, params.data.id]
      );
      if (!policyRes.rows[0]) return { kind: "policy_not_found" as const };

      const unitsRes = await client.query(
        `
          SELECT ${policyUnitSelectColumns()}
          FROM insurance.policy_unit
          WHERE operating_company_id = $1::uuid AND policy_id = $2::uuid
          ORDER BY created_at ASC
        `,
        [query.data.operating_company_id, params.data.id]
      );
      if (!unitsRes.rows.length) return { kind: "covered_units_required" as const };

      return {
        kind: "ok" as const,
        policy: normalizePolicyRow(policyRes.rows[0] as Record<string, unknown>),
        units: unitsRes.rows.map((row) => ({
          asset_id: String((row as { asset_id: string }).asset_id),
          insured_value_cents: Number((row as { insured_value_cents: number }).insured_value_cents),
        })) as InsuranceDispersalUnit[],
      };
    });

    if (loaded.kind === "policy_not_found") return reply.code(404).send({ error: "policy_not_found" });
    if (loaded.kind === "covered_units_required") {
      return reply.code(409).send({ error: "covered_units_required" });
    }

    let dispersal;
    try {
      dispersal = computeInsuranceDispersal(loaded.policy, loaded.units);
    } catch (error) {
      const message = String((error as Error)?.message ?? "dispersal_compute_failed");
      return reply.code(400).send({ error: message });
    }

    const response = buildInsuranceGenerateBillsResponse(dispersal);
    if (body.data.dry_run) {
      return {
        ...response,
        dry_run: true,
        created_bill_ids: [],
      };
    }

    let created: Array<{ bill_id: string; sequence: number; amount_cents: number }>;
    try {
      created = await persistInsuranceDispersalBills({
        userId: user.uuid,
        operatingCompanyId: query.data.operating_company_id,
        policyId: loaded.policy.id,
        policyNumber: loaded.policy.policy_number,
        insurerName: loaded.policy.insurer_name,
        bills: dispersal.bills,
      });
    } catch (error) {
      const message = String((error as Error)?.message ?? "insurance_generate_bills_failed");
      if (
        message === "insurance_vendor_not_found" ||
        message === "insurance_created_bill_not_found"
      ) {
        return reply.code(409).send({ error: message });
      }
      throw error;
    }

    await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      await appendCrudAudit(client, user.uuid, "insurance.policy.generate_bills", {
        resource_id: params.data.id,
        operating_company_id: query.data.operating_company_id,
        bill_count: created.length,
        total_amount_cents: dispersal.total_amount_cents,
      });
    });

    return {
      ...response,
      dry_run: false,
      created_bill_ids: created.map((row) => row.bill_id),
      created_bills: created,
    };
  });
}
