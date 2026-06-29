import type pg from "pg";
import { provisionLegalTemplateLibraryForCompany } from "../legal/template-library-provision.service.js";

export type BootstrapStepResult = {
  table: string;
  inserted: number;
  skipped: boolean;
};

export type BootstrapCarrierResult = {
  template_carrier_id: string;
  new_carrier_id: string;
  steps: BootstrapStepResult[];
  coa_cloned: number;
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
    `SELECT count(*)::int AS c FROM ${spec.table} WHERE operating_company_id = $1`,
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

async function cloneCoaIfEmpty(
  client: Queryable,
  templateCarrierId: string,
  newCarrierId: string
): Promise<number> {
  if (!(await tableExists(client, "accounting.qbo_accounts"))) return 0;

  const existing = await client.query<{ c: number }>(
    `SELECT count(*)::int AS c FROM accounting.qbo_accounts WHERE operating_company_id = $1`,
    [newCarrierId]
  );
  if (Number(existing.rows[0]?.c ?? 0) > 0) return 0;

  const templateCount = await client.query<{ c: number }>(
    `SELECT count(*)::int AS c FROM accounting.qbo_accounts WHERE operating_company_id = $1`,
    [templateCarrierId]
  );
  if (Number(templateCount.rows[0]?.c ?? 0) === 0) return 0;

  await client.query(
    `
      CREATE TEMP TABLE tmp_bootstrap_coa_map (
        old_id uuid PRIMARY KEY,
        new_id uuid NOT NULL
      ) ON COMMIT DROP
    `
  );
  await client.query(
    `
      INSERT INTO tmp_bootstrap_coa_map (old_id, new_id)
      SELECT id, gen_random_uuid()
      FROM accounting.qbo_accounts
      WHERE operating_company_id = $1
    `,
    [templateCarrierId]
  );
  const insertRes = await client.query(
    `
      INSERT INTO accounting.qbo_accounts (
        id, operating_company_id, qbo_id, name, full_qualified_name,
        account_type, account_sub_type, active, mirrored_at, payload_json,
        sync_status, qbo_push_attempts
      )
      SELECT
        m.new_id,
        $2::uuid,
        NULL,
        src.name,
        src.full_qualified_name,
        src.account_type,
        src.account_sub_type,
        src.active,
        now(),
        src.payload_json,
        'unsynced',
        0
      FROM accounting.qbo_accounts src
      JOIN tmp_bootstrap_coa_map m ON m.old_id = src.id
      WHERE src.operating_company_id = $1::uuid
    `,
    [templateCarrierId, newCarrierId]
  );
  await client.query(
    `
      UPDATE accounting.qbo_accounts usmca_child
      SET parent_id = parent_map.new_id
      FROM accounting.qbo_accounts src_child
      JOIN tmp_bootstrap_coa_map child_map ON child_map.old_id = src_child.id
      JOIN tmp_bootstrap_coa_map parent_map ON parent_map.old_id = src_child.parent_id
      WHERE usmca_child.id = child_map.new_id
        AND src_child.operating_company_id = $1::uuid
        AND usmca_child.operating_company_id = $2::uuid
        AND src_child.parent_id IS NOT NULL
    `,
    [templateCarrierId, newCarrierId]
  );
  return insertRes.rowCount ?? 0;
}

/** Idempotent carrier bootstrap: copy TRANSP-style catalogs + CoA into a hidden carrier scope. */
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
  const coaCloned = await cloneCoaIfEmpty(client, templateCarrierId, newCarrierId);
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
    coa_cloned: coaCloned,
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
