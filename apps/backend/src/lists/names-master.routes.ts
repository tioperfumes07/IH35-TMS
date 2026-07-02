import type { FastifyInstance } from "fastify";
import { withCurrentUser } from "../auth/db.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { EXCLUDE_PSEUDO_DRIVERS_SQL } from "../mdata/driver-pseudo-user.js";
import {
  EXCLUDE_ARCHIVED_DRIVERS_SQL,
  EXCLUDE_ARCHIVED_MDATA_CUSTOMERS_ALIAS_SQL,
  EXCLUDE_ARCHIVED_MDATA_CUSTOMERS_SQL,
  EXCLUDE_ARCHIVED_QBO_CUSTOMERS_SQL,
} from "../mdata/test-seed-archive.js";
import {
  buildArchivedFilter,
  currentAuthUser,
  namesCountsQuerySchema,
  namesSearchQuerySchema,
  type NamesEntityType,
  type NamesMasterRow,
  validationError,
} from "./names-master.shared.js";

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

async function withCompanyScope<T>(userId: string, operatingCompanyId: string, fn: (client: Queryable) => Promise<T>) {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [operatingCompanyId]);
    return fn(client as Queryable);
  });
}

function searchClause(q: string, columns: string[], values: unknown[]) {
  if (!q) return { sql: "", values };
  values.push(`%${q}%`);
  const idx = values.length;
  const predicates = columns.map((col) => `${col} ILIKE $${idx}`);
  return { sql: ` AND (${predicates.join(" OR ")})`, values };
}

function mapRow(
  entity_type: NamesEntityType,
  row: Record<string, unknown>,
  link: string
): NamesMasterRow {
  return {
    entity_type,
    entity_id: String(row.entity_id),
    display_name: String(row.display_name ?? "").trim(),
    primary_email: row.primary_email ? String(row.primary_email) : null,
    primary_phone: row.primary_phone ? String(row.primary_phone) : null,
    link_to_module_page: link,
    qbo_id: row.qbo_id ? String(row.qbo_id) : null,
    archived_at: row.archived_at ? String(row.archived_at) : null,
  };
}

async function searchCustomers(
  client: Queryable,
  companyId: string,
  q: string,
  includeArchived: boolean,
  perTypeLimit: number
) {
  const values: unknown[] = [companyId];
  const archivedFilter = buildArchivedFilter(includeArchived, "c.deactivated_at");
  const testSeedFilter = includeArchived ? "TRUE" : EXCLUDE_ARCHIVED_MDATA_CUSTOMERS_ALIAS_SQL;
  const search = searchClause(q, ["c.customer_name", "c.billing_email", "c.billing_phone"], values);
  const res = await client.query(
    `
      SELECT
        c.id AS entity_id,
        c.customer_name AS display_name,
        c.billing_email AS primary_email,
        c.billing_phone AS primary_phone,
        c.qbo_customer_id AS qbo_id,
        COALESCE(c.archived_at, c.deactivated_at) AS archived_at
      FROM mdata.customers c
      WHERE c.operating_company_id = $1
        AND ${testSeedFilter}
        AND ${archivedFilter}
        ${search.sql}
      ORDER BY c.customer_name ASC
      LIMIT ${perTypeLimit}
    `,
    values
  );
  return res.rows.map((row) => mapRow("customer", row, `/customers/${row.entity_id}`));
}

async function searchVendors(
  client: Queryable,
  companyId: string,
  q: string,
  includeArchived: boolean,
  perTypeLimit: number
) {
  const values: unknown[] = [companyId];
  const archivedFilter = buildArchivedFilter(includeArchived, "v.deactivated_at");
  const search = searchClause(q, ["v.vendor_name", "v.email", "v.phone"], values);
  const res = await client.query(
    `
      SELECT
        v.id AS entity_id,
        v.vendor_name AS display_name,
        v.email AS primary_email,
        v.phone AS primary_phone,
        v.qbo_vendor_id AS qbo_id,
        v.deactivated_at AS archived_at
      FROM mdata.vendors v
      WHERE v.operating_company_id = $1
        AND ${archivedFilter}
        ${search.sql}
      ORDER BY v.vendor_name ASC
      LIMIT ${perTypeLimit}
    `,
    values
  );
  return res.rows.map((row) => mapRow("vendor", row, `/vendors/${row.entity_id}`));
}

