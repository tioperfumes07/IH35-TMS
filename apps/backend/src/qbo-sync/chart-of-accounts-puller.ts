// ACCT-F4431380 (Lead 443.137 item 9e) — QuickBooks is a READ-ONLY ARCHIVE. This puller writes ONLY the
// mirror (mdata.qbo_accounts). The former native write (catalogs.accounts) is REMOVED: a QBO pull never creates,
// heals or deactivates a native master row. Guard: scripts/verify-qbo-paths-never-write-native-tables.mjs.
import type { PoolClient } from "pg";
import { qboCompanyContext, qboPaginateEntity } from "../integrations/qbo/qbo-client.js";
import { withLuciaBypass } from "../auth/db.js";

export type CoaPullResult = {
  rowsPulled: number;
  rowsUpserted: number;
  pulledAt: string;
};

function metaUpdatedAt(row: Record<string, unknown>): Date | null {
  const meta = row.MetaData as Record<string, unknown> | undefined;
  const raw = meta?.LastUpdatedTime;
  if (typeof raw !== "string") return null;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}

async function upsertMirror(
  client: PoolClient,
  operatingCompanyId: string,
  row: Record<string, unknown>
): Promise<void> {
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
    `,
    [operatingCompanyId, id, syncToken, name, fullQualifiedName, accountType, accountSubType, active, updated, JSON.stringify(row)]
  );
}

export async function pullChartOfAccountsFromQbo(operatingCompanyId: string): Promise<CoaPullResult> {
  const pulledAt = new Date().toISOString();
  let rowsPulled = 0;
  let rowsUpserted = 0;

  await withLuciaBypass(async (client) => {
    const ctx = await qboCompanyContext(operatingCompanyId);
    for await (const page of qboPaginateEntity<Record<string, unknown>>(ctx, "Account", "", { pageSize: 1000 })) {
      for (const row of page) {
        rowsPulled += 1;
        await upsertMirror(client, operatingCompanyId, row);
        rowsUpserted += 1;
      }
    }
  });

  return { rowsPulled, rowsUpserted, pulledAt };
}
