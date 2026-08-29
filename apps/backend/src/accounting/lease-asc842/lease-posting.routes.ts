// FIN-22 — Lease ASC 842 LESSOR posting routes (TIER-1 FINANCIAL; BUILD-AND-HOLD, flag OFF).
//
// Wires the already-built lessor subledger + poster (lease.service.ts + lease-posting.service.ts) to an
// HTTP surface, mirroring the sibling FIN-18 settlement-posting.routes.ts. Auto-registered by the accounting
// @fastify/autoload barrel (accounting/index.ts, matchFilter /\.routes\.(ts|js)$/) — same as settlement/
// factoring posters. Finance-role + company-membership gated on every endpoint.
//
// MONEY SAFETY: the posting endpoints delegate to the flag-gated poster. With LEASE_GL_POSTING_ENABLED OFF
// (the owner-locked default) every post returns { result: "skipped_flag_off" } and writes ZERO journal
// entries — so even if this surface is reached, no money moves until Jorge flips the per-entity flag. TRK is
// the only entity that books lessor leases; the poster's re-title guard enforces owner_company_id = TRK.

import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { assertCompanyMembership } from "../../_helpers/company-membership-guard.js";
import { withCurrentUser } from "../../auth/db.js";
import { companyQuerySchema, currentAuthUser, validationError } from "../shared.js";
import { LeasePostingError } from "./lease.math.js";
import {
  createLeaseContract,
  addLeaseAsset,
  generateScheduleForLease,
  activateLease,
} from "./lease.service.js";
import {
  postOperatingRentalPeriod,
  postOperatingEndOfTermSale,
  postSalesTypeCommencement,
  postSalesTypeInterestPeriod,
  postOperatingActivationEntries,
} from "./lease-posting.service.js";

const financeRoles = new Set(["Owner", "Administrator", "Manager", "Accountant"]);

function ensureFinanceUser(req: Parameters<typeof currentAuthUser>[0], reply: Parameters<typeof currentAuthUser>[1]) {
  const user = currentAuthUser(req, reply);
  if (!user) return null;
  if (!financeRoles.has(String(user.role ?? ""))) {
    reply.code(403).send({ error: "forbidden" });
    return null;
  }
  return user as { uuid: string; role: string };
}

function mapError(error: LeasePostingError) {
  const byCode: Record<string, number> = {
    LEASE_NOT_FOUND: 404,
    SCHEDULE_PERIOD_NOT_FOUND: 404,
    LEASE_NOT_POSTABLE: 409,
    DISPOSAL_ALREADY_EXISTS: 409,
    RETITLE_REQUIRED: 409,
    PERIOD_LOCKED: 409,
    LEASE_NOT_OPERATING: 422,
    LEASE_NOT_SALES_TYPE: 422,
    NO_LEASE_ASSETS: 422,
    ACCOUNT_ROLE_MAPPING_MISSING: 422,
    ASSET_ACCOUNT_MISSING: 422,
    UNBALANCED_ENTRY: 422,
  };
  return { statusCode: byCode[error.code] ?? 400, body: { error: error.code, message: error.message, details: error.details ?? null } };
}

const paymentFrequency = z.enum(["monthly", "quarterly", "annual"]);
const election = z.enum(["operating", "sales_type"]);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected yyyy-mm-dd");

const createLeaseBody = z.object({
  lessor_operating_company_id: z.string().uuid(),
  lessee_name: z.string().trim().min(1),
  lessee_customer_id: z.string().uuid().optional().nullable(),
  lessee_operating_company_id: z.string().uuid().optional().nullable(),
  display_id: z.string().trim().min(1).optional().nullable(),
  election: election.optional(),
  commencement_date: isoDate,
  end_date: isoDate,
  payment_amount_cents: z.number().int().nonnegative(),
  payment_frequency: paymentFrequency,
  number_of_periods: z.number().int().positive(),
  total_lease_payments_cents: z.number().int().nonnegative(),
  discount_rate_bps: z.number().int().nonnegative().optional().nullable(),
  residual_value_cents: z.number().int().nonnegative().optional(),
  contract_instance_id: z.string().uuid().optional().nullable(),
});
const addAssetBody = z.object({
  fixed_asset_id: z.string().uuid(),
  unit_uuid: z.string().uuid().optional().nullable(),
  allocated_cost_cents: z.number().int().nonnegative().optional().nullable(),
});
const rentalBody = z.object({ lease_contract_id: z.string().uuid(), period_number: z.number().int().positive() });
const saleBody = z.object({ lease_contract_id: z.string().uuid(), disposal_date: isoDate, proceeds_cents: z.number().int().nonnegative() });
const commencementBody = z.object({ lease_contract_id: z.string().uuid() });
const interestBody = z.object({ lease_contract_id: z.string().uuid(), period_number: z.number().int().positive() });
const leaseIdParams = z.object({ lease_id: z.string().uuid() });

