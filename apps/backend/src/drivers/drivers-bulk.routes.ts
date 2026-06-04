import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { buildPatchChanges } from "../audit/crud-audit.js";
import {
  appendBulkCrudAudit,
  FLEET_BULK_MAX_IDS,
  registerBulkRoute,
} from "../bulk/bulk-update.factory.js";
import type { BulkPerEntityContext, BulkPerEntityResult } from "../bulk/bulk.types.js";

const driverBulkStatusSchema = z.enum(["Active", "Inactive", "Terminated"]);

const setStatusPayloadSchema = z
  .object({
    status: driverBulkStatusSchema,
    reason_code_id: z.string().uuid().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.status === "Inactive" && !value.reason_code_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "reason_code_id required when setting status to Inactive",
        path: ["reason_code_id"],
      });
    }
  });

const setOosReasonPayloadSchema = z.object({
  reason_code_id: z.string().uuid(),
});

const assignTruckPayloadSchema = z.object({
  unit_id: z.string().uuid().nullable(),
});

const archivePayloadSchema = z.object({});

type DriverBulkPayload =
  | z.infer<typeof setStatusPayloadSchema>
  | z.infer<typeof setOosReasonPayloadSchema>
  | z.infer<typeof assignTruckPayloadSchema>
  | z.infer<typeof archivePayloadSchema>;

async function assertDriverScope(
  client: BulkPerEntityContext<DriverBulkPayload>["client"],
  driverId: string,
  operatingCompanyId: string
): Promise<Record<string, unknown> | null> {
  const res = await client.query(
    `
      SELECT
        d.id,
        d.status,
        d.archived_at,
        d.driver_employment_status_id,
        d.operating_company_id
      FROM mdata.drivers d
      WHERE d.id = $1::uuid
        AND d.archived_at IS NULL
        AND (
          d.operating_company_id = $2::uuid
          OR EXISTS (
            SELECT 1
            FROM mdata.driver_company_authorizations dca
            WHERE dca.driver_id = d.id
              AND dca.company_id = $2::uuid
              AND dca.is_authorized = true
              AND dca.deactivated_at IS NULL
          )
        )
      LIMIT 1
    `,
    [driverId, operatingCompanyId]
  );
  return (res.rows[0] as Record<string, unknown> | undefined) ?? null;
}

async function assertEmploymentStatusCode(
  client: BulkPerEntityContext<DriverBulkPayload>["client"],
  reasonCodeId: string
): Promise<{ id: string; code: string } | null> {
  const res = await client.query(
    `
      SELECT id::text, code
      FROM reference.employment_statuses
      WHERE id = $1::uuid
        AND archived_at IS NULL
      LIMIT 1
    `,
    [reasonCodeId]
  );
  const row = res.rows[0] as { id: string; code: string } | undefined;
  return row ?? null;
}

async function assertUnitScope(
  client: BulkPerEntityContext<DriverBulkPayload>["client"],
  unitId: string,
  operatingCompanyId: string
): Promise<string | null> {
  const res = await client.query(
    `
      SELECT id::text
      FROM mdata.units
      WHERE id = $1::uuid
        AND (owner_company_id = $2::uuid OR currently_leased_to_company_id = $2::uuid)
      LIMIT 1
    `,
    [unitId, operatingCompanyId]
  );
  return (res.rows[0] as { id: string } | undefined)?.id ?? null;
}

