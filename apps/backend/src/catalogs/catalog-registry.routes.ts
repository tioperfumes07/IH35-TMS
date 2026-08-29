import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { resolveOperatingCompanyId } from "../auth/operating-company-scope.js";

const catalogDepartmentSchema = z.enum(["dispatch", "safety", "accounting", "identity", "operations"]);

// LST-CAT-07 — SINGLE SOURCE OF TRUTH for which registry codes this module can actually serve.
//
// The defect: the WRITE surface (`createCatalogRegistrySchema.code`) accepted any
// /^[A-Z][A-Z0-9_]+$/ string, while both READ surfaces were a hand-maintained 8-entry list — a zod
// enum for preview and a separate `statsByCode` map for stats. So `POST /api/v1/catalogs/registry`
// with code `FOO_BAR` returned 201, and from then on stats reported `item_count: 0` FOREVER (a silent
// zero indistinguishable from an empty catalog) while preview returned 400. Two independently
// maintained lists, no mechanism keeping them equal.
//
// Root fix: define the supported set ONCE, with its stats query attached, and derive every surface
// from it — the enum, the create schema, and the stats lookup. A code that cannot be served can no
// longer be created, and an unsupported code already in the table reports `stats_supported: false`
// instead of a fake 0.
// LISTS-F6704: EQUIPMENT_TYPES and DRIVER_LOAD_STATUSES are both company-owned (100% non-null
// operating_company_id, real per-company row splits — verified live against prod; see
// CATALOG-EQUIPMENT-TYPES-AND-DRIVER-LOAD-STATUSES-STALE-SELECT-ALL-RLS-POLICY-DEFEATS-ENTITY-SCOPE in
// docs/audit/GUARD-WORKORDERS.md). Both tables ALSO carry a leftover unconditional `USING (true)` RLS
// policy alongside their real `company_scope` policy — Postgres OR's permissive policies together, so RLS
// alone does not scope these two reads today. The explicit `$1` predicate below is the actual fix for
// this consumer, not just defense-in-depth (dropping the stale policy is a separate migration-owner fix).
const CATALOG_REGISTRY_STATS_SQL = {
  EQUIPMENT_TYPES:
    "SELECT count(*)::int AS item_count, MAX(updated_at) AS last_updated_at FROM catalogs.equipment_types WHERE deactivated_at IS NULL AND is_active = true AND operating_company_id = $1::uuid",
  DRIVER_LOAD_STATUSES:
    "SELECT count(*)::int AS item_count, MAX(updated_at) AS last_updated_at FROM catalogs.driver_load_statuses WHERE deactivated_at IS NULL AND is_active = true AND operating_company_id = $1::uuid",
  CHART_OF_ACCOUNTS:
    "SELECT count(*)::int AS item_count, MAX(updated_at) AS last_updated_at FROM catalogs.accounts WHERE deactivated_at IS NULL",
  CLASSES: "SELECT count(*)::int AS item_count, MAX(updated_at) AS last_updated_at FROM catalogs.classes WHERE deactivated_at IS NULL",
  ITEMS: "SELECT count(*)::int AS item_count, MAX(updated_at) AS last_updated_at FROM catalogs.items WHERE deactivated_at IS NULL",
  PAYMENT_TERMS:
    "SELECT count(*)::int AS item_count, MAX(updated_at) AS last_updated_at FROM catalogs.payment_terms WHERE deactivated_at IS NULL",
  POSTING_TEMPLATES:
    "SELECT count(*)::int AS item_count, MAX(updated_at) AS last_updated_at FROM catalogs.posting_templates WHERE deactivated_at IS NULL",
  ACCOUNT_ROLE_BINDINGS:
    "SELECT count(*)::int AS item_count, MAX(updated_at) AS last_updated_at FROM catalogs.account_role_bindings WHERE deactivated_at IS NULL",
} as const;

export const CATALOG_REGISTRY_CODES = Object.keys(CATALOG_REGISTRY_STATS_SQL) as [
  keyof typeof CATALOG_REGISTRY_STATS_SQL,
  ...Array<keyof typeof CATALOG_REGISTRY_STATS_SQL>,
];

const catalogCodeSchema = z.enum(CATALOG_REGISTRY_CODES);

const idParamSchema = z.object({ id: z.string().uuid() });
const codeParamSchema = z.object({ code: catalogCodeSchema });

