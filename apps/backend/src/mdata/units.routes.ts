import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { ensureUnitAsset } from "./ensure-unit-asset.shared.js";
import { appendCrudAudit, buildPatchChanges } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { setScopedCompanyContext } from "../_helpers/scoped-company-context.js";
import { countOpenWorkOrdersForUnit } from "../kpi/canonical-kpis.js";
import { requireAuth } from "../auth/session-middleware.js";
import { companyBusinessDate } from "../lib/company-business-date.js";
import {
  resolveDefaultOperatingCompanyId,
  resolveOperatingCompanyId,
} from "../auth/operating-company-scope.js";
import { buildUnitAggregate } from "./unit-aggregate.service.js";
import { registerUnitDefaultDriverRoutes } from "./unit-default-driver.routes.js";
import { registerUnitDocumentsRoutes } from "./unit-documents.routes.js";
import { registerUnitPdfExportRoutes } from "./unit-pdf-export.routes.js";
import { registerUnitPhotosRoutes } from "./unit-photos.routes.js";
import { registerUnitPlatesRoutes } from "./unit-plates.routes.js";
import { registerUnitTripCostRoutes } from "./unit-trip-cost.routes.js";
import { registerUnitFinanceLinkageRoutes } from "./unit-finance-linkage.routes.js";
import { emitMasterDataCreatedSpineEvent } from "./master-data-spine-emit.js";
import {
  getUnitFinancialYTD,
  type FinancialPeriod,
} from "./unit-financial.service.js";
import {
  fleetTypeFilterSchema,
  truckTypeSqlFilter,
} from "./fleet-type-filter.js";
import { fetchUnifiedFleetList } from "./units-unified-list.service.js";
import {
  applyUnitPatchFields,
  ownerOnlyPatchViolation,
  unitStatusSchema,
  updateUnitBodySchema,
} from "./unit-update-schema.js";

export {
  unitStatusSchema,
  updateUnitBodySchema,
  UNIT_PATCHABLE_FIELD_KEYS,
} from "./unit-update-schema.js";

export const UNIT_PROFILE_AUDIT_FIELD_KEYS = [
  "status",
  "is_oos",
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

const quickAvailabilitySchema = z
  .enum(["available", "booked", "holding"])
  .nullable();
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  // CODER-17 hardening: an unrecognized status filter (e.g. the expenses unit-picker passing
  // status=Active, which is not a fleet status enum) must NOT 400 the list — degrade to no status
  // filter. The default `deactivated_at IS NULL` clause still returns active units, which is the
  // intent. Valid fleet statuses (InService, etc.) are unaffected.
  status: unitStatusSchema.optional().catch(undefined),
  type: fleetTypeFilterSchema.optional(),
  search: z.string().trim().min(1).max(100).optional(),
  operating_company_id: z.string().uuid().optional(),
  include: z.enum(["trailers"]).optional(),
  // Soft-delete visibility: include deactivated units so they can be viewed + reactivated.
  include_inactive: z.coerce.boolean().optional().default(false),
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
  if (!requireAuth(req, reply)) return reply;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply
    .code(400)
    .send({ error: "validation_error", details: error.flatten() });
}

function isWriteRole(role: string): boolean {
  return role === "Owner" || role === "Administrator" || role === "Manager";
}

