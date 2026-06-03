import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit, buildPatchChanges } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { buildUnitAggregate } from "./unit-aggregate.service.js";
import { registerUnitDefaultDriverRoutes } from "./unit-default-driver.routes.js";
import { registerUnitDocumentsRoutes } from "./unit-documents.routes.js";
import { registerUnitPdfExportRoutes } from "./unit-pdf-export.routes.js";
import { registerUnitPhotosRoutes } from "./unit-photos.routes.js";
import { registerUnitPlatesRoutes } from "./unit-plates.routes.js";
import { registerUnitTripCostRoutes } from "./unit-trip-cost.routes.js";
import { getUnitFinancialYTD, type FinancialPeriod } from "./unit-financial.service.js";
import { fetchUnifiedFleetList } from "./units-unified-list.service.js";
import {
  applyUnitPatchFields,
  ownerOnlyPatchViolation,
  unitStatusSchema,
  updateUnitBodySchema,
} from "./unit-update-schema.js";


export { unitStatusSchema, updateUnitBodySchema, UNIT_PATCHABLE_FIELD_KEYS } from "./unit-update-schema.js";

export const UNIT_PROFILE_AUDIT_FIELD_KEYS = [
  "status",
  "status_change_reason",
  "quick_availability",
  "sold_date",
  "sold_to",
  "sold_price",
  "transferred_date",
  "transferred_to_entity",
  "damage_date",
  "damage_description",
  "repair_estimate",
  "oos_date",
  "oos_reason",
] as const;

const quickAvailabilitySchema = z.enum(["available", "booked", "holding"]).nullable();
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: unitStatusSchema.optional(),
  search: z.string().trim().min(1).max(100).optional(),
  operating_company_id: z.string().uuid().optional(),
  include: z.enum(["trailers"]).optional(),
});

const idParamSchema = z.object({ id: z.string().uuid() });

const createUnitBodySchema = z.object({
  unit_number: z.string().trim().min(1).max(100),
  vin: z.string().trim().min(1).max(100),
  make: z.string().trim().max(100).optional(),
  model: z.string().trim().max(100).optional(),
  year: z.number().int().min(1980).max(2100).optional(),
  license_plate: z.string().trim().max(50).optional(),
  license_state: z.string().trim().max(50).optional(),
  status: unitStatusSchema.default("InService"),
  assigned_driver_id: z.string().uuid().optional(),
  owner_company_id: z.string().uuid().optional(),
  currently_leased_to_company_id: z.string().uuid().optional(),
  acquired_date: isoDateSchema.optional(),
  notes: z.string().trim().max(2000).optional(),
});

const unitAggregateQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const quickAvailabilityBodySchema = z.object({
  value: quickAvailabilitySchema,
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

async function resolveAssetCompanyIds(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<{ id: string }> }> },
  userId: string,
  ownerCompanyId?: string,
  leasedCompanyId?: string
) {
  const resolvedOwnerId =
    ownerCompanyId ??
    (
      await client.query(
        `
          SELECT id
          FROM org.companies
          WHERE code = 'TRK'
            AND deactivated_at IS NULL
          LIMIT 1
        `
      )
    ).rows[0]?.id ??
    null;

  let resolvedLeasedId = leasedCompanyId ?? null;
  if (!resolvedLeasedId) {
    const res = await client.query(
      `
        SELECT c.id
        FROM identity.users u
        JOIN org.companies c ON c.id = u.default_company_id
        WHERE u.id = $1
          AND c.deactivated_at IS NULL
        UNION
        SELECT c.id
        FROM org.companies c
        WHERE c.id IN (SELECT org.user_accessible_company_ids())
        ORDER BY id
        LIMIT 1
      `,
      [userId]
    );
    resolvedLeasedId = res.rows[0]?.id ?? null;
  }

  return { resolvedOwnerId, resolvedLeasedId };
}

const ARCHIVE_STATUSES = new Set(["Sold", "Transferred", "Damaged"]);

