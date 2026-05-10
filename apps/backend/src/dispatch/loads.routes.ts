import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { emitAutoProposedEscrowEvents } from "../driver-finance/escrow-deduction-pending.service.js";

const dispatchStatusSchema = z.enum([
  "unassigned",
  "assigned_not_dispatched",
  "dispatched",
  "in_transit",
  "delivered_pending_docs",
  "completed_docs_received",
  "cancelled",
  "abandoned",
  "driver_walkoff",
  "driver_no_show",
]);

const listDispatchLoadsQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: z
    .preprocess((value) => {
      if (Array.isArray(value)) return value;
      if (typeof value === "string") return value.split(",").map((entry) => entry.trim()).filter(Boolean);
      return undefined;
    }, z.array(dispatchStatusSchema).optional())
    .optional(),
  customer: z.string().uuid().optional(),
  driver: z.string().uuid().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  search: z.string().trim().max(120).optional(),
  view: z.enum(["home", "loads"]).optional(),
});

const dispatchLoadIdParamsSchema = z.object({
  id: z.string().uuid(),
});
const dispatchUnitIdParamsSchema = z.object({
  unit_id: z.string().uuid(),
});
const dispatchDriverIdParamsSchema = z.object({
  driver_id: z.string().uuid(),
});

const dispatchPreferenceBodySchema = z.object({
  dispatch_default_view: z.enum(["home", "loads"]),
});

const transitionBodySchema = z.object({
  new_status: dispatchStatusSchema,
  cancellation_reason_code: z.string().trim().max(80).optional(),
});

const createDispatchLoadBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  customer_id: z.string().uuid(),
  status: dispatchStatusSchema.default("assigned_not_dispatched"),
  customer_wo_number: z.string().trim().max(120).optional(),
  commodity: z.string().trim().max(120).optional(),
  weight_lbs: z.number().int().min(0).optional(),
  notes: z.string().trim().max(5000).optional(),
  trailer_type: z.enum(["refrigerated_van", "dry_van", "flatbed", "power_only_no_trailer", "power_only_customer_trailer"]).optional(),
  assigned_unit_id: z.string().uuid().optional(),
  assigned_primary_driver_id: z.string().uuid().optional(),
  assigned_secondary_driver_id: z.string().uuid().optional(),
  temp_fahrenheit: z.number().int().optional(),
  charges: z
    .array(
      z.object({
        code: z.string().trim().min(1).max(60),
        amount_cents: z.number().int().min(0),
      })
    )
    .default([]),
  stops: z
    .array(
      z.object({
        stop_type: z.enum(["pickup", "delivery"]),
        sequence_number: z.number().int().min(1),
        location_id: z.string().uuid().optional(),
        company_name: z.string().trim().max(200).optional(),
        city: z.string().trim().max(120).optional(),
        state: z.string().trim().max(120).optional(),
        country: z.string().trim().max(120).optional(),
        address_line1: z.string().trim().max(300).optional(),
        scheduled_arrival_at: z.string().datetime({ offset: true }).optional(),
      })
    )
    .min(2),
  save_mode: z.enum(["draft", "book_dispatch"]).default("book_dispatch"),
  override_token: z.string().uuid().optional(),
  override_reason: z.string().trim().min(10).max(1000).optional(),
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
    query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
  }) => Promise<T>
) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${operatingCompanyId}'`);
    return fn(client);
  });
}

function fromMdataStatus(status: string): z.infer<typeof dispatchStatusSchema> {
  if (status === "assigned") return "assigned_not_dispatched";
  if (status === "at_pickup") return "dispatched";
  if (status === "at_delivery") return "in_transit";
  if (status === "delivered") return "delivered_pending_docs";
  if (status === "invoiced" || status === "paid" || status === "closed") return "completed_docs_received";
  if (status === "cancelled") return "cancelled";
  if (status === "unassigned") return "unassigned";
  if (status === "assigned_not_dispatched") return "assigned_not_dispatched";
  if (status === "dispatched") return "dispatched";
  if (status === "in_transit") return "in_transit";
  if (status === "delivered_pending_docs") return "delivered_pending_docs";
  if (status === "completed_docs_received") return "completed_docs_received";
  if (status === "abandoned") return "abandoned";
  if (status === "driver_walkoff") return "driver_walkoff";
  if (status === "driver_no_show") return "driver_no_show";
  return "unassigned";
}