const createCatalogRegistrySchema = z.object({
  // Derived from the same set the read surfaces use — never a permissive regex (that WAS the defect).
  code: catalogCodeSchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  department: catalogDepartmentSchema,
  route_path: z.string().trim().min(1).max(200),
  icon_label: z.string().trim().min(1).max(10),
  sort_order: z.number().int().min(0).max(10000).default(100),
});

const updateCatalogRegistrySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    department: catalogDepartmentSchema.optional(),
    route_path: z.string().trim().min(1).max(200).optional(),
    icon_label: z.string().trim().min(1).max(10).optional(),
    sort_order: z.number().int().min(0).max(10000).optional(),
    is_active: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "at least one field is required" });

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function ensureAdmin(req: FastifyRequest, reply: FastifyReply) {
  const user = currentAuthUser(req, reply);
  if (!user) return null;
  if (!["Owner", "Administrator"].includes(user.role)) {
    reply.code(403).send({ error: "forbidden" });
    return null;
  }
  return user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

async function fetchCatalogStats(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
  code: string,
  operatingCompanyId: string | null
) {
  const sql = (CATALOG_REGISTRY_STATS_SQL as Record<string, string | undefined>)[code];
  if (!sql) {
    // LST-CAT-07: previously this returned `item_count: 0`, which is indistinguishable from a genuinely
    // empty catalog — a fake number presented as data. Creation of an unsupported code is now rejected
    // at the write surface, so this branch is only reachable for a legacy row; it reports the truth
    // (stats not available for this code) rather than inventing a count.
    return { item_count: 0, last_updated_at: null as string | null, stats_supported: false };
  }
  // LISTS-F6704: EQUIPMENT_TYPES/DRIVER_LOAD_STATUSES SQL now has a $1 operating_company_id predicate;
  // every other code's SQL has no placeholder, so the extra bound value is simply unused (harmless — the
  // same pattern fetchPreviewItems already relies on below).
  const res = await client.query(sql, [operatingCompanyId]);
  return {
    item_count: Number(res.rows[0]?.item_count ?? 0),
    last_updated_at: (res.rows[0]?.last_updated_at as string | null) ?? null,
    stats_supported: true,
  };
}

type PreviewItem = {
  id: string;
  label: string;
  sub_label?: string | null;
};

async function fetchPreviewItems(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
  code: z.infer<typeof catalogCodeSchema>,
  operatingCompanyId: string | null
) {
  const limitPlusOne = 21;
  const queries: Record<z.infer<typeof catalogCodeSchema>, { sql: string; map: (row: Record<string, unknown>) => PreviewItem }> = {
    EQUIPMENT_TYPES: {
      sql: `
        SELECT id, name, code
        FROM catalogs.equipment_types
        WHERE deactivated_at IS NULL
          AND is_active = true
          AND operating_company_id = $1::uuid
        ORDER BY sort_order, name
        LIMIT ${limitPlusOne}
      `,
      map: (row) => ({ id: String(row.id), label: String(row.name), sub_label: String(row.code) }),
    },
    DRIVER_LOAD_STATUSES: {
      sql: `
        SELECT id, name, code
        FROM catalogs.driver_load_statuses
        WHERE deactivated_at IS NULL
          AND is_active = true
          AND operating_company_id = $1::uuid
        ORDER BY sort_order, name
        LIMIT ${limitPlusOne}
      `,
      map: (row) => ({ id: String(row.id), label: String(row.name), sub_label: String(row.code) }),
    },
    CHART_OF_ACCOUNTS: {
      sql: `
        SELECT id, account_name, account_number
        FROM catalogs.accounts
        WHERE deactivated_at IS NULL
          AND operating_company_id = $1::uuid
        ORDER BY account_number, account_name
        LIMIT ${limitPlusOne}
      `,
      map: (row) => ({ id: String(row.id), label: String(row.account_name), sub_label: String(row.account_number) }),
    },
    CLASSES: {
      sql: `
        SELECT id, class_name, class_code
        FROM catalogs.classes
        WHERE deactivated_at IS NULL
          AND operating_company_id = $1::uuid
        ORDER BY class_name
        LIMIT ${limitPlusOne}
      `,
      map: (row) => ({ id: String(row.id), label: String(row.class_name), sub_label: (row.class_code as string | null) ?? null }),
    },
    ITEMS: {
      sql: `
        SELECT id, item_name, item_code
        FROM catalogs.items
        WHERE deactivated_at IS NULL
        ORDER BY item_name
        LIMIT ${limitPlusOne}
      `,
      map: (row) => ({ id: String(row.id), label: String(row.item_name), sub_label: (row.item_code as string | null) ?? null }),
    },
    PAYMENT_TERMS: {
      sql: `
        SELECT id, terms_name, days_until_due
        FROM catalogs.payment_terms
        WHERE deactivated_at IS NULL
        ORDER BY terms_name
        LIMIT ${limitPlusOne}
      `,
      map: (row) => ({
        id: String(row.id),
        label: String(row.terms_name),
        sub_label: `${String(row.days_until_due)} days`,
      }),
    },
    POSTING_TEMPLATES: {
      sql: `
        SELECT id, template_name, template_code
        FROM catalogs.posting_templates
        WHERE deactivated_at IS NULL
        ORDER BY template_name
        LIMIT ${limitPlusOne}
      `,
      map: (row) => ({ id: String(row.id), label: String(row.template_name), sub_label: String(row.template_code) }),
    },
    ACCOUNT_ROLE_BINDINGS: {
      sql: `
        SELECT
          arb.id,
          arb.role_key,
          a.account_number,
          a.account_name
        FROM catalogs.account_role_bindings arb
        LEFT JOIN catalogs.accounts a ON a.id = arb.account_id
                                             AND a.operating_company_id = arb.operating_company_id
        WHERE arb.deactivated_at IS NULL
        ORDER BY arb.role_key
        LIMIT ${limitPlusOne}
      `,
      map: (row) => ({
        id: String(row.id),
        label: String(row.role_key).replaceAll("_", " "),
        sub_label: row.account_number && row.account_name ? `${String(row.account_number)} · ${String(row.account_name)}` : null,
      }),
    },
  };
  const queryDef = queries[code];
  const res = await client.query(queryDef.sql, [operatingCompanyId]);
  const rows = res.rows;
  const truncated = rows.length > 20;
  const sliced = rows.slice(0, 20).map((row) => queryDef.map(row));
  return { items: sliced, truncated };
}

const DEPARTMENT_LABELS: Record<z.infer<typeof catalogDepartmentSchema>, string> = {
  dispatch: "Dispatch",
  safety: "Safety",
  accounting: "Accounting",
  identity: "Identity",
  operations: "Operations",
};

const DEPARTMENT_ORDER: Array<z.infer<typeof catalogDepartmentSchema>> = ["dispatch", "safety", "accounting", "identity", "operations"];

export async function registerCatalogRegistryRoutes(app: FastifyInstance) {
  app.get("/api/v1/catalogs/registry", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    return withCurrentUser(user.uuid, async (client) => {
      // Several catalogs the registry counts/previews are per-entity with FORCE RLS (accounts, classes,
      // items, and now driver_load_statuses). Set the caller's company GUC so those reads return the
      // entity's rows instead of a false 0; still-global catalogs are unaffected.
      const operatingCompanyId = await resolveOperatingCompanyId(client, user.uuid, null);
      if (operatingCompanyId) await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [operatingCompanyId]);

      const registryRes = await client.query(
        `
          SELECT id, code, name, description, department, route_path, icon_label, sort_order
          FROM catalogs.catalog_registry
          WHERE deactivated_at IS NULL
            AND is_active = true
          ORDER BY department, sort_order, name
        `
      );

      const catalogRows = await Promise.all(
        registryRes.rows.map(async (row) => {
          const stats = await fetchCatalogStats(client, String(row.code), operatingCompanyId);
          return {
            department: row.department,
            code: row.code,
            name: row.name,
            description: row.description,
            route_path: row.route_path,
            icon_label: row.icon_label,
            sort_order: row.sort_order,
            item_count: stats.item_count,
            last_updated_at: stats.last_updated_at,
          };
        })
      );

      return {
        departments: DEPARTMENT_ORDER.map((departmentCode) => ({
          code: departmentCode,
          name: DEPARTMENT_LABELS[departmentCode],
          catalogs: catalogRows
            .filter((row) => String(row.department) === departmentCode)
            .map(({ department: _department, ...rest }) => rest),
        })).filter((department) => department.catalogs.length > 0),
      };
    });
  });

  app.get<{ Params: { code: z.infer<typeof catalogCodeSchema> } }>("/api/v1/catalogs/registry/:code/preview", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const parsedParams = codeParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    return withCurrentUser(user.uuid, async (client) => {
      // Same entity GUC as the registry index — per-entity catalog previews (e.g. driver_load_statuses)
      // return the caller's rows under FORCE RLS instead of a false-empty preview.
      const operatingCompanyId = await resolveOperatingCompanyId(client, user.uuid, null);
      if (operatingCompanyId) await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [operatingCompanyId]);

      const registryRes = await client.query(
        `
          SELECT code, name, route_path
          FROM catalogs.catalog_registry
          WHERE code = $1
            AND deactivated_at IS NULL
            AND is_active = true
          LIMIT 1
        `,
        [parsedParams.data.code]
      );
      if (registryRes.rows.length === 0) return reply.code(404).send({ error: "catalog_registry_not_found" });
      const row = registryRes.rows[0];
      const preview = await fetchPreviewItems(client, parsedParams.data.code, operatingCompanyId);
      return {
        code: row.code,
        name: row.name,
        items: preview.items.map((item) => ({
          id: item.id,
          label: item.label,
          sub_label: item.sub_label ?? null,
          route_path: `${row.route_path}?highlight=${item.id}`,
        })),
        truncated: preview.truncated,
      };
    });
  });

  app.post("/api/v1/catalogs/registry", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = ensureAdmin(req, reply);
    if (!user) return;
    const parsedBody = createCatalogRegistrySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    try {
      return await withCurrentUser(user.uuid, async (client) => {
        const res = await client.query(
          `
            INSERT INTO catalogs.catalog_registry (
              code, name, description, department, route_path, icon_label, sort_order
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING
              id, code, name, description, department, route_path, icon_label, sort_order, is_active, deactivated_at, created_at, updated_at
          `,
          [
            parsedBody.data.code,
            parsedBody.data.name,
            parsedBody.data.description ?? null,
            parsedBody.data.department,
            parsedBody.data.route_path,
            parsedBody.data.icon_label,
            parsedBody.data.sort_order,
          ]
        );
        const created = res.rows[0];
        await appendCrudAudit(
          client,
          user.uuid,
          "catalogs.catalog_registry.created",
          {
            resource_id: created.id,
            resource_type: "catalogs.catalog_registry",
            code: created.code,
            department: created.department,
          },
          "info",
          "BT-1-LISTS-CATALOGS-HUB-AND-UX"
        );
        return reply.code(201).send({ entry: created });
      });
    } catch (error) {
      if ((error as { code?: string }).code === "23505") return reply.code(409).send({ error: "catalog_registry_code_conflict" });
      throw error;
    }
  });

  app.patch<{ Params: { id: string } }>("/api/v1/catalogs/registry/:id", async (req, reply) => {
    const user = ensureAdmin(req, reply);
    if (!user) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = updateCatalogRegistrySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    return withCurrentUser(user.uuid, async (client) => {
      const fields: string[] = [];
      const values: unknown[] = [];
      for (const [key, value] of Object.entries(parsedBody.data)) {
        if (value !== undefined) {
          values.push(value);
          fields.push(`${key} = $${values.length}`);
        }
      }
      if ("is_active" in parsedBody.data) {
        values.push(parsedBody.data.is_active ? null : new Date().toISOString());
        fields.push(`deactivated_at = $${values.length}`);
      }
      fields.push("updated_at = now()");
      values.push(parsedParams.data.id);
      const idIdx = values.length;

      const res = await client.query(
        `
          UPDATE catalogs.catalog_registry
          SET ${fields.join(", ")}
          WHERE id = $${idIdx}
          RETURNING
            id, code, name, description, department, route_path, icon_label, sort_order, is_active, deactivated_at, created_at, updated_at
        `,
        values
      );
      if (res.rows.length === 0) return reply.code(404).send({ error: "catalog_registry_not_found" });

      const updated = res.rows[0];
      await appendCrudAudit(
        client,
        user.uuid,
        "catalogs.catalog_registry.updated",
        {
          resource_id: updated.id,
          resource_type: "catalogs.catalog_registry",
          changes: parsedBody.data,
        },
        "info",
        "BT-1-LISTS-CATALOGS-HUB-AND-UX"
      );
      return { entry: updated };
    });
  });
}
