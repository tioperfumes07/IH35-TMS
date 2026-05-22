import type { PoolClient } from "pg";
import { qboCompanyContext, qboPaginateEntity } from "../integrations/qbo/qbo-client.js";
import { withLuciaBypass } from "../auth/db.js";
import { withMasterDataSyncHeartbeat } from "./master-data-sync-heartbeat.js";

export type MasterEntityType = "vendor" | "customer" | "item" | "account";
export type MasterSyncType = "full" | "delta";

type SyncParams = {
  operatingCompanyId: string;
  syncType: MasterSyncType;
};

function qboEntityName(entity: MasterEntityType): "Vendor" | "Customer" | "Item" | "Account" {
  if (entity === "vendor") return "Vendor";
  if (entity === "customer") return "Customer";
  if (entity === "item") return "Item";
  return "Account";
}

function metadataWhereClause(syncType: MasterSyncType, cursorIso: string | null): string {
  if (syncType === "full" || !cursorIso) return "";
  const safe = cursorIso.replace(/'/g, "''");
  return `Metadata.LastUpdatedTime > '${safe}'`;
}

function metaUpdatedAt(row: Record<string, unknown>): Date | null {
  const meta = row.MetaData as Record<string, unknown> | undefined;
  const raw = meta?.LastUpdatedTime;
  if (typeof raw !== "string") return null;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}

function nestedString(obj: unknown, path: string[]): string | null {
  let cur: unknown = obj;
  for (const key of path) {
    if (!cur || typeof cur !== "object") return null;
    cur = (cur as Record<string, unknown>)[key];
  }
  return typeof cur === "string" ? cur : null;
}

async function appendAudit(client: PoolClient, eventClass: string, payload: Record<string, unknown>) {
  await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
    eventClass,
    "info",
    JSON.stringify(payload),
    "P6-T11173",
  ]);
}

async function resolveDeltaCursorIso(
  client: PoolClient,
  operatingCompanyId: string,
  entity: MasterEntityType,
  syncType: MasterSyncType
): Promise<string | null> {
  if (syncType === "full") return null;
  const table =
    entity === "vendor"
      ? "mdata.qbo_vendors"
      : entity === "customer"
        ? "mdata.qbo_customers"
        : entity === "item"
          ? "mdata.qbo_items"
          : "mdata.qbo_accounts";
  const lastRun = await client.query<{ cdc_cursor: string | null }>(
    `
      SELECT cdc_cursor::text AS cdc_cursor
      FROM mdata.qbo_sync_runs
      WHERE operating_company_id = $1
        AND entity_type = $2
        AND sync_type = 'delta'
        AND finished_at IS NOT NULL
        AND error_message IS NULL
      ORDER BY finished_at DESC
      LIMIT 1
    `,
    [operatingCompanyId, entity]
  );
  const fromRun = lastRun.rows[0]?.cdc_cursor;
  if (fromRun) return new Date(fromRun).toISOString();
  const maxMirror = await client.query<{ max_u: string | null }>(
    `SELECT max(qbo_updated_at)::text AS max_u FROM ${table} WHERE operating_company_id = $1`,
    [operatingCompanyId]
  );
  const maxU = maxMirror.rows[0]?.max_u;
  return maxU ? new Date(maxU).toISOString() : null;
}