export async function registerLeasePostingRoutes(app: FastifyInstance) {
  // ── Subledger lifecycle (data-model writes; no GL posting) ─────────────────────────────────────────
  // Create a lessor lease contract (+ classification). Election defaults to OPERATING (owner lock).
  app.post("/api/v1/accounting/lease-posting/leases", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = ensureFinanceUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);
    const body = createLeaseBody.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    try {
      const result = await createLeaseContract(
        {
          operatingCompanyId: query.data.operating_company_id,
          lessorOperatingCompanyId: body.data.lessor_operating_company_id,
          lesseeName: body.data.lessee_name,
          lesseeCustomerId: body.data.lessee_customer_id ?? null,
          lesseeOperatingCompanyId: body.data.lessee_operating_company_id ?? null,
          displayId: body.data.display_id ?? null,
          election: body.data.election,
          commencementDate: body.data.commencement_date,
          endDate: body.data.end_date,
          paymentAmountCents: body.data.payment_amount_cents,
          paymentFrequency: body.data.payment_frequency,
          numberOfPeriods: body.data.number_of_periods,
          totalLeasePaymentsCents: body.data.total_lease_payments_cents,
          discountRateBps: body.data.discount_rate_bps ?? null,
          residualValueCents: body.data.residual_value_cents,
          contractInstanceId: body.data.contract_instance_id ?? null,
        },
        { userId: user.uuid }
      );
      return reply.code(201).send(result);
    } catch (error) {
      if (error instanceof LeasePostingError) {
        const m = mapError(error);
        return reply.code(m.statusCode).send(m.body);
      }
      throw error;
    }
  });

  // Attach a leased asset (FK fixed_assets + unit) to a contract.
  app.post("/api/v1/accounting/lease-posting/leases/:lease_id/assets", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = ensureFinanceUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);
    const params = leaseIdParams.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const body = addAssetBody.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    try {
      const result = await addLeaseAsset(
        {
          operatingCompanyId: query.data.operating_company_id,
          leaseContractId: params.data.lease_id,
          fixedAssetId: body.data.fixed_asset_id,
          unitUuid: body.data.unit_uuid ?? null,
          allocatedCostCents: body.data.allocated_cost_cents ?? null,
        },
        { userId: user.uuid }
      );
      return reply.code(201).send(result);
    } catch (error) {
      if (error instanceof LeasePostingError) {
        const m = mapError(error);
        return reply.code(m.statusCode).send(m.body);
      }
      throw error;
    }
  });

  // Generate (or regenerate) the period schedule from the contract totals.
  app.post("/api/v1/accounting/lease-posting/leases/:lease_id/schedule", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = ensureFinanceUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);
    const params = leaseIdParams.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    try {
      const result = await generateScheduleForLease(
        { operatingCompanyId: query.data.operating_company_id, leaseContractId: params.data.lease_id },
        { userId: user.uuid }
      );
      return reply.code(200).send(result);
    } catch (error) {
      if (error instanceof LeasePostingError) {
        const m = mapError(error);
        return reply.code(m.statusCode).send(m.body);
      }
      throw error;
    }
  });

  // Activate a lease (draft -> active) and post period-1 ASC 842 operating entries when flag ON.
  app.post("/api/v1/accounting/lease-posting/leases/:lease_id/activate", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = ensureFinanceUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);
    const params = leaseIdParams.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    try {
      await activateLease(
        { operatingCompanyId: query.data.operating_company_id, leaseContractId: params.data.lease_id },
        { userId: user.uuid }
      );
      const activation = await postOperatingActivationEntries(
        { operatingCompanyId: query.data.operating_company_id, leaseContractId: params.data.lease_id },
        { userId: user.uuid }
      );
      return reply.code(200).send({
        lease_contract_id: params.data.lease_id,
        status: "active",
        activation,
      });
    } catch (error) {
      if (error instanceof LeasePostingError) {
        const m = mapError(error);
        return reply.code(m.statusCode).send(m.body);
      }
      throw error;
    }
  });

  // READ-ONLY lease detail: contract + asset lines + schedule (forward/reverse connectivity view).
  app.get("/api/v1/accounting/lease-posting/leases/:lease_id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = ensureFinanceUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);
    const params = leaseIdParams.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const opco = query.data.operating_company_id;
    const detail = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      const contract = await client.query(
        `SELECT id::text, display_id, election, status, commencement_date::text, end_date::text,
                payment_amount_cents::text, payment_frequency, number_of_periods,
                total_lease_payments_cents::text, commencement_je_id::text
           FROM accounting.lease_contract
          WHERE operating_company_id = $1::uuid AND id = $2::uuid LIMIT 1`,
        [opco, params.data.lease_id]
      );
      if (contract.rows.length === 0) return null;
      const assets = await client.query(
        `SELECT lal.id::text, lal.fixed_asset_id::text, lal.unit_uuid::text, lal.allocated_cost_cents::text,
                fa.asset_number, fa.name AS fixed_asset_name, u.unit_number
           FROM accounting.lease_asset_line lal
           LEFT JOIN accounting.fixed_assets fa
             ON fa.id = lal.fixed_asset_id AND fa.operating_company_id = lal.operating_company_id
           LEFT JOIN mdata.units u
             ON u.id = lal.unit_uuid AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = lal.operating_company_id
          WHERE lal.operating_company_id = $1::uuid AND lal.lease_contract_id = $2::uuid AND lal.is_active = true
          ORDER BY lal.created_at ASC`,
        [opco, params.data.lease_id]
      );
      const schedule = await client.query(
        `SELECT period_number, period_date::text, payment_cents::text, rental_income_cents::text,
                interest_cents::text, principal_cents::text, receivable_balance_cents::text,
                posted, posted_journal_entry_id::text
           FROM accounting.lease_schedule_period
          WHERE operating_company_id = $1::uuid AND lease_contract_id = $2::uuid AND is_active = true
          ORDER BY period_number ASC`,
        [opco, params.data.lease_id]
      );
      return { contract: contract.rows[0], assets: assets.rows, schedule: schedule.rows };
    });
    if (!detail) {
      return reply.code(404).send({
        error: "LEASE_NOT_FOUND",
        message: "Lease not found for this operating company.",
      });
    }
    return reply.code(200).send(detail);
  });

  // ── GL posting (flag-gated; OFF => { result: "skipped_flag_off" }, zero JEs) ───────────────────────
  // OPERATING — post one period's rental income (Dr cash-like / Cr rental_income).
  app.post("/api/v1/accounting/lease-posting/operating/rental", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = ensureFinanceUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);
    const body = rentalBody.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    try {
      const result = await postOperatingRentalPeriod(
        { operatingCompanyId: query.data.operating_company_id, leaseContractId: body.data.lease_contract_id, periodNumber: body.data.period_number },
        { userId: user.uuid }
      );
      return reply.code(result.result === "posted" ? 201 : 200).send(result);
    } catch (error) {
      if (error instanceof LeasePostingError) {
        const m = mapError(error);
        return reply.code(m.statusCode).send(m.body);
      }
      throw error;
    }
  });

  // OPERATING — post the end-of-term SALE (reuses accounting.fixed_asset_disposals).
  app.post("/api/v1/accounting/lease-posting/operating/end-of-term-sale", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = ensureFinanceUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);
    const body = saleBody.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    try {
      const result = await postOperatingEndOfTermSale(
        { operatingCompanyId: query.data.operating_company_id, leaseContractId: body.data.lease_contract_id, disposalDate: body.data.disposal_date, proceedsCents: body.data.proceeds_cents },
        { userId: user.uuid }
      );
      return reply.code(result.result === "posted" ? 201 : 200).send(result);
    } catch (error) {
      if (error instanceof LeasePostingError) {
        const m = mapError(error);
        return reply.code(m.statusCode).send(m.body);
      }
      throw error;
    }
  });

  // SALES-TYPE — post commencement (derecognition + lease receivable + selling P/L).
  app.post("/api/v1/accounting/lease-posting/sales-type/commencement", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = ensureFinanceUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);
    const body = commencementBody.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    try {
      const result = await postSalesTypeCommencement(
        { operatingCompanyId: query.data.operating_company_id, leaseContractId: body.data.lease_contract_id },
        { userId: user.uuid }
      );
      return reply.code(result.result === "posted" ? 201 : 200).send(result);
    } catch (error) {
      if (error instanceof LeasePostingError) {
        const m = mapError(error);
        return reply.code(m.statusCode).send(m.body);
      }
      throw error;
    }
  });

  // SALES-TYPE — post one period (Dr cash / Cr lease receivable principal / Cr interest_income).
  app.post("/api/v1/accounting/lease-posting/sales-type/interest", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = ensureFinanceUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);
    const body = interestBody.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    try {
      const result = await postSalesTypeInterestPeriod(
        { operatingCompanyId: query.data.operating_company_id, leaseContractId: body.data.lease_contract_id, periodNumber: body.data.period_number },
        { userId: user.uuid }
      );
      return reply.code(result.result === "posted" ? 201 : 200).send(result);
    } catch (error) {
      if (error instanceof LeasePostingError) {
        const m = mapError(error);
        return reply.code(m.statusCode).send(m.body);
      }
      throw error;
    }
  });
}

export default fp(async (app) => {
  await registerLeasePostingRoutes(app);
}, { name: "accounting.registerLeasePostingRoutes" });
