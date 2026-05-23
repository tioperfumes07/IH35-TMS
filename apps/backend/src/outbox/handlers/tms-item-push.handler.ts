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

type ItemRow = {
  item_id: string;
  item_name: string;
  item_code: string | null;
  item_type: string;
  description: string | null;
  unit_price_cents: number | null;
  default_income_account_id: string | null;
  qbo_item_id: string | null;
  deactivated_at: string | null;
};

type MirrorRow = {
  mirror_row_id: string;
  qbo_id: string | null;
  qbo_sync_token: string | null;
};

async function resolveIncomeAccountQboId(
  payload: { operating_company_id: string; default_income_account_id: string | null },
  ctx: OutboxHandlerContext,
) {
  if (!payload.default_income_account_id) return null;
  const accountRes = await ctx.client.query<{ qbo_account_id: string | null }>(
    `
      SELECT a.qbo_account_id
      FROM catalogs.accounts a
      WHERE a.id = $2::uuid
        AND a.operating_company_id = $1::uuid
      LIMIT 1
    `,
    [payload.operating_company_id, payload.default_income_account_id],
  );
  return accountRes.rows[0]?.qbo_account_id ? String(accountRes.rows[0].qbo_account_id).trim() : null;
}

async function upsertMirrorFromItem(
  payload: { operating_company_id: string; item_id: string },
  ctx: OutboxHandlerContext,
): Promise<{ mirror_row_id: string; qbo_id: string | null; operation: "create" | "update" }> {
  const itemRes = await ctx.client.query<ItemRow>(
    `
      SELECT
        i.id::text AS item_id,
        i.item_name,
        i.item_code,
        i.item_type,
        i.description,
        i.unit_price_cents::int,
        i.default_income_account_id::text,
        i.qbo_item_id,
        i.deactivated_at::text
      FROM catalogs.items i
      WHERE i.id = $1::uuid
      LIMIT 1
    `,
    [payload.item_id],
  );
  const item = itemRes.rows[0];
  if (!item) throw new Error("tms_item_missing");

  const incomeAccountQboId = await resolveIncomeAccountQboId(
    {
      operating_company_id: payload.operating_company_id,
      default_income_account_id: item.default_income_account_id,
    },
    ctx,
  );

  const currentQboId = item.qbo_item_id ? item.qbo_item_id.trim() : "";
  let matchedMirror: MirrorRow | null = null;

  if (currentQboId) {
    const byLinkedId = await ctx.client.query<MirrorRow>(
      `
        SELECT id::text AS mirror_row_id, qbo_id, qbo_sync_token
        FROM mdata.qbo_items
        WHERE operating_company_id = $1::uuid
          AND qbo_id = $2
        LIMIT 1
      `,
      [payload.operating_company_id, currentQboId],
    );
    matchedMirror = byLinkedId.rows[0] ?? null;
  }

  if (!matchedMirror) {
    const byName = await ctx.client.query<MirrorRow>(
      `
        SELECT id::text AS mirror_row_id, qbo_id, qbo_sync_token
        FROM mdata.qbo_items
        WHERE operating_company_id = $1::uuid
          AND lower(trim(name)) = lower(trim($2))
        ORDER BY mirrored_at DESC, updated_at DESC
        LIMIT 1
      `,
      [payload.operating_company_id, item.item_name],
    );
    matchedMirror = byName.rows[0] ?? null;
  }

  const payloadJson = {
    source: "catalogs.items",
    item_id: item.item_id,
    description: item.description,
    income_account_qbo_id: incomeAccountQboId,
  };
  const active = item.deactivated_at == null;

  if (matchedMirror) {
    const updated = await ctx.client.query<{ id: string }>(
      `
        UPDATE mdata.qbo_items
        SET
          name = $3,
          sku = $4,
          item_type = $5,
          unit_price_cents = $6,
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
        item.item_name,
        item.item_code,
        item.item_type,
        item.unit_price_cents,
        active,
        JSON.stringify(payloadJson),
      ],
    );
    const mirrorRowId = updated.rows[0]?.id;
    if (!mirrorRowId) throw new Error("qbo_item_mirror_update_failed");
    const nextOperation = matchedMirror.qbo_id && matchedMirror.qbo_sync_token ? "update" : "create";
    return { mirror_row_id: mirrorRowId, qbo_id: matchedMirror.qbo_id, operation: nextOperation };
  }

  if (!incomeAccountQboId) throw new Error("tms_item_income_account_qbo_id_missing");

  const inserted = await ctx.client.query<{ id: string }>(
    `
      INSERT INTO mdata.qbo_items (
        operating_company_id,
        qbo_id,
        name,
        sku,
        item_type,
        unit_price_cents,
        active,
        created_in_tms,
        payload_json
      )
      VALUES ($1::uuid, NULL, $2, $3, $4, $5, $6, true, $7::jsonb)
      RETURNING id::text
    `,
    [payload.operating_company_id, item.item_name, item.item_code, item.item_type, item.unit_price_cents, active, JSON.stringify(payloadJson)],
  );
  const mirrorRowId = inserted.rows[0]?.id;
  if (!mirrorRowId) throw new Error("qbo_item_mirror_insert_failed");
  return { mirror_row_id: mirrorRowId, qbo_id: null, operation: "create" };
}

async function syncBackLinkedQboId(payload: { operating_company_id: string; item_id: string; mirror_row_id: string }, ctx: OutboxHandlerContext) {
  const qboRes = await ctx.client.query<{ qbo_id: string | null }>(
    `
      SELECT qbo_id
      FROM mdata.qbo_items
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [payload.mirror_row_id, payload.operating_company_id],
  );
  const qboId = qboRes.rows[0]?.qbo_id ? String(qboRes.rows[0].qbo_id).trim() : "";
  if (!qboId) return;

  await ctx.client.query(
    `
      UPDATE catalogs.items
      SET qbo_item_id = $2,
          updated_at = now()
      WHERE id = $1::uuid
        AND (qbo_item_id IS NULL OR qbo_item_id <> $2)
    `,
    [payload.item_id, qboId],
  );
}

export class TmsItemPushHandler implements OutboxEventHandler {
  eventType = "tms.item.push_requested" as const;

  canHandle() {
    return (process.env.TMS_ITEM_PUSH_HANDLER_ENABLED ?? "true").trim() !== "false";
  }

  async deliver(payload: OutboxPayload, ctx: OutboxHandlerContext) {
    const operating_company_id = requireUuid(payload.operating_company_id, "operating_company_id");
    const item_id = requireUuid(payload.item_id, "item_id");
    const operationHint = requireOperation(payload.operation);

    await ctx.client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    await ctx.client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operating_company_id]);

    const mirror = await upsertMirrorFromItem({ operating_company_id, item_id }, ctx);
    const effectiveOperation: "create" | "update" = operationHint === "create" ? (mirror.qbo_id ? "update" : "create") : "update";

    const pushPayload: QboMasterPushPayload = {
      operating_company_id,
      mirror_row_id: mirror.mirror_row_id,
      entity: "item",
      operation: effectiveOperation,
    };
    const result = await deliverQboMasterEntityPush(pushPayload, ctx);
    await syncBackLinkedQboId({ operating_company_id, item_id, mirror_row_id: mirror.mirror_row_id }, ctx);

    return {
      message: result?.message ?? `tms_item_push_${effectiveOperation}`,
    };
  }
}
