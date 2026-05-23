import type { PoolClient } from "pg";
import type { OutboxHandlerContext } from "../outbox/handlers/registry.js";
import { qboPostMasterJson, unwrapIntuitEntity } from "../integrations/qbo/qbo-entity-write.js";

export type QboMasterPushPayload = {
  operating_company_id: string;
  mirror_row_id: string;
  entity: "vendor" | "customer" | "item" | "account";
  operation: "create" | "update";
};

export type QboInvoicePushPayload = {
  operating_company_id: string;
  mirror_row_id: string;
  operation: "create" | "update";
  qbo_body: Record<string, unknown>;
};

export type QboBillPushPayload = {
  operating_company_id: string;
  bill_id: string;
  operation: "create" | "update";
  qbo_body: Record<string, unknown>;
};

export async function enqueueQboMasterEntityPush(client: PoolClient, payload: QboMasterPushPayload) {
  await client.query(`INSERT INTO outbox.events (event_type, payload, next_retry_at) VALUES ($1, $2::jsonb, now())`, [
    "qbo.master_entity.push_requested",
    JSON.stringify(payload),
  ]);
}

async function applyBypass(client: PoolClient, operatingCompanyId: string) {
  await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
  await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
}

function emailAddr(address?: string | null) {
  const trimmed = String(address ?? "").trim();
  if (!trimmed) return undefined;
  return { Address: trimmed };
}

function phoneNumber(number?: string | null) {
  const trimmed = String(number ?? "").trim();
  if (!trimmed) return undefined;
  return { FreeFormNumber: trimmed };
}

function asPayloadJson(row: Record<string, unknown>): Record<string, unknown> {
  const raw = row.payload_json;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return {};
}

export async function deliverQboMasterEntityPush(payload: QboMasterPushPayload, ctx: OutboxHandlerContext) {
  await applyBypass(ctx.client, payload.operating_company_id);

  if (payload.entity === "vendor") return deliverVendor(payload, ctx.client);
  if (payload.entity === "customer") return deliverCustomer(payload, ctx.client);
  if (payload.entity === "item") return deliverItem(payload, ctx.client);
  return deliverAccount(payload, ctx.client);
}

export async function deliverQboBillPush(payload: QboBillPushPayload) {
  const response = await qboPostMasterJson(payload.operating_company_id, "bill", payload.qbo_body, payload.operation);
  const row =
    response && typeof response === "object" && !Array.isArray(response) && (response as Record<string, unknown>).Bill
      ? ((response as Record<string, unknown>).Bill as Record<string, unknown>)
      : unwrapIntuitEntity(response);
  return row;
}

