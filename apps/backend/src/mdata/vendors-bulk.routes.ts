import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { buildPatchChanges } from "../audit/crud-audit.js";
import { appendBulkCrudAudit, registerBulkRoute } from "../bulk/bulk-update.factory.js";
import type { BulkPerEntityContext, BulkPerEntityResult } from "../bulk/bulk.types.js";

const vendorStatusPayloadSchema = z.object({
  status: z.enum(["active", "inactive"]),
});

const vendor1099PayloadSchema = z.object({
  eligible: z.boolean(),
});

const emptyPayloadSchema = z.object({}).default({});

type VendorBulkPayload =
  | z.infer<typeof vendorStatusPayloadSchema>
  | z.infer<typeof vendor1099PayloadSchema>
  | z.infer<typeof emptyPayloadSchema>;

async function handleVendorBulk(ctx: BulkPerEntityContext<VendorBulkPayload>): Promise<BulkPerEntityResult> {
  const { id, action, payload, reason, operatingCompanyId, actorUserId, bulkCallId, client } = ctx;

  const oldRes = await client.query(
    `
      SELECT *
      FROM mdata.vendors
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [id, operatingCompanyId]
  );
  const oldRow = oldRes.rows[0] as Record<string, unknown> | undefined;
  if (!oldRow) {
    return { ok: false, code: "E_NOT_FOUND", message: "Vendor not found" };
  }

  let updateRes: { rows: unknown[] };
  const auditPayload: Record<string, unknown> = {
    resource_id: id,
    resource_type: "mdata.vendors",
    operating_company_id: operatingCompanyId,
    reason: reason ?? null,
  };

  if (action === "set_status") {
    const statusPayload = payload as z.infer<typeof vendorStatusPayloadSchema>;
    const isInactive = statusPayload.status === "inactive";
    updateRes = await client.query(
      `
        UPDATE mdata.vendors
        SET deactivated_at = CASE WHEN $3 THEN COALESCE(deactivated_at, now()) ELSE NULL END,
            updated_by_user_id = $4,
            updated_at = now()
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
        RETURNING *
      `,
      [id, operatingCompanyId, isInactive, actorUserId]
    );
    auditPayload.changes = buildPatchChanges({ status: statusPayload.status }, oldRow, updateRes.rows[0] as Record<string, unknown>);
  } else if (action === "archive") {
    updateRes = await client.query(
      `
        UPDATE mdata.vendors
        SET deactivated_at = COALESCE(deactivated_at, now()),
            updated_by_user_id = $3,
            updated_at = now()
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
          AND deactivated_at IS NULL
        RETURNING *
      `,
      [id, operatingCompanyId, actorUserId]
    );
    if (updateRes.rows.length === 0) {
      return { ok: false, code: "E_ALREADY_ARCHIVED", message: "Vendor is already archived" };
    }
    auditPayload.changes = buildPatchChanges({ deactivated_at: "now" }, oldRow, updateRes.rows[0] as Record<string, unknown>);
  } else if (action === "set_1099_eligibility") {
    const eligibilityPayload = payload as z.infer<typeof vendor1099PayloadSchema>;
    updateRes = await client.query(
      `
        UPDATE mdata.vendors
        SET eligible_1099 = $3,
            updated_by_user_id = $4,
            updated_at = now()
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
        RETURNING *
      `,
      [id, operatingCompanyId, eligibilityPayload.eligible, actorUserId]
    );
    auditPayload.changes = buildPatchChanges(
      { eligible_1099: eligibilityPayload.eligible },
      oldRow,
      updateRes.rows[0] as Record<string, unknown>
    );
  } else {
    return { ok: false, code: "E_UNKNOWN_ACTION", message: `Unknown action: ${action}` };
  }

  if (updateRes.rows.length === 0) {
    return { ok: false, code: "E_UPDATE_FAILED", message: "Vendor update failed" };
  }

  await appendBulkCrudAudit(client, actorUserId, "vendor", action, bulkCallId, auditPayload);
  return { ok: true };
}

export async function registerVendorBulkRoutes(app: FastifyInstance) {
  registerBulkRoute({
    app,
    path: "/api/v1/mdata/vendors/bulk-update",
    domain: "mdata",
    resource: "vendors",
    entityType: "vendor",
    requireReasonActions: ["set_status", "archive"],
    destructiveActions: ["archive"],
    actionMap: {
      set_status: vendorStatusPayloadSchema,
      archive: emptyPayloadSchema,
      set_1099_eligibility: vendor1099PayloadSchema,
    },
    perEntityHandler: handleVendorBulk,
  });
}
