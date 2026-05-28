import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { resolveAllocation } from "./allocation.js";
import {
  createBill,
  getBillDetail,
  listBillPayments,
  listBillPaymentsForBill,
  listBills,
  listVendorBalances,
  payBill,
  voidBill,
  voidBillPayment,
} from "./bills.service.js";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";

const idParamsSchema = z.object({
  id: z.string().uuid(),
});

const listVendorBalancesQuerySchema = companyQuerySchema.extend({
  all: z.coerce.boolean().optional().default(false),
  sort: z.enum(["balance_desc", "balance_asc", "vendor_asc"]).optional().default("balance_desc"),
});

const listBillsQuerySchema = companyQuerySchema.extend({
  vendor_id: z.string().trim().min(1).optional(),
  include_balance: z.coerce.boolean().optional(),
  status: z.enum(["open", "partial", "paid", "voided", "unpaid"]).optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const listBillPaymentsQuerySchema = companyQuerySchema.extend({
  vendor_id: z.string().trim().min(1).optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const createBillBodySchema = z.object({
  vendor_id: z.string().trim().min(1),
  bill_number: z.string().trim().max(200).optional(),
  bill_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  amount_cents: z.coerce.number().int().positive(),
  memo: z.string().trim().max(4000).optional(),
  coa_account_id: z.string().uuid().optional(),
});

const payBillBodySchema = z.object({
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount_cents: z.coerce.number().int().positive(),
  payment_method: z.enum(["check", "ach", "wire", "cash", "credit_card"]),
  from_bank_account_id: z.string().uuid().optional(),
  check_number: z.string().trim().max(80).optional(),
  reference_number: z.string().trim().max(120).optional(),
  memo: z.string().trim().max(2000).optional(),
});

const voidBodySchema = z.object({
  reason: z.string().trim().min(3).max(500),
});
const allocateBillBodySchema = z.object({
  method: z.enum(["equal", "by_value", "by_miles", "manual_pct"]),
  asset_ids: z.array(z.string().uuid()).min(1),
  manual_pcts: z.record(z.string(), z.number()).optional(),
  miles: z.record(z.string(), z.number()).optional(),
});
const allocatedCostsQuerySchema = companyQuerySchema.extend({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

function canAccessAccounting(role: string) {
  return role === "Owner" || role === "Administrator" || role === "Accountant";
}

export async function registerBillsRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/vendor-balances", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessAccounting(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const query = listVendorBalancesQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);

    const rows = await listVendorBalances(String(user.uuid), query.data.operating_company_id, {
      includeZero: Boolean(query.data.all),
      sort: query.data.sort,
    });
    return { rows };
  });

  app.get("/api/v1/accounting/bills", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessAccounting(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const query = listBillsQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const rows = await listBills(String(user.uuid), query.data.operating_company_id, {
      vendorId: query.data.vendor_id,
      status: query.data.status === "unpaid" ? "open" : query.data.status,
      fromDate: query.data.date_from,
      toDate: query.data.date_to,
      limit: query.data.limit,
      offset: query.data.offset,
    });
    return { rows };
  });

  app.get("/api/v1/accounting/bills/:id/payments", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessAccounting(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const payments = await listBillPaymentsForBill(String(user.uuid), query.data.operating_company_id, params.data.id);
    if (payments === null) return reply.code(404).send({ error: "bill_not_found" });
    return { payments };
  });

  app.get("/api/v1/accounting/bills/:id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessAccounting(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const detail = await getBillDetail(String(user.uuid), query.data.operating_company_id, params.data.id);
    if (!detail) return reply.code(404).send({ error: "bill_not_found" });
    return detail;
  });

  app.post("/api/v1/accounting/bills", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessAccounting(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = createBillBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    try {
      const bill = await createBill(
        {
          operatingCompanyId: query.data.operating_company_id,
          vendorId: body.data.vendor_id,
          billNumber: body.data.bill_number,
          billDate: body.data.bill_date,
          dueDate: body.data.due_date,
          amountCents: body.data.amount_cents,
          memo: body.data.memo,
          coaAccountId: body.data.coa_account_id,
        },
        String(user.uuid)
      );
      return reply.code(201).send({ bill });
    } catch (error) {
      const message = String((error as Error)?.message ?? "bill_create_failed");
      if (message === "bill_amount_must_be_positive") return reply.code(400).send({ error: message });
      throw error;
    }
  });

  app.post("/api/v1/accounting/bills/:id/pay", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessAccounting(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = payBillBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    try {
      const payment = await payBill(
        {
          operatingCompanyId: query.data.operating_company_id,
          billId: params.data.id,
          paymentDate: body.data.payment_date,
          amountCents: body.data.amount_cents,
          paymentMethod: body.data.payment_method,
          fromBankAccountId: body.data.from_bank_account_id,
          checkNumber: body.data.check_number,
          referenceNumber: body.data.reference_number,
          memo: body.data.memo,
        },
        String(user.uuid)
      );
      return reply.code(201).send({ payment });
    } catch (error) {
      const message = String((error as Error)?.message ?? "bill_payment_failed");
      if (
        message === "bill_not_found" ||
        message === "bill_voided" ||
        message === "bill_already_paid" ||
        message === "check_number_required" ||
        message === "payment_exceeds_remaining_balance" ||
        message === "bank_account_not_found_for_payment"
      ) {
        return reply.code(message === "bill_not_found" ? 404 : 409).send({ error: message });
      }
      throw error;
    }
  });

  app.post("/api/v1/accounting/bills/:id/void", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (String(user.role ?? "") !== "Owner") return reply.code(403).send({ error: "forbidden_owner_only" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = voidBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    try {
      await voidBill(query.data.operating_company_id, params.data.id, body.data.reason, String(user.uuid));
      return { ok: true };
    } catch (error) {
      const message = String((error as Error)?.message ?? "bill_void_failed");
      if (message === "bill_not_found") return reply.code(404).send({ error: message });
      if (message === "bill_has_payments_cannot_void") return reply.code(409).send({ error: message });
      throw error;
    }
  });

  app.post("/api/v1/accounting/bill-payments/:id/void", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (String(user.role ?? "") !== "Owner") return reply.code(403).send({ error: "forbidden_owner_only" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = voidBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    try {
      await voidBillPayment(query.data.operating_company_id, params.data.id, body.data.reason, String(user.uuid));
      return { ok: true };
    } catch (error) {
      const message = String((error as Error)?.message ?? "bill_payment_void_failed");
      if (message === "bill_payment_not_found") return reply.code(404).send({ error: message });
      if (message === "bill_payment_already_voided" || message === "bill_not_found") return reply.code(409).send({ error: message });
      if (message === "bank_account_not_found_for_payment") return reply.code(409).send({ error: message });
      throw error;
    }
  });

  app.get("/api/v1/accounting/bill-payments", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessAccounting(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const query = listBillPaymentsQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const rows = await listBillPayments(String(user.uuid), query.data.operating_company_id, {
      vendorId: query.data.vendor_id,
      dateFrom: query.data.date_from,
      dateTo: query.data.date_to,
      limit: query.data.limit,
      offset: query.data.offset,
    });
    return { rows };
  });

  app.post("/api/v1/accounting/bills/:id/allocate", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessAccounting(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = allocateBillBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    await assertCompanyMembership(String(user.uuid), query.data.operating_company_id);
    const billAllocation = await withCompanyScope(String(user.uuid), query.data.operating_company_id, async (client) => {
      const billRes = await client.query(
        `
          SELECT id, amount_cents
          FROM accounting.bills
          WHERE id = $1
            AND operating_company_id = $2
          LIMIT 1
        `,
        [params.data.id, query.data.operating_company_id]
      );
      const billRow = billRes.rows[0] as { id: string; amount_cents: number | null } | undefined;
      if (!billRow) return { kind: "bill_not_found" as const };
      const billAmountCents = Number(billRow.amount_cents ?? 0);
      if (!Number.isInteger(billAmountCents) || billAmountCents <= 0) {
        return { kind: "bill_amount_invalid" as const };
      }

      const assetIds = Array.from(new Set(body.data.asset_ids));
      const assetsRes = await client.query(
        `
          SELECT id, insured_value_cents
          FROM mdata.assets
          WHERE tenant_id = $1
            AND id = ANY($2::uuid[])
        `,
        [query.data.operating_company_id, assetIds]
      );
      if (assetsRes.rows.length !== assetIds.length) {
        return { kind: "asset_not_found" as const };
      }

      const rows = resolveAllocation(
        body.data.method,
        assetsRes.rows.map((row: { id: string; insured_value_cents: number | null }) => ({
          id: row.id,
          insured_value_cents: row.insured_value_cents,
        })),
        billAmountCents,
        body.data.manual_pcts,
        body.data.miles
      );

      await client.query(`DELETE FROM accounting.bill_unit_allocation WHERE bill_id = $1 AND tenant_id = $2`, [
        params.data.id,
        query.data.operating_company_id,
      ]);

      for (const row of rows) {
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
            query.data.operating_company_id,
            params.data.id,
            row.asset_id,
            row.allocation_method,
            row.allocation_pct,
            row.allocated_amount_cents,
          ]
        );
      }

      return { kind: "ok" as const, rows };
    });

    if (billAllocation.kind === "bill_not_found") return reply.code(404).send({ error: "bill_not_found" });
    if (billAllocation.kind === "bill_amount_invalid") return reply.code(409).send({ error: "bill_amount_invalid_for_allocation" });
    if (billAllocation.kind === "asset_not_found") return reply.code(404).send({ error: "asset_not_found" });
    return { rows: billAllocation.rows };
  });

  app.get("/api/v1/assets/:id/allocated-costs", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessAccounting(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = allocatedCostsQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    await assertCompanyMembership(String(user.uuid), query.data.operating_company_id);
    const payload = await withCompanyScope(String(user.uuid), query.data.operating_company_id, async (client) => {
      const values: unknown[] = [query.data.operating_company_id, params.data.id];
      const where = ["a.tenant_id = $1", "a.asset_id = $2", "b.operating_company_id = $1"];
      if (query.data.from) {
        values.push(query.data.from);
        where.push(`b.bill_date >= $${values.length}::date`);
      }
      if (query.data.to) {
        values.push(query.data.to);
        where.push(`b.bill_date <= $${values.length}::date`);
      }

      const res = await client.query(
        `
          SELECT
            COALESCE(SUM(a.allocated_amount_cents), 0)::bigint AS total_allocated_cents
          FROM accounting.bill_unit_allocation a
          JOIN accounting.bills b ON b.id = a.bill_id
          WHERE ${where.join(" AND ")}
        `,
        values
      );

      return {
        asset_id: params.data.id,
        total_allocated_cents: Number(res.rows[0]?.total_allocated_cents ?? 0),
        from: query.data.from ?? null,
        to: query.data.to ?? null,
      };
    });

    return payload;
  });
}


export default fp(async (app) => {
  await registerBillsRoutes(app);
}, { name: "accounting.registerBillsRoutes" });