async function syncCanonicalDefaultDriver(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<{ id?: string }> }> },
  input: { unitId: string; driverId: string | null; operatingCompanyId: string; actorUserId: string },
) {
  await client.query(
    `UPDATE telematics.vehicle_driver_assignments
     SET ended_at = now()
     WHERE unit_id = $1::uuid AND operating_company_id = $2::uuid
       AND is_default = true AND ended_at IS NULL`,
    [input.unitId, input.operatingCompanyId],
  );
  if (!input.driverId) return null;
  await client.query(
    `UPDATE telematics.vehicle_driver_assignments
     SET ended_at = now()
     WHERE driver_id = $1::uuid AND operating_company_id = $2::uuid
       AND is_default = true AND ended_at IS NULL`,
    [input.driverId, input.operatingCompanyId],
  );
  const inserted = await client.query(
    `INSERT INTO telematics.vehicle_driver_assignments (
       operating_company_id, unit_id, driver_id, started_at, source, is_default, created_by_user_uuid
     ) VALUES ($1::uuid,$2::uuid,$3::uuid,now(),'manual_override',true,$4::uuid)
     RETURNING id::text AS id`,
    [input.operatingCompanyId, input.unitId, input.driverId, input.actorUserId],
  );
  const assignmentId = inserted.rows[0]?.id;
  if (!assignmentId) throw new Error("unit_default_driver_insert_failed");
  return assignmentId;
}