async function deliverVendor(payload: QboMasterPushPayload, client: PoolClient) {
  const rowRes = await client.query(
    `
      SELECT *
      FROM mdata.qbo_vendors
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [payload.mirror_row_id, payload.operating_company_id]
  );
  const row = rowRes.rows[0] as Record<string, unknown> | undefined;
  if (!row) throw new Error("mirror_vendor_missing");

  if (payload.operation === "create") {
    if (row.qbo_id) return { message: "vendor_already_linked_skip" };
    const displayName = String(row.display_name ?? "").trim().slice(0, 100) || "IH35 Vendor";
    const companyName = row.company_name != null ? String(row.company_name).trim().slice(0, 100) : displayName;
    const body: Record<string, unknown> = {
      DisplayName: displayName,
      CompanyName: companyName || displayName,
      Active: row.active === undefined ? true : Boolean(row.active),
    };
    const email = emailAddr(row.primary_email as string | null);
    const phone = phoneNumber(row.primary_phone as string | null);
    if (email) body.PrimaryEmailAddr = email;
    if (phone) body.PrimaryPhone = phone;

    const resp = await qboPostMasterJson(payload.operating_company_id, "vendor", body, "create");
    const entity = unwrapIntuitEntity(resp);
    const qboId = entity.Id != null ? String(entity.Id) : "";
    const syncToken = entity.SyncToken != null ? String(entity.SyncToken) : null;
    if (!qboId) throw new Error("vendor_create_missing_id");

    await client.query(
      `
        UPDATE mdata.qbo_vendors
        SET qbo_id = $3,
            qbo_sync_token = $4,
            payload_json = $5::jsonb,
            last_push_at = now(),
            mirrored_at = now(),
            created_in_tms = true
        WHERE id = $1::uuid AND operating_company_id = $2::uuid
      `,
      [payload.mirror_row_id, payload.operating_company_id, qboId, syncToken, JSON.stringify(entity)]
    );
    return { message: `vendor_created_${qboId}` };
  }

  const qboId = row.qbo_id != null ? String(row.qbo_id) : "";
  const syncToken = row.qbo_sync_token != null ? String(row.qbo_sync_token) : "";
  if (!qboId || !syncToken) throw new Error("vendor_update_requires_ids");

  const sparseBody: Record<string, unknown> = {
    Id: qboId,
    SyncToken: syncToken,
    sparse: true,
    DisplayName: String(row.display_name ?? "").trim().slice(0, 100),
    CompanyName: row.company_name != null ? String(row.company_name).trim().slice(0, 100) : undefined,
    Active: Boolean(row.active),
  };
  const email = emailAddr(row.primary_email as string | null);
  const phone = phoneNumber(row.primary_phone as string | null);
  if (email) sparseBody.PrimaryEmailAddr = email;
  if (phone) sparseBody.PrimaryPhone = phone;

  const resp = await qboPostMasterJson(payload.operating_company_id, "vendor", sparseBody, "update");
  const entity = unwrapIntuitEntity(resp);
  const nextToken = entity.SyncToken != null ? String(entity.SyncToken) : syncToken;
  await client.query(
    `
      UPDATE mdata.qbo_vendors
      SET qbo_sync_token = $4,
          payload_json = $5::jsonb,
          last_push_at = now(),
          mirrored_at = now()
      WHERE id = $1::uuid AND operating_company_id = $2::uuid AND qbo_id = $3
    `,
    [payload.mirror_row_id, payload.operating_company_id, qboId, nextToken, JSON.stringify(entity)]
  );
  return { message: `vendor_updated_${qboId}` };
}

async function deliverCustomer(payload: QboMasterPushPayload, client: PoolClient) {
  const rowRes = await client.query(
    `
      SELECT *
      FROM mdata.qbo_customers
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [payload.mirror_row_id, payload.operating_company_id]
  );
  const row = rowRes.rows[0] as Record<string, unknown> | undefined;
  if (!row) throw new Error("mirror_customer_missing");

  if (payload.operation === "create") {
    if (row.qbo_id) return { message: "customer_already_linked_skip" };
    const displayName = String(row.display_name ?? "").trim().slice(0, 100) || "IH35 Customer";
    const companyName = row.company_name != null ? String(row.company_name).trim().slice(0, 100) : displayName;
    const body: Record<string, unknown> = {
      DisplayName: displayName,
      CompanyName: companyName || displayName,
      Active: row.active === undefined ? true : Boolean(row.active),
    };
    const email = emailAddr(row.primary_email as string | null);
    const phone = phoneNumber(row.primary_phone as string | null);
    if (email) body.PrimaryEmailAddr = email;
    if (phone) body.PrimaryPhone = phone;

    const resp = await qboPostMasterJson(payload.operating_company_id, "customer", body, "create");
    const entity = unwrapIntuitEntity(resp);
    const qboId = entity.Id != null ? String(entity.Id) : "";
    const syncToken = entity.SyncToken != null ? String(entity.SyncToken) : null;
    if (!qboId) throw new Error("customer_create_missing_id");

    await client.query(
      `
        UPDATE mdata.qbo_customers
        SET qbo_id = $3,
            qbo_sync_token = $4,
            payload_json = $5::jsonb,
            last_push_at = now(),
            mirrored_at = now(),
            created_in_tms = true
        WHERE id = $1::uuid AND operating_company_id = $2::uuid
      `,
      [payload.mirror_row_id, payload.operating_company_id, qboId, syncToken, JSON.stringify(entity)]
    );
    return { message: `customer_created_${qboId}` };
  }

  const qboId = row.qbo_id != null ? String(row.qbo_id) : "";
  const syncToken = row.qbo_sync_token != null ? String(row.qbo_sync_token) : "";
  if (!qboId || !syncToken) throw new Error("customer_update_requires_ids");

  const sparseBody: Record<string, unknown> = {
    Id: qboId,
    SyncToken: syncToken,
    sparse: true,
    DisplayName: String(row.display_name ?? "").trim().slice(0, 100),
    CompanyName: row.company_name != null ? String(row.company_name).trim().slice(0, 100) : undefined,
    Active: Boolean(row.active),
  };
  const email = emailAddr(row.primary_email as string | null);
  const phone = phoneNumber(row.primary_phone as string | null);
  if (email) sparseBody.PrimaryEmailAddr = email;
  if (phone) sparseBody.PrimaryPhone = phone;

  const resp = await qboPostMasterJson(payload.operating_company_id, "customer", sparseBody, "update");
  const entity = unwrapIntuitEntity(resp);
  const nextToken = entity.SyncToken != null ? String(entity.SyncToken) : syncToken;
  await client.query(
    `
      UPDATE mdata.qbo_customers
      SET qbo_sync_token = $4,
          payload_json = $5::jsonb,
          last_push_at = now(),
          mirrored_at = now()
      WHERE id = $1::uuid AND operating_company_id = $2::uuid AND qbo_id = $3
    `,
    [payload.mirror_row_id, payload.operating_company_id, qboId, nextToken, JSON.stringify(entity)]
  );
  return { message: `customer_updated_${qboId}` };
}

