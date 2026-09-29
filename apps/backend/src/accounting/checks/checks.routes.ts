// R-154 §4 — core CRUD routes for the check engine (PR 3/7).
//
// A Check IS an accounting.expenses row with payment_type='check' (Lead's R-154 §2 architecture
// ruling) -- there is no parallel document table. This file creates/lists/reads exactly that row +
// its accounting.expense_lines, using the payee and account resolvers from PR 2/7
// (check-payee.service.ts / check-account-rules.service.ts) for every write. Posting reuses the
// EXISTING 'expense' source type in posting-engine.service.ts untouched -- buildExpenseLines already
// credits accounting.expenses.payment_account_uuid, which this route sets to the check's own bank
// account's ledger_account_id resolution target. No new posting logic.
//
// Scope of this PR: create, list, detail, and the print-queue's next-number lookup. PATCH (edit
// while unprinted), void+reissue, and the print-batch/print-PDF routes are later PRs (4-7) per the
// spec's own PR mapping -- not silently rolled in here.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "../shared.js";
import { assertCompanyMembership } from "../../_helpers/company-membership-guard.js";
import { CHECK_PAYEE_KIND_VALUES, resolveCheckPayee } from "./check-payee.service.js";
import { createCheck, CreateCheckConflictError, CheckPayeeError, CheckAccountError } from "./check-create.service.js";
import { assignPrintBatch, confirmPrintBatch, CheckPrintBatchError } from "./check-print-batch.service.js";
import { voidCheck, reissueCheck, unvoidCheck, CheckVoidError } from "./check-void.service.js";
import { upsertCheckStockSettings, getCheckStockSettings, advanceCheckStockAfterUse, CheckStockError } from "./check-stock.service.js";
import { resolveDriverVendorLink, DriverVendorMissingError } from "../driver-vendor-link.service.js";
import { applyVendorBillPaymentBatch, type VendorBillPaymentBatchInput } from "../vendor-bill-payments.routes.js";
import { withLuciaBypass } from "../../auth/db.js";

function accountingRoles(role: string) {
  return ["Owner", "Administrator", "Accountant"].includes(role);
}

const checkLineSchema = z
  .object({
    line_kind: z.enum(["category", "item"]),
    category_kind: z.string().trim().min(1).optional().nullable(),
    category_code: z.string().trim().min(1).optional().nullable(),
    item_id: z.string().uuid().optional().nullable(),
    amount_cents: z.number().int().positive(),
    description: z.string().trim().max(500).optional().nullable(),
    billable_customer_uuid: z.string().uuid().optional().nullable(),
    load_id: z.string().uuid().optional().nullable(),
    // R-172 step 3 -- per-line fleet linkage columns (spec's category-grid columns), additive on
    // accounting.expense_lines (202614360000). Omitted/null falls back to the check header's own
    // driver_id/unit_id/trailer_id/linked_work_order_uuid in the service layer.
    driver_id: z.string().uuid().optional().nullable(),
    unit_id: z.string().uuid().optional().nullable(),
    trailer_id: z.string().uuid().optional().nullable(),
    linked_work_order_uuid: z.string().uuid().optional().nullable(),
    // R-172 step 4 -- item grid Qty/Rate (spec + R-83 owner ruling "amount = qty x rate, computed,
    // never typed", already enforced by accounting.expense_lines_item_qty_rate_amount_check). Required
    // together for an item line; amount_cents is recomputed server-side from these, never trusted.
    quantity: z.number().positive().max(999999).optional().nullable(),
    rate_cents: z.number().positive().optional().nullable(),
    unit_of_measure: z
      .string()
      .trim()
      .regex(/^[a-z][a-z_]*$/, "unit_of_measure must be lowercase snake_case")
      .optional()
      .nullable(),
  })
  .superRefine((line, ctx) => {
    if (line.line_kind === "category" && (!line.category_kind || !line.category_code)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "category_kind and category_code are required for a category line" });
    }
    if (line.line_kind === "item") {
      if (!line.item_id) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "item_id is required for an item line" });
      }
      if (!(line.quantity && line.quantity > 0) || !(line.rate_cents && line.rate_cents > 0)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "quantity and rate_cents are required for an item line (amount is computed, never typed)" });
      }
    }
  });

const createCheckBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  bank_account_id: z.string().uuid(),
  payee_kind: z.enum(CHECK_PAYEE_KIND_VALUES as [string, ...string[]]),
  payee_id: z.string().uuid(),
  check_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "check_date must be YYYY-MM-DD"),
  print_later: z.boolean(),
  // Required unless print_later -- the owner-typed number, never guessed (spec §3).
  check_number: z.string().trim().min(1).max(21).optional().nullable(),
  memo: z.string().trim().max(500).optional().nullable(),
  // Header linkage (spec §6 / R-154.1 §C) -- optional here; per-category required/optional
  // enforcement is a guard-assertion concern (PR 7/7, spec §E items 9-13), not a create-time 400.
  unit_id: z.string().uuid().optional().nullable(),
  trailer_id: z.string().uuid().optional().nullable(),
  driver_id: z.string().uuid().optional().nullable(),
  load_id: z.string().uuid().optional().nullable(),
  linked_work_order_uuid: z.string().uuid().optional().nullable(),
  insurance_claim_id: z.string().uuid().optional().nullable(),
  legal_matter_id: z.string().uuid().optional().nullable(),
  class_id: z.string().uuid().optional().nullable(),
  recover_from_driver: z.boolean().optional(),
  // R-172 step 2 -- QBO Write Check's Tags field; additive accounting.expenses.tags column.
  tags: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  // R-172 step 6 -- footer Attachments (docs.files), Option B draft-attachment reconcile.
  attachment_draft_id: z.string().uuid().optional().nullable(),
  // R-172 step 2 -- "the payee's mailing address auto-fills and stays editable": the operator's
  // edited copy, if any. Omitted/null means "use the payee's resolved address as-is."
  remit_to_address: z
    .object({
      address_line1: z.string().trim().max(200).nullable().optional(),
      address_line2: z.string().trim().max(200).nullable().optional(),
      city: z.string().trim().max(120).nullable().optional(),
      state: z.string().trim().max(60).nullable().optional(),
      postal_code: z.string().trim().max(20).nullable().optional(),
      country: z.string().trim().max(60).nullable().optional(),
    })
    .optional()
    .nullable(),
  lines: z.array(checkLineSchema).min(1),
});

const CHECK_ACCOUNT_ERROR_HTTP: Record<string, number> = {
  BANK_ACCOUNT_NOT_FOUND: 404,
  BANK_ACCOUNT_NOT_DEPOSITORY: 400,
  BANK_ACCOUNT_INACTIVE: 400,
  BANK_ACCOUNT_UNMAPPED: 409,
  CATEGORY_INCOMPLETE: 400,
  CATEGORY_KIND_INVALID: 400,
  CATEGORY_UNMAPPED: 409,
  ITEM_NOT_FOUND: 404,
  ITEM_ACCOUNT_UNMAPPED: 409,
  LINE_KIND_INVALID: 400,
  FORBIDDEN_ACCOUNT_TYPE: 400,
  ACCOUNT_NOT_POSTABLE: 400,
  ACCOUNT_NOT_FOUND: 404,
  DRIVER_ADVANCE_IS_A_BILL_PAYMENT: 409,
  CHECK_NUMBER_REQUIRED: 400,
  TOTAL_MUST_BE_POSITIVE: 400,
  ITEM_QTY_RATE_REQUIRED: 400,
};