async function handleSetStatus(ctx: BulkPerEntityContext<z.infer<typeof setStatusPayloadSchema>>): Promise<BulkPerEntityResult> {
  const oldRow = await assertDriverScope(ctx.client, ctx.id, ctx.operatingCompanyId);
  if (!oldRow) return { ok: false, code: "E_NOT_FOUND", message: "Driver not found" };

  const payload = ctx.payload;
  if (payload.status === "Inactive") {
    const reasonRow = await assertEmploymentStatusCode(ctx.client, payload.reason_code_id!);
    if (!reasonRow) {
      return { ok: false, code: "E_OOS_REASON_INVALID", message: "OOS reason code not found" };
    }
    if (reasonRow.code === "ACTIVE") {
      return { ok: false, code: "E_OOS_REASON_REJECTED", message: "OOS reason cannot be Active employment status" };
    }
  }

  const res = await ctx.client.query(
    `
      UPDATE mdata.drivers
      SET
        status = $2,
        driver_employment_status_id = CASE
          WHEN $2 = 'Inactive' AND $3::uuid IS NOT NULL THEN $3::uuid
          ELSE driver_employment_status_id
        END,
        deactivated_at = CASE
          WHEN $2 IN ('Inactive', 'Terminated') THEN COALESCE(deactivated_at, now())
          WHEN $2 = 'Active' THEN NULL
          ELSE deactivated_at
        END,
        updated_by_user_id = $4,
        updated_at = now()
      WHERE id = $1::uuid
      RETURNING *
    `,
    [ctx.id, payload.status, payload.reason_code_id ?? null, ctx.actorUserId]
  );
  const newRow = res.rows[0] as Record<string, unknown> | undefined;
  if (!newRow) return { ok: false, code: "E_NOT_FOUND", message: "Driver not found" };

  const changes = buildPatchChanges({ status: payload.status }, oldRow, newRow);
  await appendBulkCrudAudit(ctx.client, ctx.actorUserId, "mdata.drivers", "set_status", ctx.bulkCallId, {
    resource_id: ctx.id,
    operating_company_id: ctx.operatingCompanyId,
    reason: ctx.reason,
    changes,
    payload,
  });

  return { ok: true };
}

async function handleSetOosReason(ctx: BulkPerEntityContext<z.infer<typeof setOosReasonPayloadSchema>>): Promise<BulkPerEntityResult> {
  const oldRow = await assertDriverScope(ctx.client, ctx.id, ctx.operatingCompanyId);
  if (!oldRow) return { ok: false, code: "E_NOT_FOUND", message: "Driver not found" };

  const reasonRow = await assertEmploymentStatusCode(ctx.client, ctx.payload.reason_code_id);
  if (!reasonRow) {
    return { ok: false, code: "E_OOS_REASON_INVALID", message: "OOS reason code not found" };
  }
  if (reasonRow.code === "ACTIVE") {
    return { ok: false, code: "E_OOS_REASON_REJECTED", message: "OOS reason cannot be Active employment status" };
  }

  const res = await ctx.client.query(
    `
      UPDATE mdata.drivers
      SET
        driver_employment_status_id = $2,
        updated_by_user_id = $3,
        updated_at = now()
      WHERE id = $1::uuid
      RETURNING *
    `,
    [ctx.id, ctx.payload.reason_code_id, ctx.actorUserId]
  );
  const newRow = res.rows[0] as Record<string, unknown> | undefined;
  if (!newRow) return { ok: false, code: "E_NOT_FOUND", message: "Driver not found" };

  const changes = buildPatchChanges(
    { driver_employment_status_id: ctx.payload.reason_code_id },
    oldRow,
    newRow
  );
  await appendBulkCrudAudit(ctx.client, ctx.actorUserId, "mdata.drivers", "set_oos_reason", ctx.bulkCallId, {
    resource_id: ctx.id,
    operating_company_id: ctx.operatingCompanyId,
    reason: ctx.reason,
    changes,
    payload: ctx.payload,
  });

  return { ok: true };
}

async function handleArchive(ctx: BulkPerEntityContext<z.infer<typeof archivePayloadSchema>>): Promise<BulkPerEntityResult> {
  const oldRow = await assertDriverScope(ctx.client, ctx.id, ctx.operatingCompanyId);
  if (!oldRow) return { ok: false, code: "E_NOT_FOUND", message: "Driver not found" };

  const res = await ctx.client.query(
    `
      UPDATE mdata.drivers
      SET
        archived_at = COALESCE(archived_at, now()),
        updated_by_user_id = $2,
        updated_at = now()
      WHERE id = $1::uuid
        AND archived_at IS NULL
      RETURNING *
    `,
    [ctx.id, ctx.actorUserId]
  );
  const newRow = res.rows[0] as Record<string, unknown> | undefined;
  if (!newRow) return { ok: false, code: "E_ALREADY_ARCHIVED", message: "Driver already archived" };

  await appendBulkCrudAudit(ctx.client, ctx.actorUserId, "mdata.drivers", "archive", ctx.bulkCallId, {
    resource_id: ctx.id,
    operating_company_id: ctx.operatingCompanyId,
    reason: ctx.reason,
    changes: buildPatchChanges({ archived_at: newRow.archived_at }, oldRow, newRow),
  });

  return { ok: true };
}

