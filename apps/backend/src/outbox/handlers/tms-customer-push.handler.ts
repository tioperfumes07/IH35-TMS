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

type CustomerRow = {
  customer_id: string;
  operating_company_id: string;
  customer_name: string;
  billing_email: string | null;
  billing_phone: string | null;
  mc_number: string | null;
  status: string | null;
  deactivated_at: string | null;
  qbo_customer_id: string | null;
};

type MirrorRow = {
  mirror_row_id: string;
  qbo_id: string | null;
  qbo_sync_token: string | null;
};

function normalized(input: string | null | undefined) {
  return String(input ?? "").trim().toLowerCase();
}

function isActiveCustomer(row: CustomerRow) {
  if (row.deactivated_at) return false;
  const status = normalized(row.status);
  return !["inactive", "blacklist"].includes(status);
}

async function upsertMirrorFromCustomer(
  payload: { operating_company_id: string; customer_id: string },
  ctx: OutboxHandlerContext
): Promise<{ mirror_row_id: string; qbo_id: string | null; operation: "create" | "update" }> {
  const customerRes = await ctx.client.query<CustomerRow>(
    `
      SELECT
        c.id::text AS customer_id,
        c.operating_company_id::text AS operating_company_id,
        c.customer_name,
        c.billing_email,
        c.billing_phone,
        c.mc_number,
        c.status::text,
        c.deactivated_at::text,
        c.qbo_customer_id
      FROM mdata.customers c
      WHERE c.id = $1::uuid
        AND c.operating_company_id = $2::uuid
      LIMIT 1
    `,
    [payload.customer_id, payload.operating_company_id]
  );
  const customer = customerRes.rows[0];
  if (!customer) throw new Error("tms_customer_missing");

  const currentQboId = customer.qbo_customer_id ? customer.qbo_customer_id.trim() : "";
  const email = customer.billing_email ? customer.billing_email.trim() : null;
  const phone = customer.billing_phone ? customer.billing_phone.trim() : null;
  const mcNumber = customer.mc_number ? customer.mc_number.trim() : null;
  const displayName = customer.customer_name.trim();
  const active = isActiveCustomer(customer);

  let matchedMirror: MirrorRow | null = null;

  if (currentQboId) {
    const byLinkedId = await ctx.client.query<MirrorRow>(
      `
        SELECT id::text AS mirror_row_id, qbo_id, qbo_sync_token
        FROM mdata.qbo_customers
        WHERE operating_company_id = $1::uuid
          AND qbo_id = $2
        LIMIT 1
      `,
      [payload.operating_company_id, currentQboId]
    );
    matchedMirror = byLinkedId.rows[0] ?? null;
    if (!matchedMirror) {
      throw new Error("linked_qbo_customer_missing_in_mirror");
    }
  } else if (mcNumber) {
    const byMc = await ctx.client.query<MirrorRow>(
      `
        SELECT id::text AS mirror_row_id, qbo_id, qbo_sync_token
        FROM mdata.qbo_customers
        WHERE operating_company_id = $1::uuid
          AND qbo_id IS NOT NULL
          AND mc_number = $2
        ORDER BY mirrored_at DESC, updated_at DESC
        LIMIT 1
      `,
      [payload.operating_company_id, mcNumber]
    );
    matchedMirror = byMc.rows[0] ?? null;
  }

  if (!matchedMirror && displayName) {
    const byName = await ctx.client.query<MirrorRow>(
      `
        SELECT id::text AS mirror_row_id, qbo_id, qbo_sync_token
        FROM mdata.qbo_customers
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
        UPDATE mdata.qbo_customers
        SET
          display_name = $3,
          company_name = $4,
          primary_email = $5,
          primary_phone = $6,
          mc_number = $7,
          active = $8,
          created_in_tms = true,
          payload_json = COALESCE(payload_json, '{}'::jsonb) || $9::jsonb,
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
        mcNumber,
        active,
        JSON.stringify({
          source: "mdata.customers",
          customer_id: payload.customer_id,
        }),
      ]
    );
    const mirrorRowId = updateRes.rows[0]?.id;
    if (!mirrorRowId) throw new Error("qbo_customer_mirror_update_failed");
    return {
      mirror_row_id: mirrorRowId,
      qbo_id: matchedMirror.qbo_id,
      operation: matchedMirror.qbo_id && matchedMirror.qbo_sync_token ? "update" : "create",
    };
  }

  const inserted = await ctx.client.query<{ id: string }>(
    `
      INSERT INTO mdata.qbo_customers (
        operating_company_id,
        qbo_id,
        display_name,
        company_name,
        primary_email,
        primary_phone,
        mc_number,
        active,
        created_in_tms,
        payload_json
      )
      VALUES ($1::uuid, NULL, $2, $3, $4, $5, $6, $7, true, $8::jsonb)
      RETURNING id::text
    `,
    [
      payload.operating_company_id,
      displayName,
      displayName,
      email,
      phone,
      mcNumber,
      active,
      JSON.stringify({
        source: "mdata.customers",
        customer_id: payload.customer_id,
      }),
    ]
  );
  const mirrorRowId = inserted.rows[0]?.id;
  if (!mirrorRowId) throw new Error("qbo_customer_mirror_insert_failed");
  return { mirror_row_id: mirrorRowId, qbo_id: null, operation: "create" };
}

async function syncBackLinkedQboId(
  payload: { operating_company_id: string; customer_id: string; mirror_row_id: string },
  ctx: OutboxHandlerContext
) {
  const qboRes = await ctx.client.query<{ qbo_id: string | null }>(
    `
      SELECT qbo_id
      FROM mdata.qbo_customers
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
      UPDATE mdata.customers
      SET qbo_customer_id = $3,
          updated_at = now()
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
        AND (qbo_customer_id IS NULL OR qbo_customer_id <> $3)
    `,
    [payload.customer_id, payload.operating_company_id, qboId]
  );
}

export class TmsCustomerPushHandler implements OutboxEventHandler {
  eventType = "tms.customer.push_requested" as const;

  canHandle() {
    return (process.env.TMS_CUSTOMER_PUSH_HANDLER_ENABLED ?? "true").trim() !== "false";
  }

  async deliver(payload: OutboxPayload, ctx: OutboxHandlerContext) {
    const operating_company_id = requireUuid(payload.operating_company_id, "operating_company_id");
    const customer_id = requireUuid(payload.customer_id, "customer_id");
    const operationHint = requireOperation(payload.operation);

    await ctx.client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    await ctx.client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operating_company_id]);

    const mirror = await upsertMirrorFromCustomer({ operating_company_id, customer_id }, ctx);

    const effectiveOperation: "create" | "update" =
      operationHint === "create" ? (mirror.qbo_id ? "update" : "create") : "update";

    const pushPayload: QboMasterPushPayload = {
      operating_company_id,
      mirror_row_id: mirror.mirror_row_id,
      entity: "customer",
      operation: effectiveOperation,
    };
    const result = await deliverQboMasterEntityPush(pushPayload, ctx);
    await syncBackLinkedQboId({ operating_company_id, customer_id, mirror_row_id: mirror.mirror_row_id }, ctx);

    return {
      message: result?.message ?? `tms_customer_push_${effectiveOperation}`,
    };
  }
}