export async function registerUnitsRoutes(app: FastifyInstance) {
  app.get("/api/v1/mdata/units", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedQuery = listQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);
    const { limit, offset, status, search, operating_company_id, include } = parsedQuery.data;

    if (include === "trailers") {
      const units = await withCurrentUser(authUser.uuid, async (client) => {
        if (operating_company_id) {
          await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operating_company_id]);
        }
        return fetchUnifiedFleetList(client, {
          limit,
          offset,
          status,
          search,
          operating_company_id,
        });
      });
      return { units };
    }

    const units = await withCurrentUser(authUser.uuid, async (client) => {
      const values: unknown[] = [];
      const filters: string[] = [];
      if (status) {
        values.push(status);
        filters.push(`status = $${values.length}`);
      }
      if (search) {
        values.push(`%${search}%`);
        const idx = values.length;
        filters.push(`(unit_number ILIKE $${idx} OR vin ILIKE $${idx} OR make ILIKE $${idx} OR model ILIKE $${idx})`);
      }
      if (operating_company_id) {
        values.push(operating_company_id);
        const idx = values.length;
        filters.push(`(owner_company_id = $${idx} OR currently_leased_to_company_id = $${idx})`);
      }
      values.push(limit);
      values.push(offset);
      const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
      const res = await client.query(
        `
          SELECT
            id, unit_number, vin, make, model, year, license_plate, license_state, status,
            assigned_driver_id, owner_company_id, currently_leased_to_company_id, acquired_date, disposed_date, notes,
            qbo_vendor_id, qbo_class_id,
            created_at, updated_at, deactivated_at, created_by_user_id, updated_by_user_id
          FROM mdata.units
          ${whereClause}
          ORDER BY created_at DESC
          LIMIT $${values.length - 1}
          OFFSET $${values.length}
        `,
        values
      );
      return res.rows;
    });

    return { units };
  });

  app.post("/api/v1/mdata/units", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedBody = createUnitBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;

    try {
      const created = await withCurrentUser(authUser.uuid, async (client) => {
        const { resolvedOwnerId, resolvedLeasedId } = await resolveAssetCompanyIds(
          client,
          authUser.uuid,
          b.owner_company_id,
          b.currently_leased_to_company_id
        );
        if (!resolvedOwnerId) {
          throw new Error("owner_company_id_required");
        }
        const res = await client.query(
          `
            INSERT INTO mdata.units (
              unit_number, vin, make, model, year, license_plate, license_state, status,
              assigned_driver_id, owner_company_id, currently_leased_to_company_id, acquired_date, notes, created_by_user_id, updated_by_user_id
            ) VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14
            )
            RETURNING
              id, unit_number, vin, make, model, year, license_plate, license_state, status,
              assigned_driver_id, owner_company_id, currently_leased_to_company_id, acquired_date, disposed_date, notes,
              created_at, updated_at, deactivated_at, created_by_user_id, updated_by_user_id
          `,
          [
            b.unit_number,
            b.vin,
            b.make ?? null,
            b.model ?? null,
            b.year ?? null,
            b.license_plate ?? null,
            b.license_state ?? null,
            b.status,
            b.assigned_driver_id ?? null,
            resolvedOwnerId,
            resolvedLeasedId,
            b.acquired_date ?? null,
            b.notes ?? null,
            authUser.uuid,
          ]
        );
        const row = res.rows[0];
        await appendCrudAudit(client, authUser.uuid, "mdata.units.created", {
          resource_id: row.id,
          resource_type: "mdata.units",
          id: row.id,
          unit_number: row.unit_number,
          vin: row.vin,
          status: row.status,
        });
        return row;
      });
      return reply.code(201).send(created);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "23505") return reply.code(409).send({ error: "mdata_unit_conflict" });
      if (code === "23503") return reply.code(400).send({ error: "invalid_assigned_driver_id" });
      if ((err as Error).message === "owner_company_id_required") {
        return reply.code(400).send({ error: "owner_company_id_required" });
      }
      throw err;
    }
  });

  app.get("/api/v1/mdata/units/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedQuery = unitAggregateQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const aggregate = await withCurrentUser(authUser.uuid, async (client) =>
      buildUnitAggregate(client, parsedParams.data.id, parsedQuery.data.operating_company_id)
    );
    if (!aggregate) return reply.code(404).send({ error: "mdata_unit_not_found" });
    return aggregate;
  });

  app.get("/api/v1/mdata/units/:id/financial", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedQuery = unitAggregateQuerySchema
      .extend({ period: z.enum(["YTD", "quarter", "month"]).default("YTD") })
      .safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const financial = await withCurrentUser(authUser.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [
        parsedQuery.data.operating_company_id,
      ]);
      return getUnitFinancialYTD(
        client,
        parsedParams.data.id,
        parsedQuery.data.operating_company_id,
        parsedQuery.data.period as FinancialPeriod
      );
    });
    return financial;
  });

  app.patch("/api/v1/mdata/units/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = updateUnitBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;
    const ownerViolation = ownerOnlyPatchViolation(authUser.role, b as Record<string, unknown>);
    if (ownerViolation) {
      return reply.code(403).send({ error: "owner_only_field", field: ownerViolation });
    }

    const setParts: string[] = [];
    const values: unknown[] = [];
    const add = (col: string, val: unknown) => {
      values.push(val);
      setParts.push(`${col} = $${values.length}`);
    };
    applyUnitPatchFields(b, add);
    if ("status" in b && typeof b.status === "string" && ARCHIVE_STATUSES.has(b.status)) {
      add("deactivated_at", new Date().toISOString().slice(0, 10));
    }
    if ("status" in b) {
      add("status_changed_at", new Date().toISOString());
      add("status_changed_by_user_id", authUser.uuid);
    }
    add("updated_by_user_id", authUser.uuid);

    values.push(parsedParams.data.id);
    const idIdx = values.length;
    try {
      const updated = await withCurrentUser(authUser.uuid, async (client) => {
        const oldRes = await client.query(`SELECT * FROM mdata.units WHERE id = $1 LIMIT 1`, [parsedParams.data.id]);
        const oldRow = oldRes.rows[0] ?? null;
        if (!oldRow) return null;

        const res = await client.query(
          `
            UPDATE mdata.units
            SET ${setParts.join(", ")}
            WHERE id = $${idIdx}
            RETURNING *
          `,
          values
        );
        const updatedRow = res.rows[0] ?? null;
        if (!updatedRow) return null;

        const changes = buildPatchChanges(
          b as unknown as Record<string, unknown>,
          oldRow as Record<string, unknown>,
          updatedRow as Record<string, unknown>
        );
        const profileAuditFields = Object.fromEntries(
          UNIT_PROFILE_AUDIT_FIELD_KEYS.filter((key) => key in b).map((key) => [key, (b as Record<string, unknown>)[key]])
        );
        const statusChanged = "status" in b && oldRow.status !== updatedRow.status;
        const auditAction = statusChanged ? "mdata.unit.status_changed" : "mdata.units.updated";
        await appendCrudAudit(client, authUser.uuid, auditAction, {
          resource_id: updatedRow.id,
          resource_type: "mdata.units",
          changes,
          profile_fields: profileAuditFields,
          ...(statusChanged
            ? { before_status: oldRow.status, after_status: updatedRow.status, status_change_reason: updatedRow.status_change_reason }
            : {}),
        });
        return updatedRow;
      });
      if (!updated) return reply.code(404).send({ error: "mdata_unit_not_found" });
      return updated;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "23505") return reply.code(409).send({ error: "mdata_unit_conflict" });
      if (code === "23503") return reply.code(400).send({ error: "invalid_assigned_driver_id" });
      throw err;
    }
  });

  app.post("/api/v1/mdata/units/:id/deactivate", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const deactivated = await withCurrentUser(authUser.uuid, async (client) => {
      const oldRes = await client.query(
        `
          SELECT id, deactivated_at
          FROM mdata.units
          WHERE id = $1
          LIMIT 1
        `,
        [parsedParams.data.id]
      );
      const oldRow = oldRes.rows[0] ?? null;
      if (!oldRow) return null;

      let deactivatedAt = oldRow.deactivated_at as string | null;
      let wasAlreadyDeactivated = oldRow.deactivated_at !== null;
      if (!wasAlreadyDeactivated) {
        const res = await client.query(
          `
            UPDATE mdata.units
            SET deactivated_at = now(), updated_by_user_id = $2
            WHERE id = $1
              AND deactivated_at IS NULL
            RETURNING id, deactivated_at
          `,
          [parsedParams.data.id, authUser.uuid]
        );
        deactivatedAt = (res.rows[0]?.deactivated_at as string | undefined) ?? deactivatedAt;
        wasAlreadyDeactivated = false;
      }

      await appendCrudAudit(client, authUser.uuid, "mdata.units.deactivated", {
        resource_id: oldRow.id,
        resource_type: "mdata.units",
        was_already_deactivated: wasAlreadyDeactivated,
      });

      return { id: oldRow.id, deactivated_at: deactivatedAt, was_already_deactivated: wasAlreadyDeactivated };
    });
    if (!deactivated) return reply.code(404).send({ error: "mdata_unit_not_found" });
    return deactivated;
  });

  app.post("/api/v1/mdata/units/:id/quick-availability", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    const parsedQuery = unitAggregateQuerySchema.safeParse(req.query ?? {});
    const parsedBody = quickAvailabilityBodySchema.safeParse(req.body ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const updated = await withCurrentUser(authUser.uuid, async (client) => {
      const oldRes = await client.query(`SELECT * FROM mdata.units WHERE id = $1 LIMIT 1`, [parsedParams.data.id]);
      const oldRow = oldRes.rows[0];
      if (!oldRow) return null;
      const res = await client.query(
        `
          UPDATE mdata.units
          SET quick_availability = $2, updated_by_user_id = $3, updated_at = now()
          WHERE id = $1
          RETURNING id, quick_availability
        `,
        [parsedParams.data.id, parsedBody.data.value, authUser.uuid]
      );
      const row = res.rows[0];
      await appendCrudAudit(client, authUser.uuid, "mdata.unit.quick_availability_changed", {
        resource_id: row.id,
        before: oldRow.quick_availability,
        after: row.quick_availability,
        profile_fields: { quick_availability: parsedBody.data.value },
      });
      return row;
    });
    if (!updated) return reply.code(404).send({ error: "mdata_unit_not_found" });
    return updated;
  });

  await registerUnitPlatesRoutes(app);
  await registerUnitDefaultDriverRoutes(app);
  await registerUnitPhotosRoutes(app);
  await registerUnitDocumentsRoutes(app);
  await registerUnitTripCostRoutes(app);
  await registerUnitPdfExportRoutes(app);
}