async function upsertVendor(
  client: PoolClient,
  operatingCompanyId: string,
  row: Record<string, unknown>,
  maxUpdated: { current: Date | null }
) {
  const id = String(row.Id ?? "");
  if (!id) return;
  const syncToken = row.SyncToken != null ? String(row.SyncToken) : null;
  const displayName = String(row.DisplayName ?? row.Name ?? "");
  if (!displayName) return;
  const companyName = row.CompanyName != null ? String(row.CompanyName) : null;
  const primaryEmail = nestedString(row.PrimaryEmailAddr, ["Address"]);
  const primaryPhone = nestedString(row.PrimaryPhone, ["FreeFormNumber"]);
  const active = row.Active === undefined ? true : Boolean(row.Active);
  const updated = metaUpdatedAt(row);
  if (updated && (!maxUpdated.current || updated > maxUpdated.current)) maxUpdated.current = updated;

  await client.query(
    `
      INSERT INTO mdata.qbo_vendors (
        operating_company_id,
        qbo_id,
        qbo_sync_token,
        display_name,
        company_name,
        primary_email,
        primary_phone,
        active,
        qbo_updated_at,
        mirrored_at,
        payload_json
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),$10::jsonb)
      ON CONFLICT (operating_company_id, qbo_id)
      DO UPDATE SET
        qbo_sync_token = EXCLUDED.qbo_sync_token,
        display_name = EXCLUDED.display_name,
        company_name = EXCLUDED.company_name,
        primary_email = EXCLUDED.primary_email,
        primary_phone = EXCLUDED.primary_phone,
        active = EXCLUDED.active,
        qbo_updated_at = EXCLUDED.qbo_updated_at,
        mirrored_at = now(),
        payload_json = EXCLUDED.payload_json
      WHERE mdata.qbo_vendors.qbo_sync_token IS DISTINCT FROM EXCLUDED.qbo_sync_token
    `,
    [
      operatingCompanyId,
      id,
      syncToken,
      displayName,
      companyName,
      primaryEmail,
      primaryPhone,
      active,
      updated,
      JSON.stringify(row),
    ]
  );
}

async function upsertCustomer(client: PoolClient, operatingCompanyId: string, row: Record<string, unknown>, maxUpdated: { current: Date | null }) {
  const id = String(row.Id ?? "");
  if (!id) return;
  const syncToken = row.SyncToken != null ? String(row.SyncToken) : null;
  const displayName = String(row.DisplayName ?? row.Name ?? "");
  if (!displayName) return;
  const companyName = row.CompanyName != null ? String(row.CompanyName) : null;
  const primaryEmail = nestedString(row.PrimaryEmailAddr, ["Address"]);
  const primaryPhone = nestedString(row.PrimaryPhone, ["FreeFormNumber"]);
  const mcNumber = row.MCNumber != null ? String(row.MCNumber) : null;
  const active = row.Active === undefined ? true : Boolean(row.Active);
  const updated = metaUpdatedAt(row);
  if (updated && (!maxUpdated.current || updated > maxUpdated.current)) maxUpdated.current = updated;

  await client.query(
    `
      INSERT INTO mdata.qbo_customers (
        operating_company_id,
        qbo_id,
        qbo_sync_token,
        display_name,
        company_name,
        primary_email,
        primary_phone,
        mc_number,
        active,
        qbo_updated_at,
        mirrored_at,
        payload_json
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now(),$11::jsonb)
      ON CONFLICT (operating_company_id, qbo_id)
      DO UPDATE SET
        qbo_sync_token = EXCLUDED.qbo_sync_token,
        display_name = EXCLUDED.display_name,
        company_name = EXCLUDED.company_name,
        primary_email = EXCLUDED.primary_email,
        primary_phone = EXCLUDED.primary_phone,
        mc_number = EXCLUDED.mc_number,
        active = EXCLUDED.active,
        qbo_updated_at = EXCLUDED.qbo_updated_at,
        mirrored_at = now(),
        payload_json = EXCLUDED.payload_json
      WHERE mdata.qbo_customers.qbo_sync_token IS DISTINCT FROM EXCLUDED.qbo_sync_token
    `,
    [
      operatingCompanyId,
      id,
      syncToken,
      displayName,
      companyName,
      primaryEmail,
      primaryPhone,
      mcNumber,
      active,
      updated,
      JSON.stringify(row),
    ]
  );
}

