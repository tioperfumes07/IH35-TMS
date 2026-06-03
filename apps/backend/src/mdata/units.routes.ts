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

export const unitStatusSchema = z.enum([
  "InService",
  "OutOfService",
  "InMaintenance",
  "Sold",
  "Damaged",
  "Transferred",
]);

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

const updateUnitBodySchema = z
  .object({
    unit_number: z.string().trim().min(1).max(100).optional(),
    vin: z.string().trim().min(1).max(100).optional(),
    make: z.string().trim().max(100).nullable().optional(),
    model: z.string().trim().max(100).nullable().optional(),
    year: z.number().int().min(1980).max(2100).nullable().optional(),
    license_plate: z.string().trim().max(50).nullable().optional(),
    license_state: z.string().trim().max(50).nullable().optional(),
    status: unitStatusSchema.optional(),
    assigned_driver_id: z.string().uuid().nullable().optional(),
    owner_company_id: z.string().uuid().optional(),
    currently_leased_to_company_id: z.string().uuid().nullable().optional(),
    acquired_date: isoDateSchema.nullable().optional(),
    disposed_date: isoDateSchema.nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    deactivated_at: isoDateSchema.nullable().optional(),
    qbo_vendor_id: z.string().trim().max(120).nullable().optional(),
    qbo_class_id: z.string().trim().max(120).nullable().optional(),
    status_change_reason: z.string().trim().max(2000).nullable().optional(),
    sold_date: isoDateSchema.nullable().optional(),
    sold_to: z.string().trim().max(200).nullable().optional(),
    sold_price: z.number().nonnegative().nullable().optional(),
    transferred_date: isoDateSchema.nullable().optional(),
    transferred_to_entity: z.enum(["TRK", "TRANSP", "USMCA"]).nullable().optional(),
    damage_date: isoDateSchema.nullable().optional(),
    damage_description: z.string().trim().max(4000).nullable().optional(),
    repair_estimate: z.number().nonnegative().nullable().optional(),
    oos_date: isoDateSchema.nullable().optional(),
    oos_reason: z.string().trim().max(2000).nullable().optional(),
    quick_availability: quickAvailabilitySchema.optional(),
    texas_irp_number: z.string().trim().max(120).nullable().optional(),
    irp_account_number: z.string().trim().max(120).nullable().optional(),
    irp_registered_jurisdictions: z.record(z.string(), z.unknown()).nullable().optional(),
    irp_expiration: isoDateSchema.nullable().optional(),
    irp_registered_weight_lbs: z.number().int().nonnegative().nullable().optional(),
    operation_country: z.enum(["US", "MX", "cross_border"]).nullable().optional(),
    sct_permit_number: z.string().trim().max(120).nullable().optional(),
    sct_permit_expiration: isoDateSchema.nullable().optional(),
    pita_status: z.string().trim().max(120).nullable().optional(),
    pita_permit_number: z.string().trim().max(120).nullable().optional(),
    pita_expiration: isoDateSchema.nullable().optional(),
    ctpat_status: z.string().trim().max(120).nullable().optional(),
    oea_status: z.string().trim().max(120).nullable().optional(),
    hazmat_endorsement: z.boolean().optional(),
    us_insurance_policy_number: z.string().trim().max(120).nullable().optional(),
    us_insurance_carrier: z.string().trim().max(200).nullable().optional(),
    us_insurance_expiration: isoDateSchema.nullable().optional(),
    mx_insurance_policy_number: z.string().trim().max(120).nullable().optional(),
    mx_insurance_carrier: z.string().trim().max(200).nullable().optional(),
    mx_insurance_expiration: isoDateSchema.nullable().optional(),
    title_status: z.enum(["owned", "financed", "leased"]).nullable().optional(),
    lien_holder: z.string().trim().max(200).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "at least one field is required" });

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

