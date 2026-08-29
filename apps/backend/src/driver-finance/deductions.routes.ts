import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { requireAuth } from "../auth/session-middleware.js";

const deductionIdParamsSchema = z.object({ id: z.string().uuid() });
const companyQuerySchema = z.object({ operating_company_id: z.string().uuid() });
// FAIL-DD2 — list filters. `status` is a free string (column is not a DB enum).
const listDeductionsQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  deduction_id: z.string().uuid().optional(),
  driver_id: z.string().uuid().optional(),
  status: z.string().trim().min(1).max(40).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});
const holdBodySchema = z.object({
  hold_until_period: z.string(),
  reason: z.string().trim().min(10),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return reply;
  return req.user;
}

// ACCT-F5580: the 4 PATCH hold/resume routes below had no role gate -- authed() only requires a
// session, and withCompany's assertCompanyMembership is role-agnostic. Holding or resuming a driver
// deduction directly controls whether a real dollar amount is withheld from a driver's pay -- the
// same tier of financial-control operation as ACCT-F5576/F5579. Matches settlements.routes.ts's own
// SETTLEMENT_WRITE_ROLES for the sibling settlement domain.
const DEDUCTION_WRITE_ROLES = new Set(["Owner", "Administrator", "Manager", "Accountant", "Payroll"]);
function requireDeductionWriteRole(req: FastifyRequest, reply: FastifyReply) {
  const user = authed(req, reply);
  if (!user) return null;
  const role = String((user as { role?: string }).role ?? "");
  if (!DEDUCTION_WRITE_ROLES.has(role)) {
    reply.code(403).send({ error: "forbidden", detail: "deduction hold/resume requires an office role" });
    return null;
  }
  return user;
}

function validationError(reply: FastifyReply, err: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: err.flatten() });
}

async function withCompany<T>(userId: string, companyId: string, fn: (client: any) => Promise<T>) {
  await assertCompanyMembership(userId, companyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    return fn(client);
  });
}

async function hasDeductionSchedule(client: any) {
  const res = await client.query(`SELECT to_regclass('driver_finance.deduction_schedule') IS NOT NULL AS ok`);
  return Boolean((res.rows[0] as { ok?: boolean } | undefined)?.ok);
}

