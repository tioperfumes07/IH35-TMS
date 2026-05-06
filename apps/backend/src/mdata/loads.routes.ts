import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit, buildPatchChanges } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const loadStatusSchema = z.enum([
  "draft",
  "booked",
  "planned",
  "assigned",
  "dispatched",
  "at_pickup",
  "in_transit",
  "at_delivery",
  "delivered",
  "invoiced",
  "paid",
  "closed",
  "cancelled",
]);

const stopTypeSchema = z.enum(["pickup", "delivery", "fuel", "rest", "border"]);
const stopStatusSchema = z.enum(["pending", "arrived", "departed", "cancelled"]);
const isoDatetimeSchema = z.string().datetime({ offset: true });

const listLoadsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: loadStatusSchema.optional(),
  customer_id: z.string().uuid().optional(),
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const loadIdParamSchema = z.object({ id: z.string().uuid() });
const loadStopParamsSchema = z.object({
  id: z.string().uuid(),
  stopId: z.string().uuid(),
});

const createLoadBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  customer_id: z.string().uuid(),
  status: loadStatusSchema.default("draft"),
  rate_total_cents: z.coerce.number().int().min(0).default(0),
  currency_code: z.enum(["USD", "MXN"]).default("USD"),
  assigned_unit_id: z.string().uuid().optional(),
  assigned_primary_driver_id: z.string().uuid().optional(),
  assigned_secondary_driver_id: z.string().uuid().optional(),
  notes: z.string().trim().max(5000).optional(),
});

const updateLoadBodySchema = z
  .object({
    customer_id: z.string().uuid().optional(),
    status: loadStatusSchema.optional(),
    rate_total_cents: z.coerce.number().int().min(0).optional(),
    currency_code: z.enum(["USD", "MXN"]).optional(),
    assigned_unit_id: z.string().uuid().nullable().optional(),
    assigned_primary_driver_id: z.string().uuid().nullable().optional(),
    assigned_secondary_driver_id: z.string().uuid().nullable().optional(),
    notes: z.string().trim().max(5000).nullable().optional(),
    soft_deleted_at: isoDatetimeSchema.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "at least one field is required" });

const createStopBodySchema = z.object({
  sequence_number: z.coerce.number().int().min(1),
  stop_type: stopTypeSchema,
  location_id: z.string().uuid().optional(),
  address_line1: z.string().trim().max(300).optional(),
  city: z.string().trim().max(120).optional(),
  state: z.string().trim().max(120).optional(),
  country: z.string().trim().max(120).optional(),
  scheduled_arrival_at: isoDatetimeSchema.optional(),
  scheduled_departure_at: isoDatetimeSchema.optional(),
  actual_arrival_at: isoDatetimeSchema.optional(),
  actual_departure_at: isoDatetimeSchema.optional(),
  status: stopStatusSchema.default("pending"),
  notes: z.string().trim().max(5000).optional(),
});