async function deliverItem(payload: QboMasterPushPayload, client: PoolClient) {
  const rowRes = await client.query(
    `
      SELECT *
      FROM mdata.qbo_items
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [payload.mirror_row_id, payload.operating_company_id]
  );
  const row = rowRes.rows[0] as Record<string, unknown> | undefined;
  if (!row) throw new Error("mirror_item_missing");

  const hints = asPayloadJson(row);
  const incomeAccountId =
    typeof hints.income_account_qbo_id === "string" && hints.income_account_qbo_id.trim().length > 0
      ? hints.income_account_qbo_id.trim()
      : "";

  if (payload.operation === "create") {
    if (row.qbo_id) return { message: "item_already_linked_skip" };
    if (!incomeAccountId) throw new Error("item_create_requires_income_account_qbo_id");

    const name = String(row.name ?? "").trim().slice(0, 100) || "IH35 Item";
    const sku = row.sku != null ? String(row.sku).trim().slice(0, 100) : undefined;
    const unitPrice = row.unit_price_cents != null ? Number(row.unit_price_cents) / 100 : undefined;

    const body: Record<string, unknown> = {
      Name: name,
      Type: "NonInventory",
      IncomeAccountRef: { value: incomeAccountId },
      Active: row.active === undefined ? true : Boolean(row.active),
    };
    if (sku) body.Sku = sku;
    if (unitPrice !== undefined && Number.isFinite(unitPrice)) body.UnitPrice = unitPrice;

    const resp = await qboPostMasterJson(payload.operating_company_id, "item", body, "create");
    const entity = unwrapIntuitEntity(resp);
    const qboId = entity.Id != null ? String(entity.Id) : "";
    const syncToken = entity.SyncToken != null ? String(entity.SyncToken) : null;
    if (!qboId) throw new Error("item_create_missing_id");

    await client.query(
      `
        UPDATE mdata.qbo_items
        SET qbo_id = $3,
            qbo_sync_token = $4,
            payload_json = $5::jsonb,
            last_push_at = now(),
            mirrored_at = now(),
            created_in_tms = true
        WHERE id = $1::uuid AND operating_company_id = $2::uuid
      `,
      [payload.mirror_row_id, payload.operating_company_id, qboId, syncToken, JSON.stringify({ ...hints, qbo_mirror: entity })]
    );
    return { message: `item_created_${qboId}` };
  }

  const qboId = row.qbo_id != null ? String(row.qbo_id) : "";
  const syncToken = row.qbo_sync_token != null ? String(row.qbo_sync_token) : "";
  if (!qboId || !syncToken) throw new Error("item_update_requires_ids");

  const name = String(row.name ?? "").trim().slice(0, 100);
  const sku = row.sku != null ? String(row.sku).trim().slice(0, 100) : undefined;
  const unitPrice = row.unit_price_cents != null ? Number(row.unit_price_cents) / 100 : undefined;

  const sparseBody: Record<string, unknown> = {
    Id: qboId,
    SyncToken: syncToken,
    sparse: true,
    Name: name,
    Active: Boolean(row.active),
  };
  if (sku) sparseBody.Sku = sku;
  if (unitPrice !== undefined && Number.isFinite(unitPrice)) sparseBody.UnitPrice = unitPrice;
  if (incomeAccountId) sparseBody.IncomeAccountRef = { value: incomeAccountId };

  const resp = await qboPostMasterJson(payload.operating_company_id, "item", sparseBody, "update");
  const entity = unwrapIntuitEntity(resp);
  const nextToken = entity.SyncToken != null ? String(entity.SyncToken) : syncToken;
  await client.query(
    `
      UPDATE mdata.qbo_items
      SET qbo_sync_token = $4,
          payload_json = $5::jsonb,
          last_push_at = now(),
          mirrored_at = now()
      WHERE id = $1::uuid AND operating_company_id = $2::uuid AND qbo_id = $3
    `,
    [payload.mirror_row_id, payload.operating_company_id, qboId, nextToken, JSON.stringify({ ...hints, qbo_mirror: entity })]
  );
  return { message: `item_updated_${qboId}` };
}

async function deliverAccount(payload: QboMasterPushPayload, client: PoolClient) {
  const rowRes = await client.query(
    `
      SELECT *
      FROM mdata.qbo_accounts
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [payload.mirror_row_id, payload.operating_company_id]
  );
  const row = rowRes.rows[0] as Record<string, unknown> | undefined;
  if (!row) throw new Error("mirror_account_missing");
  const hints = asPayloadJson(row);

  if (payload.operation === "create") {
    if (row.qbo_id) return { message: "account_already_linked_skip" };
    const name = String(row.name ?? "").trim().slice(0, 100) || "IH35 Account";
    const accountType = String(row.account_type ?? "Expense").trim().slice(0, 64) || "Expense";
    const accountSubType = row.account_sub_type != null ? String(row.account_sub_type).trim().slice(0, 64) : undefined;
    const classification =
      typeof hints.classification === "string" && hints.classification.trim().length > 0
        ? hints.classification.trim().slice(0, 32)
        : undefined;
    const acctNum =
      typeof hints.acct_num === "string" && hints.acct_num.trim().length > 0
        ? hints.acct_num.trim().slice(0, 32)
        : undefined;

    const body: Record<string, unknown> = {
      Name: name,
      AccountType: accountType,
      Active: row.active === undefined ? true : Boolean(row.active),
    };
    if (accountSubType) body.AccountSubType = accountSubType;
    if (classification) body.Classification = classification;
    if (acctNum) body.AcctNum = acctNum;

    const resp = await qboPostMasterJson(payload.operating_company_id, "account", body, "create");
    const entity = unwrapIntuitEntity(resp);
    const qboId = entity.Id != null ? String(entity.Id) : "";
    const syncToken = entity.SyncToken != null ? String(entity.SyncToken) : null;
    if (!qboId) throw new Error("account_create_missing_id");

    await client.query(
      `
        UPDATE mdata.qbo_accounts
        SET qbo_id = $3,
            qbo_sync_token = $4,
            payload_json = $5::jsonb,
            last_push_at = now(),
            mirrored_at = now(),
            created_in_tms = true
        WHERE id = $1::uuid AND operating_company_id = $2::uuid
      `,
      [payload.mirror_row_id, payload.operating_company_id, qboId, syncToken, JSON.stringify(entity)]
    );
    return { message: `account_created_${qboId}` };
  }

  const qboId = row.qbo_id != null ? String(row.qbo_id) : "";
  const syncToken = row.qbo_sync_token != null ? String(row.qbo_sync_token) : "";
  if (!qboId || !syncToken) throw new Error("account_update_requires_ids");

  const sparseBody: Record<string, unknown> = {
    Id: qboId,
    SyncToken: syncToken,
    sparse: true,
    Name: String(row.name ?? "").trim().slice(0, 100),
    AccountType: String(row.account_type ?? "Expense").trim().slice(0, 64),
    Active: Boolean(row.active),
  };
  if (row.account_sub_type != null) sparseBody.AccountSubType = String(row.account_sub_type).trim().slice(0, 64);
  if (typeof hints.classification === "string" && hints.classification.trim().length > 0) {
    sparseBody.Classification = hints.classification.trim().slice(0, 32);
  }
  if (typeof hints.acct_num === "string" && hints.acct_num.trim().length > 0) {
    sparseBody.AcctNum = hints.acct_num.trim().slice(0, 32);
  }

  const resp = await qboPostMasterJson(payload.operating_company_id, "account", sparseBody, "update");
  const entity = unwrapIntuitEntity(resp);
  const nextToken = entity.SyncToken != null ? String(entity.SyncToken) : syncToken;
  await client.query(
    `
      UPDATE mdata.qbo_accounts
      SET qbo_sync_token = $4,
          payload_json = $5::jsonb,
          last_push_at = now(),
          mirrored_at = now()
      WHERE id = $1::uuid AND operating_company_id = $2::uuid AND qbo_id = $3
    `,
    [payload.mirror_row_id, payload.operating_company_id, qboId, nextToken, JSON.stringify(entity)]
  );
  return { message: `account_updated_${qboId}` };
}