export async function registerDriverFinanceDeductionRoutes(app: FastifyInstance) {
  // FAIL-DD2 — LIST settlement deductions. Without this, pending cash-advance recoveries
  // (e.g. b4a09ab6 $100) are unservable: hold/resume existed, list did not.
  // Entity-scoped BOTH ways: withCompany GUC + explicit d.operating_company_id predicate
  // (Owner sessions see every company via org.user_accessible_company_ids — GUC alone is not enough).
  // Joins are LEFT and entity-pinned so archived driver/load cannot silently drop money rows.
  app.get(
    "/api/v1/driver-finance/deductions",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = authed(req, reply);
      if (!user) return;
      const query = listDeductionsQuerySchema.safeParse(req.query ?? {});
      if (!query.success) return validationError(reply, query.error);
      const { operating_company_id, deduction_id, driver_id, status, limit, offset } = query.data;

      const rows = await withCompany(user.uuid, operating_company_id, async (client) => {
        const values: unknown[] = [operating_company_id];
        const where = ["d.operating_company_id = $1::uuid"];
        if (deduction_id) {
          values.push(deduction_id);
          where.push(`d.id = $${values.length}::uuid`);
        }
        if (driver_id) {
          values.push(driver_id);
          where.push(`d.driver_id = $${values.length}`);
        }
        if (status) {
          values.push(status);
          where.push(`d.status = $${values.length}`);
        }
        values.push(limit, offset);
        const res = await client.query(
          `
            SELECT
              d.id::text                        AS id,
              d.driver_id::text                 AS driver_id,
              TRIM(COALESCE(dr.first_name, '') || ' ' || COALESCE(dr.last_name, '')) AS driver_name,
              d.deduction_type,
              d.status,
              d.amount_cents::int                AS amount_cents,
              COALESCE(d.remaining_balance_cents, d.amount_cents)::int AS remaining_balance_cents,
              d.reason,
              d.load_id::text                   AS load_id,
              l.load_number                     AS load_number,
              d.applied_to_settlement_id::text  AS applied_to_settlement_id,
              s.display_id                      AS applied_to_settlement_display_id,
              d.created_at::text                AS created_at
            FROM driver_finance.driver_settlement_deductions d
            LEFT JOIN mdata.drivers dr
              ON dr.id = d.driver_id
             AND dr.operating_company_id = d.operating_company_id
            LEFT JOIN mdata.loads l
              ON l.id = d.load_id
             AND l.operating_company_id = d.operating_company_id
            LEFT JOIN driver_finance.driver_settlements s
              ON s.id = d.applied_to_settlement_id
             AND s.operating_company_id = d.operating_company_id
            WHERE ${where.join(" AND ")}
            ORDER BY d.created_at DESC
            LIMIT $${values.length - 1} OFFSET $${values.length}
          `,
          values
        );
        return res.rows;
      });

      return reply.code(200).send({ deductions: rows });
    }
  );

  app.patch("/api/v1/driver-finance/deduction-schedules/:id/hold", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = requireDeductionWriteRole(req, reply);
    if (!user) return;
    const params = deductionIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = holdBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const result = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      if (!(await hasDeductionSchedule(client))) return { unavailable: true as const };
      const updateRes = await client.query(
        `
          UPDATE driver_finance.deduction_schedule
          SET is_held = true,
              hold_until_period = $2::date,
              hold_reason = $3,
              held_by_user_id = $4,
              updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [params.data.id, body.data.hold_until_period, body.data.reason, user.uuid]
      );
      if (updateRes.rowCount === 0) return { notFound: true as const };
      await appendCrudAudit(
        client,
        user.uuid,
        "driver_finance.deduction_held",
        {
          resource_type: "driver_finance.deduction_schedule",
          resource_id: params.data.id,
          hold_until_period: body.data.hold_until_period,
          reason: body.data.reason,
          held_by_user_id: user.uuid,
        },
        "info",
        "BT-3-DRIVER-FINANCE-REBUILD"
      );
      return { row: updateRes.rows[0] };
    });
    if ("unavailable" in result) return reply.code(501).send({ error: "driver_finance_schema_not_available" });
    if ("notFound" in result) return reply.code(404).send({ error: "deduction_schedule_not_found" });
    return result.row;
  });

  app.patch("/api/v1/driver-finance/deduction-schedules/:id/resume", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = requireDeductionWriteRole(req, reply);
    if (!user) return;
    const params = deductionIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const result = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      if (!(await hasDeductionSchedule(client))) return { unavailable: true as const };
      const updateRes = await client.query(
        `
          UPDATE driver_finance.deduction_schedule
          SET is_held = false,
              hold_until_period = NULL,
              hold_reason = NULL,
              held_by_user_id = NULL,
              updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [params.data.id]
      );
      if (updateRes.rowCount === 0) return { notFound: true as const };
      await appendCrudAudit(
        client,
        user.uuid,
        "driver_finance.deduction_resumed",
        {
          resource_type: "driver_finance.deduction_schedule",
          resource_id: params.data.id,
          resumed_by_user_id: user.uuid,
        },
        "info",
        "BT-3-DRIVER-FINANCE-REBUILD"
      );
      return { row: updateRes.rows[0] };
    });
    if ("unavailable" in result) return reply.code(501).send({ error: "driver_finance_schema_not_available" });
    if ("notFound" in result) return reply.code(404).send({ error: "deduction_schedule_not_found" });
    return result.row;
  });

  // HOLD-DEDUCTION-MODAL-WRONG-PATCH-TARGET-ID: the settlement-detail Hold Deduction modal's real
  // target is a driver_finance.driver_settlement_deductions row (the live, GL-posted deduction
  // ledger — see settlement-deduction-cap.service.ts / settlement-posting.service.ts), reached via
  // the settlement line's source_reference_id (see settlements.routes.ts GET detail). The
  // pre-existing /deduction-schedules/:id/hold routes above are LEFT UNCHANGED — they correctly
  // serve the separate cash-advance/liability recurring-schedule feature (driver_finance.
  // deduction_schedule) and have their own callers elsewhere; this is a distinct table with its
  // own hold semantics, not a repoint of those routes.
  app.patch("/api/v1/driver-finance/settlement-deductions/:id/hold", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = requireDeductionWriteRole(req, reply);
    if (!user) return;
    const params = deductionIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = holdBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const result = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      const updateRes = await client.query(
        `
          UPDATE driver_finance.driver_settlement_deductions
          SET is_held = true,
              hold_until_period = $2::date,
              hold_reason = $3,
              held_by_user_id = $4,
              updated_at = now()
          WHERE id = $1
            AND operating_company_id = $5::uuid
            -- An already-applied (GL-posted) deduction is historical fact, not future-holdable.
            AND status <> 'applied'
          RETURNING *
        `,
        [params.data.id, body.data.hold_until_period, body.data.reason, user.uuid, query.data.operating_company_id]
      );
      if (updateRes.rowCount === 0) return { notFound: true as const };
      await appendCrudAudit(
        client,
        user.uuid,
        "driver_finance.settlement_deduction_held",
        {
          resource_type: "driver_finance.driver_settlement_deductions",
          resource_id: params.data.id,
          hold_until_period: body.data.hold_until_period,
          reason: body.data.reason,
          held_by_user_id: user.uuid,
        },
        "info",
        "HOLD-DEDUCTION-MODAL-WRONG-PATCH-TARGET-ID"
      );
      return { row: updateRes.rows[0] };
    });
    if ("notFound" in result)
      return reply.code(404).send({ error: "settlement_deduction_not_found_or_already_applied" });
    return result.row;
  });

  app.patch("/api/v1/driver-finance/settlement-deductions/:id/resume", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = requireDeductionWriteRole(req, reply);
    if (!user) return;
    const params = deductionIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const result = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      const updateRes = await client.query(
        `
          UPDATE driver_finance.driver_settlement_deductions
          SET is_held = false,
              hold_until_period = NULL,
              hold_reason = NULL,
              held_by_user_id = NULL,
              updated_at = now()
          WHERE id = $1
            AND operating_company_id = $2::uuid
          RETURNING *
        `,
        [params.data.id, query.data.operating_company_id]
      );
      if (updateRes.rowCount === 0) return { notFound: true as const };
      await appendCrudAudit(
        client,
        user.uuid,
        "driver_finance.settlement_deduction_resumed",
        {
          resource_type: "driver_finance.driver_settlement_deductions",
          resource_id: params.data.id,
          resumed_by_user_id: user.uuid,
        },
        "info",
        "HOLD-DEDUCTION-MODAL-WRONG-PATCH-TARGET-ID"
      );
      return { row: updateRes.rows[0] };
    });
    if ("notFound" in result) return reply.code(404).send({ error: "settlement_deduction_not_found" });
    return result.row;
  });

  app.get("/api/v1/driver-finance/drivers/:id/escrow-timeline", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = deductionIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const rows = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      const existsRes = await client.query(`SELECT to_regclass('driver_finance.escrow_ledger') IS NOT NULL AS ok`);
      if (!Boolean((existsRes.rows[0] as { ok?: boolean } | undefined)?.ok)) return [];
      // XE-FIN IDOR fix: bind the caller's entity scope explicitly. Without the
      // operating_company_id predicate, a driver_id belonging to another entity
      // returned that entity's escrow ledger (cross-entity financial read-leak).
      // FORCE-RLS on this table already isolates via app.operating_company_id, but
      // this predicate is defense-in-depth so the read can only ever return the
      // resolved company's rows. driver_finance.escrow_ledger.operating_company_id
      // is NOT NULL (migration 202606120600). No posting/GL/amount logic changes.
      const res = await client.query(
        // ORDER BY created_at, NOT posted_at. driver_finance.escrow_ledger has no posted_at column
        // (202606120600_d1_settlement_approval.sql defines created_at; no later migration adds one),
        // so this query raised Postgres 42703 and the endpoint returned 500 on every call.
        // posted_at DOES exist — on accounting.escrow_postings (0234_block_23_escrow_posting_flow.sql:29),
        // the OTHER half of the escrow split-brain. The column name was carried across from that table.
        `SELECT * FROM driver_finance.escrow_ledger WHERE driver_id = $1 AND operating_company_id = $2::uuid ORDER BY created_at DESC LIMIT 200`,
        [params.data.id, query.data.operating_company_id]
      );
      return res.rows;
    });

    return { timeline: rows };
  });
}
