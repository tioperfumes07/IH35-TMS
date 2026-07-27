import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { resolveAllocation } from "./allocation.js";
import {
  createBill,
  getBillDetail,
  getBillPaymentDetail,
  listBillPayments,
  listBillPaymentsForBill,
  listBills,
  listWorkOrderLinkedFinancials,
  listClaimLinkedFinancials,
  listUnitLinkedFinancials,
  listVendorBalances,
  payBill,
  voidBill,
  voidBillPayment,
} from "./bills.service.js";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { emitAccountingSpineEvent } from "./accounting-spine-emit.js";
import { requireVoidCancelExecutor } from "../lib/authz/void-cancel-authz.js";

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
  has_balance: z.coerce.boolean().optional(),
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

const createBillLineSchema = z.object({
  account_id: z.string().uuid().optional().nullable(),
  amount_cents: z.coerce.number().int().positive(),
  description: z.string().trim().max(2000).optional().nullable(),
  section: z.enum(["A", "B"]).optional(),
  expense_category_uuid: z.string().uuid().optional().nullable(),
  service_item_uuid: z.string().uuid().optional().nullable(),
  category_kind: z.string().trim().max(120).optional().nullable(),
  category_code: z.string().trim().max(120).optional().nullable(),
  load_id: z.string().uuid().optional().nullable(),
});

