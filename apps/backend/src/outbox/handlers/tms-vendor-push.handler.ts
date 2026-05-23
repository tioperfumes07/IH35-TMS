import type { OutboxEventHandler, OutboxHandlerContext, OutboxPayload } from "./registry.js";
import { deliverQboMasterEntityPush } from "../../qbo/push.service.js";
import type { QboMasterPushPayload } from "../../qbo/push.service.js";

function requireUuid(value: unknown, field: string): string {
  const trimmed = String(value ?? "").trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(trimmed)) throw new Error(`${field}_invalid_uuid`);
  return trimmed;
}

function requireOperation(value: unknown): "create" | "update" {
  const operation = String(value ?? "").trim();
  if (operation !== "create" && operation !== "update") throw new Error("operation_invalid");
  return operation;
}

type VendorRow = {
  vendor_id: string;
  operating_company_id: string;
  vendor_name: string;
  vendor_type: string | null;
  vendor_code: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  deactivated_at: string | null;
  qbo_vendor_id: string | null;
};

type MirrorRow = {
  mirror_row_id: string;
  qbo_id: string | null;
  qbo_sync_token: string | null;
};

function normalized(input: string | null | undefined) {
  return String(input ?? "").trim().toLowerCase();
}

function isActiveVendor(row: VendorRow) {
  return !row.deactivated_at;
}

async function upsertMirrorFromVendor(
  payload: { operating_company_id: string; vendor_id: string },
  ctx: OutboxHandlerContext
): Promise<{ mirror_row_id: string; qbo_id: string | null; operation: "create" | "update" }> {
  const vendorRes = await ctx.client.query<VendorRow>(
    `
      SELECT
        v.id::text AS vendor_id,
        v.operating_company_id::text AS operating_company_id,
        v.vendor_name,
        v.vendor_type,
        v.vendor_code,
        v.phone,
        v.email,
        v.notes,
        v.deactivated_at::text,
        v.qbo_vendor_id
      FROM mdata.vendors v
      WHERE v.id = $1::uuid
        AND v.operating_company_id = $2::uuid
      LIMIT 1
    `,
    [payload.vendor_id, payload.operating_company_id]
  );
  const vendor = vendorRes.rows[0];
  if (!vendor) throw new Error("tms_vendor_missing");

  const currentQboId = vendor.qbo_vendor_id ? vendor.qbo_vendor_id.trim() : "";
  const email = vendor.email ? vendor.email.trim() : null;
  const phone = vendor.phone ? vendor.phone.trim() : null;
  const displayName = vendor.vendor_name.trim();
  const active = isActiveVendor(vendor);

  let matchedMirror: MirrorRow | null = null;

  if (currentQboId) {
    const byLinkedId = await ctx.client.query<MirrorRow>(
      `
        SELECT id::text AS mirror_row_id, qbo_id, qbo_sync_token
        FROM mdata.qbo_vendors
        WHERE operating_company_id = $1::uuid
          AND qbo_id = $2
        LIMIT 1
      `,
      [payload.operating_company_id, currentQboId]
    );
    matchedMirror = byLinkedId.rows[0] ?? null;
    if (!matchedMirror) throw new Error("linked_qbo_vendor_missing_in_mirror");
  } else if (email) {
    const byEmail = await ctx.client.query<MirrorRow>(
      `
        SELECT id::text AS mirror_row_id, qbo_id, qbo_sync_token
        FROM mdata.qbo_vendors
        WHERE operating_company_id = $1::uuid
          AND qbo_id IS NOT NULL
          AND lower(trim(primary_email)) = lower(trim($2))
        ORDER BY mirrored_at DESC, updated_at DESC
        LIMIT 1
      `,
      [payload.operating_company_id, email]
    );
    matchedMirror = byEmail.rows[0] ?? null;
  }

  if (!matchedMirror && displayName) {
    const byName = await ctx.client.query<MirrorRow>(
      `
        SELECT id::text AS mirror_row_id, qbo_id, qbo_sync_token
        FROM mdata.qbo_vendors
        WHERE operating_company_id = $1::uuid
          AND qbo_id IS NOT NULL
          AND lower(trim(display_name)) = lower(trim($2))
        ORDER BY mirrored_at DESC, updated_at DESC
        LIMIT 1
      `,
      [payload.operating_company_id, displayName]
    );
    matchedMirror = byName.rows[0] ?? null;
  }

  if (matchedMirror) {
    const updateRes = await ctx.client.query<{ id: string }>(
      `
        UPDATE mdata.qbo_vendors
        SET
          display_name = $3,
          company_name = $4,
          primary_email = $5,
          primary_phone = $6,
          active = $7,
          created_in_tms = true,
          payload_json = COALESCE(payload_json, '{}'::jsonb) || $8::jsonb,
          mirrored_at = now()
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
        RETURNING id::text
      `,
      [
        matchedMirror.mirror_row_id,
        payload.operating_company_id,
        displayName,
        displayName,
        email,
        phone,
        active,
        JSON.stringify({
          source: "mdata.vendors",
          vendor_id: payload.vendor_id,
          vendor_type: vendor.vendor_type,
          vendor_code: vendor.vendor_code,
        }),
      ]
    );
    const mirrorRowId = updateRes.rows[0]?.id;
    if (!mirrorRowId) throw new Error("qbo_vendor_mirror_update_failed");
    return {
      mirror_row_id: mirrorRowId,
      qbo_id: matchedMirror.qbo_id,
      operation: matchedMirror.qbo_id && matchedMirror.qbo_sync_token ? "update" : "create",
    };
  }

  const inserted = await ctx.client.query<{ id: string }>(
    `
      INSERT INTO mdata.qbo_vendors (
        operating_company_id,
        qbo_id,
        display_name,
        company_name,
        primary_email,
        primary_phone,
        active,
        created_in_tms,
        payload_json
      )
      VALUES ($1::uuid, NULL, $2, $3, $4, $5, $6, true, $7::jsonb)
      RETURNING id::text
    `,
    [
      payload.operating_company_id,
      displayName,
      displayName,
      email,
      phone,
      active,
      JSON.stringify({
        source: "mdata.vendors",
        vendor_id: payload.vendor_id,
        vendor_type: vendor.vendor_type,
        vendor_code: vendor.vendor_code,
      }),
    ]
  );
  const mirrorRowId = inserted.rows[0]?.id;
  if (!mirrorRowId) throw new Error("qbo_vendor_mirror_insert_failed");
  return { mirror_row_id: mirrorRowId, qbo_id: null, operation: "create" };
}