function applyUnitPatchFields(b: z.infer<typeof updateUnitBodySchema>, add: (col: string, val: unknown) => void) {
  if ("unit_number" in b) add("unit_number", b.unit_number ?? null);
  if ("vin" in b) add("vin", b.vin ?? null);
  if ("make" in b) add("make", b.make ?? null);
  if ("model" in b) add("model", b.model ?? null);
  if ("year" in b) add("year", b.year ?? null);
  if ("license_plate" in b) add("license_plate", b.license_plate ?? null);
  if ("license_state" in b) add("license_state", b.license_state ?? null);
  if ("status" in b) add("status", b.status ?? null);
  if ("assigned_driver_id" in b) add("assigned_driver_id", b.assigned_driver_id ?? null);
  if ("owner_company_id" in b) add("owner_company_id", b.owner_company_id ?? null);
  if ("currently_leased_to_company_id" in b) add("currently_leased_to_company_id", b.currently_leased_to_company_id ?? null);
  if ("acquired_date" in b) add("acquired_date", b.acquired_date ?? null);
  if ("disposed_date" in b) add("disposed_date", b.disposed_date ?? null);
  if ("notes" in b) add("notes", b.notes ?? null);
  if ("qbo_vendor_id" in b) add("qbo_vendor_id", b.qbo_vendor_id ?? null);
  if ("qbo_class_id" in b) add("qbo_class_id", b.qbo_class_id ?? null);
  if ("deactivated_at" in b) add("deactivated_at", b.deactivated_at ?? null);
  if ("status_change_reason" in b) add("status_change_reason", b.status_change_reason ?? null);
  if ("sold_date" in b) add("sold_date", b.sold_date ?? null);
  if ("sold_to" in b) add("sold_to", b.sold_to ?? null);
  if ("sold_price" in b) add("sold_price", b.sold_price ?? null);
  if ("transferred_date" in b) add("transferred_date", b.transferred_date ?? null);
  if ("transferred_to_entity" in b) add("transferred_to_entity", b.transferred_to_entity ?? null);
  if ("damage_date" in b) add("damage_date", b.damage_date ?? null);
  if ("damage_description" in b) add("damage_description", b.damage_description ?? null);
  if ("repair_estimate" in b) add("repair_estimate", b.repair_estimate ?? null);
  if ("oos_date" in b) add("oos_date", b.oos_date ?? null);
  if ("oos_reason" in b) add("oos_reason", b.oos_reason ?? null);
  if ("quick_availability" in b) add("quick_availability", b.quick_availability ?? null);
  if ("texas_irp_number" in b) add("texas_irp_number", b.texas_irp_number ?? null);
  if ("irp_account_number" in b) add("irp_account_number", b.irp_account_number ?? null);
  if ("irp_registered_jurisdictions" in b) add("irp_registered_jurisdictions", b.irp_registered_jurisdictions ?? null);
  if ("irp_expiration" in b) add("irp_expiration", b.irp_expiration ?? null);
  if ("irp_registered_weight_lbs" in b) add("irp_registered_weight_lbs", b.irp_registered_weight_lbs ?? null);
  if ("operation_country" in b) add("operation_country", b.operation_country ?? null);
  if ("sct_permit_number" in b) add("sct_permit_number", b.sct_permit_number ?? null);
  if ("sct_permit_expiration" in b) add("sct_permit_expiration", b.sct_permit_expiration ?? null);
  if ("pita_status" in b) add("pita_status", b.pita_status ?? null);
  if ("pita_permit_number" in b) add("pita_permit_number", b.pita_permit_number ?? null);
  if ("pita_expiration" in b) add("pita_expiration", b.pita_expiration ?? null);
  if ("ctpat_status" in b) add("ctpat_status", b.ctpat_status ?? null);
  if ("oea_status" in b) add("oea_status", b.oea_status ?? null);
  if ("hazmat_endorsement" in b) add("hazmat_endorsement", b.hazmat_endorsement ?? false);
  if ("us_insurance_policy_number" in b) add("us_insurance_policy_number", b.us_insurance_policy_number ?? null);
  if ("us_insurance_carrier" in b) add("us_insurance_carrier", b.us_insurance_carrier ?? null);
  if ("us_insurance_expiration" in b) add("us_insurance_expiration", b.us_insurance_expiration ?? null);
  if ("mx_insurance_policy_number" in b) add("mx_insurance_policy_number", b.mx_insurance_policy_number ?? null);
  if ("mx_insurance_carrier" in b) add("mx_insurance_carrier", b.mx_insurance_carrier ?? null);
  if ("mx_insurance_expiration" in b) add("mx_insurance_expiration", b.mx_insurance_expiration ?? null);
  if ("title_status" in b) add("title_status", b.title_status ?? null);
  if ("lien_holder" in b) add("lien_holder", b.lien_holder ?? null);
}

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

    const setParts: string[] = [];
    const values: unknown[] = [];
    const add = (col: string, val: unknown) => {
      values.push(val);
      setParts.push(`${col} = $${values.length}`);
    };
    applyUnitPatchFields(b, add);
    if ("status" in b && b.status && ARCHIVE_STATUSES.has(b.status)) {
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