async function searchDrivers(
  client: Queryable,
  companyId: string,
  q: string,
  includeArchived: boolean,
  perTypeLimit: number
) {
  const values: unknown[] = [companyId];
  const pseudoFilter = EXCLUDE_PSEUDO_DRIVERS_SQL.replace(/\bfirst_name\b/g, 'd.first_name').replace(/\blast_name\b/g, 'd.last_name').replace(/\bcdl_number\b/g, 'd.cdl_number');
  const filters = [`d.operating_company_id = $1`, pseudoFilter];
  if (!includeArchived) {
    filters.push("d.archived_at IS NULL");
    filters.push("d.deactivated_at IS NULL");
  }
  const search = searchClause(
    q,
    ["d.first_name", "d.last_name", "d.email", "d.cdl_number", "(d.first_name || ' ' || d.last_name)"],
    values
  );
  if (search.sql) filters.push(search.sql.replace(/^ AND /, ""));
  const res = await client.query(
    `
      SELECT
        d.id AS entity_id,
        trim(concat_ws(' ', d.first_name, d.last_name)) AS display_name,
        d.email AS primary_email,
        d.phone AS primary_phone,
        NULL::text AS qbo_id,
        COALESCE(d.archived_at, d.deactivated_at) AS archived_at
      FROM mdata.drivers d
      WHERE ${filters.join(" AND ")}
      ORDER BY d.last_name ASC, d.first_name ASC
      LIMIT ${perTypeLimit}
    `,
    values
  );
  return res.rows.map((row) => mapRow("driver", row, `/drivers/${row.entity_id}`));
}

async function searchContacts(
  client: Queryable,
  companyId: string,
  q: string,
  includeArchived: boolean,
  perTypeLimit: number
) {
  const values: unknown[] = [companyId];
  const archivedFilter = buildArchivedFilter(includeArchived, "cc.deactivated_at");
  const search = searchClause(q, ["cc.name", "cc.email", "cc.phone", "cc.mobile"], values);
  const res = await client.query(
    `
      SELECT
        cc.uuid AS entity_id,
        cc.name AS display_name,
        cc.email AS primary_email,
        COALESCE(cc.phone, cc.mobile) AS primary_phone,
        NULL::text AS qbo_id,
        cc.deactivated_at AS archived_at,
        cc.customer_uuid AS customer_id
      FROM mdata.customer_contacts cc
      INNER JOIN mdata.customers c ON c.id = cc.customer_uuid
      WHERE c.operating_company_id = $1
        AND ${archivedFilter}
        ${search.sql}
      ORDER BY cc.name ASC
      LIMIT ${perTypeLimit}
    `,
    values
  );
  return res.rows.map((row) =>
    mapRow("contact", row, `/customers/${row.customer_id}`)
  );
}

async function searchCompanies(
  client: Queryable,
  q: string,
  includeArchived: boolean,
  perTypeLimit: number
) {
  const values: unknown[] = [];
  const archivedFilter = buildArchivedFilter(includeArchived, "c.deactivated_at");
  const search = searchClause(q, ["c.legal_name", "c.short_name", "c.code"], values);
  const res = await client.query(
    `
      SELECT
        c.id AS entity_id,
        COALESCE(c.short_name, c.legal_name) AS display_name,
        NULL::text AS primary_email,
        NULL::text AS primary_phone,
        NULL::text AS qbo_id,
        c.deactivated_at AS archived_at
      FROM org.companies c
      WHERE c.id IN (SELECT org.user_accessible_company_ids())
        AND ${archivedFilter}
        ${search.sql}
      ORDER BY c.legal_name ASC
      LIMIT ${perTypeLimit}
    `,
    values
  );
  return res.rows.map((row) => mapRow("company", row, `/lists/names`));
}