export async function deliverQboInvoicePush(payload: QboInvoicePushPayload, ctx: OutboxHandlerContext) {
  await applyBypass(ctx.client, payload.operating_company_id);

  const rowRes = await ctx.client.query(
    `
      SELECT *
      FROM mdata.qbo_invoices
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [payload.mirror_row_id, payload.operating_company_id],
  );
  const row = rowRes.rows[0] as Record<string, unknown> | undefined;
  if (!row) throw new Error("mirror_invoice_missing");

  const resp = await qboPostMasterJson(payload.operating_company_id, "invoice", payload.qbo_body, payload.operation);
  const invoiceEntity = (resp.Invoice as Record<string, unknown> | undefined) ?? unwrapIntuitEntity(resp);
  const qboId = invoiceEntity.Id != null ? String(invoiceEntity.Id) : "";
  const syncToken = invoiceEntity.SyncToken != null ? String(invoiceEntity.SyncToken) : null;
  if (!qboId) throw new Error("invoice_push_missing_id");

  await ctx.client.query(
    `
      UPDATE mdata.qbo_invoices
      SET qbo_id = $3,
          qbo_sync_token = $4,
          payload_json = $5::jsonb,
          sync_status = 'synced',
          last_synced_at = now(),
          last_push_at = now(),
          updated_at = now(),
          created_in_tms = true
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
    `,
    [payload.mirror_row_id, payload.operating_company_id, qboId, syncToken, JSON.stringify(invoiceEntity)],
  );

  return { message: `invoice_${payload.operation}_${qboId}`, qbo_id: qboId, qbo_sync_token: syncToken };
}