async function resolveAssetCompanyIds(
  client: {
    query: (
      sql: string,
      values?: unknown[],
    ) => Promise<{ rows: Array<{ id: string }> }>;
  },
  userId: string,
  ownerCompanyId?: string,
  leasedCompanyId?: string,
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
        `,
      )
    ).rows[0]?.id ??
    null;

  let resolvedLeasedId = leasedCompanyId ?? null;
  if (!resolvedLeasedId) {
    // LST-F05: this picked the LOWEST accessible UUID instead of the user's default, so a TRANSP
    // dispatcher creating a unit/equipment leased it to USMCA (5c854333… < 91e0bf0a…).
    resolvedLeasedId = await resolveDefaultOperatingCompanyId(client, userId);
  }

  return { resolvedOwnerId, resolvedLeasedId };
}

const ARCHIVE_STATUSES = new Set(["Sold", "Transferred", "Damaged"]);
// Active-fleet statuses: setting one of these REACTIVATES a unit — clears deactivated_at so it returns to
// active lists/board/dropdowns. Without this, clicking "InService" on an archived unit leaves it hidden
// (deactivated_at still set) — the reactivation half of the Saldana desync class.
const ACTIVE_FLEET_STATUSES = new Set([
  "InService",
  "OutOfService",
  "InMaintenance",
]);
// WF-064: statuses blocked when the unit has an open work order (Sold/Transferred only).
const RETIRE_GATE_STATUSES = new Set(["Sold", "Transferred"]);

export async function registerUnitsRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/mdata/units",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedQuery = listQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success)
      return sendValidationError(reply, parsedQuery.error);
    const {
      limit,
      offset,
      status,
      type,
      search,
      operating_company_id,
      include,
      include_inactive,
    } = parsedQuery.data;

    if (include === "trailers") {
      const result = await withCurrentUser(authUser.uuid, async (client) => {
        // Entity scope (USMCA cross-entity leak fix): the unified fleet list blends mdata.units +
        // mdata.equipment, neither of which is entity-scoped by RLS. ALWAYS resolve and bind the
        // owner/leased predicate (via the now-required operating_company_id) so trucks/trailers
        // from another operating company never appear.
        const scopedCompanyId = await resolveOperatingCompanyId(
          client,
          authUser.uuid,
          operating_company_id,
        );
        if (!scopedCompanyId) return { rows: [], total: 0 };
        await client.query(
          `SELECT set_config('app.operating_company_id', $1::text, true)`,
          [scopedCompanyId],
        );
        return fetchUnifiedFleetList(client, {
          limit,
          offset,
          status,
          type,
          search,
          operating_company_id: scopedCompanyId,
          include_inactive,
        });
      });
      // Return the real total so the Fleet pager shows the FULL fleet (was "of 50" — page size — before).
      return { units: result.rows, total: result.total };
    }

    const result = await withCurrentUser(authUser.uuid, async (client) => {
      const values: unknown[] = [];
      const filters: string[] = [];
      // DISPATCH-4: onboarding sample/demo units (is_sample_data) must never surface on the live
      // Fleet OOS / In-shop board or the units roster. Read-only exclusion — the sample rows stay in
      // the table (void-not-delete), just hidden from operational views. is_sample_data is NOT NULL
      // DEFAULT false (migration 0403), so `IS NOT TRUE` is a total, index-friendly predicate.
      filters.push("is_sample_data IS NOT TRUE");
      if (type) {
        filters.push(truckTypeSqlFilter(type));
      }
      if (status) {
        values.push(status);
        filters.push(`status = $${values.length}`);
      }
      if (search) {
        values.push(`%${search}%`);
        const idx = values.length;
        filters.push(
          `(unit_number ILIKE $${idx} OR vin ILIKE $${idx} OR make ILIKE $${idx} OR model ILIKE $${idx})`,
        );
      }
      // Entity scope (USMCA cross-entity leak fix): mdata.units has no operating_company_id and its
      // RLS is identity/role-scoped, so scope by the owner/leased pair. ALWAYS bind it — resolve the
      // company from the param or user context so units from another entity never leak.
      const scopedCompanyId = await resolveOperatingCompanyId(
        client,
        authUser.uuid,
        operating_company_id,
      );
      if (!scopedCompanyId) return { rows: [], total: 0 };
      await client.query(
        `SELECT set_config('app.operating_company_id', $1::text, true)`,
        [scopedCompanyId],
      );
      values.push(scopedCompanyId);
      const ownerLeasedIdx = values.length;
      filters.push(
        `(owner_company_id = $${ownerLeasedIdx} OR currently_leased_to_company_id = $${ownerLeasedIdx})`,
      );
      const whereClause =
        filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
      const countRes = await client.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM mdata.units ${whereClause}`,
        values,
      );
      values.push(limit);
      values.push(offset);
      const res = await client.query(
        `
          SELECT
            id, unit_number, vin, make, model, year, license_plate, license_state, status,
            assigned_driver_id, owner_company_id, currently_leased_to_company_id, acquired_date, disposed_date, notes,
            qbo_vendor_id, qbo_class_id,
            created_at, updated_at, deactivated_at, created_by_user_id, updated_by_user_id
          FROM mdata.units
          ${whereClause}
          ORDER BY created_at DESC, id DESC
          LIMIT $${values.length - 1}
          OFFSET $${values.length}
        `,
        values,
      );
      return { rows: res.rows, total: countRes.rows[0]?.total ?? 0 };
    });

    return { units: result.rows, total: result.total };
    },
  );

  app.post("/api/v1/mdata/units", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isWriteRole(authUser.role))
      return reply.code(403).send({ error: "forbidden" });
    const parsedBody = createUnitBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success)
      return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;
    try {
      const created = await withCurrentUser(authUser.uuid, async (client) => {
        const { resolvedOwnerId, resolvedLeasedId } =
          await resolveAssetCompanyIds(
            client,
            authUser.uuid,
            b.owner_company_id,
            b.currently_leased_to_company_id,
          );
        if (!resolvedOwnerId) {
          throw new Error("owner_company_id_required");
        }
        const operatingCompanyId = resolvedLeasedId ?? resolvedOwnerId;
          // mdata.assets is FORCE-RLS and scopes writes through app.operating_company_id.
          // Bind one validated company inside the same transaction as unit + asset + audit + spine.
          await setScopedCompanyContext(
            client,
            authUser.uuid,
            operatingCompanyId,
          );
          if (b.assigned_driver_id) {
            const driver = await client.query<{ id: string }>(
              `SELECT d.id::text
                 FROM mdata.drivers d
                WHERE d.id = $1::uuid
                  AND d.archived_at IS NULL
                  AND (
                    d.operating_company_id = $2::uuid
                    OR EXISTS (
                      SELECT 1 FROM mdata.driver_company_authorizations unit_create_dca
                       WHERE unit_create_dca.driver_id = d.id
                         AND unit_create_dca.company_id = $2::uuid
                         AND unit_create_dca.is_authorized = true
                         AND unit_create_dca.deactivated_at IS NULL
                    )
                  )
                LIMIT 1`,
              [b.assigned_driver_id, operatingCompanyId],
            );
            if (!driver.rows[0]?.id)
              throw new Error("invalid_assigned_driver_id");
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
            ],
          );
          const row = res.rows[0];
          if (!row?.id) throw new Error("unit_insert_returned_no_row");

          const defaultDriverAssignmentId = b.assigned_driver_id
            ? await syncCanonicalDefaultDriver(client, {
                unitId: String(row.id), driverId: b.assigned_driver_id,
                operatingCompanyId, actorUserId: authUser.uuid,
              })
            : null;

          // FAIL-INS-POLICY-ASSET-404 — mint the canonical mdata.assets row alongside the unit.
          //
          // insurance.policy_unit.asset_id and insurance.claim reference mdata.assets, but unit-create
          // never wrote one, so a freshly created unit could never be insured: the wizard resolver
          // (resolve-asset-id.shared.ts) resolves unit -> asset through `a.id | a.unit_id | a.unit_code`
          // and all three miss when no asset row exists. This is the going-forward half of that fix; the
          // backfill for existing units is migration 202612460000.
          //
          // Tenancy mirrors mdata.units: the LESSEE operates the unit (TRK owns, TRANSP/USMCA runs it),
          // so the asset belongs to COALESCE(currently_leased_to, owner) — the same expression the
          // backfill uses, so both halves agree.
          //
          // Deliberately NOT set: insured_value_cents / acquisition_cost_cents stay NULL rather than 0.
          // NULL means "not stated"; 0 would assert a valued-at-nothing asset into a table insurance
          // reads. The owner supplies real insured values.
          //
          // ON CONFLICT on the natural key (tenant_id, unit_code) keeps this idempotent and stops a
          // retry or a re-created unit number from failing the whole create.
          const assetId = await ensureUnitAsset(client, {
            tenantId: operatingCompanyId,
            unitId: String(row.id),
            unitCode: String(row.unit_number),
            vin: String(row.vin),
            make: (row.make as string | null) ?? null,
            model: (row.model as string | null) ?? null,
            year: (row.year as number | null) ?? null,
          });

          await appendCrudAudit(client, authUser.uuid, "mdata.units.created", {
            operating_company_id: operatingCompanyId,
            resource_id: row.id,
            resource_type: "mdata.units",
            id: row.id,
            unit_number: row.unit_number,
            vin: row.vin,
            status: row.status,
            asset_id: assetId,
            default_driver_assignment_id: defaultDriverAssignmentId,
          });
          await emitMasterDataCreatedSpineEvent(client, {
            operating_company_id: String(operatingCompanyId),
            actor_user_id: authUser.uuid,
            subject_type: "unit",
            subject_id: String(row.id),
            payload: {
              unit_number: row.unit_number,
              vin: row.vin,
              status: row.status,
            },
          });
          return row;
      });
      return reply.code(201).send(created);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "23505")
        return reply.code(409).send({ error: "mdata_unit_conflict" });
      if (code === "23503")
        return reply.code(400).send({ error: "invalid_assigned_driver_id" });
      if ((err as Error).message === "invalid_assigned_driver_id") {
        return reply.code(400).send({ error: "invalid_assigned_driver_id" });
      }
      if ((err as Error).message === "owner_company_id_required") {
        return reply.code(400).send({ error: "owner_company_id_required" });
      }
      throw err;
    }
  });

  app.get(
    "/api/v1/mdata/units/:id",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const authUser = currentAuthUser(req, reply);
      if (!authUser) return;
      const parsedParams = idParamSchema.safeParse(req.params ?? {});
      if (!parsedParams.success)
        return sendValidationError(reply, parsedParams.error);
      const parsedQuery = unitAggregateQuerySchema.safeParse(req.query ?? {});
      if (!parsedQuery.success)
        return sendValidationError(reply, parsedQuery.error);

      const aggregate = await withCurrentUser(authUser.uuid, async (client) => {
        // FLEET-F6111: buildUnitAggregate installs its company argument as the RLS GUC. Resolve the
        // caller-named company first, matching the sibling equipment aggregate, so the query string
        // cannot choose another tenant's unit-profile scope.
        const scopedCompanyId = await resolveOperatingCompanyId(
          client,
          authUser.uuid,
          parsedQuery.data.operating_company_id,
        );
        if (!scopedCompanyId) return null;
        return buildUnitAggregate(
          client,
          parsedParams.data.id,
          scopedCompanyId,
        );
      });
      if (!aggregate)
        return reply.code(404).send({ error: "mdata_unit_not_found" });
      return aggregate;
    },
  );

  app.get("/api/v1/mdata/units/:id/financial", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success)
      return sendValidationError(reply, parsedParams.error);
    const parsedQuery = unitAggregateQuerySchema
      .extend({ period: z.enum(["YTD", "quarter", "month"]).default("YTD") })
      .safeParse(req.query ?? {});
    if (!parsedQuery.success)
      return sendValidationError(reply, parsedQuery.error);

    const financial = await withCurrentUser(authUser.uuid, async (client) => {
      // CLS-GUC-BASELINE-CARRIED-5-PHANTOM-SLOTS — this set the tenant-scope GUC directly from the
      // caller-named operating_company_id query param with no membership check. RLS then enforced
      // whatever the caller asked for, not what they were entitled to — an IDOR on a route that
      // returns FINANCIAL data per unit. setScopedCompanyContext asserts membership FIRST.
      await setScopedCompanyContext(
        client,
        authUser.uuid,
        parsedQuery.data.operating_company_id,
      );
      return getUnitFinancialYTD(
        client,
        parsedParams.data.id,
        parsedQuery.data.operating_company_id,
        parsedQuery.data.period as FinancialPeriod,
      );
    });
    return financial;
  });

  app.patch(
    "/api/v1/mdata/units/:id",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const authUser = currentAuthUser(req, reply);
      if (!authUser) return;
      if (!isWriteRole(authUser.role))
        return reply.code(403).send({ error: "forbidden" });
      const parsedParams = idParamSchema.safeParse(req.params ?? {});
      if (!parsedParams.success)
        return sendValidationError(reply, parsedParams.error);
      const parsedBody = updateUnitBodySchema.safeParse(req.body ?? {});
      if (!parsedBody.success)
        return sendValidationError(reply, parsedBody.error);
      const b = parsedBody.data;
      // A fleet status transition is the canonical operational-state write. Keep the legacy
      // dispatch guard flag in lockstep so Change Status cannot render OutOfService while
      // dispatch and Program probes still treat the unit as available.
      const normalizedPatch =
        "status" in b && typeof b.status === "string"
          ? { ...b, is_oos: b.status === "OutOfService" }
          : b;
      const ownerViolation = ownerOnlyPatchViolation(
        authUser.role,
        b as Record<string, unknown>,
      );
      if (ownerViolation) {
        return reply
          .code(403)
          .send({ error: "owner_only_field", field: ownerViolation });
      }

      // WF-064 retire gate: a unit with an OPEN work order cannot be Sold or Transferred.
      // Damaged / OutOfService are intentionally NOT gated — those routinely coincide with an
      // open WO by design (accident/repair).
      if (
        "status" in b &&
        typeof b.status === "string" &&
        RETIRE_GATE_STATUSES.has(b.status)
      ) {
        const openWoCount = await withCurrentUser(authUser.uuid, (client) =>
          countOpenWorkOrdersForUnit(client, parsedParams.data.id),
        );
        if (openWoCount > 0) {
          return reply.code(409).send({
            error: "E_UNIT_HAS_OPEN_WO",
            open_wo_count: openWoCount,
            message: `Unit has ${openWoCount} open work order(s) and cannot be sold or transferred until they are closed.`,
          });
        }
      }

      const setParts: string[] = [];
      const values: unknown[] = [];
      const add = (col: string, val: unknown) => {
        values.push(val);
        setParts.push(`${col} = $${values.length}`);
      };
      applyUnitPatchFields(normalizedPatch, add);
      if (
        "status" in b &&
        typeof b.status === "string" &&
        ARCHIVE_STATUSES.has(b.status)
      ) {
        add("deactivated_at", companyBusinessDate());
      } else if (
        "status" in b &&
        typeof b.status === "string" &&
        ACTIVE_FLEET_STATUSES.has(b.status)
      ) {
        // Reactivate: returning to an active-fleet status clears the soft-delete so the unit reappears.
        add("deactivated_at", null);
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
          // Entity scope (USMCA cross-entity leak fix): mdata.units has no operating_company_id and its
          // RLS is role-scoped, so a bare `WHERE id = $1` write reaches ANY entity's truck. Resolve the
          // caller's company (default, or an explicit ?operating_company_id validated for membership) and
          // gate both the existence read and the UPDATE on owner/lessee — mirrors the GET-list / status
          // predicate already in this module.
          const scopedCompanyId = await resolveOperatingCompanyId(
            client,
            authUser.uuid,
            (req.query as { operating_company_id?: string } | undefined)
              ?.operating_company_id,
          );
          if (!scopedCompanyId) {
            return null;
          }
          const oldRes = await client.query(
            `SELECT * FROM mdata.units WHERE id = $1 AND (owner_company_id = $2 OR currently_leased_to_company_id = $2) LIMIT 1`,
            [parsedParams.data.id, scopedCompanyId],
          );
          const oldRow = oldRes.rows[0] ?? null;
          if (!oldRow) {
            return null;
          }
          if ("assigned_driver_id" in normalizedPatch && normalizedPatch.assigned_driver_id) {
            const driver = await client.query<{ id?: string }>(
              `SELECT d.id::text FROM mdata.drivers d
               WHERE d.id = $1::uuid AND d.archived_at IS NULL
                 AND (d.operating_company_id = $2::uuid OR EXISTS (
                   SELECT 1 FROM mdata.driver_company_authorizations unit_patch_dca
                   WHERE unit_patch_dca.driver_id = d.id AND unit_patch_dca.company_id = $2::uuid
                     AND unit_patch_dca.is_authorized = true AND unit_patch_dca.deactivated_at IS NULL
                 )) LIMIT 1`,
              [normalizedPatch.assigned_driver_id, scopedCompanyId],
            );
            if (!driver.rows[0]?.id) throw new Error("invalid_assigned_driver_id");
          }

          values.push(scopedCompanyId);
          const scopeIdx = values.length;
          const res = await client.query(
            `
            UPDATE mdata.units
            SET ${setParts.join(", ")}
            WHERE id = $${idIdx}
              AND (owner_company_id = $${scopeIdx} OR currently_leased_to_company_id = $${scopeIdx})
            RETURNING *
          `,
            values,
          );
          const updatedRow = res.rows[0] ?? null;
          if (!updatedRow) {
            return null;
          }
          const defaultDriverAssignmentId = "assigned_driver_id" in normalizedPatch
            ? await syncCanonicalDefaultDriver(client, {
                unitId: String(updatedRow.id),
                driverId: (normalizedPatch.assigned_driver_id as string | null | undefined) ?? null,
                operatingCompanyId: scopedCompanyId, actorUserId: authUser.uuid,
              })
            : null;

          const changes = buildPatchChanges(
            normalizedPatch as unknown as Record<string, unknown>,
            oldRow as Record<string, unknown>,
            updatedRow as Record<string, unknown>,
          );
          const profileAuditFields = Object.fromEntries(
            UNIT_PROFILE_AUDIT_FIELD_KEYS.filter(
              (key) => key in normalizedPatch,
            ).map((key) => [
              key,
              (normalizedPatch as Record<string, unknown>)[key],
            ]),
          );
          const statusChanged =
            "status" in b && oldRow.status !== updatedRow.status;
          const auditAction = statusChanged
            ? "mdata.unit.status_changed"
            : "mdata.units.updated";
          await appendCrudAudit(client, authUser.uuid, auditAction, {
            operating_company_id: scopedCompanyId,
            resource_id: updatedRow.id,
            resource_type: "mdata.units",
            changes,
            profile_fields: profileAuditFields,
            ...("assigned_driver_id" in normalizedPatch ? { default_driver_assignment_id: defaultDriverAssignmentId } : {}),
            ...(statusChanged
              ? {
                  before_status: oldRow.status,
                  after_status: updatedRow.status,
                  status_change_reason: updatedRow.status_change_reason,
                }
              : {}),
          });
          return updatedRow;
        });
        if (!updated)
          return reply.code(404).send({ error: "mdata_unit_not_found" });
        return updated;
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === "23505")
          return reply.code(409).send({ error: "mdata_unit_conflict" });
        if (code === "23503")
          return reply.code(400).send({ error: "invalid_assigned_driver_id" });
        if ((err as Error).message === "invalid_assigned_driver_id")
          return reply.code(400).send({ error: "invalid_assigned_driver_id" });
        throw err;
      }
    },
  );

  app.post(
    "/api/v1/mdata/units/:id/deactivate",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const authUser = currentAuthUser(req, reply);
      if (!authUser) return;
      if (!isWriteRole(authUser.role))
        return reply.code(403).send({ error: "forbidden" });
      const parsedParams = idParamSchema.safeParse(req.params ?? {});
      if (!parsedParams.success)
        return sendValidationError(reply, parsedParams.error);

      const deactivated = await withCurrentUser(
        authUser.uuid,
        async (client) => {
          // Entity scope (USMCA cross-entity leak fix): gate the read + soft-delete on owner/lessee so one
          // entity cannot deactivate another entity's truck by guessing its UUID.
          const scopedCompanyId = await resolveOperatingCompanyId(
            client,
            authUser.uuid,
            (req.query as { operating_company_id?: string } | undefined)
              ?.operating_company_id,
          );
          const oldRes = await client.query(
            `
          SELECT id, deactivated_at, status
          FROM mdata.units
          WHERE id = $1
            AND (owner_company_id = $2 OR currently_leased_to_company_id = $2)
          LIMIT 1
        `,
            [parsedParams.data.id, scopedCompanyId],
          );
          const oldRow = oldRes.rows[0] ?? null;
          if (!oldRow) return null;

          const wasAlreadyDeactivated = oldRow.deactivated_at !== null;
          let deactivatedAt = oldRow.deactivated_at as string | null;
          let newStatus = oldRow.status as string | null;
          if (!wasAlreadyDeactivated) {
            // Set status in the SAME update as deactivated_at — the units list/badge read the `status`
            // column, so writing only deactivated_at left units reading their old (active) status. There is
            // no 'Inactive' member in mdata.unit_status; 'OutOfService' is the deactivated state. Preserve
            // terminal/archive states (Sold/Totaled/Transferred/Damaged) rather than downgrade them.
            //
            // Soft-delete WITHOUT RETURNING. units_select's USING requires `deactivated_at IS NULL`, so the
            // mutated row is SELECT-invisible; `UPDATE ... RETURNING` re-reads it under the SELECT policy
            // (ExecWithCheckOptions) → 42501 even for an Owner. Compute the new status/timestamp app-side from
            // the row we already read and reuse them for the response — never RETURNING a soft-deleted row.
            const terminalStatuses = new Set([
              "Sold",
              "Totaled",
              "Transferred",
              "Damaged",
            ]);
            newStatus = terminalStatuses.has(String(oldRow.status))
              ? (oldRow.status as string)
              : "OutOfService";
            const result = await client.query(
              `
            UPDATE mdata.units
            SET deactivated_at = now(),
                status = $2::mdata.unit_status,
                updated_by_user_id = $3
            WHERE id = $1
              AND deactivated_at IS NULL
              AND (owner_company_id = $4 OR currently_leased_to_company_id = $4)
          `,
              [parsedParams.data.id, newStatus, authUser.uuid, scopedCompanyId],
            );
            if (result.rowCount !== 1) return null;
            // now() is transaction-scoped (constant for the whole txn), so reading it back here returns the
            // exact value just written — DB-authoritative — without re-reading the now-SELECT-invisible row.
            const tsRes = await client.query(`SELECT now() AS deactivated_at`);
            deactivatedAt =
              (tsRes.rows[0]?.deactivated_at as string | undefined) ??
              deactivatedAt;
          }

          await appendCrudAudit(
            client,
            authUser.uuid,
            "mdata.units.deactivated",
            {
              operating_company_id: scopedCompanyId,
              resource_id: oldRow.id,
              resource_type: "mdata.units",
              was_already_deactivated: wasAlreadyDeactivated,
            },
          );

          return {
            id: oldRow.id,
            deactivated_at: deactivatedAt,
            status: newStatus,
            was_already_deactivated: wasAlreadyDeactivated,
          };
        },
      );
      if (!deactivated)
        return reply.code(404).send({ error: "mdata_unit_not_found" });
      return deactivated;
    },
  );

  app.post(
    "/api/v1/mdata/units/:id/quick-availability",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isWriteRole(authUser.role))
      return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    const parsedQuery = unitAggregateQuerySchema.safeParse(req.query ?? {});
    const parsedBody = quickAvailabilityBodySchema.safeParse(req.body ?? {});
    if (!parsedParams.success)
      return sendValidationError(reply, parsedParams.error);
    if (!parsedQuery.success)
      return sendValidationError(reply, parsedQuery.error);
    if (!parsedBody.success)
      return sendValidationError(reply, parsedBody.error);
    const updated = await withCurrentUser(authUser.uuid, async (client) => {
      // Entity scope (USMCA cross-entity leak fix): gate on owner/lessee. parsedQuery already carries a
      // required operating_company_id — validate membership + scope the read and write to it.
      const scopedCompanyId = await resolveOperatingCompanyId(
        client,
        authUser.uuid,
        parsedQuery.data.operating_company_id,
      );
      const oldRes = await client.query(
        `SELECT * FROM mdata.units WHERE id = $1 AND (owner_company_id = $2 OR currently_leased_to_company_id = $2) LIMIT 1`,
        [parsedParams.data.id, scopedCompanyId],
      );
      const oldRow = oldRes.rows[0];
      if (!oldRow) return null;
      const res = await client.query(
        `
          UPDATE mdata.units
          SET quick_availability = $2, updated_by_user_id = $3, updated_at = now()
          WHERE id = $1
            AND (owner_company_id = $4 OR currently_leased_to_company_id = $4)
          RETURNING id, quick_availability
        `,
        [
          parsedParams.data.id,
          parsedBody.data.value,
          authUser.uuid,
          scopedCompanyId,
        ],
      );
      const row = res.rows[0];
      if (!row) return null;
      await appendCrudAudit(
        client,
        authUser.uuid,
        "mdata.unit.quick_availability_changed",
        {
          operating_company_id: scopedCompanyId,
          resource_id: row.id,
          resource_type: "mdata.units",
          before: oldRow.quick_availability,
          after: row.quick_availability,
          profile_fields: { quick_availability: parsedBody.data.value },
        },
      );
      return row;
    });
    if (!updated)
      return reply.code(404).send({ error: "mdata_unit_not_found" });
    return updated;
    },
  );

  await registerUnitPlatesRoutes(app);
  await registerUnitDefaultDriverRoutes(app);
  await registerUnitPhotosRoutes(app);
  await registerUnitDocumentsRoutes(app);
  await registerUnitTripCostRoutes(app);
  await registerUnitPdfExportRoutes(app);
  await registerUnitFinanceLinkageRoutes(app);
}