async function searchUnlinkedQboCustomers(
  client: Queryable,
  companyId: string,
  q: string,
  includeArchived: boolean,
  perTypeLimit: number
) {
  const values: unknown[] = [companyId];
  const archivedFilter = includeArchived ? "TRUE" : EXCLUDE_ARCHIVED_QBO_CUSTOMERS_SQL;
  const search = searchClause(q, ["qc.display_name"], values);
  const res = await client.query(
    `
      SELECT
        qc.id AS entity_id,
        qc.display_name,
        NULL::text AS primary_email,
        NULL::text AS primary_phone,
        qc.qbo_id,
        qc.archived_at
      FROM mdata.qbo_customers qc
      WHERE qc.operating_company_id = $1
        AND ${archivedFilter}
        AND NOT EXISTS (
          SELECT 1 FROM mdata.customers c
          WHERE c.operating_company_id = $1 AND c.qbo_customer_id = qc.qbo_id
        )
        ${search.sql}
      ORDER BY qc.display_name ASC
      LIMIT ${perTypeLimit}
    `,
    values
  );
  return res.rows.map((row) => mapRow("customer", row, "/accounting/customers"));
}

async function searchUnlinkedQboVendors(
  client: Queryable,
  companyId: string,
  q: string,
  includeArchived: boolean,
  perTypeLimit: number
) {
  const values: unknown[] = [companyId];
  const archivedFilter = includeArchived ? "TRUE" : "qv.active = true";
  const search = searchClause(q, ["qv.display_name"], values);
  const res = await client.query(
    `
      SELECT
        qv.id AS entity_id,
        qv.display_name,
        NULL::text AS primary_email,
        NULL::text AS primary_phone,
        qv.qbo_id,
        NULL::timestamptz AS archived_at
      FROM mdata.qbo_vendors qv
      WHERE qv.operating_company_id = $1
        AND ${archivedFilter}
        AND NOT EXISTS (
          SELECT 1 FROM mdata.vendors v
          WHERE v.operating_company_id = $1 AND v.qbo_vendor_id = qv.qbo_id
        )
        ${search.sql}
      ORDER BY qv.display_name ASC
      LIMIT ${perTypeLimit}
    `,
    values
  );
  return res.rows.map((row) => mapRow("vendor", row, "/accounting/vendors"));
}

async function countActive(
  client: Queryable,
  sql: string,
  values: unknown[]
) {
  const res = await client.query<{ count: string }>(sql, values);
  return Number(res.rows[0]?.count ?? 0);
}

