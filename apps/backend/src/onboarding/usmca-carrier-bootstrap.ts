import type pg from "pg";
import { provisionLegalTemplateLibraryForCompany } from "../legal/template-library-provision.service.js";
import { QBO_NATIVE_WRITE_REFUSED } from "../qbo-sync/qbo-native-write-refused.js";

export type BootstrapStepResult = {
  table: string;
  inserted: number;
  skipped: boolean;
};

export type BootstrapCarrierResult = {
  template_carrier_id: string;
  new_carrier_id: string;
  steps: BootstrapStepResult[];
  /** Always 0 since 443.137 9e — the chart step refuses; see coa_refused. */
  coa_cloned: number;
  coa_refused: { code: string; reason: string };
  legal_templates_seeded: number;
  storage_prefix: string;
};

type Queryable = {
  query: pg.PoolClient["query"];
};

const CATALOG_COPY_SPECS: Array<{
  table: string;
  columns: string[];
  conflict: string;
}> = [
  {
    table: "catalogs.complaint_types",
    columns: ["type_code", "type_name", "default_severity", "is_active"],
    conflict: "(operating_company_id, type_code)",
  },
  {
    table: "catalogs.load_cancellation_reasons",
    columns: ["reason_code", "display_name", "category", "is_active", "sort_order", "description"],
    conflict: "(operating_company_id, reason_code)",
  },
  {
    table: "catalogs.dispatch_flag_colors",
    columns: [
      "flag_code",
      "display_name",
      "hex_color",
      "icon_emoji",
      "severity_order",
      "description",
      "is_active",
      "sort_order",
      "created_by_user_id",
    ],
    conflict: "(operating_company_id, flag_code)",
  },
];

async function tableExists(client: Queryable, qualifiedName: string): Promise<boolean> {
  const [schema, table] = qualifiedName.split(".");
  const res = await client.query<{ reg: string | null }>(
    `SELECT to_regclass($1) AS reg`,
    [`${schema}.${table}`]
  );
  return Boolean(res.rows[0]?.reg);
}

async function copyCatalogTable(
  client: Queryable,
  spec: (typeof CATALOG_COPY_SPECS)[number],
  templateCarrierId: string,
  newCarrierId: string
): Promise<BootstrapStepResult> {
  if (!(await tableExists(client, spec.table))) {
    return { table: spec.table, inserted: 0, skipped: true };
  }

  const existing = await client.query<{ c: number }>(
    `SELECT count(*)::int AS c FROM ${spec.table} WHERE operating_company_id = $1::uuid`,
    [newCarrierId]
  );
  if (Number(existing.rows[0]?.c ?? 0) > 0) {
    return { table: spec.table, inserted: 0, skipped: true };
  }

  const columnList = ["operating_company_id", ...spec.columns].join(", ");
  const selectList = [`$2::uuid`, ...spec.columns.map((c) => `src.${c}`)].join(", ");
  const res = await client.query(
    `
      INSERT INTO ${spec.table} (${columnList})
      SELECT ${selectList}
      FROM ${spec.table} src
      WHERE src.operating_company_id = $1::uuid
      ON CONFLICT ${spec.conflict} DO NOTHING
    `,
    [templateCarrierId, newCarrierId]
  );

  return { table: spec.table, inserted: res.rowCount ?? 0, skipped: false };
}

// ACCT-F4431381 (Lead 443.137 item 9e, part 2) — the chart-of-accounts step is REFUSED BY NAME.
//
// It used to copy the TEMPLATE carrier's QuickBooks chart (mdata.qbo_accounts) into the NEW carrier's
// mdata.qbo_accounts with qbo_id NULL and sync_status 'unsynced' — rows QuickBooks never had, written into
// the read-only QuickBooks archive. Measured on prod (read-only, 2026-10-12): USMCA holds 365 such rows,
// every one with qbo_id NULL, while its native chart (catalogs.accounts) holds 241 rows that were seeded
// separately. No native posting path reads the cloned rows: native posting resolves catalogs.accounts,
// and the one QBO-id resolver (expense category_qbo_id) cannot match a row whose qbo_id is NULL.
//
// The replacement is a native catalogs.accounts seed routed through a chart-of-accounts engine. No such
// engine exists today (no chart template, no per-carrier chart clone service), and the order forbids
// inventing a chart, so the step refuses with its SQL removed and the result names the refusal. The
// other bootstrap steps (operational catalogs, legal template library) still run.
export const COA_BOOTSTRAP_REFUSED = {
  code: QBO_NATIVE_WRITE_REFUSED,
  reason:
    "Chart-of-accounts clone refused: it wrote non-QuickBooks rows into the read-only QuickBooks archive " +
    "(mdata.qbo_accounts). QuickBooks is a read-only archive (Lead 443.137 item 9e). Seed the new carrier's " +
    "native chart (catalogs.accounts) through Accounting > Chart of Accounts; a native chart-seed engine is a tracked follow-up.",
} as const;

/** Idempotent carrier bootstrap: copy TRANSP-style operational catalogs into a hidden carrier scope (the CoA step refuses — see COA_BOOTSTRAP_REFUSED). */
export async function bootstrapCarrier(
  client: Queryable,
  templateCarrierId: string,
  newCarrierId: string,
  actorUserId: string
): Promise<BootstrapCarrierResult> {
  const steps: BootstrapStepResult[] = [];
  for (const spec of CATALOG_COPY_SPECS) {
    steps.push(await copyCatalogTable(client, spec, templateCarrierId, newCarrierId));
  }
  const codeRes = await client.query<{ code: string }>(
    `SELECT code FROM org.companies WHERE id = $1 LIMIT 1`,
    [newCarrierId]
  );
  const code = String(codeRes.rows[0]?.code ?? "carrier").toLowerCase();
  // LEGAL-SEED-01: a newly-bootstrapped/activated entity auto-gets its OWN legal template library
  // (per-entity, idempotent). Done LAST because it sets app.operating_company_id to the new
  // carrier for its insert scope. Reuses ensureLegalTemplateLibrary — no insert logic duplicated.
  const legalSeed = await provisionLegalTemplateLibraryForCompany(client, {
    operatingCompanyId: newCarrierId,
    actorUserId,
  });
  return {
    template_carrier_id: templateCarrierId,
    new_carrier_id: newCarrierId,
    steps,
    coa_cloned: 0,
    coa_refused: COA_BOOTSTRAP_REFUSED,
    legal_templates_seeded: legalSeed.inserted,
    storage_prefix: `tenants/${code}/`,
  };
}

export async function resolveCompanyIdByCode(client: Queryable, code: string): Promise<string | null> {
  const res = await client.query<{ id: string }>(
    `SELECT id::text AS id FROM org.companies WHERE code = $1 LIMIT 1`,
    [code]
  );
  return res.rows[0]?.id ?? null;
}

export async function listHiddenCarriers(client: Queryable) {
  const res = await client.query<{
    id: string;
    code: string;
    legal_name: string;
    short_name: string | null;
    is_active: boolean;
    usdot_number: string | null;
    mc_number: string | null;
  }>(
    `
      SELECT
        id::text,
        code,
        legal_name,
        short_name,
        is_active,
        usdot_number,
        mc_number
      FROM org.companies
      WHERE is_active = false
        AND deactivated_at IS NULL
      ORDER BY code
    `
  );
  return res.rows;
}
