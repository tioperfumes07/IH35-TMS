import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const ALLOWED_ROLES = ["Owner", "Administrator", "Manager", "Accountant"];

function authGuard(req: Parameters<typeof requireAuth>[0], reply: Parameters<typeof requireAuth>[1]) {
  if (!requireAuth(req, reply)) return false;
  const role = String(req.user?.role ?? "");
  if (!ALLOWED_ROLES.includes(role)) {
    reply.code(403).send({ error: "forbidden" });
    return false;
  }
  return true;
}

const listQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  driver_id:            z.string().uuid().optional(),
  status:               z.enum(["open", "ready", "closed", "disputed"]).optional(),
  from:                 z.string().optional(),
  to:                   z.string().optional(),
  limit:                z.coerce.number().int().min(1).max(500).default(100),
  offset:               z.coerce.number().int().min(0).default(0),
});

const idParamsSchema = z.object({ id: z.string().uuid() });

const pendingDedQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  driver_id:            z.string().uuid(),
  limit:                z.coerce.number().int().min(1).max(200).default(50),
  offset:               z.coerce.number().int().min(0).default(0),
});

export async function registerPreSettlementsRoutes(app: FastifyInstance) {

  /** GET /api/v1/settlements — list with 4 metric-card aggregates */
  app.get("/api/v1/settlements", async (req, reply) => {
    if (!authGuard(req, reply)) return;
    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const p = parsed.data;
    const values: unknown[] = [p.operating_company_id];
    const filters = [`s.operating_company_id = $1::uuid`, `s.is_active = true`];
    if (p.driver_id) { values.push(p.driver_id); filters.push(`s.driver_id = $${values.length}::uuid`); }
    if (p.status)    { values.push(p.status);    filters.push(`s.status = $${values.length}`); }
    if (p.from) { values.push(p.from); filters.push(`s.pay_period_start >= $${values.length}::date`); }
    if (p.to)   { values.push(p.to);   filters.push(`s.pay_period_end   <= $${values.length}::date`); }
    values.push(p.limit);  const limPos = values.length;
    values.push(p.offset); const offPos = values.length;

    const sql = `
      SELECT
        s.id::text, s.driver_id::text, s.pay_period_start::text, s.pay_period_end::text,
        s.status, s.gross_cents, s.deductions_cents, s.net_cents, s.notes,
        s.created_at::text, s.updated_at::text,
        d.first_name || ' ' || d.last_name AS driver_name,
        count(*) OVER()::int AS total_count
      FROM settlement.settlement s
      JOIN mdata.drivers d ON d.id = s.driver_id
      WHERE ${filters.join(" AND ")}
      ORDER BY s.pay_period_start DESC, s.created_at DESC
      LIMIT $${limPos} OFFSET $${offPos}`;

    const aggSql = `
      SELECT
        count(*) FILTER (WHERE s.status = 'open')     AS open_count,
        count(*) FILTER (WHERE s.status = 'ready')    AS ready_count,
        count(*) FILTER (WHERE s.status = 'closed')   AS closed_count,
        count(*) FILTER (WHERE s.status = 'disputed') AS disputed_count
      FROM settlement.settlement s
      WHERE s.operating_company_id = $1::uuid AND s.is_active = true`;

    return withCurrentUser(req.user!.uuid, async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1, true)", [p.operating_company_id]);
      const [rows, agg] = await Promise.all([
        client.query(sql, values),
        client.query(aggSql, [p.operating_company_id]),
      ]);
      return {
        settlements: rows.rows,
        total_count: Number(rows.rows[0]?.total_count ?? 0),
        limit: p.limit,
        offset: p.offset,
        metrics: {
          open_count:     Number(agg.rows[0]?.open_count ?? 0),
          ready_count:    Number(agg.rows[0]?.ready_count ?? 0),
          closed_count:   Number(agg.rows[0]?.closed_count ?? 0),
          disputed_count: Number(agg.rows[0]?.disputed_count ?? 0),
        },
      };
    });
  });

  /** GET /api/v1/settlements/:id — one settlement with lines + deductions */
  app.get("/api/v1/settlements/:id", async (req, reply) => {
    if (!authGuard(req, reply)) return;
    const params = idParamsSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: "validation_error" });
    const query = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error" });
    const companyId = query.data.operating_company_id;

    const settleSql = `
      SELECT s.id::text, s.driver_id::text, s.pay_period_start::text, s.pay_period_end::text,
             s.status, s.gross_cents, s.deductions_cents, s.net_cents, s.notes,
             s.created_at::text, s.updated_at::text,
             d.first_name || ' ' || d.last_name AS driver_name
      FROM settlement.settlement s
      JOIN mdata.drivers d ON d.id = s.driver_id
      WHERE s.id = $1::uuid AND s.operating_company_id = $2::uuid AND s.is_active = true`;

    const linesSql = `
      SELECT id::text, line_type, description, amount_cents, load_id::text, source_table,
             source_reference_id::text, created_at::text
      FROM settlement.settlement_line
      WHERE settlement_id = $1::uuid AND is_active = true
      ORDER BY created_at ASC`;

    const dedSql = `
      SELECT id::text, deduction_type, description, amount_cents, source_table,
             source_reference_id::text, created_at::text
      FROM settlement.settlement_deduction
      WHERE settlement_id = $1::uuid AND is_active = true
      ORDER BY created_at ASC`;

    return withCurrentUser(req.user!.uuid, async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
      const [settle, lines, deductions] = await Promise.all([
        client.query(settleSql, [params.data.id, companyId]),
        client.query(linesSql,  [params.data.id]),
        client.query(dedSql,    [params.data.id]),
      ]);
      if (settle.rows.length === 0) return reply.code(404).send({ error: "not_found" });
      await client.query(`SELECT events.log_event(
        $1::uuid, 'settlement.viewed', 'user', $2::uuid,
        'settlement', $3::uuid, now(), '{}'::jsonb, 'pre-settlements-routes', true, null, null, $2::uuid, null
      )`, [companyId, req.user!.uuid, params.data.id]);
      return { settlement: settle.rows[0], lines: lines.rows, deductions: deductions.rows };
    });
  });

  /** GET /api/v1/settlements/pending-deductions — pending deductions for a driver */
  app.get("/api/v1/settlements/pending-deductions", async (req, reply) => {
    if (!authGuard(req, reply)) return;
    const parsed = pendingDedQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const p = parsed.data;

    const sql = `
      SELECT
        edp.source_type             AS deduction_type,
        edp.id::text                AS source_reference_id,
        'driver_finance.escrow_deductions_pending' AS source_table,
        edp.proposed_reason         AS description,
        edp.proposed_amount_cents   AS amount_cents,
        edp.proposed_at::text       AS created_at
      FROM driver_finance.escrow_deductions_pending edp
      WHERE edp.driver_id = $2::uuid
        AND edp.operating_company_id = $1::uuid
        AND edp.status = 'approved'
      ORDER BY edp.proposed_at ASC
      LIMIT $3 OFFSET $4`;

    return withCurrentUser(req.user!.uuid, async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1, true)", [p.operating_company_id]);
      const res = await client.query(sql, [p.operating_company_id, p.driver_id, p.limit, p.offset]);
      return { pending_deductions: res.rows, limit: p.limit, offset: p.offset };
    });
  });
}
