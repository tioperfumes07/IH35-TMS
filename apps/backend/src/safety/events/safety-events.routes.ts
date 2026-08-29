import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import { assertCompanyMembership } from "../../_helpers/company-membership-guard.js";
import { isSevereSafetyEventSeverity, notifySevereSafetyEvent } from "./notification.service.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const listQuerySchema = companyQuerySchema.extend({
  status: z.enum(["open", "acknowledged", "closed"]).optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  search: z.string().trim().min(1).max(120).optional(),
  // SAF-C01-REVERSE / FAIL-S1 reverse half: the load drawer needs to ask "which safety events are on
  // THIS load". The column and the join were already here — only the filter was missing, so the
  // reverse direction had no server-side question to ask and the load looked clean.
  related_load_id: z.string().uuid().optional(),
  subject_driver_id: z.string().uuid().optional(),
  subject_unit_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

const eventIdParamsSchema = z.object({
  id: z.string().uuid(),
});

const createEventSchema = z.object({
  operating_company_id: z.string().uuid(),
  event_type: z.string().trim().min(1).max(80),
  severity: z.enum(["low", "medium", "high", "critical"]),
  status: z.enum(["open", "acknowledged", "closed"]).default("open"),
  kpi_bucket: z.enum(["incidents", "violations", "claims", "commendations"]).default("incidents"),
  subject_type: z.enum(["driver", "unit", "company"]).default("company"),
  subject_driver_id: z.string().uuid().optional(),
  subject_unit_id: z.string().uuid().optional(),
  related_load_id: z.string().uuid().optional(),
  occurred_at: z.string().datetime().optional(),
  location_text: z.string().trim().max(500).optional(),
  injury_count: z.coerce.number().int().min(0).max(999).default(0),
  fatality_count: z.coerce.number().int().min(0).max(999).default(0),
  tow_away_required: z.boolean().default(false),
  dot_reportable: z.boolean().default(false),
  police_report_number: z.string().trim().max(80).optional(),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(5000).optional(),
});


function currentUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function canMutate(role: string) {
  return ["Owner", "Administrator", "Manager", "Safety"].includes(role);
}

async function withCompanyScope<T>(userId: string, operatingCompanyId: string, fn: (client: any) => Promise<T>) {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [operatingCompanyId]);
    return fn(client);
  });
}

