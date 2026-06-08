import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { INSURANCE_COVERAGE_TYPES, INSURANCE_POLICY_STATUSES } from "./policy.shared.js";
import { createInsurancePolicyWithBills } from "./policy-create-atomic.service.js";
import type { AllocationMethod } from "./policy-create-atomic.service.js";

const ALLOCATION_METHODS = ["equal_split", "pro_rata", "weighted"] as const;

const createWithBillsSchema = z.object({
  operating_company_id: z.string().uuid(),
  insurer_name: z.string().trim().min(1).max(250),
  policy_number: z.string().trim().min(1).max(120),
  coverage_type: z.enum(INSURANCE_COVERAGE_TYPES),
  effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
  expiry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
  total_premium_cents: z.number().int().positive(),
  down_payment_cents: z.number().int().nonnegative().default(0),
  term_months: z.number().int().min(1).max(120),
  allocation_method: z.enum(ALLOCATION_METHODS).default("equal_split"),
  manual_pcts: z.record(z.string(), z.number().nonnegative()).optional(),
  unit_ids: z.array(z.string().uuid()).min(1, "at least one unit required"),
  due_day: z.number().int().min(1).max(31).nullable().optional(),
  pay_day: z.number().int().min(1).max(31).nullable().optional(),
  late_fee_pct: z.number().min(0).max(999.99).default(0),
  status: z.enum(INSURANCE_POLICY_STATUSES).default("active"),
  insurer_email: z.string().trim().email().nullable().optional(),
  agent_contact: z.string().trim().max(500).nullable().optional(),
});

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function canMutate(role: string) {
  return ["Owner", "Administrator", "Manager", "Accountant"].includes(role);
}

export async function registerInsurancePolicyCreateAtomicRoutes(app: FastifyInstance) {
  app.post("/api/v1/insurance/policies/with-bills", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });

    const parsed = createWithBillsSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    }
    const body = parsed.data;

    if (body.expiry_date < body.effective_date) {
      return reply.code(400).send({ error: "validation_error", details: { fieldErrors: { expiry_date: ["must be on or after effective_date"] }, formErrors: [] } });
    }

    if (body.allocation_method === "weighted" && !body.manual_pcts) {
      return reply.code(400).send({ error: "validation_error", details: { fieldErrors: { manual_pcts: ["required when allocation_method is weighted"] }, formErrors: [] } });
    }

    try {
      const result = await createInsurancePolicyWithBills({
        operatingCompanyId: body.operating_company_id,
        userId: user.uuid,
        insurerName: body.insurer_name,
        policyNumber: body.policy_number,
        coverageType: body.coverage_type,
        effectiveDate: body.effective_date,
        expiryDate: body.expiry_date,
        totalPremiumCents: body.total_premium_cents,
        downPaymentCents: body.down_payment_cents,
        termMonths: body.term_months,
        allocationMethod: body.allocation_method as AllocationMethod,
        manualPcts: body.manual_pcts,
        unitIds: body.unit_ids,
        dueDay: body.due_day,
        payDay: body.pay_day,
        lateFee: body.late_fee_pct,
        status: body.status,
        insurerEmail: body.insurer_email,
        agentContact: body.agent_contact,
      });

      return reply.code(201).send(result);
    } catch (err) {
      const message = String((err as Error)?.message ?? "policy_create_failed");
      if (message === "coverage_type_not_found") {
        return reply.code(400).send({ error: "coverage_type_not_found" });
      }
      if (message.startsWith("asset_not_found:")) {
        return reply.code(404).send({ error: "asset_not_found", detail: message });
      }
      if (
        message === "insurance_vendor_not_found" ||
        message === "insurance_seed_bank_account_not_found"
      ) {
        return reply.code(409).send({ error: message });
      }
      throw err;
    }
  });
}
