import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const equipmentStatusSchema = z.enum(["InService", "OutOfService", "InMaintenance", "Sold", "Lost"]);
const eventTypeSchema = z.enum(["Coupled", "Uncoupled", "Moved", "StatusChange", "MaintenanceStart", "MaintenanceEnd", "Note"]);

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  equipment_id: z.string().uuid().optional(),
  event_type: eventTypeSchema.optional(),
  event_at_from: z.string().datetime().optional(),
  event_at_to: z.string().datetime().optional(),
});

const idParamSchema = z.object({ id: z.string().uuid() });

const createEquipmentLogBodySchema = z.object({
  equipment_id: z.string().uuid(),
  event_type: eventTypeSchema,
  event_at: z.string().datetime(),
  from_unit_id: z.string().uuid().optional(),
  to_unit_id: z.string().uuid().optional(),
  new_unit_id: z.string().uuid().optional(),
  from_location_id: z.string().uuid().optional(),
  to_location_id: z.string().uuid().optional(),
  new_location_id: z.string().uuid().optional(),
  status_before: equipmentStatusSchema.optional(),
  status_after: equipmentStatusSchema.optional(),
  new_status: equipmentStatusSchema.optional(),
  notes: z.string().trim().max(2000).optional(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function isWriteRole(role: string): boolean {
  return role === "Owner" || role === "Administrator" || role === "Manager";
}

type EquipmentLogRow = Record<string, unknown> & {
  id: string;
  equipment_id: string;
  event_type: string;
  event_at: string;
};

function mapEquipmentLogRow(row: Record<string, unknown>): EquipmentLogRow {
  return {
    ...row,
    new_unit_id: row.to_unit_id ?? null,
    new_location_id: row.to_location_id ?? null,
    new_status: row.status_after ?? null,
  } as unknown as EquipmentLogRow;
}

export async function registerEquipmentLogRoutes(app: FastifyInstance) {
  app.get("/api/v1/mdata/equipment-log", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedQuery = listQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const { limit, offset, equipment_id, event_type, event_at_from, event_at_to } = parsedQuery.data;
    const equipment_log = await withCurrentUser(authUser.uuid, async (client) => {
      const values: unknown[] = [];
      const filters: string[] = [];
      if (equipment_id) {
        values.push(equipment_id);
        filters.push(`equipment_id = $${values.length}`);
      }
      if (event_type) {
        values.push(event_type);
        filters.push(`event_type = $${values.length}`);
      }
      if (event_at_from) {
        values.push(event_at_from);
        filters.push(`event_at >= $${values.length}::timestamptz`);
      }
      if (event_at_to) {
        values.push(event_at_to);
        filters.push(`event_at <= $${values.length}::timestamptz`);
      }
      values.push(limit);
      values.push(offset);
      const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
      const res = await client.query(
        `
          SELECT
            id,
            equipment_id,
            event_type,
            event_at,
            from_unit_id,
            to_unit_id,
            from_location_id,
            to_location_id,
            status_before,
            status_after,
            notes,
            created_at,
            updated_at,
            created_by_user_id,
            updated_by_user_id
          FROM mdata.equipment_log
          ${whereClause}
          ORDER BY event_at DESC, created_at DESC
          LIMIT $${values.length - 1}
          OFFSET $${values.length}
        `,
        values
      );
      return res.rows.map(mapEquipmentLogRow);
    });

    return { equipment_log };
  });

  app.post("/api/v1/mdata/equipment-log", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedBody = createEquipmentLogBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;

    try {
      const created = await withCurrentUser(authUser.uuid, async (client) => {
        const res = await client.query(
          `
            INSERT INTO mdata.equipment_log (
              equipment_id, event_type, event_at, from_unit_id, to_unit_id, from_location_id, to_location_id,
              status_before, status_after, notes, created_by_user_id, updated_by_user_id
            ) VALUES (
              $1,$2,$3::timestamptz,$4,$5,$6,$7,$8,$9,$10,$11,$11
            )
            RETURNING
              id,
              equipment_id,
              event_type,
              event_at,
              from_unit_id,
              to_unit_id,
              from_location_id,
              to_location_id,
              status_before,
              status_after,
              notes,
              created_at,
              updated_at,
              created_by_user_id,
              updated_by_user_id
          `,
          [
            b.equipment_id,
            b.event_type,
            b.event_at,
            b.from_unit_id ?? null,
            b.new_unit_id ?? b.to_unit_id ?? null,
            b.from_location_id ?? null,
            b.new_location_id ?? b.to_location_id ?? null,
            b.status_before ?? null,
            b.new_status ?? b.status_after ?? null,
            b.notes ?? null,
            authUser.uuid,
          ]
        );
        const row = mapEquipmentLogRow(res.rows[0]);
        await appendCrudAudit(client, authUser.uuid, "mdata.equipment_log.created", {
          resource_id: row.id,
          resource_type: "mdata.equipment_log",
          id: row.id,
          equipment_id: row.equipment_id,
          event_type: row.event_type,
          event_at: row.event_at,
        });
        return row;
      });
      return reply.code(201).send(created);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "23503") return reply.code(400).send({ error: "invalid_equipment_log_fk_reference" });
      if (code === "23514") return reply.code(400).send({ error: "invalid_equipment_log_payload" });
      throw err;
    }
  });

  app.get("/api/v1/mdata/equipment-log/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const row = await withCurrentUser(authUser.uuid, async (client) => {
      const res = await client.query(
        `
          SELECT
            id,
            equipment_id,
            event_type,
            event_at,
            from_unit_id,
            to_unit_id,
            from_location_id,
            to_location_id,
            status_before,
            status_after,
            notes,
            created_at,
            updated_at,
            created_by_user_id,
            updated_by_user_id
          FROM mdata.equipment_log
          WHERE id = $1
          LIMIT 1
        `,
        [parsedParams.data.id]
      );
      const raw = res.rows[0] ?? null;
      return raw ? mapEquipmentLogRow(raw) : null;
    });

    if (!row) return reply.code(404).send({ error: "mdata_equipment_log_not_found" });
    return row;
  });
}
