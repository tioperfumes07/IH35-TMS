import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { createBill } from "../accounting/bills.service.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import {
  buildInsuranceGenerateBillsResponse,
  computeInsuranceDispersal,
  type InsuranceDispersalBill,
  type InsuranceDispersalPolicy,
  type InsuranceDispersalUnit,
} from "./dispersal.service.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const policyIdParamsSchema = z.object({
  id: z.string().uuid(),
});

const generateBillsBodySchema = z.object({
  dry_run: z.boolean().optional().default(false),
  vendor_id: z.string().trim().min(1),
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
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${operatingCompanyId}'`);
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
  vendorId: string;
  policyNumber: string;
  bills: InsuranceDispersalBill[];
}) {
  const created: Array<{ bill_id: string; sequence: number; amount_cents: number }> = [];

  for (const bill of input.bills) {
    const createdBill = await createBill(
      {
        operatingCompanyId: input.operatingCompanyId,
        vendorId: input.vendorId,
        billNumber: `${input.policyNumber}-INS-${String(bill.sequence).padStart(2, "0")}`,
        billDate: bill.due_date,
        dueDate: bill.due_date,
        amountCents: bill.amount_cents,
        memo: bill.memo,
      },
      input.userId
    );

    await withCompanyScope(input.userId, input.operatingCompanyId, async (client) => {
      for (const allocation of bill.allocations) {
        await client.query(
          `
            INSERT INTO accounting.bill_unit_allocation (
              tenant_id,
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
            createdBill.id,
            allocation.asset_id,
            allocation.allocation_method,
            allocation.allocation_pct,
            allocation.allocated_amount_cents,
          ]
        );
      }
    });

    created.push({
      bill_id: createdBill.id,
      sequence: bill.sequence,
      amount_cents: bill.amount_cents,
    });
  }

  return created;
}

export async function registerInsuranceDispersalRoutes(app: FastifyInstance) {
  app.post("/api/v1/insurance/policies/:id/generate-bills", async (req, reply) => {
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
          WHERE tenant_id = $1::uuid AND id = $2::uuid
        `,
        [query.data.operating_company_id, params.data.id]
      );
      if (!policyRes.rows[0]) return { kind: "policy_not_found" as const };

      const unitsRes = await client.query(
        `
          SELECT ${policyUnitSelectColumns()}
          FROM insurance.policy_unit
          WHERE tenant_id = $1::uuid AND policy_id = $2::uuid
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

    const created = await persistInsuranceDispersalBills({
      userId: user.uuid,
      operatingCompanyId: query.data.operating_company_id,
      vendorId: body.data.vendor_id,
      policyNumber: loaded.policy.policy_number,
      bills: dispersal.bills,
    });

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