async function handleAssignTruck(ctx: BulkPerEntityContext<z.infer<typeof assignTruckPayloadSchema>>): Promise<BulkPerEntityResult> {
  const oldRow = await assertDriverScope(ctx.client, ctx.id, ctx.operatingCompanyId);
  if (!oldRow) return { ok: false, code: "E_NOT_FOUND", message: "Driver not found" };

  const unitId = ctx.payload.unit_id;
  if (unitId) {
    const unitOk = await assertUnitScope(ctx.client, unitId, ctx.operatingCompanyId);
    if (!unitOk) return { ok: false, code: "E_UNIT_NOT_FOUND", message: "Truck not found in operating company" };

    await ctx.client.query(
      `
        UPDATE telematics.vehicle_driver_assignments
        SET ended_at = now()
        WHERE unit_id = $1::uuid
          AND operating_company_id = $2::uuid
          AND is_default = true
          AND ended_at IS NULL
      `,
      [unitId, ctx.operatingCompanyId]
    );
    await ctx.client.query(
      `
        UPDATE telematics.vehicle_driver_assignments
        SET ended_at = now()
        WHERE driver_id = $1::uuid
          AND operating_company_id = $2::uuid
          AND is_default = true
          AND ended_at IS NULL
      `,
      [ctx.id, ctx.operatingCompanyId]
    );
    await ctx.client.query(
      `
        INSERT INTO telematics.vehicle_driver_assignments (
          operating_company_id, unit_id, driver_id, started_at, source, is_default, created_by_user_uuid
        ) VALUES ($1, $2, $3, now(), 'bulk_assign', true, $4)
      `,
      [ctx.operatingCompanyId, unitId, ctx.id, ctx.actorUserId]
    );
  } else {
    await ctx.client.query(
      `
        UPDATE telematics.vehicle_driver_assignments
        SET ended_at = now()
        WHERE driver_id = $1::uuid
          AND operating_company_id = $2::uuid
          AND is_default = true
          AND ended_at IS NULL
      `,
      [ctx.id, ctx.operatingCompanyId]
    );
  }

  await appendBulkCrudAudit(ctx.client, ctx.actorUserId, "mdata.drivers", "assign_to_truck", ctx.bulkCallId, {
    resource_id: ctx.id,
    operating_company_id: ctx.operatingCompanyId,
    unit_id: unitId,
    reason: ctx.reason,
  });

  return { ok: true };
}

export async function registerDriversBulkRoutes(app: FastifyInstance) {
  registerBulkRoute<DriverBulkPayload>({
    app,
    path: "/api/v1/mdata/drivers/bulk-update",
    domain: "mdata",
    resource: "drivers",
    entityType: "mdata.drivers",
    maxIds: FLEET_BULK_MAX_IDS,
    requireReasonActions: ["set_status", "archive", "set_oos_reason"],
    destructiveActions: ["archive"],
    actionMap: {
      set_status: setStatusPayloadSchema as z.ZodType<DriverBulkPayload>,
      set_oos_reason: setOosReasonPayloadSchema as z.ZodType<DriverBulkPayload>,
      assign_to_truck: assignTruckPayloadSchema as z.ZodType<DriverBulkPayload>,
      archive: archivePayloadSchema as z.ZodType<DriverBulkPayload>,
    },
    perEntityHandler: async (ctx) => {
      switch (ctx.action) {
        case "set_status":
          return handleSetStatus(ctx as BulkPerEntityContext<z.infer<typeof setStatusPayloadSchema>>);
        case "set_oos_reason":
          return handleSetOosReason(ctx as BulkPerEntityContext<z.infer<typeof setOosReasonPayloadSchema>>);
        case "archive":
          return handleArchive(ctx as BulkPerEntityContext<z.infer<typeof archivePayloadSchema>>);
        case "assign_to_truck":
          return handleAssignTruck(ctx as BulkPerEntityContext<z.infer<typeof assignTruckPayloadSchema>>);
        default:
          return { ok: false, code: "E_UNKNOWN_ACTION", message: "Unknown bulk action" };
      }
    },
  });
}
