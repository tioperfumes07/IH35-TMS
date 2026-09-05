// DUPLICATE-MASTERS — READ-ONLY duplicate master-records report.
//
// GET /api/v1/reports/duplicate-masters?operating_company_id=<uuid>&entity=drivers|customers|vendors
//
// Groups master records (drivers / customers / vendors) by a NORMALIZED name so that
// "John Smith", "john  smith", "JOHN SMITH" and "Jöhn Smíth" all collapse into one group.
// Only groups with > 1 row are returned. For each row we also count the money-carrying
// child records (driver bills / settlements, invoices, bills) so the operator can see
// which duplicates are "safe" to ignore and which carry real financial activity.
//
// This report NEVER merges, voids, or deletes anything — it is purely diagnostic.

import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";

const duplicateMastersQuerySchema = companyQuerySchema.extend({
  entity: z.enum(["drivers", "customers", "vendors"]),
});

type DuplicateRow = {
  id: string;
  name: string;
  secondary_value: string | null;
  created_at: string;
  deactivated_at: string | null;
  is_newest: boolean;
  money: {
    driver_bills?: number;
    settlements?: number;
    invoices?: number;
    bills?: number;
    total: number;
  };
};

type DuplicateGroup = {
  group_key: string;
  display_name: string;
  secondary_key: string | null;
  row_count: number;
  rows: DuplicateRow[];
};

type DuplicateMastersPayload = {
  entity: "drivers" | "customers" | "vendors";
  group_count: number;
  groups: DuplicateGroup[];
};

function canAccessReports(role: string): boolean {
  return role === "Owner" || role === "Administrator" || role === "Manager" || role === "Accountant";
}

const num = (v: unknown): number => Number(v ?? 0);

// NORMALIZATION — case-insensitive (LOWER) + accent-stripped + whitespace-collapsed.
// The guard's selftest plants case-SENSITIVE grouping (UPPER instead of LOWER) to verify
// the guard catches a regression. LOWER is load-bearing: "John" and "john" MUST group.
const DRIVER_NORMALIZE_EXPR = `LOWER(regexp_replace(upper(replace(replace(replace(replace(replace(replace(
  first_name || ' ' || last_name,
  'Á','A'),'É','E'),'Í','I'),'Ó','O'),'Ú','U'),'Ñ','N')
), '\\s+', ' ', 'g'))`;

const CUSTOMER_NORMALIZE_EXPR = `LOWER(regexp_replace(upper(replace(replace(replace(replace(replace(replace(
  customer_name,
  'Á','A'),'É','E'),'Í','I'),'Ó','O'),'Ú','U'),'Ñ','N')
), '\\s+', ' ', 'g'))`;

const VENDOR_NORMALIZE_EXPR = `LOWER(regexp_replace(upper(replace(replace(replace(replace(replace(replace(
  vendor_name,
  'Á','A'),'É','E'),'Í','I'),'Ó','O'),'Ú','U'),'Ñ','N')
), '\\s+', ' ', 'g'))`;

// Driver scope: home company OR active driver_company_authorizations (same predicate every
// dispatch read uses — see dispatch-refinements.service.ts / driver-availability.service.ts).
const DRIVER_SCOPE = `(d.operating_company_id = $1::uuid OR EXISTS (
  SELECT 1 FROM mdata.driver_company_authorizations dup_dca
  WHERE dup_dca.driver_id = d.id
    AND dup_dca.company_id = $1::uuid
    AND dup_dca.is_authorized = true
    AND dup_dca.deactivated_at IS NULL
))`;