function toMdataStatus(status: z.infer<typeof dispatchStatusSchema>): string {
  if (status === "unassigned") return "draft";
  if (status === "assigned_not_dispatched") return "assigned_not_dispatched";
  if (status === "dispatched") return "dispatched";
  if (status === "in_transit") return "in_transit";
  if (status === "delivered_pending_docs") return "delivered_pending_docs";
  if (status === "completed_docs_received") return "completed_docs_received";
  if (status === "abandoned") return "abandoned";
  if (status === "driver_walkoff") return "driver_walkoff";
  if (status === "driver_no_show") return "driver_no_show";
  return "cancelled";
}

function canOverrideUnitBlock(role: string) {
  return role === "Owner";
}

function canOverrideHos(role: string) {
  return ["Owner", "Administrator", "Manager"].includes(role);
}

const allowedTransitions: Record<z.infer<typeof dispatchStatusSchema>, z.infer<typeof dispatchStatusSchema>[]> = {
  unassigned: ["assigned_not_dispatched", "cancelled"],
  assigned_not_dispatched: ["dispatched", "driver_no_show", "cancelled"],
  dispatched: ["in_transit", "driver_no_show", "driver_walkoff", "cancelled"],
  in_transit: ["delivered_pending_docs", "abandoned", "driver_walkoff", "cancelled"],
  delivered_pending_docs: ["completed_docs_received", "cancelled"],
  completed_docs_received: [],
  cancelled: [],
  abandoned: [],
  driver_walkoff: [],
  driver_no_show: [],
};

