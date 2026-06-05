import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import { createWorkOrderFromRoadServiceTicket } from "./wo-integration.js";

export type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

const serviceTypeSchema = z.enum(["tire_change", "jump_start", "fuel_delivery", "lockout", "tow", "other"]);
const statusSchema = z.enum(["open", "completed", "invoiced", "paid"]);
const paymentMethodSchema = z.enum(["vendor_bill", "driver_advance", "cc"]);

const createTicketSchema = z.object({
  operating_company_id: z.string().uuid(),
  ticket_number: z.string().trim().min(1).max(80),
  vendor_name: z.string().trim().min(1).max(200),
  vendor_id: z.string().uuid().optional(),
  unit_id: z.string().uuid(),
  driver_id: z.string().uuid().optional(),
  call_time: z.string().datetime({ offset: true }).optional(),
  location_address: z.string().trim().max(1000).optional(),
  location_lat: z.coerce.number().optional(),
  location_lng: z.coerce.number().optional(),
  service_type: serviceTypeSchema,
  initial_complaint: z.string().trim().max(4000).optional(),
  payment_method: paymentMethodSchema.default("vendor_bill"),
  attached_doc_ids: z.array(z.string().uuid()).optional(),
});

const listQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  status: statusSchema.optional(),
  unit_id: z.string().uuid().optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const completeBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  on_scene_time: z.string().datetime({ offset: true }).optional(),
  completed_time: z.string().datetime({ offset: true }).optional(),
  work_performed: z.string().trim().min(1).max(4000),
  parts_used: z.string().trim().max(4000).optional(),
  total_cost_cents: z.number().int().min(0),
});

const idParamsSchema = z.object({ id: z.string().uuid() });
const createWoBodySchema = z.object({ operating_company_id: z.string().uuid() });

function auth(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

async function withCompany<T>(userId: string, companyId: string, fn: (client: DbClient) => Promise<T>) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [companyId]);
    return fn(client);
  });
}

export async function registerRoadServiceTicketRoutes(app: FastifyInstance) {
  app.get("/api/v1/road-service-tickets", async (req, reply) => {
    const user = auth(req, reply);
    if (!user) return;
    const query = listQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error" });

    const rows = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      const filters = ["operating_company_id = $1::uuid"];
      const values: unknown[] = [query.data.operating_company_id];
      if (query.data.status) {
        values.push(query.data.status);
        filters.push(`status = $${values.length}`);
      }
      if (query.data.unit_id) {
        values.push(query.data.unit_id);
        filters.push(`unit_id = $${values.length}::uuid`);
      }
      if (query.data.date_from) {
        values.push(query.data.date_from);
        filters.push(`created_at::date >= $${values.length}::date`);
      }
      if (query.data.date_to) {
        values.push(query.data.date_to);
        filters.push(`created_at::date <= $${values.length}::date`);
      }
      values.push(query.data.limit, query.data.offset);
      const res = await client.query(
        `
          SELECT
            t.*,
            u.display_id AS unit_display_id,
            d.first_name || ' ' || d.last_name AS driver_name
          FROM maintenance.road_service_tickets t
          LEFT JOIN mdata.units u ON u.id = t.unit_id
          LEFT JOIN mdata.drivers d ON d.id = t.driver_id
          WHERE ${filters.join(" AND ")}
          ORDER BY t.created_at DESC
          LIMIT $${values.length - 1}
          OFFSET $${values.length}
        `,
        values
      );
      return res.rows;
    });

    return { tickets: rows };
  });

  app.post("/api/v1/road-service-tickets", async (req, reply) => {
    const user = auth(req, reply);
    if (!user) return;
    const body = createTicketSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error" });

    const row = await withCompany(user.uuid, body.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          INSERT INTO maintenance.road_service_tickets (
            operating_company_id,
            ticket_number,
            vendor_name,
            vendor_id,
            unit_id,
            driver_id,
            dispatcher_user_id,
            call_time,
            location_address,
            location_lat,
            location_lng,
            service_type,
            initial_complaint,
            payment_method,
            attached_doc_ids,
            status
          )
          VALUES (
            $1::uuid, $2, $3, $4::uuid, $5::uuid, $6::uuid, $7::uuid, $8::timestamptz,
            $9, $10, $11, $12, $13, $14, $15::uuid[], 'open'
          )
          RETURNING *
        `,
        [
          body.data.operating_company_id,
          body.data.ticket_number,
          body.data.vendor_name,
          body.data.vendor_id ?? null,
          body.data.unit_id,
          body.data.driver_id ?? null,
          user.uuid,
          body.data.call_time ?? new Date().toISOString(),
          body.data.location_address ?? null,
          body.data.location_lat ?? null,
          body.data.location_lng ?? null,
          body.data.service_type,
          body.data.initial_complaint ?? null,
          body.data.payment_method,
          body.data.attached_doc_ids ?? null,
        ]
      );
      const ticket = res.rows[0];
      await appendCrudAudit(
        client,
        user.uuid,
        "maintenance.road_service_ticket.created",
        { resource_type: "maintenance.road_service_tickets", resource_id: String(ticket?.id ?? "") },
        "info",
        "P5-T17-ROAD-SERVICE"
      );
      return ticket;
    });

    return reply.code(201).send({ ticket: row });
  });

  app.patch("/api/v1/road-service-tickets/:id/complete", async (req, reply) => {
    const user = auth(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error" });
    const body = completeBodySchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error" });

    const updated = await withCompany(user.uuid, body.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE maintenance.road_service_tickets
          SET on_scene_time = COALESCE($3::timestamptz, on_scene_time),
              completed_time = COALESCE($4::timestamptz, now()),
              work_performed = $5,
              parts_used = $6,
              total_cost_cents = $7::bigint,
              status = 'completed',
              completed_at = now(),
              updated_at = now()
          WHERE id = $1::uuid
            AND operating_company_id = $2::uuid
            AND status = 'open'
          RETURNING *
        `,
        [
          params.data.id,
          body.data.operating_company_id,
          body.data.on_scene_time ?? null,
          body.data.completed_time ?? null,
          body.data.work_performed,
          body.data.parts_used ?? null,
          body.data.total_cost_cents,
        ]
      );
      return res.rows[0] ?? null;
    });

    if (!updated) return reply.code(404).send({ error: "ticket_not_found_or_not_open" });
    return { ticket: updated };
  });

  app.post("/api/v1/road-service-tickets/:id/create-wo", async (req, reply) => {
    const user = auth(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error" });
    const body = createWoBodySchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error" });

    const result = await withCompany(user.uuid, body.data.operating_company_id, async (client) =>
      createWorkOrderFromRoadServiceTicket(client, user.uuid, {
        operatingCompanyId: body.data.operating_company_id,
        ticketId: params.data.id,
      })
    );

    return { ...result };
  });
}

export default fp(
  async (app) => {
    await registerRoadServiceTicketRoutes(app);
  },
  { name: "maintenance.registerRoadServiceTicketRoutes" }
);