async function fetchDuplicateDrivers(client: { query: (sql: string, vals?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> }, operatingCompanyId: string): Promise<DuplicateGroup[]> {
  // CTE: normalize every driver row (including deactivated), group by normalized_name,
  // keep only groups with > 1 row.
  const res = await client.query(
    `
    WITH normalized AS (
      SELECT
        d.id::text                                           AS id,
        NULLIF(TRIM(CONCAT_WS(' ', d.first_name, d.last_name)), '') AS name,
        d.cdl_number                                         AS secondary_value,
        d.created_at::text                                   AS created_at,
        d.deactivated_at::text                               AS deactivated_at,
        ${DRIVER_NORMALIZE_EXPR}                             AS normalized_name
      FROM mdata.drivers d
      WHERE ${DRIVER_SCOPE}
    ),
    dup_groups AS (
      SELECT normalized_name
      FROM normalized
      GROUP BY normalized_name
      HAVING COUNT(*) > 1
    )
    SELECT n.id, n.name, n.secondary_value, n.created_at, n.deactivated_at, n.normalized_name
    FROM normalized n
    JOIN dup_groups dg ON dg.normalized_name = n.normalized_name
    ORDER BY n.normalized_name ASC, n.created_at DESC
    `,
    [operatingCompanyId]
  );

  const rows = res.rows as Array<{
    id: string;
    name: string | null;
    secondary_value: string | null;
    created_at: string;
    deactivated_at: string | null;
    normalized_name: string;
  }>;

  if (rows.length === 0) return [];

  // Money counts: driver_bills + driver_settlements per driver.
  const ids = rows.map((r) => r.id);
  const moneyRes = await client.query(
    `
    SELECT d.driver_id::text AS driver_id,
           COUNT(*) AS driver_bill_count
    FROM driver_finance.driver_bills d
    WHERE d.driver_id = ANY($1::uuid[])
    GROUP BY d.driver_id
    `,
    [ids]
  );
  const billMap = new Map<string, number>(
    (moneyRes.rows as Array<{ driver_id: string; driver_bill_count: string }>).map((r) => [r.driver_id, num(r.driver_bill_count)])
  );

  const settlementRes = await client.query(
    `
    SELECT s.driver_id::text AS driver_id,
           COUNT(*) AS settlement_count
    FROM driver_finance.driver_settlements s
    WHERE s.driver_id = ANY($1::uuid[])
    GROUP BY s.driver_id
    `,
    [ids]
  );
  const settlementMap = new Map<string, number>(
    (settlementRes.rows as Array<{ driver_id: string; settlement_count: string }>).map((r) => [r.driver_id, num(r.settlement_count)])
  );

  return buildGroups(rows, billMap, settlementMap, "driver_bills", "settlements");
}

async function fetchDuplicateCustomers(client: { query: (sql: string, vals?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> }, operatingCompanyId: string): Promise<DuplicateGroup[]> {
  const res = await client.query(
    `
    WITH normalized AS (
      SELECT
        c.id::text              AS id,
        c.customer_name         AS name,
        c.mc_number             AS secondary_value,
        c.created_at::text      AS created_at,
        c.deactivated_at::text  AS deactivated_at,
        ${CUSTOMER_NORMALIZE_EXPR} AS normalized_name
      FROM mdata.customers c
      WHERE c.operating_company_id = $1::uuid
    ),
    dup_groups AS (
      SELECT normalized_name
      FROM normalized
      GROUP BY normalized_name
      HAVING COUNT(*) > 1
    )
    SELECT n.id, n.name, n.secondary_value, n.created_at, n.deactivated_at, n.normalized_name
    FROM normalized n
    JOIN dup_groups dg ON dg.normalized_name = n.normalized_name
    ORDER BY n.normalized_name ASC, n.created_at DESC
    `,
    [operatingCompanyId]
  );

  const rows = res.rows as Array<{
    id: string;
    name: string | null;
    secondary_value: string | null;
    created_at: string;
    deactivated_at: string | null;
    normalized_name: string;
  }>;

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const invoiceRes = await client.query(
    `
    SELECT i.customer_id::text AS customer_id,
           COUNT(*) AS invoice_count
    FROM accounting.invoices i
    WHERE i.customer_id = ANY($1::uuid[])
      AND i.operating_company_id = $2::uuid
    GROUP BY i.customer_id
    `,
    [ids, operatingCompanyId]
  );
  const invoiceMap = new Map<string, number>(
    (invoiceRes.rows as Array<{ customer_id: string; invoice_count: string }>).map((r) => [r.customer_id, num(r.invoice_count)])
  );

  return buildGroups(rows, invoiceMap, undefined, "invoices");
}

async function fetchDuplicateVendors(client: { query: (sql: string, vals?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> }, operatingCompanyId: string): Promise<DuplicateGroup[]> {
  const res = await client.query(
    `
    WITH normalized AS (
      SELECT
        v.id::text              AS id,
        v.vendor_name           AS name,
        v.tax_id                AS secondary_value,
        v.created_at::text      AS created_at,
        v.deactivated_at::text  AS deactivated_at,
        ${VENDOR_NORMALIZE_EXPR} AS normalized_name
      FROM mdata.vendors v
      WHERE v.operating_company_id = $1::uuid
    ),
    dup_groups AS (
      SELECT normalized_name
      FROM normalized
      GROUP BY normalized_name
      HAVING COUNT(*) > 1
    )
    SELECT n.id, n.name, n.secondary_value, n.created_at, n.deactivated_at, n.normalized_name
    FROM normalized n
    JOIN dup_groups dg ON dg.normalized_name = n.normalized_name
    ORDER BY n.normalized_name ASC, n.created_at DESC
    `,
    [operatingCompanyId]
  );

  const rows = res.rows as Array<{
    id: string;
    name: string | null;
    secondary_value: string | null;
    created_at: string;
    deactivated_at: string | null;
    normalized_name: string;
  }>;

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const billRes = await client.query(
    `
    SELECT
      COALESCE(NULLIF(TRIM(b.mdata_vendor_id::text), ''), NULLIF(TRIM(b.vendor_uuid), '')) AS vendor_key,
      COUNT(*) AS bill_count
    FROM accounting.bills b
    WHERE b.operating_company_id = $2::uuid
      AND (
        b.mdata_vendor_id = ANY($1::uuid[])
        OR (b.vendor_uuid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            AND b.vendor_uuid::uuid = ANY($1::uuid[]))
      )
    GROUP BY COALESCE(NULLIF(TRIM(b.mdata_vendor_id::text), ''), NULLIF(TRIM(b.vendor_uuid), ''))
    `,
    [ids, operatingCompanyId]
  );
  const billMap = new Map<string, number>();
  for (const r of billRes.rows as Array<{ vendor_key: string | null; bill_count: string }>) {
    if (r.vendor_key) billMap.set(r.vendor_key, num(r.bill_count));
  }

  return buildGroups(rows, billMap, undefined, "bills");
}

// Shared group-builder: takes the flat normalized rows + a money-count map and produces
// the DuplicateGroup[] payload. The "is_newest" flag marks the most recently created row
// in each group (by created_at DESC — the SQL already orders that way).
function buildGroups(
  rows: Array<{
    id: string;
    name: string | null;
    secondary_value: string | null;
    created_at: string;
    deactivated_at: string | null;
    normalized_name: string;
  }>,
  moneyMap1: Map<string, number>,
  moneyMap2: Map<string, number> | undefined,
  moneyKey1: "driver_bills" | "invoices" | "bills",
  moneyKey2?: "settlements",
): DuplicateGroup[] {
  const byGroup = new Map<string, typeof rows>();
  for (const r of rows) {
    const arr = byGroup.get(r.normalized_name) ?? [];
    arr.push(r);
    byGroup.set(r.normalized_name, arr);
  }

  const groups: DuplicateGroup[] = [];
  for (const [normalizedName, groupRows] of byGroup) {
    // Most recent non-null name for display.
    const displayName = groupRows.find((r) => r.name)?.name ?? groupRows[0]?.name ?? normalizedName;
    const secondaryKey = groupRows.find((r) => r.secondary_value)?.secondary_value ?? null;

    const dupRows: DuplicateRow[] = groupRows.map((r, idx) => {
      const m1 = moneyMap1.get(r.id) ?? 0;
      const m2 = moneyMap2?.get(r.id) ?? 0;
      const money: DuplicateRow["money"] = { total: m1 + m2 };
      money[moneyKey1] = m1;
      if (moneyKey2) money[moneyKey2] = m2;
      return {
        id: r.id,
        name: r.name ?? "—",
        secondary_value: r.secondary_value,
        created_at: r.created_at,
        deactivated_at: r.deactivated_at,
        is_newest: idx === 0,
        money,
      };
    });

    groups.push({
      group_key: normalizedName,
      display_name: displayName,
      secondary_key: secondaryKey,
      row_count: dupRows.length,
      rows: dupRows,
    });
  }

  return groups;
}

export async function registerDuplicateMastersRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/reports/duplicate-masters",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      if (!canAccessReports(String(user.role ?? ""))) {
        return reply.code(403).send({ error: "forbidden" });
      }
      const query = duplicateMastersQuerySchema.safeParse(req.query ?? {});
      if (!query.success) return validationError(reply, query.error);

      const { entity, operating_company_id } = query.data;

      const payload = await withCompanyScope(user.uuid, operating_company_id, async (client) => {
        let groups: DuplicateGroup[];
        if (entity === "drivers") {
          groups = await fetchDuplicateDrivers(client, operating_company_id);
        } else if (entity === "customers") {
          groups = await fetchDuplicateCustomers(client, operating_company_id);
        } else {
          groups = await fetchDuplicateVendors(client, operating_company_id);
        }
        const body: DuplicateMastersPayload = {
          entity,
          group_count: groups.length,
          groups,
        };
        return body;
      });

      return payload;
    },
  );
}

export default fp(async (app) => {
  await registerDuplicateMastersRoutes(app);
}, { name: "reports.registerDuplicateMastersRoutes" });