export async function registerDispatchLoadRoutes(app: FastifyInstance) {
  app.get("/api/v1/dispatch/preferences", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;

    const preferences = await withCurrentUser(authUser.uuid, async (client) => {
      const res = await client.query<{ dispatch_default_view: "home" | "loads" }>(
        `
          SELECT dispatch_default_view
          FROM identity.user_preferences
          WHERE user_id = $1
          LIMIT 1
        `,
        [authUser.uuid]
      );
      return res.rows[0] ?? { dispatch_default_view: "home" as const };
    });
    return preferences;
  });

  app.patch("/api/v1/dispatch/preferences", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const body = dispatchPreferenceBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const updated = await withCurrentUser(authUser.uuid, async (client) => {
      const res = await client.query<{ dispatch_default_view: "home" | "loads" }>(
        `
          INSERT INTO identity.user_preferences (user_id, dispatch_default_view)
          VALUES ($1, $2)
          ON CONFLICT (user_id)
          DO UPDATE SET dispatch_default_view = EXCLUDED.dispatch_default_view
          RETURNING dispatch_default_view
        `,
        [authUser.uuid, body.data.dispatch_default_view]
      );
      return res.rows[0];
    });

    return updated;
  });

  app.get("/api/v1/dispatch/loads", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsed = listDispatchLoadsQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);
    const query = parsed.data;

    const values: unknown[] = [query.operating_company_id];
    const filters: string[] = [`l.operating_company_id = $1`, `l.soft_deleted_at IS NULL`];
    if (query.status && query.status.length > 0) {
      const mappedStatuses = query.status.map((status) => toMdataStatus(status));
      values.push(mappedStatuses);
      filters.push(`l.status = ANY($${values.length}::mdata.load_status_enum[])`);
    }
    if (query.customer) {
      values.push(query.customer);
      filters.push(`l.customer_id = $${values.length}`);
    }
    if (query.driver) {
      values.push(query.driver);
      filters.push(`(l.assigned_primary_driver_id = $${values.length} OR l.assigned_secondary_driver_id = $${values.length})`);
    }
    if (query.from) {
      values.push(query.from);
      filters.push(`sp.scheduled_arrival_at::date >= $${values.length}::date`);
    }
    if (query.to) {
      values.push(query.to);
      filters.push(`sd.scheduled_arrival_at::date <= $${values.length}::date`);
    }
    if (query.search) {
      values.push(`%${query.search}%`);
      const idx = values.length;
      filters.push(
        `(l.load_number ILIKE $${idx} OR c.customer_name ILIKE $${idx} OR COALESCE(sp.city, '') ILIKE $${idx} OR COALESCE(sd.city, '') ILIKE $${idx})`
      );
    }

    const whereClause = `WHERE ${filters.join(" AND ")}`;

    const payload = await withCompanyScope(authUser.uuid, query.operating_company_id, async (client) => {
      const countRes = await client.query<{ total: number }>(
        `
          SELECT count(*)::int AS total
          FROM views.dispatch_load_with_driver_status l
          JOIN mdata.customers c ON c.id = l.customer_id
          LEFT JOIN LATERAL (
            SELECT city, state, scheduled_arrival_at
            FROM mdata.load_stops
            WHERE load_id = l.id AND stop_type = 'pickup'
            ORDER BY sequence_number ASC
            LIMIT 1
          ) sp ON true
          LEFT JOIN LATERAL (
            SELECT city, state, scheduled_arrival_at
            FROM mdata.load_stops
            WHERE load_id = l.id AND stop_type = 'delivery'
            ORDER BY sequence_number DESC
            LIMIT 1
          ) sd ON true
          ${whereClause}
        `,
        values
      );

      values.push(query.limit);
      values.push(query.offset);
      const limitIdx = values.length - 1;
      const offsetIdx = values.length;

      const rowsRes = await client.query(
        `
          SELECT
            l.*,
            c.customer_name,
            u.unit_number,
            tr.unit_number AS trailer_number,
            CASE WHEN d.id IS NULL THEN NULL ELSE CONCAT(LEFT(d.first_name, 1), '. ', d.last_name) END AS driver_short_name,
            COALESCE(uds.has_open_pm_due_wo, false) AS has_open_pm_due_wo,
            COALESCE(uds.is_dispatch_blocked, false) AS is_dispatch_blocked,
            uds.dispatch_block_reason,
            COALESCE(uds.open_wo_count, 0) AS open_wo_count,
            dhs.hos_badge_color,
            COALESCE(dhs.is_in_violation, false) AS hos_is_in_violation,
            COALESCE(dhs.minutes_until_violation, 9999) AS hos_minutes_until_violation,
            sp.city AS pickup_city,
            sp.state AS pickup_state,
            sd.city AS delivery_city,
            sd.state AS delivery_state
          FROM views.dispatch_load_with_driver_status l
          JOIN mdata.customers c ON c.id = l.customer_id
          LEFT JOIN mdata.units u ON u.id = l.assigned_unit_id
          LEFT JOIN mdata.units tr ON tr.id = l.assigned_secondary_driver_id
          LEFT JOIN mdata.drivers d ON d.id = l.assigned_primary_driver_id
          LEFT JOIN views.units_with_dispatch_status uds ON uds.id = l.assigned_unit_id
          LEFT JOIN views.drivers_with_hos_status dhs ON dhs.id = l.assigned_primary_driver_id
          LEFT JOIN LATERAL (
            SELECT city, state, scheduled_arrival_at
            FROM mdata.load_stops
            WHERE load_id = l.id AND stop_type = 'pickup'
            ORDER BY sequence_number ASC
            LIMIT 1
          ) sp ON true
          LEFT JOIN LATERAL (
            SELECT city, state, scheduled_arrival_at
            FROM mdata.load_stops
            WHERE load_id = l.id AND stop_type = 'delivery'
            ORDER BY sequence_number DESC
            LIMIT 1
          ) sd ON true
          ${whereClause}
          ORDER BY sp.scheduled_arrival_at NULLS LAST, l.created_at DESC
          LIMIT $${limitIdx}
          OFFSET $${offsetIdx}
        `,
        values
      );

      return { rows: rowsRes.rows, total: Number(countRes.rows[0]?.total ?? 0) };
    });

    return {
      loads: payload.rows.map((row) => ({
        ...row,
        dispatch_status: fromMdataStatus(String(row.status)),
      })),
      total_count: payload.total,
      has_more: query.offset + query.limit < payload.total,
    };
  });

  app.get("/api/v1/dispatch/loads/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const params = dispatchLoadIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);

    const operatingCompanyId = String((req.query as Record<string, unknown> | undefined)?.["operating_company_id"] ?? "");
    if (!operatingCompanyId) return reply.code(400).send({ error: "operating_company_id_required" });

    const detail = await withCompanyScope(authUser.uuid, operatingCompanyId, async (client) => {
      const loadRes = await client.query(
        `
          SELECT l.*, c.customer_name
          FROM views.dispatch_load_with_driver_status l
          JOIN mdata.customers c ON c.id = l.customer_id
          WHERE l.id = $1
            AND l.operating_company_id = $2
          LIMIT 1
        `,
        [params.data.id, operatingCompanyId]
      );
      const load = loadRes.rows[0] ?? null;
      if (!load) return null;

      const stopsRes = await client.query(
        `
          SELECT *
          FROM mdata.load_stops
          WHERE load_id = $1
          ORDER BY sequence_number ASC
        `,
        [params.data.id]
      );
      return { ...load, stops: stopsRes.rows, charges: [], drivers: [] };
    });

    if (!detail) return reply.code(404).send({ error: "dispatch_load_not_found" });
    return detail;
  });

  app.get("/api/v1/dispatch/units/:unit_id/dispatch-status", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const params = dispatchUnitIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const operatingCompanyId = String((req.query as Record<string, unknown> | undefined)?.["operating_company_id"] ?? "");
    if (!operatingCompanyId) return reply.code(400).send({ error: "operating_company_id_required" });

    const row = await withCompanyScope(authUser.uuid, operatingCompanyId, async (client) => {
      const res = await client
        .query(
          `
            SELECT id, display_id, is_dispatch_blocked, dispatch_block_reason, has_open_pm_due_wo, open_wo_count
            FROM views.units_with_dispatch_status
            WHERE id = $1
              AND operating_company_id = $2
            LIMIT 1
          `,
          [params.data.unit_id, operatingCompanyId]
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] }));
      return res.rows[0] ?? null;
    });

    if (!row) return reply.code(404).send({ error: "unit_not_found" });
    return {
      unit_id: row.id,
      unit_display_id: row.display_id,
      is_blocked: Boolean(row.is_dispatch_blocked),
      block_reason: row.dispatch_block_reason,
      has_pm_due: Boolean(row.has_open_pm_due_wo),
      open_wo_count: Number(row.open_wo_count ?? 0),
    };
  });

  app.get("/api/v1/dispatch/drivers/:driver_id/hos-status", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const params = dispatchDriverIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const operatingCompanyId = String((req.query as Record<string, unknown> | undefined)?.["operating_company_id"] ?? "");
    if (!operatingCompanyId) return reply.code(400).send({ error: "operating_company_id_required" });

    const row = await withCompanyScope(authUser.uuid, operatingCompanyId, async (client) => {
      const res = await client
        .query(
          `
            SELECT id, hos_badge_color, is_in_violation, minutes_until_violation
            FROM views.drivers_with_hos_status
            WHERE id = $1
              AND operating_company_id = $2
            LIMIT 1
          `,
          [params.data.driver_id, operatingCompanyId]
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] }));
      return res.rows[0] ?? null;
    });

    if (!row) return reply.code(404).send({ error: "driver_not_found" });
    return {
      driver_id: row.id,
      hos_badge_color: row.hos_badge_color,
      is_violation: Boolean(row.is_in_violation),
      minutes_until_violation: Number(row.minutes_until_violation ?? 0),
    };
  });

  app.post("/api/v1/dispatch/loads", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!["Owner", "Administrator", "Manager", "Dispatcher"].includes(authUser.role)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const body = createDispatchLoadBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const b = body.data;

    try {
      const result = await withCompanyScope(authUser.uuid, b.operating_company_id, async (client) => {
        const wf044Warnings: Array<Record<string, unknown>> = [];

        if (b.assigned_unit_id) {
          const unitRes = await client
            .query(
              `
                SELECT id, display_id, is_dispatch_blocked, dispatch_block_reason, has_open_pm_due_wo, open_wo_count
                FROM views.units_with_dispatch_status
                WHERE id = $1
                  AND operating_company_id = $2
                LIMIT 1
              `,
              [b.assigned_unit_id, b.operating_company_id]
            )
            .catch(() => ({ rows: [] as Record<string, unknown>[] }));
          const unit = unitRes.rows[0] ?? null;
          if (unit?.has_open_pm_due_wo) {
            wf044Warnings.push({
              unit_id: unit.id,
              unit_display_id: unit.display_id,
              open_wo_count: Number(unit.open_wo_count ?? 0),
              message: `Unit ${String(unit.display_id ?? "unit")} has open PM-due work order(s).`,
            });
          }

          if (unit?.is_dispatch_blocked) {
            if (!b.override_token) {
              await appendCrudAudit(
                client,
                authUser.uuid,
                "dispatch.book_load_blocked_by_unit",
                {
                  operating_company_id: b.operating_company_id,
                  unit_id: unit.id,
                  block_reason: unit.dispatch_block_reason ?? null,
                  block_code: "E_UNIT_DISPATCH_BLOCKED",
                },
                "info",
                "BT-3-DISPATCH-AUTH-GATES"
              );
              return {
                kind: "error" as const,
                status: 422,
                payload: {
                  error: "E_UNIT_DISPATCH_BLOCKED",
                  message: `Unit ${String(unit.display_id ?? "")} is dispatch-blocked: ${String(unit.dispatch_block_reason ?? "major defect reported")}`,
                  details: { unit_id: unit.id, unit_display_id: unit.display_id, block_reason: unit.dispatch_block_reason },
                  wf_044_maintenance_warnings: wf044Warnings,
                },
              };
            }
            if (!canOverrideUnitBlock(authUser.role)) {
              return {
                kind: "error" as const,
                status: 403,
                payload: { error: "E_PERMISSION_DENIED", message: "Only Owner can override dispatch-blocked units." },
              };
            }
            if (!b.override_reason || b.override_reason.trim().length < 10) {
              return {
                kind: "error" as const,
                status: 400,
                payload: { error: "E_OVERRIDE_REASON_REQUIRED", message: "Override reason must be at least 10 characters." },
              };
            }
            await appendCrudAudit(
              client,
              authUser.uuid,
              "dispatch.unit_block_overridden_by_owner",
              {
                operating_company_id: b.operating_company_id,
                unit_id: unit.id,
                unit_display_id: unit.display_id,
                block_reason: unit.dispatch_block_reason ?? null,
                override_token: b.override_token,
                override_reason: b.override_reason,
                role: authUser.role,
                severity_label: "critical",
              },
              "warning",
              "BT-3-DISPATCH-AUTH-GATES"
            );
            await client.query(
              `
                INSERT INTO outbox.outbox_queue (aggregate_type, aggregate_id, event_type, payload)
                VALUES ($1,$2,$3,$4::jsonb)
              `,
              [
                "dispatch.loads",
                b.assigned_unit_id,
                "dispatch.wf064.override_notice",
                JSON.stringify({
                  override_type: "unit_block",
                  notify_channels: ["email", "sms"],
                  operating_company_id: b.operating_company_id,
                  override_reason: b.override_reason,
                  override_by_user_id: authUser.uuid,
                }),
              ]
            );
          }
        }

        if (b.assigned_primary_driver_id) {
          const hosRes = await client
            .query(
              `
                SELECT id, display_id, full_name, hos_badge_color, is_in_violation, minutes_until_violation
                FROM views.drivers_with_hos_status
                WHERE id = $1
                  AND operating_company_id = $2
                LIMIT 1
              `,
              [b.assigned_primary_driver_id, b.operating_company_id]
            )
            .catch(() => ({ rows: [] as Record<string, unknown>[] }));
          const hos = hosRes.rows[0] ?? null;
          if (hos?.is_in_violation) {
            if (!b.override_token) {
              await appendCrudAudit(
                client,
                authUser.uuid,
                "dispatch.book_load_blocked_by_hos",
                {
                  operating_company_id: b.operating_company_id,
                  driver_id: hos.id,
                  block_code: "E_DRIVER_HOS_VIOLATION",
                  minutes_until_violation: Number(hos.minutes_until_violation ?? 0),
                },
                "info",
                "BT-3-DISPATCH-AUTH-GATES"
              );
              return {
                kind: "error" as const,
                status: 422,
                payload: {
                  error: "E_DRIVER_HOS_VIOLATION",
                  message: `Driver ${String(hos.full_name ?? hos.display_id ?? "")} is in HOS violation.`,
                  details: {
                    driver_id: hos.id,
                    minutes_until_violation: Number(hos.minutes_until_violation ?? 0),
                    hos_badge_color: hos.hos_badge_color,
                  },
                  wf_044_maintenance_warnings: wf044Warnings,
                },
              };
            }
            if (!canOverrideHos(authUser.role)) {
              return {
                kind: "error" as const,
                status: 403,
                payload: { error: "E_PERMISSION_DENIED", message: "Only Manager/Admin/Owner can override HOS violations." },
              };
            }
            if (!b.override_reason || b.override_reason.trim().length < 10) {
              return {
                kind: "error" as const,
                status: 400,
                payload: { error: "E_OVERRIDE_REASON_REQUIRED", message: "Override reason must be at least 10 characters." },
              };
            }
            await appendCrudAudit(
              client,
              authUser.uuid,
              "dispatch.hos_override_by_manager",
              {
                operating_company_id: b.operating_company_id,
                driver_id: hos.id,
                driver_display_id: hos.display_id,
                minutes_until_violation: Number(hos.minutes_until_violation ?? 0),
                override_token: b.override_token,
                override_reason: b.override_reason,
                role: authUser.role,
              },
              "warning",
              "BT-3-DISPATCH-AUTH-GATES"
            );
            await client.query(
              `
                INSERT INTO outbox.outbox_queue (aggregate_type, aggregate_id, event_type, payload)
                VALUES ($1,$2,$3,$4::jsonb)
              `,
              [
                "dispatch.loads",
                b.assigned_primary_driver_id,
                "dispatch.wf064.override_notice",
                JSON.stringify({
                  override_type: "hos_violation",
                  notify_channels: ["email"],
                  operating_company_id: b.operating_company_id,
                  override_reason: b.override_reason,
                  override_by_user_id: authUser.uuid,
                }),
              ]
            );
          }
        }

        const loadNumberRes = await client.query<{ next_seq: number }>(
          `
            SELECT COALESCE(MAX(COALESCE(NULLIF(substring(load_number FROM '([0-9]{4})$'), ''), '0')::int), 0) + 1 AS next_seq
            FROM mdata.loads
            WHERE operating_company_id = $1
              AND load_number LIKE $2
          `,
          [b.operating_company_id, `L-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-%`]
        );
        const nextSeq = Number(loadNumberRes.rows[0]?.next_seq ?? 1);
        const loadNumber = `L-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(nextSeq).padStart(4, "0")}`;
        const statusForInsert = b.save_mode === "draft" ? "draft" : toMdataStatus(b.status);

        const loadRes = await client.query(
          `
            INSERT INTO mdata.loads (
              operating_company_id, load_number, customer_id, status, rate_total_cents, currency_code,
              assigned_unit_id, assigned_primary_driver_id, assigned_secondary_driver_id,
              dispatcher_user_id, notes
            )
            VALUES ($1,$2,$3,$4,$5,'USD',$6,$7,$8,$9,$10)
            RETURNING *
          `,
          [
            b.operating_company_id,
            loadNumber,
            b.customer_id,
            statusForInsert,
            b.charges.reduce((sum, item) => sum + item.amount_cents, 0),
            b.assigned_unit_id ?? null,
            b.assigned_primary_driver_id ?? null,
            b.assigned_secondary_driver_id ?? null,
            authUser.uuid,
            b.notes ?? null,
          ]
        );
        const load = loadRes.rows[0];

        for (const stop of b.stops) {
          await client.query(
            `
              INSERT INTO mdata.load_stops (
                load_id, sequence_number, stop_type, location_id, address_line1, city, state, country, scheduled_arrival_at, status
              )
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending')
            `,
            [
              load.id,
              stop.sequence_number,
              stop.stop_type,
              stop.location_id ?? null,
              stop.address_line1 ?? null,
              stop.city ?? null,
              stop.state ?? null,
              stop.country ?? null,
              stop.scheduled_arrival_at ?? null,
            ]
          );
        }

        if (wf044Warnings.length > 0) {
          await appendCrudAudit(
            client,
            authUser.uuid,
            "dispatch.assignment_with_maintenance_warning",
            {
              resource_id: load.id,
              resource_type: "dispatch.loads",
              operating_company_id: b.operating_company_id,
              wf_044_maintenance_warnings: wf044Warnings,
            },
            "info",
            "BT-3-DISPATCH-AUTH-GATES"
          );
        }

        if (b.save_mode === "book_dispatch") {
          await appendCrudAudit(
            client,
            authUser.uuid,
            "dispatch.load_created",
            {
              resource_id: load.id,
              resource_type: "dispatch.loads",
              entity_type: "load",
              entity_id: load.id,
              load_number: load.load_number,
              operating_company_id: load.operating_company_id,
              status: load.status,
              save_mode: b.save_mode,
              wf_044_maintenance_warnings: wf044Warnings,
            },
            "info",
            "BT-3-DISPATCH-AUTH-GATES"
          );

          const outboxEvents = [
            "dispatch.driver_sms",
            "dispatch.qbo_invoice",
            "dispatch.qbo_bill",
            "dispatch.fuel_planner",
            "dispatch.factoring_packet",
            "dispatch.load_notification",
          ];
          for (const eventType of outboxEvents) {
            await client.query(
              `
                INSERT INTO outbox.outbox_queue (aggregate_type, aggregate_id, event_type, payload)
                VALUES ($1,$2,$3,$4::jsonb)
              `,
              ["dispatch.loads", load.id, eventType, JSON.stringify({ load_id: load.id, operating_company_id: load.operating_company_id })]
            );
          }
        }

        return { kind: "ok" as const, row: { ...load, wf_044_maintenance_warnings: wf044Warnings } };
      });

      if (result.kind === "error") {
        return reply.code(result.status).send(result.payload);
      }
      return reply.code(201).send(result.row);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "23505") return reply.code(409).send({ error: "dispatch_load_conflict" });
      if (code === "23503") return reply.code(400).send({ error: "invalid_foreign_key" });
      throw error;
    }
  });

  app.patch("/api/v1/dispatch/loads/:id/transition", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const params = dispatchLoadIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = transitionBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const operatingCompanyId = String((req.query as Record<string, unknown> | undefined)?.["operating_company_id"] ?? "");
    if (!operatingCompanyId) return reply.code(400).send({ error: "operating_company_id_required" });

    const result = await withCompanyScope(authUser.uuid, operatingCompanyId, async (client) => {
      const currentRes = await client.query<{ status: string }>(
        `
          SELECT status
          FROM mdata.loads
          WHERE id = $1
            AND operating_company_id = $2
            AND soft_deleted_at IS NULL
          LIMIT 1
        `,
        [params.data.id, operatingCompanyId]
      );
      const current = currentRes.rows[0] ?? null;
      if (!current) return { error: "not_found" as const };
      const currentStatus = fromMdataStatus(current.status);
      const targetStatus = body.data.new_status;
      if (!allowedTransitions[currentStatus].includes(targetStatus)) {
        return { error: "invalid_transition" as const, from: currentStatus, to: targetStatus };
      }

      const mdataStatus = toMdataStatus(targetStatus);
      await client.query(`UPDATE mdata.loads SET status = $2 WHERE id = $1`, [params.data.id, mdataStatus]);
      if (mdataStatus === "abandoned" || mdataStatus === "driver_walkoff" || mdataStatus === "driver_no_show") {
        await emitAutoProposedEscrowEvents({
          client,
          actor_user_id: authUser.uuid,
          operating_company_id: operatingCompanyId,
          load_id: params.data.id,
          load_status: mdataStatus,
        });
      }
      return { ok: true as const, status: targetStatus };
    });

    if ("error" in result) {
      if (result.error === "not_found") return reply.code(404).send({ error: "dispatch_load_not_found" });
      return reply.code(400).send({ error: "invalid_transition", from_status: result.from, to_status: result.to });
    }
    return result;
  });

  app.get("/api/v1/dispatch/dashboard", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const operatingCompanyId = String((req.query as Record<string, unknown> | undefined)?.["operating_company_id"] ?? "");
    if (!operatingCompanyId) return reply.code(400).send({ error: "operating_company_id_required" });

    const metrics = await withCompanyScope(authUser.uuid, operatingCompanyId, async (client) => {
      const dispatchedRes = await client.query<{ count: number }>(
        `
          SELECT count(*)::int AS count
          FROM mdata.loads
          WHERE operating_company_id = $1
            AND soft_deleted_at IS NULL
            AND status IN ('dispatched'::mdata.load_status_enum, 'in_transit'::mdata.load_status_enum)
        `,
        [operatingCompanyId]
      );
      const deliveredRes = await client.query<{ count: number }>(
        `
          SELECT count(*)::int AS count
          FROM mdata.loads
          WHERE operating_company_id = $1
            AND soft_deleted_at IS NULL
            AND status = 'delivered_pending_docs'::mdata.load_status_enum
        `,
        [operatingCompanyId]
      );
      const transitRes = await client.query<{ count: number }>(
        `
          SELECT count(*)::int AS count
          FROM mdata.loads
          WHERE operating_company_id = $1
            AND soft_deleted_at IS NULL
            AND status = 'in_transit'::mdata.load_status_enum
        `,
        [operatingCompanyId]
      );
      const projectedRes = await client.query<{ amount: number }>(
        `
          SELECT COALESCE(sum(rate_total_cents), 0)::bigint AS amount
          FROM mdata.loads
          WHERE operating_company_id = $1
            AND date_trunc('week', created_at) = date_trunc('week', now())
            AND soft_deleted_at IS NULL
        `,
        [operatingCompanyId]
      );
      return {
        dispatched: Number(dispatchedRes.rows[0]?.count ?? 0),
        need_load: 0,
        delivered: Number(deliveredRes.rows[0]?.count ?? 0),
        in_transit: Number(transitRes.rows[0]?.count ?? 0),
        proj_inv_wk_cents: Number(projectedRes.rows[0]?.amount ?? 0),
        deadhead_pct: 0,
        mpg: 0,
      };
    });

    return metrics;
  });

  app.get("/api/v1/dispatch/units-without-load", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const operatingCompanyId = String((req.query as Record<string, unknown> | undefined)?.["operating_company_id"] ?? "");
    if (!operatingCompanyId) return reply.code(400).send({ error: "operating_company_id_required" });

    const rows = await withCompanyScope(authUser.uuid, operatingCompanyId, async (client) => {
      const res = await client.query(
        `
          SELECT
            u.id,
            u.unit_number,
            NULL::text AS trailer_number,
            CONCAT_WS(' ', d.first_name, d.last_name) AS driver_name,
            MAX(ls.actual_departure_at) AS last_drop_at
          FROM mdata.units u
          LEFT JOIN mdata.loads l
            ON l.assigned_unit_id = u.id
            AND l.soft_deleted_at IS NULL
            AND l.status IN (
              'assigned_not_dispatched'::mdata.load_status_enum,
              'dispatched'::mdata.load_status_enum,
              'in_transit'::mdata.load_status_enum,
              'delivered_pending_docs'::mdata.load_status_enum
            )
          LEFT JOIN mdata.drivers d ON d.id = l.assigned_primary_driver_id
          LEFT JOIN mdata.load_stops ls ON ls.load_id = l.id
          WHERE u.deactivated_at IS NULL
            AND l.id IS NULL
          GROUP BY u.id, u.unit_number, d.first_name, d.last_name
          ORDER BY COALESCE(MAX(ls.actual_departure_at), now() - interval '999 days') ASC
        `
      );
      return res.rows.map((row) => ({
        ...row,
        hours_since_last_delivery: row.last_drop_at ? Math.floor((Date.now() - new Date(row.last_drop_at as string).getTime()) / 3600000) : null,
      }));
    });
    return { units: rows };
  });

  app.get("/api/v1/dispatch/loads/:id/driver-status", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const params = dispatchLoadIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const operatingCompanyId = String((req.query as Record<string, unknown> | undefined)?.["operating_company_id"] ?? "");
    if (!operatingCompanyId) return reply.code(400).send({ error: "operating_company_id_required" });

    const row = await withCompanyScope(authUser.uuid, operatingCompanyId, async (client) => {
      const res = await client.query(
        `
          SELECT
            l.id,
            l.driver_lifecycle_stage,
            l.latest_eta_prediction
          FROM views.dispatch_load_with_driver_status l
          WHERE l.id = $1
            AND l.operating_company_id = $2
          LIMIT 1
        `,
        [params.data.id, operatingCompanyId]
      );
      return res.rows[0] ?? null;
    });

    if (!row) return reply.code(404).send({ error: "dispatch_load_not_found" });
    return {
      load_id: row.id,
      current_stage: row.driver_lifecycle_stage,
      eta: row.latest_eta_prediction,
      timeline: [
        { stage: row.driver_lifecycle_stage, at: new Date().toISOString(), source: "phase3_stub" },
      ],
    };
  });
}