export async function registerCheckRoutes(app: FastifyInstance) {
  app.post(
    "/api/v1/checks",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      if (!accountingRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

      const parsed = createCheckBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) return validationError(reply, parsed.error);
      const body = parsed.data;

      try {
        await assertCompanyMembership(user.uuid, body.operating_company_id);
        const result = await createCheck(body.operating_company_id, user.uuid, body);
        return reply.code(201).send(result);
      } catch (err) {
        if (err instanceof CreateCheckConflictError) return reply.code(409).send({ error: err.code });
        if (err instanceof CheckPayeeError || err instanceof CheckAccountError) {
          const status = CHECK_ACCOUNT_ERROR_HTTP[err.code] ?? 400;
          return reply.code(status).send({ error: err.code, message: err.message });
        }
        throw err;
      }
    }
  );

  app.get(
    "/api/v1/checks",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      // R-154.1 §D reverse-link surfaces (vendor/driver/customer Transactions tab, unit/trailer cost
      // tab, Load Detail -> Costs) all read through this ONE list query, filtered by the entity in
      // question -- proven live by verify-check-engine.mjs assertion 13 (a reverse-link query for a
      // real linked entity must return the check). Wiring each existing detail page's tab to call
      // this endpoint with its own id is the remaining UI-integration step, not invented here.
      const parsed = companyQuerySchema
        .extend({
          bank_account_id: z.string().uuid().optional(),
          vendor_id: z.string().uuid().optional(),
          driver_id: z.string().uuid().optional(),
          customer_id: z.string().uuid().optional(),
          unit_id: z.string().uuid().optional(),
          trailer_id: z.string().uuid().optional(),
          load_id: z.string().uuid().optional(),
          limit: z.coerce.number().int().min(1).max(200).default(50),
          offset: z.coerce.number().int().min(0).default(0),
        })
        .safeParse(req.query ?? {});
      if (!parsed.success) return validationError(reply, parsed.error);
      const q = parsed.data;

      const rows = await withCompanyScope(user.uuid, q.operating_company_id, async (client) => {
        // e.payment_account_uuid is a catalogs.accounts (GL) id -- join back to banking.bank_accounts
        // via its ledger_account_id to surface/filter by the actual bank account the check is drawn on.
        const res = await client.query(
          `SELECT e.id::text, e.check_number, e.print_status, e.payee_kind, e.print_on_check_name,
                  e.transaction_date, e.total_amount_cents, ba.id::text AS bank_account_id, e.status, e.voided_at
             FROM accounting.expenses e
             JOIN banking.bank_accounts ba ON ba.ledger_account_id = e.payment_account_uuid
            WHERE e.operating_company_id = $1::uuid AND e.payment_type = 'check'
              AND ($2::uuid IS NULL OR ba.id = $2::uuid)
              AND ($5::uuid IS NULL OR e.vendor_uuid = $5::uuid)
              -- e.driver_uuid is the PAYEE driver only; a driver named as a line's attribution (R-172
              -- step 3, e.g. a vendor repair check tagged to driver X's truck) also matches here so the
              -- driver's Transactions tab surfaces every check that names that driver in either role.
              AND ($6::uuid IS NULL OR e.driver_uuid = $6::uuid OR EXISTS (
                    SELECT 1 FROM accounting.expense_lines el WHERE el.expense_id = e.id AND el.driver_id = $6::uuid
                  ))
              AND ($7::uuid IS NULL OR e.payee_customer_uuid = $7::uuid)
              AND ($8::uuid IS NULL OR e.unit_id = $8::uuid OR EXISTS (
                    SELECT 1 FROM accounting.expense_lines el WHERE el.expense_id = e.id AND el.unit_id = $8::uuid
                  ))
              AND ($9::uuid IS NULL OR e.trailer_id = $9::uuid OR EXISTS (
                    SELECT 1 FROM accounting.expense_lines el WHERE el.expense_id = e.id AND el.trailer_id = $9::uuid
                  ))
              AND ($10::uuid IS NULL OR e.load_id = $10::uuid OR EXISTS (
                    SELECT 1 FROM accounting.expense_lines el WHERE el.expense_id = e.id AND el.load_id = $10::uuid
                  ))
            ORDER BY e.transaction_date DESC, e.created_at DESC
            LIMIT $3 OFFSET $4`,
          [
            q.operating_company_id,
            q.bank_account_id ?? null,
            q.limit,
            q.offset,
            q.vendor_id ?? null,
            q.driver_id ?? null,
            q.customer_id ?? null,
            q.unit_id ?? null,
            q.trailer_id ?? null,
            q.load_id ?? null,
          ]
        );
        return res.rows;
      });
      return reply.code(200).send({ rows, limit: q.limit, offset: q.offset });
    }
  );

  app.get(
    "/api/v1/checks/next-number",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      const parsed = companyQuerySchema.extend({ bank_account_id: z.string().uuid() }).safeParse(req.query ?? {});
      if (!parsed.success) return validationError(reply, parsed.error);
      const q = parsed.data;

      const nextNumber = await withCompanyScope(user.uuid, q.operating_company_id, async (client) => {
        const res: { rows: Array<{ next_check_number: string | null }> } = await client.query(
          `SELECT next_check_number::text AS next_check_number
             FROM banking.check_stock_settings
            WHERE bank_account_id = $1::uuid AND operating_company_id = $2::uuid`,
          [q.bank_account_id, q.operating_company_id]
        );
        return res.rows[0]?.next_check_number ?? null;
      });
      // Never guessed (spec §3c) -- null means the owner has not typed a starting number yet.
      return reply.code(200).send({ next_check_number: nextNumber });
    }
  );

  // R-190 — owner types the first real check number (Print Checks / stock settings). Never seeded.
  app.get(
    "/api/v1/checks/stock-settings",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      const parsed = companyQuerySchema.extend({ bank_account_id: z.string().uuid() }).safeParse(req.query ?? {});
      if (!parsed.success) return validationError(reply, parsed.error);
      const q = parsed.data;
      const settings = await withCompanyScope(user.uuid, q.operating_company_id, async (client) =>
        getCheckStockSettings(client, q.operating_company_id, q.bank_account_id)
      );
      return reply.code(200).send({ settings });
    }
  );

  const stockSettingsBodySchema = z.object({
    operating_company_id: z.string().uuid(),
    bank_account_id: z.string().uuid(),
    next_check_number: z
      .union([z.string().trim().regex(/^\d+$/), z.null()])
      .refine((v) => v === null || BigInt(v) > 0n, "next_check_number must be a positive integer"),
    check_type: z.enum(["voucher", "standard"]).optional(),
  });

  app.put(
    "/api/v1/checks/stock-settings",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      if (!accountingRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
      const parsed = stockSettingsBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) return validationError(reply, parsed.error);
      const body = parsed.data;
      try {
        await assertCompanyMembership(user.uuid, body.operating_company_id);
        const settings = await withLuciaBypass(async (client) => {
          await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [body.operating_company_id]);
          return upsertCheckStockSettings(client, {
            operating_company_id: body.operating_company_id,
            bank_account_id: body.bank_account_id,
            next_check_number: body.next_check_number,
            check_type: body.check_type,
            actor_user_id: user.uuid,
          });
        });
        return reply.code(200).send({ settings });
      } catch (err) {
        if (err instanceof CheckStockError) {
          const status = err.code === "BANK_ACCOUNT_NOT_FOUND" ? 404 : 400;
          return reply.code(status).send({ error: err.code, message: err.message });
        }
        throw err;
      }
    }
  );

  // R-172 step 6 -- "warn on a duplicate check number for the same bank account" (spec §6). A LIVE
  // advisory as the operator types, distinct from the hard 409 the check_number_registry UNIQUE
  // constraint still throws at actual save -- this just lets the form show the warning before that
  // point. Checks against the SAME registry every check (category/item AND bill-payment, step 5)
  // reserves into, so it catches both shapes.
  app.get(
    "/api/v1/checks/check-number-status",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      const parsed = companyQuerySchema
        .extend({ bank_account_id: z.string().uuid(), check_number: z.string().trim().min(1) })
        .safeParse(req.query ?? {});
      if (!parsed.success) return validationError(reply, parsed.error);
      const q = parsed.data;

      const inUse = await withCompanyScope(user.uuid, q.operating_company_id, async (client) => {
        const res = await client.query(
          `SELECT 1 FROM banking.check_number_registry
            WHERE operating_company_id = $1::uuid AND bank_account_id = $2::uuid AND check_number = $3
            LIMIT 1`,
          [q.operating_company_id, q.bank_account_id, q.check_number]
        );
        return res.rows.length > 0;
      });
      return reply.code(200).send({ in_use: inUse });
    }
  );

  // R-172 step 2 -- live payee preview so the Write Check header can auto-fill print_on_check_name
  // and a mailing address the operator can still edit BEFORE saving. Read-only wrapper over PR 2/7's
  // resolveCheckPayee() -- no new resolution logic.
  app.get(
    "/api/v1/checks/resolve-payee",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      const parsed = companyQuerySchema
        .extend({ payee_kind: z.enum(CHECK_PAYEE_KIND_VALUES as [string, ...string[]]), payee_id: z.string().uuid() })
        .safeParse(req.query ?? {});
      if (!parsed.success) return validationError(reply, parsed.error);
      const q = parsed.data;
      try {
        await assertCompanyMembership(user.uuid, q.operating_company_id);
        const payee = await resolveCheckPayee(q.operating_company_id, q.payee_kind, q.payee_id);
        // R-172 step 5 -- "the payee's open bills" (spec §5) are accounting.bills rows keyed by an
        // mdata.vendors id. A vendor payee's own id already IS that key; a driver payee is billed
        // through the driver's OWN A/P vendor bridge (the same one the settlement engine posts
        // driver pay through -- driver-vendor-link.service.ts's resolveDriverVendorLink, reused
        // verbatim, no new resolution). Customer/employee payees have no bills to pay this way -- null.
        let vendorIdForBills: string | null = null;
        if (q.payee_kind === "vendor") {
          vendorIdForBills = q.payee_id;
        } else if (q.payee_kind === "driver") {
          vendorIdForBills = await withCompanyScope(user.uuid, q.operating_company_id, async (client) => {
            try {
              const link = await resolveDriverVendorLink(client, q.operating_company_id, q.payee_id);
              return link.vendorId;
            } catch (err) {
              if (err instanceof DriverVendorMissingError) return null;
              throw err;
            }
          });
        }
        return reply.code(200).send({ ...payee, vendor_id_for_bills: vendorIdForBills });
      } catch (err) {
        if (err instanceof CheckPayeeError) return reply.code(404).send({ error: err.code, message: err.message });
        throw err;
      }
    }
  );

  // R-172 step 5 -- "adding a bill turns the check into a Bill Payment (Check)" (spec §5, owner rule
  // "advances are bill payments"). This does NOT create an accounting.expenses row at all -- a Bill
  // Payment is a genuinely different document (accounting.bill_payments, Dr A/P / Cr bank), so it
  // reuses vendor-bill-payments.routes.ts's own real engine (applyVendorBillPaymentBatch, extracted
  // from that file's POST /:id/bill-payments handler) rather than forcing it through createCheck()'s
  // expense-line posting path. The check number is reserved in the SAME banking.check_number_registry
  // every other check draws from (source_kind='bill_payment', the value this table was designed to
  // carry from PR 1/7 onward) so duplicate-number protection covers both check shapes on one bank
  // account. Print-later is intentionally NOT supported here yet -- the underlying engine
  // (vendor-bill-payments.routes.ts) has never supported it either; extending that is a further,
  // separate enhancement of an existing route, not invented in this step.
  const payBillsBodySchema = z.object({
    operating_company_id: z.string().uuid(),
    payee_kind: z.enum(["vendor", "driver"]),
    payee_id: z.string().uuid(),
    bank_account_id: z.string().uuid(),
    check_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "check_date must be YYYY-MM-DD"),
    check_number: z.string().trim().min(1).max(21),
    memo: z.string().trim().max(2000).optional().nullable(),
    applications: z
      .array(z.object({ bill_id: z.string().uuid(), amount_cents: z.number().int().positive() }))
      .min(1),
  });

  app.post(
    "/api/v1/checks/pay-bills",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      if (!accountingRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

      const parsed = payBillsBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) return validationError(reply, parsed.error);
      const body = parsed.data;
      await assertCompanyMembership(user.uuid, body.operating_company_id);

      let vendorId: string;
      if (body.payee_kind === "vendor") {
        vendorId = body.payee_id;
      } else {
        try {
          vendorId = await withCompanyScope(user.uuid, body.operating_company_id, (client) =>
            resolveDriverVendorLink(client, body.operating_company_id, body.payee_id).then((l) => l.vendorId)
          );
        } catch (err) {
          if (err instanceof DriverVendorMissingError) {
            return reply.code(409).send({ error: "DRIVER_VENDOR_MISSING", message: err.message });
          }
          throw err;
        }
      }

      const totalCents = body.applications.reduce((sum, a) => sum + a.amount_cents, 0);

      const result = await withCompanyScope(user.uuid, body.operating_company_id, async (client) => {
        try {
          await client.query(
            `INSERT INTO banking.check_number_registry
               (operating_company_id, bank_account_id, check_number, source_kind, status, amount_cents, payee_label, created_by_user_id)
             VALUES ($1::uuid, $2::uuid, $3, 'bill_payment', 'issued', $4, $5, $6::uuid)`,
            [body.operating_company_id, body.bank_account_id, body.check_number, totalCents, "Bill payment", user.uuid]
          );
        } catch (err) {
          const message = String((err as { message?: string })?.message ?? "");
          if (/duplicate key|unique constraint/i.test(message)) return { code: 409 as const, error: "CHECK_NUMBER_IN_USE" as const };
          throw err;
        }

        const batchInput: VendorBillPaymentBatchInput = {
          paid_at: body.check_date,
          amount_cents: totalCents,
          payment_method: "check",
          bank_account_id: body.bank_account_id,
          check_number: body.check_number,
          memo: body.memo ?? undefined,
          applications: body.applications,
        };
        const batchResult = await applyVendorBillPaymentBatch(client, body.operating_company_id, vendorId, user.uuid, batchInput);
        if ("error" in batchResult) return batchResult;

        await client.query(
          `UPDATE banking.check_number_registry SET source_id = $1::uuid
             WHERE operating_company_id = $2::uuid AND bank_account_id = $3::uuid AND check_number = $4 AND source_kind = 'bill_payment'`,
          [batchResult.data.payment_batch_id, body.operating_company_id, body.bank_account_id, body.check_number]
        );
        await advanceCheckStockAfterUse(client, {
          operating_company_id: body.operating_company_id,
          bank_account_id: body.bank_account_id,
          used_check_number: body.check_number,
          actor_user_id: user.uuid,
        });
        return batchResult;
      });

      if ("error" in result) return reply.code(result.code).send({ error: result.error });
      return reply.code(result.code).send(result.data);
    }
  );

  app.get(
    "/api/v1/checks/:id",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      const paramsSchema = z.object({ id: z.string().uuid() });
      const params = paramsSchema.safeParse(req.params);
      if (!params.success) return validationError(reply, params.error);
      const parsed = companyQuerySchema.safeParse(req.query ?? {});
      if (!parsed.success) return validationError(reply, parsed.error);
      const q = parsed.data;

      const result = await withCompanyScope(user.uuid, q.operating_company_id, async (client) => {
        const checkRes = await client.query(
          `SELECT e.id::text, e.check_number, e.print_status, e.payee_kind, e.print_on_check_name, e.remit_to_address,
                  e.tags, e.transaction_date, e.total_amount_cents, e.memo, ba.id::text AS bank_account_id,
                  e.vendor_uuid::text AS vendor_uuid, e.driver_uuid::text AS driver_uuid,
                  e.payee_customer_uuid::text AS payee_customer_uuid, e.unit_id::text AS unit_id,
                  e.trailer_id::text AS trailer_id, e.load_id::text AS load_id, e.status, e.voided_at, e.posting_status,
                  e.journal_entry_id::text AS journal_entry_id, e.void_reason, e.voided_by_user_id::text AS voided_by_user_id
             FROM accounting.expenses e
             JOIN banking.bank_accounts ba ON ba.ledger_account_id = e.payment_account_uuid
            WHERE e.id = $1::uuid AND e.operating_company_id = $2::uuid AND e.payment_type = 'check'
            LIMIT 1`,
          [params.data.id, q.operating_company_id]
        );
        const check = checkRes.rows[0];
        if (!check) return { notFound: true as const };
        const linesRes = await client.query(
          `SELECT id::text, line_sequence, amount_cents, description, expense_account_uuid::text AS expense_account_uuid,
                  item_id::text AS item_id, billable_customer_uuid::text AS billable_customer_uuid, load_id::text AS load_id,
                  driver_id::text AS driver_id, unit_id::text AS unit_id, trailer_id::text AS trailer_id,
                  linked_work_order_uuid::text AS linked_work_order_uuid,
                  quantity, rate_cents, unit_of_measure
             FROM accounting.expense_lines
            WHERE expense_id = $1::uuid
            ORDER BY line_sequence ASC`,
          [params.data.id]
        );
        return { check, lines: linesRes.rows };
      });

      if ("notFound" in result) return reply.code(404).send({ error: "check_not_found" });
      return reply.code(200).send(result);
    }
  );

  // R-154 §4 (PR 5/7) -- check-number registry + print-batch assignment/confirm.
  app.get(
    "/api/v1/checks/print-queue",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      const parsed = companyQuerySchema.extend({ bank_account_id: z.string().uuid() }).safeParse(req.query ?? {});
      if (!parsed.success) return validationError(reply, parsed.error);
      const q = parsed.data;

      const rows = await withCompanyScope(user.uuid, q.operating_company_id, async (client) => {
        const res = await client.query(
          `SELECT e.id::text, e.print_on_check_name, e.transaction_date, e.total_amount_cents, e.memo
             FROM accounting.expenses e
             JOIN banking.bank_accounts ba ON ba.ledger_account_id = e.payment_account_uuid
            WHERE e.operating_company_id = $1::uuid AND e.payment_type = 'check' AND e.print_status = 'need_to_print'
              AND ba.id = $2::uuid AND e.voided_at IS NULL
            ORDER BY e.created_at ASC`,
          [q.operating_company_id, q.bank_account_id]
        );
        return res.rows;
      });
      return reply.code(200).send({ rows });
    }
  );

  const printBatchBodySchema = z.object({
    operating_company_id: z.string().uuid(),
    bank_account_id: z.string().uuid(),
    check_type: z.enum(["voucher", "standard"]),
    ids: z.array(z.string().uuid()).min(1),
  });

  app.post(
    "/api/v1/checks/print-batch",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      if (!accountingRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
      const parsed = printBatchBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) return validationError(reply, parsed.error);
      const body = parsed.data;

      try {
        await assertCompanyMembership(user.uuid, body.operating_company_id);
        const result = await assignPrintBatch(body.operating_company_id, user.uuid, {
          bank_account_id: body.bank_account_id,
          check_type: body.check_type,
          ids: body.ids,
        });
        return reply.code(201).send(result);
      } catch (err) {
        if (err instanceof CheckPrintBatchError) {
          const status =
            err.code === "CHECK_STOCK_NOT_INITIALIZED" ? 409 : err.code === "CHECK_NOT_FOUND" ? 404 : 400;
          return reply.code(status).send({ error: err.code, message: err.message });
        }
        throw err;
      }
    }
  );

  const confirmPrintBatchBodySchema = z.object({
    operating_company_id: z.string().uuid(),
    all_ok: z.boolean().optional(),
    reprint_from_number: z.string().trim().min(1).optional(),
  });

  app.post(
    "/api/v1/checks/print-batch/:id/confirm",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      if (!accountingRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
      const paramsSchema = z.object({ id: z.string().uuid() });
      const params = paramsSchema.safeParse(req.params);
      if (!params.success) return validationError(reply, params.error);
      const parsed = confirmPrintBatchBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) return validationError(reply, parsed.error);
      const body = parsed.data;
      if (!body.all_ok && !body.reprint_from_number) {
        return reply.code(400).send({ error: "confirm_requires_all_ok_or_reprint_from_number" });
      }

      try {
        await assertCompanyMembership(user.uuid, body.operating_company_id);
        const result = await confirmPrintBatch(
          body.operating_company_id,
          user.uuid,
          params.data.id,
          body.all_ok ? { all_ok: true } : { reprint_from_number: body.reprint_from_number as string }
        );
        return reply.code(200).send(result);
      } catch (err) {
        if (err instanceof CheckPrintBatchError) {
          const status = err.code === "PRINT_BATCH_NOT_FOUND" ? 404 : 409;
          return reply.code(status).send({ error: err.code, message: err.message });
        }
        throw err;
      }
    }
  );

  // R-154 §1/§4 (PR 6/7) -- void + reissue. Reuses void-document.service.ts's dispatcher, no new
  // reversal engine.
  const voidCheckBodySchema = z.object({
    operating_company_id: z.string().uuid(),
    reason: z.string().trim().min(1).max(500),
  });

  app.post(
    "/api/v1/checks/:id/void",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      if (!accountingRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
      const paramsSchema = z.object({ id: z.string().uuid() });
      const params = paramsSchema.safeParse(req.params);
      if (!params.success) return validationError(reply, params.error);
      const parsed = voidCheckBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) return validationError(reply, parsed.error);
      const body = parsed.data;

      try {
        await assertCompanyMembership(user.uuid, body.operating_company_id);
        const result = await voidCheck(body.operating_company_id, user.uuid, params.data.id, body.reason);
        return reply.code(200).send(result);
      } catch (err) {
        if (err instanceof CheckVoidError) {
          const status = err.code === "CHECK_NOT_FOUND" ? 404 : 409;
          return reply.code(status).send({ error: err.code, message: err.message });
        }
        throw err;
      }
    }
  );

  const unvoidCheckBodySchema = z.object({
    operating_company_id: z.string().uuid(),
    reason: z.string().trim().min(1).max(500),
  });

  app.post(
    "/api/v1/checks/:id/unvoid",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      if (!accountingRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
      const paramsSchema = z.object({ id: z.string().uuid() });
      const params = paramsSchema.safeParse(req.params);
      if (!params.success) return validationError(reply, params.error);
      const parsed = unvoidCheckBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) return validationError(reply, parsed.error);
      const body = parsed.data;

      try {
        await assertCompanyMembership(user.uuid, body.operating_company_id);
        const result = await unvoidCheck(body.operating_company_id, user.uuid, params.data.id, body.reason);
        return reply.code(200).send(result);
      } catch (err) {
        if (err instanceof CheckVoidError) {
          const status = err.code === "CHECK_NOT_FOUND" ? 404 : 409;
          return reply.code(status).send({ error: err.code, message: err.message });
        }
        throw err;
      }
    }
  );

  const reissueCheckBodySchema = createCheckBodySchema.omit({ lines: true }).extend({
    reason: z.string().trim().min(1).max(500),
    lines: z.array(checkLineSchema).min(1),
  });

  app.post(
    "/api/v1/checks/:id/reissue",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      if (!accountingRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
      const paramsSchema = z.object({ id: z.string().uuid() });
      const params = paramsSchema.safeParse(req.params);
      if (!params.success) return validationError(reply, params.error);
      const parsed = reissueCheckBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) return validationError(reply, parsed.error);
      const { reason, ...rest } = parsed.data;

      try {
        await assertCompanyMembership(user.uuid, rest.operating_company_id);
        const result = await reissueCheck(rest.operating_company_id, user.uuid, params.data.id, reason, rest);
        return reply.code(201).send(result);
      } catch (err) {
        if (err instanceof CreateCheckConflictError) return reply.code(409).send({ error: err.code });
        if (err instanceof CheckVoidError || err instanceof CheckPayeeError || err instanceof CheckAccountError) {
          const status = "code" in err && CHECK_ACCOUNT_ERROR_HTTP[err.code] ? CHECK_ACCOUNT_ERROR_HTTP[err.code] : err instanceof CheckVoidError ? 409 : 400;
          return reply.code(status).send({ error: err.code, message: err.message });
        }
        throw err;
      }
    }
  );
}

// ROUND 224 — cash-flow pattern: named export only. Explicit mount lives in
// apps/backend/src/index.ts (await registerCheckRoutes(app)). Do not restore a
// fastify-plugin default export here: the duplicate-routes static scanner would
// treat it as an autoload twin of the manual mount (boot-crash / gate-red class).