const updateStopBodySchema = z
  .object({
    sequence_number: z.coerce.number().int().min(1).optional(),
    stop_type: stopTypeSchema.optional(),
    location_id: z.string().uuid().nullable().optional(),
    address_line1: z.string().trim().max(300).nullable().optional(),
    city: z.string().trim().max(120).nullable().optional(),
    state: z.string().trim().max(120).nullable().optional(),
    country: z.string().trim().max(120).nullable().optional(),
    scheduled_arrival_at: isoDatetimeSchema.nullable().optional(),
    scheduled_departure_at: isoDatetimeSchema.nullable().optional(),
    actual_arrival_at: isoDatetimeSchema.nullable().optional(),
    actual_departure_at: isoDatetimeSchema.nullable().optional(),
    status: stopStatusSchema.optional(),
    notes: z.string().trim().max(5000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "at least one field is required" });

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function isOfficeWriteRole(role: string): boolean {
  return role === "Owner" || role === "Administrator" || role === "Manager" || role === "Dispatcher";
}

function toCompanyLoadToken(input: string | null | undefined): string {
  const cleaned = String(input ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return cleaned || "COMP";
}

async function nextLoadNumber(
  client: {
    query: <T extends Record<string, unknown> = Record<string, unknown>>(
      sql: string,
      values?: unknown[]
    ) => Promise<{ rows: T[] }>;
  },
  operatingCompanyId: string
): Promise<string> {
  const companyRes = await client.query<{ code: string | null; short_name: string | null }>(
    `
      SELECT code, short_name
      FROM org.companies
      WHERE id = $1
      LIMIT 1
    `,
    [operatingCompanyId]
  );
  const company = companyRes.rows[0];
  if (!company) throw new Error("operating_company_not_found");
  const token = toCompanyLoadToken(company.short_name ?? company.code);
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `L${token}-${datePart}-`;

  const seqRes = await client.query<{ next_seq: number }>(
    `
      SELECT COALESCE(MAX(COALESCE(NULLIF(substring(load_number FROM '([0-9]{4})$'), ''), '0')::int), 0) + 1 AS next_seq
      FROM mdata.loads
      WHERE operating_company_id = $1
        AND load_number LIKE $2
    `,
    [operatingCompanyId, `${prefix}%`]
  );
  const nextSeq = Number(seqRes.rows[0]?.next_seq ?? 1);
  return `${prefix}${String(nextSeq).padStart(4, "0")}`;
}

export async function registerLoadRoutes(app: FastifyInstance) {
  app.post("/api/v1/mdata/loads", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isOfficeWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const parsedBody = createLoadBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;

    try {
      const created = await withCurrentUser(authUser.uuid, async (client) => {
        const customerRes = await client.query<{ id: string }>(
          `
            SELECT id
            FROM mdata.customers
            WHERE id = $1
              AND operating_company_id = $2
              AND deactivated_at IS NULL
            LIMIT 1
          `,
          [b.customer_id, b.operating_company_id]
        );
        if (customerRes.rows.length === 0) {
          return { error: "invalid_customer_for_company" as const };
        }

        let loadNumber = "";
        let inserted: Record<string, unknown> | null = null;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          loadNumber = await nextLoadNumber(client, b.operating_company_id);
          try {
            const res = await client.query(
              `
                INSERT INTO mdata.loads (
                  operating_company_id, load_number, customer_id, status, rate_total_cents, currency_code,
                  assigned_unit_id, assigned_primary_driver_id, assigned_secondary_driver_id,
                  dispatcher_user_id, notes
                ) VALUES (
                  $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11
                )
                RETURNING
                  id, operating_company_id, load_number, customer_id, status, rate_total_cents, currency_code,
                  assigned_unit_id, assigned_primary_driver_id, assigned_secondary_driver_id,
                  dispatcher_user_id, notes, created_at, updated_at, soft_deleted_at, deleted_by_user_id
              `,
              [
                b.operating_company_id,
                loadNumber,
                b.customer_id,
                b.status,
                b.rate_total_cents,
                b.currency_code,
                b.assigned_unit_id ?? null,
                b.assigned_primary_driver_id ?? null,
                b.assigned_secondary_driver_id ?? null,
                authUser.uuid,
                b.notes ?? null,
              ]
            );
            inserted = res.rows[0] ?? null;
            break;
          } catch (err) {
            if ((err as { code?: string }).code !== "23505") throw err;
            if (attempt === 2) throw err;
          }
        }
        if (!inserted) throw new Error("load_insert_failed");

        await appendCrudAudit(
          client,
          authUser.uuid,
          "mdata.loads.created",
          {
            resource_id: inserted.id,
            resource_type: "mdata.loads",
            load_number: inserted.load_number,
            operating_company_id: inserted.operating_company_id,
            customer_id: inserted.customer_id,
            status: inserted.status,
          },
          "info",
          "BT-3-LOADS-SCHEMA"
        );

        if (inserted.assigned_unit_id || inserted.assigned_primary_driver_id || inserted.assigned_secondary_driver_id) {
          await appendCrudAudit(
            client,
            authUser.uuid,
            "mdata.loads.assigned",
            {
              resource_id: inserted.id,
              resource_type: "mdata.loads",
              assigned_unit_id: inserted.assigned_unit_id,
              assigned_primary_driver_id: inserted.assigned_primary_driver_id,
              assigned_secondary_driver_id: inserted.assigned_secondary_driver_id,
            },
            "info",
            "BT-3-LOADS-SCHEMA"
          );
        }

        return inserted;
      });

      if (created && typeof created === "object" && "error" in created) {
        if (created.error === "invalid_customer_for_company") return reply.code(400).send({ error: created.error });
      }

      return reply.code(201).send(created);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "23503") return reply.code(400).send({ error: "invalid_foreign_key" });
      if (code === "23505") return reply.code(409).send({ error: "mdata_load_conflict" });
      throw err;
    }
  });

  app.get("/api/v1/mdata/loads", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedQuery = listLoadsQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);
    const { limit, offset, status, customer_id, from_date, to_date } = parsedQuery.data;

    const rows = await withCurrentUser(authUser.uuid, async (client) => {
      const values: unknown[] = [];
      const filters: string[] = ["soft_deleted_at IS NULL"];
      if (status) {
        values.push(status);
        filters.push(`status = $${values.length}`);
      }
      if (customer_id) {
        values.push(customer_id);
        filters.push(`customer_id = $${values.length}`);
      }
      if (from_date) {
        values.push(from_date);
        filters.push(`created_at::date >= $${values.length}`);
      }
      if (to_date) {
        values.push(to_date);
        filters.push(`created_at::date <= $${values.length}`);
      }
      values.push(limit);
      values.push(offset);
      const whereClause = `WHERE ${filters.join(" AND ")}`;
      const res = await client.query(
        `
          SELECT
            id, operating_company_id, load_number, customer_id, status, rate_total_cents, currency_code,
            assigned_unit_id, assigned_primary_driver_id, assigned_secondary_driver_id,
            dispatcher_user_id, notes, created_at, updated_at, soft_deleted_at, deleted_by_user_id
          FROM mdata.loads
          ${whereClause}
          ORDER BY created_at DESC
          LIMIT $${values.length - 1}
          OFFSET $${values.length}
        `,
        values
      );
      return res.rows;
    });

    return { loads: rows };
  });

  app.get("/api/v1/mdata/loads/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedParams = loadIdParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const detail = await withCurrentUser(authUser.uuid, async (client) => {
      const loadRes = await client.query(
        `
          SELECT
            id, operating_company_id, load_number, customer_id, status, rate_total_cents, currency_code,
            assigned_unit_id, assigned_primary_driver_id, assigned_secondary_driver_id,
            dispatcher_user_id, notes, created_at, updated_at, soft_deleted_at, deleted_by_user_id
          FROM mdata.loads
          WHERE id = $1
          LIMIT 1
        `,
        [parsedParams.data.id]
      );
      const load = loadRes.rows[0] ?? null;
      if (!load) return null;

      const stopsRes = await client.query(
        `
          SELECT
            id, load_id, sequence_number, stop_type, location_id, address_line1, city, state, country,
            scheduled_arrival_at, scheduled_departure_at, actual_arrival_at, actual_departure_at,
            status, notes, created_at, updated_at
          FROM mdata.load_stops
          WHERE load_id = $1
          ORDER BY sequence_number ASC, created_at ASC
        `,
        [parsedParams.data.id]
      );
      return { ...load, stops: stopsRes.rows };
    });

    if (!detail) return reply.code(404).send({ error: "mdata_load_not_found" });
    return detail;
  });

  app.patch("/api/v1/mdata/loads/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isOfficeWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const parsedParams = loadIdParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = updateLoadBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;

    const setParts: string[] = [];
    const values: unknown[] = [];
    const add = (col: string, val: unknown) => {
      values.push(val);
      setParts.push(`${col} = $${values.length}`);
    };

    if ("customer_id" in b) add("customer_id", b.customer_id);
    if ("status" in b) add("status", b.status);
    if ("rate_total_cents" in b) add("rate_total_cents", b.rate_total_cents);
    if ("currency_code" in b) add("currency_code", b.currency_code);
    if ("assigned_unit_id" in b) add("assigned_unit_id", b.assigned_unit_id ?? null);
    if ("assigned_primary_driver_id" in b) add("assigned_primary_driver_id", b.assigned_primary_driver_id ?? null);
    if ("assigned_secondary_driver_id" in b) add("assigned_secondary_driver_id", b.assigned_secondary_driver_id ?? null);
    if ("notes" in b) add("notes", b.notes ?? null);
    if ("soft_deleted_at" in b) {
      add("soft_deleted_at", b.soft_deleted_at ?? null);
      if (b.soft_deleted_at) {
        add("deleted_by_user_id", authUser.uuid);
      } else {
        add("deleted_by_user_id", null);
      }
    }

    values.push(parsedParams.data.id);
    const idIdx = values.length;

    try {
      const updated = await withCurrentUser(authUser.uuid, async (client) => {
        const oldRes = await client.query(
          `
            SELECT
              id, operating_company_id, load_number, customer_id, status, rate_total_cents, currency_code,
              assigned_unit_id, assigned_primary_driver_id, assigned_secondary_driver_id,
              dispatcher_user_id, notes, created_at, updated_at, soft_deleted_at, deleted_by_user_id
            FROM mdata.loads
            WHERE id = $1
            LIMIT 1
          `,
          [parsedParams.data.id]
        );
        const oldRow = oldRes.rows[0] ?? null;
        if (!oldRow) return null;

        const res = await client.query(
          `
            UPDATE mdata.loads
            SET ${setParts.join(", ")}
            WHERE id = $${idIdx}
            RETURNING
              id, operating_company_id, load_number, customer_id, status, rate_total_cents, currency_code,
              assigned_unit_id, assigned_primary_driver_id, assigned_secondary_driver_id,
              dispatcher_user_id, notes, created_at, updated_at, soft_deleted_at, deleted_by_user_id
          `,
          values
        );
        const row = res.rows[0] ?? null;
        if (!row) return null;

        const changes = buildPatchChanges(
          b as unknown as Record<string, unknown>,
          oldRow as Record<string, unknown>,
          row as Record<string, unknown>
        );
        await appendCrudAudit(
          client,
          authUser.uuid,
          "mdata.loads.updated",
          {
            resource_id: row.id,
            resource_type: "mdata.loads",
            changes,
          },
          "info",
          "BT-3-LOADS-SCHEMA"
        );

        if (String(oldRow.status) !== String(row.status)) {
          await appendCrudAudit(
            client,
            authUser.uuid,
            "mdata.loads.status_changed",
            {
              resource_id: row.id,
              resource_type: "mdata.loads",
              from_status: oldRow.status,
              to_status: row.status,
            },
            "info",
            "BT-3-LOADS-SCHEMA"
          );
          if (row.status === "cancelled") {
            await appendCrudAudit(
              client,
              authUser.uuid,
              "mdata.loads.cancelled",
              {
                resource_id: row.id,
                resource_type: "mdata.loads",
                from_status: oldRow.status,
                to_status: row.status,
              },
              "warning",
              "BT-3-LOADS-SCHEMA"
            );
          }
        }

        if (
          oldRow.assigned_unit_id !== row.assigned_unit_id ||
          oldRow.assigned_primary_driver_id !== row.assigned_primary_driver_id ||
          oldRow.assigned_secondary_driver_id !== row.assigned_secondary_driver_id
        ) {
          await appendCrudAudit(
            client,
            authUser.uuid,
            "mdata.loads.assigned",
            {
              resource_id: row.id,
              resource_type: "mdata.loads",
              assigned_unit_id: row.assigned_unit_id,
              assigned_primary_driver_id: row.assigned_primary_driver_id,
              assigned_secondary_driver_id: row.assigned_secondary_driver_id,
            },
            "info",
            "BT-3-LOADS-SCHEMA"
          );
        }

        if (!oldRow.soft_deleted_at && row.soft_deleted_at) {
          await appendCrudAudit(
            client,
            authUser.uuid,
            "mdata.loads.deleted",
            {
              resource_id: row.id,
              resource_type: "mdata.loads",
              soft_deleted_at: row.soft_deleted_at,
            },
            "warning",
            "BT-3-LOADS-SCHEMA"
          );
        }

        return row;
      });

      if (!updated) return reply.code(404).send({ error: "mdata_load_not_found" });
      return updated;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "23505") return reply.code(409).send({ error: "mdata_load_conflict" });
      if (code === "23503") return reply.code(400).send({ error: "invalid_foreign_key" });
      throw err;
    }
  });

  app.post("/api/v1/mdata/loads/:id/stops", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isOfficeWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = loadIdParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = createStopBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;

    try {
      const created = await withCurrentUser(authUser.uuid, async (client) => {
        const loadRes = await client.query(`SELECT id FROM mdata.loads WHERE id = $1 LIMIT 1`, [parsedParams.data.id]);
        if (loadRes.rows.length === 0) return null;

        const res = await client.query(
          `
            INSERT INTO mdata.load_stops (
              load_id, sequence_number, stop_type, location_id, address_line1, city, state, country,
              scheduled_arrival_at, scheduled_departure_at, actual_arrival_at, actual_departure_at, status, notes
            ) VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
            )
            RETURNING
              id, load_id, sequence_number, stop_type, location_id, address_line1, city, state, country,
              scheduled_arrival_at, scheduled_departure_at, actual_arrival_at, actual_departure_at, status, notes, created_at, updated_at
          `,
          [
            parsedParams.data.id,
            b.sequence_number,
            b.stop_type,
            b.location_id ?? null,
            b.address_line1 ?? null,
            b.city ?? null,
            b.state ?? null,
            b.country ?? null,
            b.scheduled_arrival_at ?? null,
            b.scheduled_departure_at ?? null,
            b.actual_arrival_at ?? null,
            b.actual_departure_at ?? null,
            b.status,
            b.notes ?? null,
          ]
        );
        const row = res.rows[0];
        await appendCrudAudit(
          client,
          authUser.uuid,
          "mdata.load_stops.created",
          {
            resource_id: row.id,
            resource_type: "mdata.load_stops",
            load_id: row.load_id,
            sequence_number: row.sequence_number,
            stop_type: row.stop_type,
            status: row.status,
          },
          "info",
          "BT-3-LOADS-SCHEMA"
        );
        return row;
      });

      if (!created) return reply.code(404).send({ error: "mdata_load_not_found" });
      return reply.code(201).send(created);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "23505") return reply.code(409).send({ error: "mdata_load_stop_conflict" });
      if (code === "23503") return reply.code(400).send({ error: "invalid_foreign_key" });
      throw err;
    }
  });

  app.patch("/api/v1/mdata/loads/:id/stops/:stopId", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isOfficeWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = loadStopParamsSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = updateStopBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;

    const setParts: string[] = [];
    const values: unknown[] = [];
    const add = (col: string, val: unknown) => {
      values.push(val);
      setParts.push(`${col} = $${values.length}`);
    };

    if ("sequence_number" in b) add("sequence_number", b.sequence_number);
    if ("stop_type" in b) add("stop_type", b.stop_type);
    if ("location_id" in b) add("location_id", b.location_id ?? null);
    if ("address_line1" in b) add("address_line1", b.address_line1 ?? null);
    if ("city" in b) add("city", b.city ?? null);
    if ("state" in b) add("state", b.state ?? null);
    if ("country" in b) add("country", b.country ?? null);
    if ("scheduled_arrival_at" in b) add("scheduled_arrival_at", b.scheduled_arrival_at ?? null);
    if ("scheduled_departure_at" in b) add("scheduled_departure_at", b.scheduled_departure_at ?? null);
    if ("actual_arrival_at" in b) add("actual_arrival_at", b.actual_arrival_at ?? null);
    if ("actual_departure_at" in b) add("actual_departure_at", b.actual_departure_at ?? null);
    if ("status" in b) add("status", b.status);
    if ("notes" in b) add("notes", b.notes ?? null);

    values.push(parsedParams.data.id);
    const loadIdx = values.length;
    values.push(parsedParams.data.stopId);
    const stopIdx = values.length;

    try {
      const updated = await withCurrentUser(authUser.uuid, async (client) => {
        const oldRes = await client.query(
          `
            SELECT
              id, load_id, sequence_number, stop_type, location_id, address_line1, city, state, country,
              scheduled_arrival_at, scheduled_departure_at, actual_arrival_at, actual_departure_at, status, notes, created_at, updated_at
            FROM mdata.load_stops
            WHERE load_id = $1
              AND id = $2
            LIMIT 1
          `,
          [parsedParams.data.id, parsedParams.data.stopId]
        );
        const oldRow = oldRes.rows[0] ?? null;
        if (!oldRow) return null;

        const res = await client.query(
          `
            UPDATE mdata.load_stops
            SET ${setParts.join(", ")}
            WHERE load_id = $${loadIdx}
              AND id = $${stopIdx}
            RETURNING
              id, load_id, sequence_number, stop_type, location_id, address_line1, city, state, country,
              scheduled_arrival_at, scheduled_departure_at, actual_arrival_at, actual_departure_at, status, notes, created_at, updated_at
          `,
          values
        );
        const row = res.rows[0] ?? null;
        if (!row) return null;

        const changes = buildPatchChanges(
          b as unknown as Record<string, unknown>,
          oldRow as Record<string, unknown>,
          row as Record<string, unknown>
        );
        await appendCrudAudit(
          client,
          authUser.uuid,
          "mdata.load_stops.updated",
          {
            resource_id: row.id,
            resource_type: "mdata.load_stops",
            load_id: row.load_id,
            changes,
          },
          "info",
          "BT-3-LOADS-SCHEMA"
        );

        if (String(oldRow.status) !== String(row.status)) {
          await appendCrudAudit(
            client,
            authUser.uuid,
            "mdata.load_stops.status_changed",
            {
              resource_id: row.id,
              resource_type: "mdata.load_stops",
              load_id: row.load_id,
              from_status: oldRow.status,
              to_status: row.status,
            },
            "info",
            "BT-3-LOADS-SCHEMA"
          );
        }

        return row;
      });

      if (!updated) return reply.code(404).send({ error: "mdata_load_stop_not_found" });
      return updated;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "23505") return reply.code(409).send({ error: "mdata_load_stop_conflict" });
      if (code === "23503") return reply.code(400).send({ error: "invalid_foreign_key" });
      throw err;
    }
  });

  app.delete("/api/v1/mdata/loads/:id/stops/:stopId", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isOfficeWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = loadStopParamsSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const removed = await withCurrentUser(authUser.uuid, async (client) => {
      const res = await client.query(
        `
          DELETE FROM mdata.load_stops
          WHERE load_id = $1
            AND id = $2
          RETURNING id, load_id, sequence_number, stop_type, status
        `,
        [parsedParams.data.id, parsedParams.data.stopId]
      );
      const row = res.rows[0] ?? null;
      if (!row) return null;
      await appendCrudAudit(
        client,
        authUser.uuid,
        "mdata.load_stops.updated",
        {
          resource_id: row.id,
          resource_type: "mdata.load_stops",
          load_id: row.load_id,
          action: "deleted",
          sequence_number: row.sequence_number,
          stop_type: row.stop_type,
          prior_status: row.status,
        },
        "warning",
        "BT-3-LOADS-SCHEMA"
      );
      return row;
    });

    if (!removed) return reply.code(404).send({ error: "mdata_load_stop_not_found" });
    return { ok: true };
  });
}