export async function registerNamesMasterRoutes(app: FastifyInstance) {
  app.get("/api/v1/lists/names/search", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsed = namesSearchQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const { q, type, limit, offset, include_archived, operating_company_id } = parsed.data;
    const perTypeLimit = Math.min(limit + offset, 50);

    const merged = await withCompanyScope(authUser.uuid, operating_company_id, async (client) => {
      const buckets: NamesMasterRow[] = [];
      const run = async (entityType: NamesEntityType, fn: () => Promise<NamesMasterRow[]>) => {
        if (type !== "all" && type !== entityType) return;
        buckets.push(...(await fn()));
      };

      await run("customer", async () => [
        ...(await searchCustomers(client, operating_company_id, q, include_archived, perTypeLimit)),
        ...(await searchUnlinkedQboCustomers(client, operating_company_id, q, include_archived, perTypeLimit)),
      ]);
      await run("vendor", async () => [
        ...(await searchVendors(client, operating_company_id, q, include_archived, perTypeLimit)),
        ...(await searchUnlinkedQboVendors(client, operating_company_id, q, include_archived, perTypeLimit)),
      ]);
      await run("driver", () => searchDrivers(client, operating_company_id, q, include_archived, perTypeLimit));
      await run("contact", () => searchContacts(client, operating_company_id, q, include_archived, perTypeLimit));
      await run("company", () => searchCompanies(client, q, include_archived, perTypeLimit));

      buckets.sort((a, b) => a.display_name.localeCompare(b.display_name, undefined, { sensitivity: "base" }));
      return buckets;
    });

    const rows = merged.slice(offset, offset + limit);
    return { rows, total: merged.length, limit, offset };
  });

  app.get("/api/v1/lists/names/counts", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsed = namesCountsQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const { operating_company_id, include_archived } = parsed.data;
    const archivedCustomers = include_archived
      ? "TRUE"
      : `${EXCLUDE_ARCHIVED_MDATA_CUSTOMERS_SQL} AND deactivated_at IS NULL`;
    const archivedVendors = buildArchivedFilter(include_archived, "deactivated_at");
    const archivedContacts = buildArchivedFilter(include_archived, "cc.deactivated_at");
    const archivedDrivers = include_archived ? "TRUE" : "archived_at IS NULL AND deactivated_at IS NULL";
    const counts = await withCompanyScope(authUser.uuid, operating_company_id, async (client) => {
      const customers = await countActive(
        client,
        `SELECT count(*)::text AS count FROM mdata.customers WHERE operating_company_id = $1 AND ${archivedCustomers}`,
        [operating_company_id]
      );
      const vendors = await countActive(
        client,
        `SELECT count(*)::text AS count FROM mdata.vendors WHERE operating_company_id = $1 AND ${archivedVendors}`,
        [operating_company_id]
      );
      const drivers = await countActive(
        client,
        `SELECT count(*)::text AS count FROM mdata.drivers WHERE operating_company_id = $1 AND ${EXCLUDE_PSEUDO_DRIVERS_SQL} AND ${archivedDrivers}`,
        [operating_company_id]
      );
      const contacts = await countActive(
        client,
        `
          SELECT count(*)::text AS count
          FROM mdata.customer_contacts cc
          INNER JOIN mdata.customers c ON c.id = cc.customer_uuid
          WHERE c.operating_company_id = $1 AND ${archivedContacts}
        `,
        [operating_company_id]
      );
      const companies = await countActive(
        client,
        `
          SELECT count(*)::text AS count
          FROM org.companies c
          WHERE c.id IN (SELECT org.user_accessible_company_ids())
            AND ${buildArchivedFilter(include_archived, "c.deactivated_at")}
        `,
        []
      );
      const unlinkedQboCustomers = await countActive(
        client,
        `
          SELECT count(*)::text AS count FROM mdata.qbo_customers qc
          WHERE qc.operating_company_id = $1 AND ${include_archived ? "TRUE" : EXCLUDE_ARCHIVED_QBO_CUSTOMERS_SQL}
            AND NOT EXISTS (
              SELECT 1 FROM mdata.customers c WHERE c.operating_company_id = $1 AND c.qbo_customer_id = qc.qbo_id
            )
        `,
        [operating_company_id]
      );
      const unlinkedQboVendors = await countActive(
        client,
        `
          SELECT count(*)::text AS count FROM mdata.qbo_vendors qv
              WHERE qv.operating_company_id = $1 AND ${include_archived ? "TRUE" : "qv.active = true"}
            AND NOT EXISTS (
              SELECT 1 FROM mdata.vendors v WHERE v.operating_company_id = $1 AND v.qbo_vendor_id = qv.qbo_id
            )
        `,
        [operating_company_id]
      );
      const customerTotal = customers + unlinkedQboCustomers;
      const vendorTotal = vendors + unlinkedQboVendors;
      return {
        customers: customerTotal,
        vendors: vendorTotal,
        drivers,
        contacts,
        companies,
        total: customerTotal + vendorTotal + drivers + contacts + companies,
      };
    });

    return counts;
  });
}
