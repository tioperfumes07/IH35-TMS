import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { requireAuth } from "../auth/session-middleware.js";
import { createDriverCashAdvanceCore, resolveCompanyCashAdvanceThresholdDollars } from "./cash-advance-create.js";

const COMPANY_QUERY = z.object({
  operating_company_id: z.string().uuid(),
});

const ID_PARAMS = z.object({
  id: z.string().uuid(),
});

const listQuerySchema = COMPANY_QUERY.extend({
  view: z.enum(["all", "pending_approval", "outstanding", "paid_off"]).optional(),
  status: z.string().trim().optional(),
  search: z.string().trim().optional(),
  // LAW OF THE LAND §9 (2026-07-22): driver profile reverse-link — "View all cash advances" from
  // DriverDetail.tsx / EarningsTab.tsx scopes this list to one driver.
  driver_id: z.string().uuid().optional(),
});

const repaymentScheduleSchema = z.object({
  weekly_installment_amount: z.number().positive(),
  total_periods: z.number().int().min(1).max(104),
  cadence: z.enum(["weekly", "biweekly"]).default("weekly"),
});

const createAdvanceBodySchema = z
  .object({
    driver_id: z.string().uuid(),
    amount: z.number().positive(),
    purpose: z.enum(["fuel_deposit", "border_fee", "family_emergency", "vendor_payment", "lumper", "other"]),
    disbursement_method: z.enum(["direct_bank_transfer", "wire", "comdata", "in_person_check"]),
    recipient_info: z
      .object({
        recipient_type: z.enum(["driver", "vendor", "third_party"]).default("driver"),
        recipient_name: z.string().trim().min(1).max(200).optional(),
        bank_reference: z.string().trim().max(200).optional(),
        notes: z.string().trim().max(1000).optional(),
      })
      .default({ recipient_type: "driver" }),
    linked_bill_id: z.string().uuid().optional(),
    // Optional when recovery_mode=full (server builds single-period schedule) or purpose=lumper (load expense).
    repayment_schedule: repaymentScheduleSchema.optional(),
    // Wizard-depth 2026-07-22 — parity with Book Load cash_advance_recovery_mode + request load_id.
    load_id: z.string().uuid().nullable().optional(),
    unit_id: z.string().uuid().nullable().optional(),
    trailer_id: z.string().uuid().nullable().optional(),
    from_bank_account_id: z.string().uuid().nullable().optional(),
    recovery_mode: z.enum(["full", "amortize"]).default("full"),
    economic_routing: z.enum(["driver_settlement", "load_expense"]).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.purpose === "lumper" && !val.load_id) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["load_id"], message: "load_id required for lumper" });
    }
    if (val.purpose === "fuel_deposit" && (!val.load_id || !val.unit_id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["load_id"],
        message: "fuel_deposit requires load_id and unit_id",
      });
    }
    if (val.disbursement_method === "direct_bank_transfer" && !val.from_bank_account_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["from_bank_account_id"],
        message: "from_bank_account_id required for direct_bank_transfer",
      });
    }
    if (val.purpose !== "lumper" && val.recovery_mode === "amortize" && !val.repayment_schedule) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["repayment_schedule"],
        message: "repayment_schedule required when recovery_mode=amortize",
      });
    }
  });

/** Exported for unit tests (wizard-depth schema contract). */
export const createCashAdvanceBodySchemaForTests = createAdvanceBodySchema;

const markDisbursedBodySchema = z.object({
  disbursement_method: z.enum(["direct_bank_transfer", "wire", "comdata", "in_person_check"]).optional(),
  bank_txn_id: z.string().uuid().optional(),
  comdata_txn_id: z.string().trim().min(1).max(120).optional(),
  check_number: z.string().trim().min(1).max(50).optional(),
  wire_confirmation_ref: z.string().trim().min(1).max(120).optional(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: {
    query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
  }) => Promise<T>
) {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [operatingCompanyId]);
    return fn(client);
  });
}