async function syncBackLinkedQboId(
  payload: { operating_company_id: string; vendor_id: string; mirror_row_id: string },
  ctx: OutboxHandlerContext
) {
  const qboRes = await ctx.client.query<{ qbo_id: string | null }>(
    `
      SELECT qbo_id
      FROM mdata.qbo_vendors
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [payload.mirror_row_id, payload.operating_company_id]
  );
  const qboId = qboRes.rows[0]?.qbo_id ? String(qboRes.rows[0].qbo_id).trim() : "";
  if (!qboId) return;

  await ctx.client.query(
    `
      UPDATE mdata.vendors
      SET qbo_vendor_id = $3,
          updated_at = now()
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
        AND (qbo_vendor_id IS NULL OR qbo_vendor_id <> $3)
    `,
    [payload.vendor_id, payload.operating_company_id, qboId]
  );
}

export class TmsVendorPushHandler implements OutboxEventHandler {
  eventType = "tms.vendor.push_requested" as const;

  canHandle() {
    return (process.env.TMS_VENDOR_PUSH_HANDLER_ENABLED ?? "true").trim() !== "false";
  }

  async deliver(payload: OutboxPayload, ctx: OutboxHandlerContext) {
    const operating_company_id = requireUuid(payload.operating_company_id, "operating_company_id");
    const vendor_id = requireUuid(payload.vendor_id, "vendor_id");
    const operationHint = requireOperation(payload.operation);

    await ctx.client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    await ctx.client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operating_company_id]);

    const mirror = await upsertMirrorFromVendor({ operating_company_id, vendor_id }, ctx);

    const effectiveOperation: "create" | "update" =
      operationHint === "create" ? (mirror.qbo_id ? "update" : "create") : "update";

    const pushPayload: QboMasterPushPayload = {
      operating_company_id,
      mirror_row_id: mirror.mirror_row_id,
      entity: "vendor",
      operation: effectiveOperation,
    };
    const result = await deliverQboMasterEntityPush(pushPayload, ctx);
    await syncBackLinkedQboId({ operating_company_id, vendor_id, mirror_row_id: mirror.mirror_row_id }, ctx);

    return {
      message: result?.message ?? `tms_vendor_push_${effectiveOperation}`,
    };
  }
}
