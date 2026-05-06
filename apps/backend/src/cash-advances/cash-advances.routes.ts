import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { nextCashAdvanceDisplayId } from "./display-id.js";

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
});

const repaymentScheduleSchema = z.object({
  weekly_installment_amount: z.number().positive(),
  total_periods: z.number().int().min(1).max(104),
  cadence: z.enum(["weekly", "biweekly"]).default("weekly"),
});

const createAdvanceBodySchema = z.object({
  driver_id: z.string().uuid(),
  amount: z.number().positive(),
  purpose: z.enum(["fuel_deposit", "border_fee", "family_emergency", "vendor_payment", "other"]),
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
  repayment_schedule: repaymentScheduleSchema,
});

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
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${operatingCompanyId}'`);
    return fn(client);
  });
}

async function resolveCompanyThreshold(client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> }, companyId: string) {
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

export async function registerCashAdvancesRoutes(app: FastifyInstance) {
  app.get("/api/v1/cash-advances/dashboard/kpis", async (req, reply) => {
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
            WHERE operating_company_id = $1
            LIMIT 1
          `,
          [companyId]
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] }));
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

  app.get("/api/v1/cash-advances", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = listQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;
    const rows = await withCompanyScope(user.uuid, companyId, async (client) => {
      const where: string[] = ["operating_company_id = $1"];
      const values: unknown[] = [companyId];
      if (query.data.view === "pending_approval") where.push(`disbursement_status = 'pending_approval'`);
      if (query.data.view === "outstanding") where.push("COALESCE(outstanding_balance, 0) > 0");
      if (query.data.view === "paid_off") where.push("COALESCE(outstanding_balance, 0) <= 0");
      if (query.data.status) {
        values.push(query.data.status);
        where.push(`disbursement_status = $${values.length}`);
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
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] }));
      return res.rows;
    });
    return { advances: rows };
  });

  app.get("/api/v1/cash-advances/unpaid-bills", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = COMPANY_QUERY.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;
    const rows = await withCompanyScope(user.uuid, companyId, async (client) => {
      const res = await client
        .query(
          `
            SELECT id, COALESCE(display_id, id::text) AS display_id, vendor_id, total_amount, status, due_date
            FROM accounting.bills
            WHERE operating_company_id = $1
              AND status = 'unpaid'
            ORDER BY due_date ASC NULLS LAST, created_at DESC
            LIMIT 200
          `,
          [companyId]
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] }));
      return res.rows;
    });
    return { bills: rows };
  });

  app.get("/api/v1/cash-advances/:id", async (req, reply) => {
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
              AND operating_company_id = $2
            LIMIT 1
          `,
          [params.data.id, companyId]
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] }));
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
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] }));
      const settlementRes = await client
        .query(
          `
            SELECT settlement_id, amount, created_at
            FROM driver_finance.settlement_lines
            WHERE liability_id = $1
            ORDER BY created_at DESC
          `,
          [row.liability_id]
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] }));
      return { ...row, deduction_schedule: scheduleRes.rows, settlement_history: settlementRes.rows };
    });
    if (!detail) return reply.code(404).send({ error: "cash_advance_not_found" });
    return detail;
  });

  app.post("/api/v1/cash-advances", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = COMPANY_QUERY.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const body = createAdvanceBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const companyId = query.data.operating_company_id;

    const created = await withCompanyScope(user.uuid, companyId, async (client) => {
      const driverRes = await client.query(
        `
          SELECT id, status
          FROM mdata.drivers
          WHERE id = $1
          LIMIT 1
        `,
        [body.data.driver_id]
      );
      const driver = driverRes.rows[0];
      if (!driver) return { code: 404 as const, error: "driver_not_found" };
      if (String(driver.status ?? "").toLowerCase() !== "active") return { code: 400 as const, error: "driver_not_active" };

      const threshold = await resolveCompanyThreshold(client, companyId);
      if (body.data.amount > threshold) {
        return {
          code: 403 as const,
          error: "above_policy_owner_approval_required",
          message: "Owner approval required — feature available Phase 4",
        };
      }

      let linkedBill: Record<string, unknown> | null = null;
      if (body.data.linked_bill_id) {
        const billRes = await client.query(
          `
            SELECT id, total_amount, status, vendor_id, display_id
            FROM accounting.bills
            WHERE id = $1
              AND operating_company_id = $2
            LIMIT 1
          `,
          [body.data.linked_bill_id, companyId]
        );
        linkedBill = billRes.rows[0] ?? null;
        if (!linkedBill) return { code: 404 as const, error: "linked_bill_not_found" };
        if (String(linkedBill.status ?? "").toLowerCase() !== "unpaid") {
          return { code: 400 as const, error: "linked_bill_must_be_unpaid" };
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
        [companyId, body.data.driver_id, "advance", `Cash advance ${displayId}`, body.data.amount]
      );
      const liabilityId = String(liabilityRes.rows[0]?.id ?? "");
      if (!liabilityId) return { code: 500 as const, error: "liability_create_failed" };

      const schedule = body.data.repayment_schedule;
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
        [companyId, liabilityId, body.data.driver_id, schedule.weekly_installment_amount, schedule.total_periods, schedule.cadence]
      );

      const insertAmount = linkedBill ? Number(linkedBill.total_amount ?? body.data.amount) : body.data.amount;
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
          body.data.driver_id,
          liabilityId,
          insertAmount,
          body.data.purpose,
          body.data.disbursement_method,
          body.data.recipient_info.recipient_type,
          body.data.recipient_info.recipient_name ?? null,
          body.data.linked_bill_id ?? null,
          user.uuid,
        ]
      );
      const advanceId = String(advanceRes.rows[0]?.id ?? "");
      if (!advanceId) return { code: 500 as const, error: "advance_create_failed" };

      await appendCrudAudit(
        client,
        user.uuid,
        "cash_advance.created",
        {
          resource_type: "driver_finance.driver_advances",
          resource_id: advanceId,
          operating_company_id: companyId,
          liability_id: liabilityId,
          linked_bill_id: body.data.linked_bill_id ?? null,
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
      return { code: 201 as const, data: detailRes.rows[0] ?? { id: advanceId, display_id: displayId } };
    });

    if ("error" in created) {
      return reply.code(created.code).send({ error: created.error, message: created.message });
    }
    return reply.code(created.code).send(created.data);
  });

  app.patch("/api/v1/cash-advances/:id/mark-disbursed", async (req, reply) => {
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
            AND operating_company_id = $2
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
              advance_id
            )
            VALUES ($1, $2, $3, $4, $5)
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
        await client.query(
          `
            UPDATE banking.bank_transactions
            SET advance_id = $1,
                updated_at = now()
            WHERE id = $2
              AND operating_company_id = $3
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
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] }));
      return { code: 200 as const, data: detailRes.rows[0] ?? { id: advance.id, disbursement_status: "disbursed" } };
    });

    if ("error" in result) return reply.code(result.code).send({ error: result.error });
    return result.data;
  });

  app.patch("/api/v1/cash-advances/:id/reverse", async (req, reply) => {
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
            AND operating_company_id = $2
          LIMIT 1
        `,
        [params.data.id, companyId]
      );
      const advance = advanceRes.rows[0];
      if (!advance) return { code: 404 as const, error: "cash_advance_not_found" };

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