async function upsertItem(client: PoolClient, operatingCompanyId: string, row: Record<string, unknown>, maxUpdated: { current: Date | null }) {
  const id = String(row.Id ?? "");
  if (!id) return;
  const syncToken = row.SyncToken != null ? String(row.SyncToken) : null;
  const name = String(row.Name ?? "");
  if (!name) return;
  const sku = row.Sku != null ? String(row.Sku) : null;
  const itemType = row.Type != null ? String(row.Type) : null;
  const rawPrice = row.UnitPrice;
  const unitPrice = typeof rawPrice === "number" ? Math.round(rawPrice * 100) : rawPrice != null ? Math.round(Number(rawPrice) * 100) : null;
  const active = row.Active === undefined ? true : Boolean(row.Active);
  const updated = metaUpdatedAt(row);
  if (updated && (!maxUpdated.current || updated > maxUpdated.current)) maxUpdated.current = updated;

  await client.query(
    `
      INSERT INTO mdata.qbo_items (
        operating_company_id,
        qbo_id,
        qbo_sync_token,
        name,
        sku,
        item_type,
        unit_price_cents,
        active,
        qbo_updated_at,
        mirrored_at,
        payload_json
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),$10::jsonb)
      ON CONFLICT (operating_company_id, qbo_id)
      DO UPDATE SET
        qbo_sync_token = EXCLUDED.qbo_sync_token,
        name = EXCLUDED.name,
        sku = EXCLUDED.sku,
        item_type = EXCLUDED.item_type,
        unit_price_cents = EXCLUDED.unit_price_cents,
        active = EXCLUDED.active,
        qbo_updated_at = EXCLUDED.qbo_updated_at,
        mirrored_at = now(),
        payload_json = EXCLUDED.payload_json
      WHERE mdata.qbo_items.qbo_sync_token IS DISTINCT FROM EXCLUDED.qbo_sync_token
    `,
    [operatingCompanyId, id, syncToken, name, sku, itemType, unitPrice, active, updated, JSON.stringify(row)]
  );
}

async function upsertAccount(client: PoolClient, operatingCompanyId: string, row: Record<string, unknown>, maxUpdated: { current: Date | null }) {
  const id = String(row.Id ?? "");
  if (!id) return;
  const syncToken = row.SyncToken != null ? String(row.SyncToken) : null;
  const name = String(row.Name ?? "");
  if (!name) return;
  const fullQualifiedName = row.FullyQualifiedName != null ? String(row.FullyQualifiedName) : null;
  const accountType = row.AccountType != null ? String(row.AccountType) : null;
  const accountSubType = row.AccountSubType != null ? String(row.AccountSubType) : null;
  const active = row.Active === undefined ? true : Boolean(row.Active);
  const updated = metaUpdatedAt(row);
  if (updated && (!maxUpdated.current || updated > maxUpdated.current)) maxUpdated.current = updated;

  await client.query(
    `
      INSERT INTO mdata.qbo_accounts (
        operating_company_id,
        qbo_id,
        qbo_sync_token,
        name,
        full_qualified_name,
        account_type,
        account_sub_type,
        active,
        qbo_updated_at,
        mirrored_at,
        payload_json
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),$10::jsonb)
      ON CONFLICT (operating_company_id, qbo_id)
      DO UPDATE SET
        qbo_sync_token = EXCLUDED.qbo_sync_token,
        name = EXCLUDED.name,
        full_qualified_name = EXCLUDED.full_qualified_name,
        account_type = EXCLUDED.account_type,
        account_sub_type = EXCLUDED.account_sub_type,
        active = EXCLUDED.active,
        qbo_updated_at = EXCLUDED.qbo_updated_at,
        mirrored_at = now(),
        payload_json = EXCLUDED.payload_json
      WHERE mdata.qbo_accounts.qbo_sync_token IS DISTINCT FROM EXCLUDED.qbo_sync_token
    `,
    [operatingCompanyId, id, syncToken, name, fullQualifiedName, accountType, accountSubType, active, updated, JSON.stringify(row)]
  );
}

