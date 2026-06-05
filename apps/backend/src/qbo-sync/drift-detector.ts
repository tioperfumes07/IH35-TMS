import type { PoolClient } from "pg";
import { withLuciaBypass } from "../auth/db.js";

export type DriftEntityType = "chart_of_accounts" | "items" | "customers" | "vendors";
export type DriftType = "missing_qbo" | "missing_local" | "field_mismatch";

export type DriftDetectResult = {
  entityType: DriftEntityType;
  inserted: number;
};

const ENTITY_TYPES: DriftEntityType[] = ["chart_of_accounts", "items", "customers", "vendors"];

async function tableHasColumn(client: PoolClient, table: string, column: string): Promise<boolean> {
  const [schema, name] = table.split(".");
  const res = await client.query<{ ok: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = $2
          AND column_name = $3
      ) AS ok
    `,
    [schema, name, column]
  );
  return Boolean(res.rows[0]?.ok);
}

async function insertDrift(
  client: PoolClient,
  operatingCompanyId: string,
  entityType: DriftEntityType,
  row: {
    entity_id?: string | null;
    qbo_id?: string | null;
    drift_type: DriftType;
    local_snapshot?: Record<string, unknown> | null;
    qbo_snapshot?: Record<string, unknown> | null;
  }
): Promise<boolean> {
  const dup = await client.query(
    `
      SELECT 1
      FROM qbo_sync.drift_log
      WHERE operating_company_id = $1::uuid
        AND entity_type = $2
        AND COALESCE(entity_id::text, '') = COALESCE($3::text, '')
        AND COALESCE(qbo_id, '') = COALESCE($4, '')
        AND drift_type = $5
        AND resolved_at IS NULL
      LIMIT 1
    `,
    [operatingCompanyId, entityType, row.entity_id ?? null, row.qbo_id ?? null, row.drift_type]
  );
  if (dup.rows.length > 0) return false;

  await client.query(
    `
      INSERT INTO qbo_sync.drift_log (
        operating_company_id,
        entity_type,
        entity_id,
        qbo_id,
        drift_type,
        local_snapshot,
        qbo_snapshot
      )
      VALUES ($1::uuid, $2, $3::uuid, $4, $5, $6::jsonb, $7::jsonb)
    `,
    [
      operatingCompanyId,
      entityType,
      row.entity_id ?? null,
      row.qbo_id ?? null,
      row.drift_type,
      row.local_snapshot ? JSON.stringify(row.local_snapshot) : null,
      row.qbo_snapshot ? JSON.stringify(row.qbo_snapshot) : null,
    ]
  );
  return true;
}

async function detectCoaDrift(client: PoolClient, operatingCompanyId: string): Promise<number> {
  let inserted = 0;

  const missingQbo = await client.query<{ id: string; account_name: string }>(
    `
      SELECT id::text AS id, account_name
      FROM catalogs.accounts
      WHERE deactivated_at IS NULL
        AND qbo_account_id IS NULL
        AND COALESCE(qbo_sync_status, '') <> 'local_only'
    `
  );
  for (const row of missingQbo.rows) {
    if (await insertDrift(client, operatingCompanyId, "chart_of_accounts", {
      entity_id: row.id,
      drift_type: "missing_qbo",
      local_snapshot: { account_name: row.account_name },
    })) {
      inserted += 1;
    }
  }

  const missingLocal = await client.query<{ qbo_id: string; name: string }>(
    `
      SELECT qa.qbo_id, qa.name
      FROM mdata.qbo_accounts qa
      WHERE qa.operating_company_id = $1::uuid
        AND qa.qbo_id IS NOT NULL
        AND qa.active = true
        AND NOT EXISTS (
          SELECT 1 FROM catalogs.accounts ca WHERE ca.qbo_account_id = qa.qbo_id
        )
    `,
    [operatingCompanyId]
  );
  for (const row of missingLocal.rows) {
    if (await insertDrift(client, operatingCompanyId, "chart_of_accounts", {
      qbo_id: row.qbo_id,
      drift_type: "missing_local",
      qbo_snapshot: { name: row.name },
    })) {
      inserted += 1;
    }
  }

  const fieldMismatch = await client.query<{ id: string; qbo_id: string; local_name: string; qbo_name: string }>(
    `
      SELECT
        ca.id::text AS id,
        ca.qbo_account_id AS qbo_id,
        ca.account_name AS local_name,
        qa.name AS qbo_name
      FROM catalogs.accounts ca
      JOIN mdata.qbo_accounts qa
        ON qa.qbo_id = ca.qbo_account_id
       AND qa.operating_company_id = $1::uuid
      WHERE ca.deactivated_at IS NULL
        AND ca.qbo_account_id IS NOT NULL
        AND ca.account_name IS DISTINCT FROM qa.name
    `,
    [operatingCompanyId]
  );
  for (const row of fieldMismatch.rows) {
    if (await insertDrift(client, operatingCompanyId, "chart_of_accounts", {
      entity_id: row.id,
      qbo_id: row.qbo_id,
      drift_type: "field_mismatch",
      local_snapshot: { account_name: row.local_name },
      qbo_snapshot: { name: row.qbo_name },
    })) {
      inserted += 1;
    }
  }

  return inserted;
}

async function detectItemsDrift(client: PoolClient, operatingCompanyId: string): Promise<number> {
  if (!(await tableHasColumn(client, "catalogs.items", "qbo_sync_status"))) return 0;
  let inserted = 0;

  const missingQbo = await client.query<{ id: string; item_name: string }>(
    `
      SELECT id::text AS id, item_name
      FROM catalogs.items
      WHERE deactivated_at IS NULL
        AND qbo_item_id IS NULL
        AND COALESCE(qbo_sync_status, '') <> 'local_only'
    `
  );
  for (const row of missingQbo.rows) {
    if (await insertDrift(client, operatingCompanyId, "items", {
      entity_id: row.id,
      drift_type: "missing_qbo",
      local_snapshot: { item_name: row.item_name },
    })) {
      inserted += 1;
    }
  }

  const missingLocal = await client.query<{ qbo_id: string; name: string }>(
    `
      SELECT qi.qbo_id, qi.name
      FROM mdata.qbo_items qi
      WHERE qi.operating_company_id = $1::uuid
        AND qi.qbo_id IS NOT NULL
        AND qi.active = true
        AND NOT EXISTS (
          SELECT 1 FROM catalogs.items ci WHERE ci.qbo_item_id = qi.qbo_id
        )
    `,
    [operatingCompanyId]
  );
  for (const row of missingLocal.rows) {
    if (await insertDrift(client, operatingCompanyId, "items", {
      qbo_id: row.qbo_id,
      drift_type: "missing_local",
      qbo_snapshot: { name: row.name },
    })) {
      inserted += 1;
    }
  }

  const fieldMismatch = await client.query<{ id: string; qbo_id: string; local_name: string; qbo_name: string }>(
    `
      SELECT
        ci.id::text AS id,
        ci.qbo_item_id AS qbo_id,
        ci.item_name AS local_name,
        qi.name AS qbo_name
      FROM catalogs.items ci
      JOIN mdata.qbo_items qi
        ON qi.qbo_id = ci.qbo_item_id
       AND qi.operating_company_id = $1::uuid
      WHERE ci.deactivated_at IS NULL
        AND ci.qbo_item_id IS NOT NULL
        AND ci.item_name IS DISTINCT FROM qi.name
    `,
    [operatingCompanyId]
  );
  for (const row of fieldMismatch.rows) {
    if (await insertDrift(client, operatingCompanyId, "items", {
      entity_id: row.id,
      qbo_id: row.qbo_id,
      drift_type: "field_mismatch",
      local_snapshot: { item_name: row.local_name },
      qbo_snapshot: { name: row.qbo_name },
    })) {
      inserted += 1;
    }
  }

  return inserted;
}

async function detectCustomersDrift(client: PoolClient, operatingCompanyId: string): Promise<number> {
  if (!(await tableHasColumn(client, "mdata.customers", "qbo_sync_status"))) return 0;
  let inserted = 0;

  const missingQbo = await client.query<{ id: string; customer_name: string }>(
    `
      SELECT id::text AS id, customer_name
      FROM mdata.customers
      WHERE operating_company_id = $1::uuid
        AND deactivated_at IS NULL
        AND archived_at IS NULL
        AND qbo_customer_id IS NULL
        AND COALESCE(qbo_sync_status, '') <> 'local_only'
    `,
    [operatingCompanyId]
  );
  for (const row of missingQbo.rows) {
    if (await insertDrift(client, operatingCompanyId, "customers", {
      entity_id: row.id,
      drift_type: "missing_qbo",
      local_snapshot: { customer_name: row.customer_name },
    })) {
      inserted += 1;
    }
  }

  const missingLocal = await client.query<{ qbo_id: string; display_name: string }>(
    `
      SELECT qc.qbo_id, qc.display_name
      FROM mdata.qbo_customers qc
      WHERE qc.operating_company_id = $1::uuid
        AND qc.qbo_id IS NOT NULL
        AND qc.active = true
        AND NOT EXISTS (
          SELECT 1 FROM mdata.customers c WHERE c.qbo_customer_id = qc.qbo_id
        )
    `,
    [operatingCompanyId]
  );
  for (const row of missingLocal.rows) {
    if (await insertDrift(client, operatingCompanyId, "customers", {
      qbo_id: row.qbo_id,
      drift_type: "missing_local",
      qbo_snapshot: { display_name: row.display_name },
    })) {
      inserted += 1;
    }
  }

  const fieldMismatch = await client.query<{ id: string; qbo_id: string; local_name: string; qbo_name: string }>(
    `
      SELECT
        c.id::text AS id,
        c.qbo_customer_id AS qbo_id,
        c.customer_name AS local_name,
        qc.display_name AS qbo_name
      FROM mdata.customers c
      JOIN mdata.qbo_customers qc
        ON qc.qbo_id = c.qbo_customer_id
       AND qc.operating_company_id = $1::uuid
      WHERE c.operating_company_id = $1::uuid
        AND c.deactivated_at IS NULL
        AND c.archived_at IS NULL
        AND c.qbo_customer_id IS NOT NULL
        AND c.customer_name IS DISTINCT FROM qc.display_name
    `,
    [operatingCompanyId]
  );
  for (const row of fieldMismatch.rows) {
    if (await insertDrift(client, operatingCompanyId, "customers", {
      entity_id: row.id,
      qbo_id: row.qbo_id,
      drift_type: "field_mismatch",
      local_snapshot: { customer_name: row.local_name },
      qbo_snapshot: { display_name: row.qbo_name },
    })) {
      inserted += 1;
    }
  }

  return inserted;
}

async function detectVendorsDrift(client: PoolClient, operatingCompanyId: string): Promise<number> {
  if (!(await tableHasColumn(client, "mdata.vendors", "qbo_sync_status"))) return 0;
  let inserted = 0;

  const missingQbo = await client.query<{ id: string; vendor_name: string }>(
    `
      SELECT id::text AS id, vendor_name
      FROM mdata.vendors
      WHERE operating_company_id = $1::uuid
        AND deactivated_at IS NULL
        AND qbo_vendor_id IS NULL
        AND COALESCE(qbo_sync_status, '') <> 'local_only'
    `,
    [operatingCompanyId]
  );
  for (const row of missingQbo.rows) {
    if (await insertDrift(client, operatingCompanyId, "vendors", {
      entity_id: row.id,
      drift_type: "missing_qbo",
      local_snapshot: { vendor_name: row.vendor_name },
    })) {
      inserted += 1;
    }
  }

  const missingLocal = await client.query<{ qbo_id: string; display_name: string }>(
    `
      SELECT qv.qbo_id, qv.display_name
      FROM mdata.qbo_vendors qv
      WHERE qv.operating_company_id = $1::uuid
        AND qv.qbo_id IS NOT NULL
        AND qv.active = true
        AND NOT EXISTS (
          SELECT 1 FROM mdata.vendors v WHERE v.qbo_vendor_id = qv.qbo_id
        )
    `,
    [operatingCompanyId]
  );
  for (const row of missingLocal.rows) {
    if (await insertDrift(client, operatingCompanyId, "vendors", {
      qbo_id: row.qbo_id,
      drift_type: "missing_local",
      qbo_snapshot: { display_name: row.display_name },
    })) {
      inserted += 1;
    }
  }

  const fieldMismatch = await client.query<{ id: string; qbo_id: string; local_name: string; qbo_name: string }>(
    `
      SELECT
        v.id::text AS id,
        v.qbo_vendor_id AS qbo_id,
        v.vendor_name AS local_name,
        qv.display_name AS qbo_name
      FROM mdata.vendors v
      JOIN mdata.qbo_vendors qv
        ON qv.qbo_id = v.qbo_vendor_id
       AND qv.operating_company_id = $1::uuid
      WHERE v.operating_company_id = $1::uuid
        AND v.deactivated_at IS NULL
        AND v.qbo_vendor_id IS NOT NULL
        AND v.vendor_name IS DISTINCT FROM qv.display_name
    `,
    [operatingCompanyId]
  );
  for (const row of fieldMismatch.rows) {
    if (await insertDrift(client, operatingCompanyId, "vendors", {
      entity_id: row.id,
      qbo_id: row.qbo_id,
      drift_type: "field_mismatch",
      local_snapshot: { vendor_name: row.local_name },
      qbo_snapshot: { display_name: row.qbo_name },
    })) {
      inserted += 1;
    }
  }

  return inserted;
}

export async function detectDriftForCompany(operatingCompanyId: string): Promise<DriftDetectResult[]> {
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);

    const exists = await client.query(`SELECT to_regclass('qbo_sync.drift_log') IS NOT NULL AS ok`);
    if (!exists.rows[0]?.ok) return [];

    const detectors: Record<DriftEntityType, (c: PoolClient, id: string) => Promise<number>> = {
      chart_of_accounts: detectCoaDrift,
      items: detectItemsDrift,
      customers: detectCustomersDrift,
      vendors: detectVendorsDrift,
    };

    const results: DriftDetectResult[] = [];
    for (const entityType of ENTITY_TYPES) {
      const inserted = await detectors[entityType](client, operatingCompanyId);
      results.push({ entityType, inserted });
    }
    return results;
  });
}

export async function countUnresolvedDrift(
  operatingCompanyId: string,
  entityType?: DriftEntityType
): Promise<number> {
  return withLuciaBypass(async (client) => {
    const exists = await client.query(`SELECT to_regclass('qbo_sync.drift_log') IS NOT NULL AS ok`);
    if (!exists.rows[0]?.ok) return 0;

    const values: unknown[] = [operatingCompanyId];
    let filter = "";
    if (entityType) {
      values.push(entityType);
      filter = ` AND entity_type = $${values.length}`;
    }

    const res = await client.query<{ c: string }>(
      `
        SELECT COUNT(*)::text AS c
        FROM qbo_sync.drift_log
        WHERE operating_company_id = $1::uuid
          AND resolved_at IS NULL
          ${filter}
      `,
      values
    );
    return Number(res.rows[0]?.c ?? 0);
  });
}
