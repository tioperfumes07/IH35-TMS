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

type AccountRow = {
  account_id: string;
  account_number: string;
  account_name: string;
  account_type: string;
  account_subtype: string | null;
  qbo_account_id: string | null;
  deactivated_at: string | null;
};

type MirrorRow = {
  mirror_row_id: string;
  qbo_id: string | null;
  qbo_sync_token: string | null;
};

function mapQboClassification(accountType: string): string {
  const normalized = accountType.trim();
  if (normalized === "Asset") return "Asset";
  if (normalized === "Liability") return "Liability";
  if (normalized === "Equity") return "Equity";
  if (normalized === "Income" || normalized === "OtherIncome") return "Revenue";
  return "Expense";
}

async function upsertMirrorFromAccount(
  payload: { operating_company_id: string; account_id: string },
  ctx: OutboxHandlerContext,
): Promise<{ mirror_row_id: string; qbo_id: string | null; operation: "create" | "update" }> {
  const accountRes = await ctx.client.query<AccountRow>(
    `
      SELECT
        a.id::text AS account_id,
        a.account_number,
        a.account_name,
        a.account_type,
        a.account_subtype,
        a.qbo_account_id,
        a.deactivated_at::text
      FROM catalogs.accounts a
      WHERE a.id = $1::uuid
        AND a.operating_company_id = $2::uuid
      LIMIT 1
    `,
    [payload.account_id, payload.operating_company_id],
  );
  const account = accountRes.rows[0];
  if (!account) throw new Error("tms_account_missing");

  const currentQboId = account.qbo_account_id ? account.qbo_account_id.trim() : "";
  let matchedMirror: MirrorRow | null = null;

  if (currentQboId) {
    const byLinkedId = await ctx.client.query<MirrorRow>(
      `
        SELECT id::text AS mirror_row_id, qbo_id, qbo_sync_token
        FROM mdata.qbo_accounts
        WHERE operating_company_id = $1::uuid
          AND qbo_id = $2
        LIMIT 1
      `,
      [payload.operating_company_id, currentQboId],
    );
    matchedMirror = byLinkedId.rows[0] ?? null;
    if (!matchedMirror) throw new Error("linked_qbo_account_missing_in_mirror");
  }

  if (!matchedMirror) {
    const byName = await ctx.client.query<MirrorRow>(
      `
        SELECT id::text AS mirror_row_id, qbo_id, qbo_sync_token
        FROM mdata.qbo_accounts
        WHERE operating_company_id = $1::uuid
          AND lower(trim(name)) = lower(trim($2))
        ORDER BY mirrored_at DESC, updated_at DESC
        LIMIT 1
      `,
      [payload.operating_company_id, account.account_name],
    );
    matchedMirror = byName.rows[0] ?? null;
  }

  const active = account.deactivated_at == null;
  const payloadJson = {
    source: "catalogs.accounts",
    account_id: account.account_id,
    acct_num: account.account_number,
    classification: mapQboClassification(account.account_type),
  };

  if (matchedMirror) {
    const updated = await ctx.client.query<{ id: string }>(
      `
        UPDATE mdata.qbo_accounts
        SET
          name = $3,
          full_qualified_name = $4,
          account_type = $5,
          account_sub_type = $6,
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
        account.account_name,
        account.account_name,
        account.account_type,
        account.account_subtype,
        active,
        JSON.stringify(payloadJson),
      ],
    );
    const mirrorRowId = updated.rows[0]?.id;
    if (!mirrorRowId) throw new Error("qbo_account_mirror_update_failed");
    return {
      mirror_row_id: mirrorRowId,
      qbo_id: matchedMirror.qbo_id,
      operation: matchedMirror.qbo_id && matchedMirror.qbo_sync_token ? "update" : "create",
    };
  }

  const inserted = await ctx.client.query<{ id: string }>(
    `
      INSERT INTO mdata.qbo_accounts (
        operating_company_id,
        qbo_id,
        name,
        full_qualified_name,
        account_type,
        account_sub_type,
        active,
        created_in_tms,
        payload_json
      )
      VALUES ($1::uuid, NULL, $2, $3, $4, $5, $6, true, $7::jsonb)
      RETURNING id::text
    `,
    [
      payload.operating_company_id,
      account.account_name,
      account.account_name,
      account.account_type,
      account.account_subtype,
      active,
      JSON.stringify(payloadJson),
    ],
  );
  const mirrorRowId = inserted.rows[0]?.id;
  if (!mirrorRowId) throw new Error("qbo_account_mirror_insert_failed");
  return { mirror_row_id: mirrorRowId, qbo_id: null, operation: "create" };
}

async function syncBackLinkedQboId(
  payload: { operating_company_id: string; account_id: string; mirror_row_id: string },
  ctx: OutboxHandlerContext,
) {
  const qboRes = await ctx.client.query<{ qbo_id: string | null }>(
    `
      SELECT qbo_id
      FROM mdata.qbo_accounts
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
      UPDATE catalogs.accounts
      SET qbo_account_id = $2,
          updated_at = now()
      WHERE id = $1::uuid
        AND (qbo_account_id IS NULL OR qbo_account_id <> $2)
    `,
    [payload.account_id, qboId],
  );
}

export class TmsAccountPushHandler implements OutboxEventHandler {
  eventType = "tms.account.push_requested" as const;

  canHandle() {
    return (process.env.TMS_ACCOUNT_PUSH_HANDLER_ENABLED ?? "true").trim() !== "false";
  }

  async deliver(payload: OutboxPayload, ctx: OutboxHandlerContext) {
    const operating_company_id = requireUuid(payload.operating_company_id, "operating_company_id");
    const account_id = requireUuid(payload.account_id, "account_id");
    const operationHint = requireOperation(payload.operation);

    await ctx.client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    await ctx.client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operating_company_id]);

    const mirror = await upsertMirrorFromAccount({ operating_company_id, account_id }, ctx);
    const effectiveOperation: "create" | "update" =
      operationHint === "create" ? (mirror.qbo_id ? "update" : "create") : "update";

    const pushPayload: QboMasterPushPayload = {
      operating_company_id,
      mirror_row_id: mirror.mirror_row_id,
      entity: "account",
      operation: effectiveOperation,
    };
    const result = await deliverQboMasterEntityPush(pushPayload, ctx);
    await syncBackLinkedQboId({ operating_company_id, account_id, mirror_row_id: mirror.mirror_row_id }, ctx);

    return {
      message: result?.message ?? `tms_account_push_${effectiveOperation}`,
    };
  }
}