const createBillBodySchema = z.object({
  vendor_id: z.string().trim().min(1),
  bill_number: z.string().trim().max(200).optional(),
  bill_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  amount_cents: z.coerce.number().int().positive(),
  memo: z.string().trim().max(4000).optional(),
  coa_account_id: z.string().uuid().optional(),
  // HARD cross-module link (maintenance): persist the WO + unit id as a real FK, not just a memo string.
  work_order_id: z.string().uuid().optional().nullable(),
  unit_id: z.string().uuid().optional().nullable(),
  insurance_claim_id: z.string().uuid().optional().nullable(),
  class_id: z.string().uuid().optional().nullable(),
  attachment_draft_id: z.string().uuid().optional().nullable(),
  // LAW-E2E #3167 — vendor Bill create must send real lines (not memo-only). When present, createBill
  // persists accounting.bill_lines in the same txn; empty array fails closed.
  lines: z.array(createBillLineSchema).max(200).optional(),
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
      hasBalance: query.data.has_balance,
    });
    return { rows };
  });

  // Reverse drill-through for the WO↔bill/expense HARD link: list the bills + expenses that FK-reference
  // a given work order. Read-only (SELECT), company-scoped. Powers the WO detail "Linked Bills / Expenses"
  // section — the reverse half of the bidirectional link (forward half = FK persisted on create).
  // rateLimit: CodeQL js/missing-rate-limiting flags authorizing reverse-drill routes.
  app.get(
    "/api/v1/accounting/work-orders/:id/linked-financials",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessAccounting(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const result = await listWorkOrderLinkedFinancials(
      String(user.uuid),
      query.data.operating_company_id,
      params.data.id
    );
    return result;
  });

  // Reverse drill-through for Claim→Bill/Expense/WO (held migration 202607740000).
  app.get(
    "/api/v1/accounting/claims/:id/linked-financials",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessAccounting(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    return listClaimLinkedFinancials(
      String(user.uuid),
      query.data.operating_company_id,
      params.data.id
    );
  });

  // Reverse drill-through for Unit→Bill/Expense (ACCT-F04 / ACCT-LINK-03).
  app.get(
    "/api/v1/accounting/units/:id/linked-financials",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessAccounting(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    return listUnitLinkedFinancials(
      String(user.uuid),
      query.data.operating_company_id,
      params.data.id
    );
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
          workOrderId: body.data.work_order_id,
          unitId: body.data.unit_id,
          insuranceClaimId: body.data.insurance_claim_id,
          classId: body.data.class_id,
          attachmentDraftId: body.data.attachment_draft_id,
          lines: body.data.lines?.map((line) => ({
            accountId: line.account_id,
            amountCents: line.amount_cents,
            description: line.description,
            section: line.section,
            expenseCategoryUuid: line.expense_category_uuid,
            serviceItemUuid: line.service_item_uuid,
            categoryKind: line.category_kind,
            categoryCode: line.category_code,
            loadId: line.load_id,
          })),
        },
        String(user.uuid)
      );
      void withCompanyScope(String(user.uuid), query.data.operating_company_id, (client) =>
        emitAccountingSpineEvent(client, {
          operating_company_id: query.data.operating_company_id,
          actor_user_id: String(user.uuid),
          event_type: "bill.created",
          entity_id: (bill as { id?: string })?.id ?? "",
          entity_type: "bill",
          source_table: "accounting.bills",
        })
      ).catch((err) =>
        req.log.warn(
          { err, bill_id: (bill as { id?: string })?.id ?? null, company_id: query.data.operating_company_id },
          "spine_emit_bill_created_failed"
        )
      );
      return reply.code(201).send({ bill });
    } catch (error) {
      const message = String((error as Error)?.message ?? "bill_create_failed");
      if (
        message === "bill_amount_must_be_positive" ||
        message === "bill_lines_required" ||
        message === "bill_line_amount_must_be_positive" ||
        message === "bill_lines_amount_mismatch" ||
        message === "bill_line_account_not_in_company"
      ) {
        return reply.code(400).send({ error: message });
      }
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

    // G1-2: assert the caller is a member of the target operating company BEFORE any
    // money mutation. Without this, a client could pay a bill under a company it does not belong to.
    await assertCompanyMembership(String(user.uuid), query.data.operating_company_id);

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
      // P1-BILLPAY-GL: payBill always records the payment + bank decrement; payment.gl_posting reports
      // whether the balanced JE was also posted ("posted") or skipped because the per-entity flag is OFF
      // ("blocked_flag_off") — no silent success, no bill-payment outage for flag-OFF entities.
      void withCompanyScope(String(user.uuid), query.data.operating_company_id, (client) =>
        emitAccountingSpineEvent(client, {
          operating_company_id: query.data.operating_company_id,
          actor_user_id: String(user.uuid),
          event_type: "bill.paid",
          entity_id: params.data.id,
          entity_type: "bill",
          source_table: "accounting.bills",
        })
      ).catch((err) =>
        req.log.warn(
          { err, bill_id: params.data.id, company_id: query.data.operating_company_id },
          "spine_emit_bill_paid_failed"
        )
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
    // Role is enforced inside voidBill (flag-aware): Owner-only when the void engine is OFF,
    // Owner+Accountant when it is ON (VOID-EVERYWHERE PR-2).
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = voidBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    // G1-2: assert the caller is a member of the target operating company BEFORE voiding.
    await assertCompanyMembership(String(user.uuid), query.data.operating_company_id);

    try {
      await voidBill(query.data.operating_company_id, params.data.id, body.data.reason, String(user.uuid), {
        role: user.role,
      });
      void withCompanyScope(String(user.uuid), query.data.operating_company_id, (client) =>
        emitAccountingSpineEvent(client, {
          operating_company_id: query.data.operating_company_id,
          actor_user_id: String(user.uuid),
          event_type: "bill.voided",
          entity_id: params.data.id,
          entity_type: "bill",
          source_table: "accounting.bills",
          payload: { reason: body.data.reason ?? null },
        })
      ).catch((err) =>
        req.log.warn(
          { err, bill_id: params.data.id, company_id: query.data.operating_company_id },
          "spine_emit_bill_voided_failed"
        )
      );
      return { ok: true };
    } catch (error) {
      const message = String((error as Error)?.message ?? "bill_void_failed");
      if (message === "forbidden_owner_only" || message === "forbidden_void_owner_or_accountant_only") {
        return reply.code(403).send({ error: message });
      }
      if (message === "void_reason_required") return reply.code(400).send({ error: message });
      if (message === "bill_not_found") return reply.code(404).send({ error: message });
      if (message === "bill_already_void") return reply.code(409).send({ error: message });
      if (message === "bill_has_payments_cannot_void") return reply.code(409).send({ error: message });
      throw error;
    }
  });

  app.post("/api/v1/accounting/bill-payments/:id/void", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    // VOID-EVERYWHERE PR-3: replaced the hand-rolled Owner-only gate with the shared executor check
    // (Owner|Administrator|Accountant, Jorge-locked 2026-06-29) — non-executors now file a governed
    // void/cancel request instead of getting a bare 403 with no path forward.
    if (!requireVoidCancelExecutor(reply, String(user.role ?? ""))) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = voidBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    // G1-2: assert the caller is a member of the target operating company BEFORE voiding the payment.
    await assertCompanyMembership(String(user.uuid), query.data.operating_company_id);
    try {
      await voidBillPayment(query.data.operating_company_id, params.data.id, body.data.reason, String(user.uuid));
      void withCompanyScope(String(user.uuid), query.data.operating_company_id, (client) =>
        emitAccountingSpineEvent(client, {
          operating_company_id: query.data.operating_company_id,
          actor_user_id: String(user.uuid),
          event_type: "payment.bill_voided",
          entity_id: params.data.id,
          entity_type: "bill_payment",
          source_table: "accounting.bill_payments",
          payload: { reason: body.data.reason ?? null },
        })
      ).catch((err) =>
        req.log.warn(
          { err, bill_payment_id: params.data.id, company_id: query.data.operating_company_id },
          "spine_emit_bill_payment_voided_failed"
        )
      );
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

  // Law §9 reverse drill-through — must be registered after the list route.
  // rateLimit matches the sibling read route below (/api/v1/vendors/:vendorId/bills): this handler
  // performs its own authorization, and CodeQL js/missing-rate-limiting flags an authorizing route
  // with no limit because it is a cheap credential/enumeration oracle otherwise.
  app.get("/api/v1/accounting/bill-payments/:id", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessAccounting(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const detail = await getBillPaymentDetail(String(user.uuid), query.data.operating_company_id, params.data.id);
    if (!detail) return reply.code(404).send({ error: "bill_payment_not_found" });
    return detail;
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

  // Reverse drill-through: list bills for a specific vendor. Read-only SELECT, company-scoped.
  // Powers the Vendor detail "Bills" tab. Delegates to the same listBills service used by the
  // global /accounting/bills list — the vendor id comes from the path param, not a query param.
  const vendorIdParamSchema = z.object({ vendorId: z.string().uuid() });
  const vendorBillsQuerySchema = companyQuerySchema.extend({
    status: z.enum(["open", "partial", "paid", "voided"]).optional(),
    date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  });
  app.get("/api/v1/vendors/:vendorId/bills", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessAccounting(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const params = vendorIdParamSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = vendorBillsQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);
    const rows = await listBills(String(user.uuid), query.data.operating_company_id, {
      vendorId: params.data.vendorId,
      status: query.data.status,
      fromDate: query.data.date_from,
      toDate: query.data.date_to,
      limit: query.data.limit,
      offset: query.data.offset,
    });
    return { rows };
  });
}


export default fp(async (app) => {
  await registerBillsRoutes(app);
}, { name: "accounting.registerBillsRoutes" });