// LIAB-F9927-SILENT-CATCH-SWEEP (cash-advances leg): 7 of the 8 .catch(() => ({ rows: [] })) sites in
// this file were the same fake-empty-200 class as liabilities.routes.ts (#17110) and the
// banking/factoring/settlements sweep (BANK-F9514-9522) — dashboard/kpis, list, unpaid-bills, the two
// GET /:id reads (advance + deduction schedule), the settlement-history read, and mark-disbursed's
// re-fetch. views.cash_advances_*/driver_finance.* are foundational, not conditionally-created, so a
// caught error was always a real failure, never a legitimate "table doesn't exist yet" case. Letting
// the query throw is the fix — Fastify's async error handling turns it into a proper 500. The 8th site
// (PATCH /:id/reverse's settlement-deduction-count guard) is NOT touched here — it gates a live
// financial write path (a broken guard there currently means the "block reversal after settlement
// deductions" check never fires), already flagged HOLD below as Rule 13 financial law, and routed to
// the board as its own CC-1 finding rather than bundled into this non-financial read-honesty sweep.
export async function registerCashAdvancesRoutes(app: FastifyInstance) {
  app.get("/api/v1/cash-advances/dashboard/kpis", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = COMPANY_QUERY.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;
    const row = await withCompanyScope(user.uuid, companyId, async (client) => {
      const res = await client
        .query(
          `
            SELECT *
            FROM views.cash_advances_dashboard_kpis
            WHERE operating_company_id = $1::uuid
            LIMIT 1
          `,
          [companyId]
        );
      return res.rows[0] ?? null;
    });
    return (
      row ?? {
        operating_company_id: companyId,
        total_outstanding: 0,
        mtd_disbursed: 0,
        pending_approval: 0,
        avg_per_advance: 0,
        drivers_with_active: 0,
      }
    );
  });

  app.get("/api/v1/cash-advances", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = listQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;
    const rows = await withCompanyScope(user.uuid, companyId, async (client) => {
      const where: string[] = ["operating_company_id = $1::uuid"];
      const values: unknown[] = [companyId];
      if (query.data.view === "pending_approval") where.push(`disbursement_status = 'pending_approval'`);
      if (query.data.view === "outstanding") where.push("COALESCE(outstanding_balance, 0) > 0");
      if (query.data.view === "paid_off") where.push("COALESCE(outstanding_balance, 0) <= 0");
      if (query.data.status) {
        values.push(query.data.status);
        where.push(`disbursement_status = $${values.length}`);
      }
      if (query.data.driver_id) {
        values.push(query.data.driver_id);
        where.push(`driver_id = $${values.length}`);
      }
      if (query.data.search) {
        values.push(`%${query.data.search}%`);
        where.push(`(display_id ILIKE $${values.length} OR driver_full_name ILIKE $${values.length} OR purpose ILIKE $${values.length})`);
      }
      const res = await client
        .query(
          `
            SELECT *
            FROM views.cash_advances_with_context
            WHERE ${where.join(" AND ")}
            ORDER BY created_at DESC
            LIMIT 500
          `,
          values
        );
      return res.rows;
    });
    return { advances: rows };
  });

  app.get("/api/v1/cash-advances/unpaid-bills", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = COMPANY_QUERY.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;
    const rows = await withCompanyScope(user.uuid, companyId, async (client) => {
      const res = await client
        .query(
          `
            -- BILL-DISPLAY-ID-01: accounting.bills.display_id is NULL on every row on prod, so the
            -- previous COALESCE(display_id, id::text) resolved to the RAW UUID for every option in
            -- this picker — an operator linking an advance to a bill could not tell two bills apart
            -- except by amount. A bill is a received vendor document: bill_number (the vendor's own
            -- reference) is its correct human identifier, which is why accounting/transaction-register
            -- already reads it first. Never surface display_id or id::text as a human label.
            SELECT b.id,
                   COALESCE(
                     NULLIF(b.bill_number, ''),
                     '— ' || COALESCE(NULLIF(qv.display_name, ''), 'vendor not recorded')
                          || ', ' || COALESCE(b.bill_date::text, 'date not recorded')
                          || ', ' || to_char(COALESCE(b.total_amount, 0), 'FM$999,999,990.00')
                          || ' (no vendor bill number on file)'
                   ) AS display_id,
                   b.vendor_id, b.total_amount, b.status, b.due_date
            FROM accounting.bills b
            LEFT JOIN mdata.qbo_vendors qv
              ON qv.qbo_id = b.vendor_id
             AND qv.operating_company_id = b.operating_company_id
            WHERE b.operating_company_id = $1::uuid
              -- ACCT-F183 class: this picker is named "unpaid-bills" but its actual purpose is
              -- linking a cash advance to a bill that still owes money — a 'partial' bill (paid
              -- some, still has an open balance) belongs here too. Matching only 'unpaid' silently
              -- hid every partially-paid bill from this picker. Measured live before this fix: 526
              -- 'partial' bills prod-wide excluded. 'open'/'partially_paid' included for the same
              -- legacy-spelling reason as bills.service.ts's canonical filter.
              AND b.status IN ('open', 'unpaid', 'partial', 'partially_paid')
              AND COALESCE(b.amount_cents, ROUND(COALESCE(b.total_amount, 0) * 100)) - COALESCE(b.paid_cents, 0) > 0
            ORDER BY b.due_date ASC NULLS LAST, b.created_at DESC
            LIMIT 200
          `,
          [companyId]
        );
      return res.rows;
    });
    return { bills: rows };
  });

  app.get("/api/v1/cash-advances/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = ID_PARAMS.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = COMPANY_QUERY.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;
    const detail = await withCompanyScope(user.uuid, companyId, async (client) => {
      const advanceRes = await client
        .query(
          `
            SELECT *
            FROM views.cash_advances_with_context
            WHERE id = $1
              AND operating_company_id = $2::uuid
            LIMIT 1
          `,
          [params.data.id, companyId]
        );
      const row = advanceRes.rows[0];
      if (!row) return null;
      const scheduleRes = await client
        .query(
          `
            SELECT *
            FROM driver_finance.deduction_schedule
            WHERE liability_id = $1
            ORDER BY created_at DESC
            LIMIT 50
          `,
          [row.liability_id]
        );
      // FIX (Law §9 2026-07-22, GAP not patch): the old query filtered
      // driver_finance.settlement_lines WHERE liability_id = $1 — that column has never existed on
      // settlement_lines (verified: migrations 0191 create + 202607430000 additive columns; only
      // load_id/source_table/source_reference_id/source_id were added, none backfilled). The .catch
      // swallowed the resulting SQL error into an empty array — a silent failure (Rule 16 forbids
      // catch-and-swallow-to-empty). The canonical ledger for a cash-advance repayment deduction is
      // driver_finance.driver_settlement_deductions (deductions.service.ts sourceType
      // "cash_advance_repayment"), which carries driver_id but — confirmed by the deductions.service.ts
      // "TODO B4-B: generic source_reference_id" comment — has NO column linking a row back to the
      // specific driver_advances/driver_liabilities id it repays. So this can only show "settlement
      // deductions recorded for this driver" (driver-level), not "deductions that repaid THIS advance"
      // (advance-level). REMAINING/HOLD: exact per-advance attribution needs the deduction-cap
      // migration block (owner-approved schema + settlement-engine writer change) — separate financial
      // PR, do not invent it here.
      const settlementRes = await client
        .query(
          `
            SELECT applied_to_settlement_id AS settlement_id,
                   (amount_cents::numeric / 100) AS amount,
                   created_at
            FROM driver_finance.driver_settlement_deductions
            WHERE driver_id = $1
              AND deduction_type = 'cash_advance_repayment'
              AND applied_to_settlement_id IS NOT NULL
            ORDER BY created_at DESC
          `,
          [row.driver_id]
        );
      return {
        ...row,
        deduction_schedule: scheduleRes.rows,
        settlement_history: settlementRes.rows,
        settlement_history_is_driver_level: true,
      };
    });
    if (!detail) return reply.code(404).send({ error: "cash_advance_not_found" });
    return detail;
  });

  app.post("/api/v1/cash-advances", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = COMPANY_QUERY.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const body = createAdvanceBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const companyId = query.data.operating_company_id;

    const created = await withCompanyScope(user.uuid, companyId, async (client) => {
      const threshold = await resolveCompanyCashAdvanceThresholdDollars(client, companyId);
      if (body.data.amount > threshold) {
        return {
          code: 403 as const,
          error: "above_policy_owner_approval_required",
          message: "Owner approval required — feature available Phase 4",
        };
      }
      const core = await createDriverCashAdvanceCore(client, user.uuid, companyId, body.data);
      if (!core.ok) {
        return { code: core.code as 400 | 404 | 500, error: core.error, message: core.message };
      }
      return { code: 201 as const, data: core.data };
    });

    if ("error" in created) {
      return reply.code(created.code).send({ error: created.error, message: created.message });
    }
    return reply.code(created.code).send(created.data);
  });

  app.patch("/api/v1/cash-advances/:id/mark-disbursed", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = ID_PARAMS.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = COMPANY_QUERY.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const body = markDisbursedBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const companyId = query.data.operating_company_id;

    const result = await withCompanyScope(user.uuid, companyId, async (client) => {
      const advanceRes = await client.query(
        `
          SELECT *
          FROM driver_finance.driver_advances
          WHERE id = $1
            AND operating_company_id = $2::uuid
          LIMIT 1
        `,
        [params.data.id, companyId]
      );
      const advance = advanceRes.rows[0];
      if (!advance) return { code: 404 as const, error: "cash_advance_not_found" };
      if (String(advance.disbursement_status ?? "") === "reversed") return { code: 400 as const, error: "cash_advance_reversed" };

      const method = body.data.disbursement_method ?? String(advance.disbursement_method ?? "");
      let linkedBillPaymentId: string | null = null;
      if (advance.linked_bill_id) {
        const billPaymentRes = await client.query(
          `
            INSERT INTO accounting.bill_payments (
              operating_company_id,
              bill_id,
              amount,
              payment_method,
              advance_id,
              is_sample_data
            )
            VALUES ($1, $2, $3, $4, $5,
              -- ACCT-F265 — inherit the parent bill's sample flag (see bills.service.ts). A cash advance
              -- settled against a SAMPLE bill must not produce a REAL payment; the driver-advance path
              -- is the one most likely to be exercised with fixture data.
              COALESCE((SELECT b.is_sample_data FROM accounting.bills b WHERE b.id = $2::uuid AND b.operating_company_id = $1::uuid), false))
            RETURNING id
          `,
          [companyId, advance.linked_bill_id, advance.amount, "cash_advance", advance.id]
        );
        linkedBillPaymentId = String(billPaymentRes.rows[0]?.id ?? "");
        await client.query(
          `
            UPDATE accounting.bills
            SET status = 'paid',
                updated_at = now()
            WHERE id = $1
          `,
          [advance.linked_bill_id]
        );
        await appendCrudAudit(
          client,
          user.uuid,
          "cash_advance.bill_payment_linked",
          {
            resource_type: "driver_finance.driver_advances",
            resource_id: String(advance.id),
            operating_company_id: companyId,
            bill_id: String(advance.linked_bill_id),
            bill_payment_id: linkedBillPaymentId,
          },
          "info",
          "BT-3-CASH-ADVANCE-REBUILD"
        );
      }

      if (body.data.bank_txn_id) {
        // ACCT-F5541 — banking.bank_transactions has no `advance_id` column; the real column,
        // following this table's own matched_<entity>_id convention (202612801800), is
        // matched_advance_id.
        await client.query(
          `
            UPDATE banking.bank_transactions
            SET matched_advance_id = $1,
                updated_at = now()
            WHERE id = $2
              AND operating_company_id = $3::uuid
          `,
          [advance.id, body.data.bank_txn_id, companyId]
        );
      }

      await client.query(
        `
          UPDATE driver_finance.driver_advances
          SET disbursement_status = 'disbursed',
              disbursed_at = now(),
              disbursement_method = COALESCE($2, disbursement_method),
              linked_bank_txn_id = COALESCE($3, linked_bank_txn_id),
              linked_bill_payment_id = COALESCE($4, linked_bill_payment_id),
              disbursement_reference = COALESCE($5, disbursement_reference),
              updated_at = now()
          WHERE id = $1
        `,
        [
          advance.id,
          method || null,
          body.data.bank_txn_id ?? null,
          linkedBillPaymentId,
          body.data.comdata_txn_id ?? body.data.check_number ?? body.data.wire_confirmation_ref ?? null,
        ]
      );

      await appendCrudAudit(
        client,
        user.uuid,
        "cash_advance.disbursed",
        {
          resource_type: "driver_finance.driver_advances",
          resource_id: String(advance.id),
          operating_company_id: companyId,
          disbursement_method: method,
          bank_txn_id: body.data.bank_txn_id ?? null,
          linked_bill_payment_id: linkedBillPaymentId,
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
          [advance.id]
        );
      return { code: 200 as const, data: detailRes.rows[0] ?? { id: advance.id, disbursement_status: "disbursed" } };
    });

    if ("error" in result) return reply.code(result.code).send({ error: result.error });
    return result.data;
  });

  app.patch("/api/v1/cash-advances/:id/reverse", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!["Owner", "Admin"].includes(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden_owner_admin_only" });
    const params = ID_PARAMS.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = COMPANY_QUERY.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;

    const result = await withCompanyScope(user.uuid, companyId, async (client) => {
      const advanceRes = await client.query(
        `
          SELECT *
          FROM driver_finance.driver_advances
          WHERE id = $1
            AND operating_company_id = $2::uuid
          LIMIT 1
        `,
        [params.data.id, companyId]
      );
      const advance = advanceRes.rows[0];
      if (!advance) return { code: 404 as const, error: "cash_advance_not_found" };

      // HOLD (Law §9 2026-07-22 — NOT fixed in this PR): this WHERE liability_id = $1 filters
      // driver_finance.settlement_lines, which has never had a liability_id column (same root cause
      // documented on the GET /:id settlement_history query above) — the .catch always swallows a SQL
      // error to rows=[], so cnt is always 0 and this write-path guard never actually blocks a reverse.
      // Left untouched here on purpose: this gates a mutation (cash-advance reversal), and changing a
      // live financial gate's query semantics without owner/CPA review is out of scope for a
      // frontend-linkage PR (Rule 13 financial law). Tracked as REMAINING — needs an explicit backend
      // fix (or the Phase-2 settlement_lines repoint) reviewed as a financial change, not bundled here.
      // Filed on the board 2026-08-28 as CASH-ADV-F9930-REVERSE-GUARD-NEVER-BLOCKS (CC-1 money lane) —
      // this comment predates the finding ID; see docs/audit/GUARD-WORKORDERS.md.
      const settlementUseRes = await client
        .query(
          `
            SELECT COUNT(*)::int AS cnt
            FROM driver_finance.settlement_lines
            WHERE liability_id = $1
          `,
          [advance.liability_id]
        )
        .catch(() => ({ rows: [{ cnt: 0 }] as Record<string, unknown>[] }));
      if (Number(settlementUseRes.rows[0]?.cnt ?? 0) > 0) {
        return { code: 400 as const, error: "cannot_reverse_after_settlement_deductions" };
      }

      await client.query(
        `
          UPDATE driver_finance.driver_advances
          SET disbursement_status = 'reversed',
              updated_at = now()
          WHERE id = $1
        `,
        [advance.id]
      );
      await client.query(
        `
          UPDATE driver_finance.driver_liabilities
          SET current_balance = 0,
              paid_to_date = original_amount
          WHERE id = $1
        `,
        [advance.liability_id]
      );
      await client.query(
        `
          UPDATE driver_finance.deduction_schedule
          SET is_held = true,
              hold_reason = 'Advance reversed',
              updated_at = now()
          WHERE liability_id = $1
        `,
        [advance.liability_id]
      );
      if (advance.linked_bill_payment_id) {
        await client.query(
          `
            UPDATE accounting.bill_payments
            SET status = 'void',
                updated_at = now()
            WHERE id = $1
          `,
          [advance.linked_bill_payment_id]
        );
        if (advance.linked_bill_id) {
          await client.query(
            `
              UPDATE accounting.bills
              SET status = 'unpaid',
                  updated_at = now()
              WHERE id = $1
            `,
            [advance.linked_bill_id]
          );
        }
      }
      await appendCrudAudit(
        client,
        user.uuid,
        "cash_advance.reversed",
        {
          resource_type: "driver_finance.driver_advances",
          resource_id: String(advance.id),
          operating_company_id: companyId,
          liability_id: String(advance.liability_id ?? ""),
        },
        "warning",
        "BT-3-CASH-ADVANCE-REBUILD"
      );
      return { code: 200 as const, data: { ok: true } };
    });

    if ("error" in result) return reply.code(result.code).send({ error: result.error });
    return result.data;
  });
}