export async function registerSafetyEventsRoutes(app: FastifyInstance) {
  app.get("/api/v1/safety/events-log", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;

    const query = listQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const values: unknown[] = [query.data.operating_company_id];
      const filters = ["e.operating_company_id = $1::uuid"];
      if (query.data.status) {
        values.push(query.data.status);
        filters.push(`e.status = $${values.length}`);
      }
      if (query.data.severity) {
        values.push(query.data.severity);
        filters.push(`e.severity = $${values.length}`);
      }
      if (query.data.search) {
        values.push(`%${query.data.search}%`);
        filters.push(`(e.title ILIKE $${values.length} OR COALESCE(e.description, '') ILIKE $${values.length})`);
      }
      if (query.data.related_load_id) {
        values.push(query.data.related_load_id);
        filters.push(`e.related_load_id = $${values.length}::uuid`);
      }
      if (query.data.subject_driver_id) {
        values.push(query.data.subject_driver_id);
        filters.push(`e.subject_driver_id = $${values.length}::uuid`);
      }
      if (query.data.subject_unit_id) {
        values.push(query.data.subject_unit_id);
        filters.push(`e.subject_unit_id = $${values.length}::uuid`);
      }
      values.push(query.data.limit);
      const limitParam = values.length;

      const res = await client.query(
        `
          SELECT
            e.id::text,
            e.operating_company_id::text,
            e.event_type,
            e.severity,
            e.status,
            e.kpi_bucket,
            e.subject_type,
            e.subject_driver_id::text,
            e.subject_unit_id::text,
            e.related_load_id::text,
            e.occurred_at::text,
            e.location_text,
            e.injury_count,
            e.fatality_count,
            e.tow_away_required,
            e.dot_reportable,
            e.police_report_number,
            e.title,
            e.description,
            e.created_by::text,
            e.created_at::text,
            CONCAT_WS(' ', d.first_name, d.last_name) AS subject_driver_name,
            u.unit_number AS subject_unit_number,
            l.load_number AS related_load_number
          FROM safety.safety_events e
          LEFT JOIN mdata.drivers d
            ON d.id = e.subject_driver_id
           AND (
             d.operating_company_id = e.operating_company_id
             OR EXISTS (
               SELECT 1 FROM mdata.driver_company_authorizations safety_events_list_dca
               WHERE safety_events_list_dca.driver_id = d.id
                 AND safety_events_list_dca.company_id = e.operating_company_id
                 AND safety_events_list_dca.is_authorized = true
                 AND safety_events_list_dca.deactivated_at IS NULL
             )
           )
          LEFT JOIN mdata.units u
            ON u.id = e.subject_unit_id
           AND (u.owner_company_id = e.operating_company_id
                OR u.currently_leased_to_company_id = e.operating_company_id)
          LEFT JOIN mdata.loads l
            ON l.id = e.related_load_id
            AND l.operating_company_id = e.operating_company_id
          WHERE ${filters.join(" AND ")}
          ORDER BY e.occurred_at DESC, e.created_at DESC
          LIMIT $${limitParam}::int
        `,
        values
      );
      return res.rows;
    });

    return { events: rows };
  });

  app.get("/api/v1/safety/events-log/kpis", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;

    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const kpis = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'open')::int AS open_count,
            COUNT(*) FILTER (WHERE severity IN ('high', 'critical'))::int AS severe_count,
            COUNT(*) FILTER (WHERE kpi_bucket = 'commendations')::int AS commendations_count
          FROM safety.safety_events
          WHERE operating_company_id = $1::uuid
        `,
        [query.data.operating_company_id]
      );
      return res.rows[0] ?? { total: 0, open_count: 0, severe_count: 0, commendations_count: 0 };
    });

    return { kpis };
  });

  app.get("/api/v1/safety/events-log/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;

    const params = eventIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const row = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT
            e.id::text,
            e.operating_company_id::text,
            e.event_type,
            e.severity,
            e.status,
            e.kpi_bucket,
            e.subject_type,
            e.subject_driver_id::text,
            e.subject_unit_id::text,
            e.related_load_id::text,
            e.occurred_at::text,
            e.location_text,
            e.injury_count,
            e.fatality_count,
            e.tow_away_required,
            e.dot_reportable,
            e.police_report_number,
            e.title,
            e.description,
            e.created_by::text,
            e.created_at::text,
            CONCAT_WS(' ', d.first_name, d.last_name) AS subject_driver_name,
            u.unit_number AS subject_unit_number,
            l.load_number AS related_load_number
          FROM safety.safety_events e
          LEFT JOIN mdata.drivers d
            ON d.id = e.subject_driver_id
           AND (
             d.operating_company_id = e.operating_company_id
             OR EXISTS (
               SELECT 1 FROM mdata.driver_company_authorizations safety_events_detail_dca
               WHERE safety_events_detail_dca.driver_id = d.id
                 AND safety_events_detail_dca.company_id = e.operating_company_id
                 AND safety_events_detail_dca.is_authorized = true
                 AND safety_events_detail_dca.deactivated_at IS NULL
             )
           )
          LEFT JOIN mdata.units u
            ON u.id = e.subject_unit_id
           AND (u.owner_company_id = e.operating_company_id
                OR u.currently_leased_to_company_id = e.operating_company_id)
          LEFT JOIN mdata.loads l
            ON l.id = e.related_load_id
            AND l.operating_company_id = e.operating_company_id
          WHERE e.id = $1::uuid
            AND e.operating_company_id = $2::uuid
          LIMIT 1
        `,
        [params.data.id, query.data.operating_company_id]
      );
      return res.rows[0] ?? null;
    });

    if (!row) return reply.code(404).send({ error: "safety_event_not_found" });
    return { event: row };
  });

  app.get("/api/v1/safety/events-log/:id/notes", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;

    const params = eventIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const notes = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const exists = await client.query(
        `
          SELECT 1
          FROM safety.safety_events
          WHERE id = $1::uuid
            AND operating_company_id = $2::uuid
          LIMIT 1
        `,
        [params.data.id, query.data.operating_company_id]
      );
      if (!exists.rows[0]) return null;

      const res = await client.query(
        `
          SELECT
            n.id::text,
            n.safety_event_id::text,
            n.note,
            n.created_by::text,
            n.created_at::text,
            COALESCE(NULLIF(TRIM(CONCAT_WS(' ', i.first_name, i.last_name)), ''), i.email) AS created_by_name
          FROM safety.safety_event_notes n
          LEFT JOIN identity.users i ON i.id = n.created_by
          WHERE n.safety_event_id = $1::uuid
            AND n.operating_company_id = $2::uuid
          ORDER BY n.created_at DESC
        `,
        [params.data.id, query.data.operating_company_id]
      );
      return res.rows;
    });

    if (notes === null) return reply.code(404).send({ error: "safety_event_not_found" });
    return { notes };
  });

  app.post("/api/v1/safety/events-log", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });

    const body = createEventSchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    if (body.data.subject_type === "driver" && !body.data.subject_driver_id) {
      return reply.code(400).send({ error: "subject_driver_id_required" });
    }
    if (body.data.subject_type === "unit" && !body.data.subject_unit_id) {
      return reply.code(400).send({ error: "subject_unit_id_required" });
    }

    const event = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      const links = await client.query(
        `SELECT
           ($2::uuid IS NULL OR EXISTS (
             SELECT 1 FROM mdata.drivers d
             WHERE d.id = $2::uuid
               AND (d.operating_company_id = $1::uuid OR EXISTS (
                 SELECT 1 FROM mdata.driver_company_authorizations safety_event_create_driver_dca
                 WHERE safety_event_create_driver_dca.driver_id = d.id
                   AND safety_event_create_driver_dca.company_id = $1::uuid
                   AND safety_event_create_driver_dca.is_authorized = true
                   AND safety_event_create_driver_dca.deactivated_at IS NULL
               ))
           )) AS driver_ok,
           ($3::uuid IS NULL OR EXISTS (SELECT 1 FROM mdata.units u WHERE u.id = $3::uuid AND (u.owner_company_id = $1::uuid OR u.currently_leased_to_company_id = $1::uuid))) AS unit_ok,
           ($4::uuid IS NULL OR EXISTS (SELECT 1 FROM mdata.loads l WHERE l.id = $4::uuid AND l.operating_company_id = $1::uuid)) AS load_ok`,
        [body.data.operating_company_id, body.data.subject_driver_id ?? null, body.data.subject_unit_id ?? null, body.data.related_load_id ?? null]
      );
      const integrity = links.rows[0] as { driver_ok?: boolean; unit_ok?: boolean; load_ok?: boolean } | undefined;
      if (!integrity || Object.values(integrity).some((value) => value !== true)) return null;
      const inserted = await client.query(
        `
          INSERT INTO safety.safety_events (
            operating_company_id,
            event_type,
            severity,
            status,
            kpi_bucket,
            subject_type,
            subject_driver_id,
            subject_unit_id,
            related_load_id,
            occurred_at,
            location_text,
            injury_count,
            fatality_count,
            tow_away_required,
            dot_reportable,
            police_report_number,
            title,
            description,
            created_by
          ) VALUES (
            $1::uuid,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7::uuid,
            $8::uuid,
            $9::uuid,
            COALESCE($10::timestamptz, now()),
            $11,
            $12,
            $13,
            $14,
            $15,
            $16,
            $17,
            $18,
            $19::uuid
          )
          RETURNING id::text
        `,
        [
          body.data.operating_company_id,
          body.data.event_type,
          body.data.severity,
          body.data.status,
          body.data.kpi_bucket,
          body.data.subject_type,
          body.data.subject_driver_id ?? null,
          body.data.subject_unit_id ?? null,
          body.data.related_load_id ?? null,
          body.data.occurred_at ?? null,
          body.data.location_text?.trim() || null,
          body.data.injury_count,
          body.data.fatality_count,
          body.data.tow_away_required,
          body.data.dot_reportable,
          body.data.police_report_number?.trim() || null,
          body.data.title,
          body.data.description ?? null,
          user.uuid,
        ]
      );

      const createdId = String(inserted.rows[0]?.id ?? "");
      if (createdId.length === 0) return null;

      const note = body.data.description?.trim();
      if (note) {
        await client.query(
          `
            INSERT INTO safety.safety_event_notes (
              operating_company_id,
              safety_event_id,
              note,
              created_by
            ) VALUES ($1::uuid, $2::uuid, $3, $4::uuid)
          `,
          [body.data.operating_company_id, createdId, note, user.uuid]
        );
      }

      await appendCrudAudit(
        client,
        user.uuid,
        "safety.safety_events.created",
        {
          resource_type: "safety.safety_events",
          resource_id: createdId,
          operating_company_id: body.data.operating_company_id,
          event_type: body.data.event_type,
          severity: body.data.severity,
          subject_driver_id: body.data.subject_driver_id ?? null,
          subject_unit_id: body.data.subject_unit_id ?? null,
          related_load_id: body.data.related_load_id ?? null,
        },
        "info",
        "P7-SAFETY-EVENTS"
      );

      const eventRow = await client.query(
        `
          SELECT
            e.id::text,
            e.operating_company_id::text,
            e.event_type,
            e.severity,
            e.status,
            e.kpi_bucket,
            e.subject_type,
            e.subject_driver_id::text,
            e.subject_unit_id::text,
            e.related_load_id::text,
            e.occurred_at::text,
            e.location_text,
            e.injury_count,
            e.fatality_count,
            e.tow_away_required,
            e.dot_reportable,
            e.police_report_number,
            e.title,
            e.description,
            e.created_by::text,
            e.created_at::text,
            CONCAT_WS(' ', d.first_name, d.last_name) AS subject_driver_name,
            u.unit_number AS subject_unit_number
          FROM safety.safety_events e
          LEFT JOIN mdata.drivers d
            ON d.id = e.subject_driver_id
           AND d.operating_company_id = e.operating_company_id
          LEFT JOIN mdata.units u
            ON u.id = e.subject_unit_id
           AND (u.owner_company_id = e.operating_company_id
                OR u.currently_leased_to_company_id = e.operating_company_id)
          WHERE e.id = $1::uuid
            AND e.operating_company_id = $2::uuid
          LIMIT 1
        `,
        [createdId, body.data.operating_company_id]
      );
      const createdEvent = eventRow.rows[0] ?? null;

      if (createdEvent && isSevereSafetyEventSeverity(body.data.severity)) {
        await notifySevereSafetyEvent(client, {
          operating_company_id: body.data.operating_company_id,
          event_id: createdId,
          event_type: body.data.event_type,
          severity: body.data.severity,
          title: body.data.title,
          description: body.data.description ?? null,
          subject_driver_name: createdEvent.subject_driver_name ?? null,
          subject_unit_number: createdEvent.subject_unit_number ?? null,
        });
      }

      return createdEvent;
    });

    if (!event) return reply.code(400).send({ error: "related_entity_not_in_operating_company" });
    return reply.code(201).send({ event });
  });
}
