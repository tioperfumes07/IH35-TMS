import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { resolveOperatingCompanyId } from "../auth/operating-company-scope.js";
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
  operating_company_id: z.string().uuid(),
});

const idParamSchema = z.object({ id: z.string().uuid() });
const companyQuerySchema = z.object({ operating_company_id: z.string().uuid() });

const createEquipmentLogBodySchema = z.object({
  operating_company_id: z.string().uuid(),
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
  if (!requireAuth(req, reply)) return reply;
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
  app.get("/api/v1/mdata/equipment-log", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedQuery = listQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const { limit, offset, equipment_id, event_type, event_at_from, event_at_to, operating_company_id } =
      parsedQuery.data;
    const equipment_log = await withCurrentUser(authUser.uuid, async (client) => {
      const values: unknown[] = [];
      const filters: string[] = [];
      // Entity scope (USMCA cross-entity leak fix): mdata.equipment_log has NO company column and its
      // RLS is role-scoped, not entity-scoped, so join mdata.equipment and scope by the owner/leased
      // pair. ALWAYS bind it — resolve the company from the param or user context so another entity's
      // equipment history never leaks (mirrors mdata/equipment.routes.ts).
      const scopedCompanyId = await resolveOperatingCompanyId(client, authUser.uuid, operating_company_id);
      if (!scopedCompanyId) return [];
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [scopedCompanyId]);
      values.push(scopedCompanyId);
      const ownerLeasedIdx = values.length;
      filters.push(
        `(e.owner_company_id = $${ownerLeasedIdx} OR e.currently_leased_to_company_id = $${ownerLeasedIdx})`
      );
      if (equipment_id) {
        values.push(equipment_id);
        filters.push(`el.equipment_id = $${values.length}`);
      }
      if (event_type) {
        values.push(event_type);
        filters.push(`el.event_type = $${values.length}`);
      }
      if (event_at_from) {
        values.push(event_at_from);
        filters.push(`el.event_at >= $${values.length}::timestamptz`);
      }
      if (event_at_to) {
        values.push(event_at_to);
        filters.push(`el.event_at <= $${values.length}::timestamptz`);
      }
      values.push(limit);
      values.push(offset);
      const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
      const res = await client.query(
        `
          SELECT
            el.id,
            el.equipment_id,
            el.event_type,
            el.event_at,
            el.from_unit_id,
            el.to_unit_id,
            el.from_location_id,
            el.to_location_id,
            el.status_before,
            el.status_after,
            el.notes,
            el.created_at,
            el.updated_at,
            el.created_by_user_id,
            el.updated_by_user_id
          FROM mdata.equipment_log el
          JOIN mdata.equipment e ON e.id = el.equipment_id AND (e.owner_company_id = $1 OR e.currently_leased_to_company_id = $1)
          ${whereClause}
          ORDER BY el.event_at DESC, el.created_at DESC
          LIMIT $${values.length - 1}
          OFFSET $${values.length}
        `,
        values
      );
      return res.rows.map(mapEquipmentLogRow);
    });

    return { equipment_log };
  });

  app.post("/api/v1/mdata/equipment-log", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedBody = createEquipmentLogBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;
    const effectiveToUnitId = b.new_unit_id ?? b.to_unit_id ?? null;
    const effectiveToLocationId = b.new_location_id ?? b.to_location_id ?? null;

    try {
      const created = await withCurrentUser(authUser.uuid, async (client) => {
        // FLT-F6163: the caller supplied equipment/unit/location UUIDs with no company resolved and
        // no FK-ownership check — an Owner session (RLS is not a scope backstop for Owner) could write
        // a cross-entity history edge (e.g. USMCA equipment coupled to a TRK unit) since a foreign key
        // only proves the row exists somewhere, never that it belongs to the acting entity.
        const scopedCompanyId = await resolveOperatingCompanyId(client, authUser.uuid, b.operating_company_id);
        if (!scopedCompanyId) throw new Error("equipment_log_company_not_resolvable");
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [scopedCompanyId]);

        const links = await client.query<{
          equipment_ok: boolean;
          from_unit_ok: boolean;
          to_unit_ok: boolean;
          from_location_ok: boolean;
          to_location_ok: boolean;
        }>(
          `SELECT
             EXISTS (
               SELECT 1 FROM mdata.equipment e
               WHERE e.id = $2 AND (e.owner_company_id = $1 OR e.currently_leased_to_company_id = $1)
             ) AS equipment_ok,
             ($3::uuid IS NULL OR EXISTS (
               SELECT 1 FROM mdata.units u
               WHERE u.id = $3 AND (u.owner_company_id = $1 OR u.currently_leased_to_company_id = $1)
             )) AS from_unit_ok,
             ($4::uuid IS NULL OR EXISTS (
               SELECT 1 FROM mdata.units u
               WHERE u.id = $4 AND (u.owner_company_id = $1 OR u.currently_leased_to_company_id = $1)
             )) AS to_unit_ok,
             ($5::uuid IS NULL OR EXISTS (
               SELECT 1 FROM mdata.locations loc WHERE loc.id = $5 AND loc.operating_company_id = $1
             )) AS from_location_ok,
             ($6::uuid IS NULL OR EXISTS (
               SELECT 1 FROM mdata.locations loc WHERE loc.id = $6 AND loc.operating_company_id = $1
             )) AS to_location_ok`,
          [scopedCompanyId, b.equipment_id, b.from_unit_id ?? null, effectiveToUnitId, b.from_location_id ?? null, effectiveToLocationId]
        );
        const integrity = links.rows[0];
        if (
          !integrity?.equipment_ok ||
          !integrity.from_unit_ok ||
          !integrity.to_unit_ok ||
          !integrity.from_location_ok ||
          !integrity.to_location_ok
        ) {
          throw new Error("equipment_log_entity_not_in_operating_company");
        }

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
            effectiveToUnitId,
            b.from_location_id ?? null,
            effectiveToLocationId,
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
      const message = (err as Error).message;
      if (message === "equipment_log_company_not_resolvable") {
        return reply.code(400).send({ error: "equipment_log_company_not_resolvable" });
      }
      if (message === "equipment_log_entity_not_in_operating_company") {
        return reply.code(400).send({ error: "equipment_log_entity_not_in_operating_company" });
      }
      const code = (err as { code?: string }).code;
      if (code === "23503") return reply.code(400).send({ error: "invalid_equipment_log_fk_reference" });
      if (code === "23514") return reply.code(400).send({ error: "invalid_equipment_log_payload" });
      throw err;
    }
  });

  app.get("/api/v1/mdata/equipment-log/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    const parsedQuery = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const row = await withCurrentUser(authUser.uuid, async (client) => {
      // Entity scope (USMCA cross-entity leak fix): mdata.equipment_log has NO company column and its
      // RLS is role-scoped, so a bare `WHERE id = $1` lets an Owner read another entity's equipment
      // history by id. Resolve the explicitly selected company, not the account default: otherwise a
      // valid USMCA activity drill silently 404s whenever that user's default company is different.
      const scopedCompanyId = await resolveOperatingCompanyId(
        client,
        authUser.uuid,
        parsedQuery.data.operating_company_id
      );
      if (!scopedCompanyId) return null;
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [scopedCompanyId]);
      const res = await client.query(
        `
          SELECT
            el.id,
            el.equipment_id,
            el.event_type,
            el.event_at,
            el.from_unit_id,
            el.to_unit_id,
            el.from_location_id,
            el.to_location_id,
            el.status_before,
            el.status_after,
            el.notes,
            el.created_at,
            el.updated_at,
            el.created_by_user_id,
            el.updated_by_user_id
          FROM mdata.equipment_log el
          JOIN mdata.equipment e ON e.id = el.equipment_id
          WHERE el.id = $1
            AND (e.owner_company_id = $2 OR e.currently_leased_to_company_id = $2)
          LIMIT 1
        `,
        [parsedParams.data.id, scopedCompanyId]
      );
      const raw = res.rows[0] ?? null;
      return raw ? mapEquipmentLogRow(raw) : null;
    });

    if (!row) return reply.code(404).send({ error: "mdata_equipment_log_not_found" });
    return row;
  });
}