async function syncEntity(params: SyncParams & { entity: MasterEntityType }): Promise<{ runId: string; rowsUpserted: number }> {
  const { operatingCompanyId, syncType, entity } = params;
  const qboName = qboEntityName(entity);
  const startedAt = Date.now();

  return withLuciaBypass(async (client) => {
    const cursorIso = await resolveDeltaCursorIso(client, operatingCompanyId, entity, syncType);
    const where = metadataWhereClause(syncType, cursorIso);

    const runInsert = await client.query<{ id: string }>(
      `
        INSERT INTO mdata.qbo_sync_runs (
          operating_company_id,
          entity_type,
          sync_type,
          started_at,
          rows_upserted,
          rows_deactivated,
          cdc_cursor
        )
        VALUES ($1,$2,$3,now(),0,0,$4::timestamptz)
        RETURNING id::text
      `,
      [operatingCompanyId, entity, syncType, cursorIso ? cursorIso : null]
    );
    const runId = runInsert.rows[0]?.id;
    if (!runId) throw new Error("sync_run_insert_failed");

    let rowsUpserted = 0;
    const maxUpdated: { current: Date | null } = { current: null };

    try {
      await withMasterDataSyncHeartbeat(runId, async () => {
        const ctx = await qboCompanyContext(operatingCompanyId);
        for await (const page of qboPaginateEntity<Record<string, unknown>>(ctx, qboName, where, { pageSize: 200 })) {
          for (const row of page) {
            if (entity === "vendor") await upsertVendor(client, operatingCompanyId, row, maxUpdated);
            else if (entity === "customer") await upsertCustomer(client, operatingCompanyId, row, maxUpdated);
            else if (entity === "item") await upsertItem(client, operatingCompanyId, row, maxUpdated);
            else await upsertAccount(client, operatingCompanyId, row, maxUpdated);
            rowsUpserted += 1;
          }
        }

        const cursorOut = maxUpdated.current ? maxUpdated.current.toISOString() : cursorIso;
        await client.query(
          `
            UPDATE mdata.qbo_sync_runs
            SET finished_at = now(),
                rows_upserted = $2,
                cdc_cursor = COALESCE($3::timestamptz, cdc_cursor),
                last_heartbeat_at = now()
            WHERE id = $1::uuid
          `,
          [runId, rowsUpserted, cursorOut ? cursorOut : null]
        );

        const durationMs = Date.now() - startedAt;
        await appendAudit(client, `qbo.mdata.${entity}.${syncType}.completed`, {
          operating_company_id: operatingCompanyId,
          entity_type: entity,
          sync_type: syncType,
          rows_upserted: rowsUpserted,
          duration_ms: durationMs,
        });
      });

      return { runId, rowsUpserted };
    } catch (error) {
      const message = String((error as Error)?.message ?? error);
      await client.query(
        `
          UPDATE mdata.qbo_sync_runs
          SET finished_at = now(),
              error_message = $2,
              rows_upserted = $3,
              last_heartbeat_at = now()
          WHERE id = $1::uuid
        `,
        [runId, message.slice(0, 4000), rowsUpserted]
      );
      await appendAudit(client, `qbo.mdata.${entity}.${syncType}.failed`, {
        operating_company_id: operatingCompanyId,
        entity_type: entity,
        sync_type: syncType,
        error_message: message,
      });
      throw error;
    }
  });
}

export async function syncVendors(params: SyncParams) {
  return syncEntity({ ...params, entity: "vendor" });
}

export async function syncCustomers(params: SyncParams) {
  return syncEntity({ ...params, entity: "customer" });
}

export async function syncItems(params: SyncParams) {
  return syncEntity({ ...params, entity: "item" });
}

export async function syncAccounts(params: SyncParams) {
  return syncEntity({ ...params, entity: "account" });
}

export async function listMasterDataCompanyIds(): Promise<string[]> {
  return withLuciaBypass(async (client) => {
    const codes = ["TRK"];
    if ((process.env.QBO_MASTERDATA_TRANSP_ENABLED ?? "").trim() === "1") {
      codes.push("TRANSP");
    }
    const res = await client.query<{ id: string }>(
      `
        SELECT id::text
        FROM org.companies
        WHERE code = ANY($1::text[])
          AND COALESCE(is_active, true) = true
      `,
      [codes]
    );
    return res.rows.map((row) => row.id);
  });
}

export async function runScheduledMasterDataSync(syncType: MasterSyncType) {
  const companies = await listMasterDataCompanyIds();
  const entities: MasterEntityType[] = ["vendor", "customer", "item", "account"];
  for (const operatingCompanyId of companies) {
    for (const entity of entities) {
      try {
        await syncEntity({ operatingCompanyId, syncType, entity });
      } catch (error) {
        console.error("[QBO_MASTERDATA_SYNC]", { operatingCompanyId, entity, syncType, error: String((error as Error)?.message ?? error) });
      }
    }
  }
}

export async function triggerFullMasterDataSync(params: {
  operatingCompanyId: string;
  entityType?: MasterEntityType | null;
}): Promise<{ sync_run_ids: string[] }> {
  const entities: MasterEntityType[] = params.entityType ? [params.entityType] : ["vendor", "customer", "item", "account"];
  const ids: string[] = [];
  for (const entity of entities) {
    const res = await syncEntity({ operatingCompanyId: params.operatingCompanyId, syncType: "full", entity });
    ids.push(res.runId);
  }
  return { sync_run_ids: ids };
}
