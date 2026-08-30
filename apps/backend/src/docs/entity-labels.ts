type LabelRow = { entity_id?: unknown; label?: unknown };

export type DocsLabelClient = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: LabelRow[] }>;
};

export type DocsEntityLink = {
  entity_type: string;
  entity_id: string;
  entity_label?: string | null;
};

const ENTITY_LABEL_SQL: Record<string, { table: string; labelSelect: string; scopePredicate: string }> = {
  // Never COALESCE to id::text — that ships raw UUIDs into entity_label and defeats FE chrome law.
  driver: {
    table: "mdata.drivers",
    labelSelect:
      "NULLIF(TRIM(BOTH FROM COALESCE(d.first_name, '') || ' ' || COALESCE(d.last_name, '')), '')",
    scopePredicate: `(d.operating_company_id = $1::uuid OR EXISTS (
      SELECT 1
      FROM mdata.driver_company_authorizations docs_driver_dca
      WHERE docs_driver_dca.driver_id = d.id
        AND docs_driver_dca.company_id = $1::uuid
        AND docs_driver_dca.is_authorized = true
        AND docs_driver_dca.deactivated_at IS NULL
    ))`,
  },
  customer: { table: "mdata.customers", labelSelect: "NULLIF(TRIM(d.customer_name), '')", scopePredicate: "d.operating_company_id = $1::uuid" },
  vendor: { table: "mdata.vendors", labelSelect: "NULLIF(TRIM(d.vendor_name), '')", scopePredicate: "d.operating_company_id = $1::uuid" },
  unit: { table: "mdata.units", labelSelect: "NULLIF(TRIM(d.unit_number::text), '')", scopePredicate: "COALESCE(d.currently_leased_to_company_id, d.owner_company_id) = $1::uuid" },
  equipment: { table: "mdata.equipment", labelSelect: "NULLIF(TRIM(d.equipment_number), '')", scopePredicate: "COALESCE(d.currently_leased_to_company_id, d.owner_company_id) = $1::uuid" },
  load: { table: "mdata.loads", labelSelect: "NULLIF(TRIM(d.load_number), '')", scopePredicate: "d.operating_company_id = $1::uuid" },
  settlement: { table: "driver_finance.driver_settlements", labelSelect: "NULLIF(TRIM(d.display_id), '')", scopePredicate: "d.operating_company_id = $1::uuid" },
  invoice: { table: "accounting.invoices", labelSelect: "NULLIF(TRIM(d.display_id), '')", scopePredicate: "d.operating_company_id = $1::uuid" },
  // DOC-01 D2 (owner 2026-08-29): safety.medical_cards / safety.background_checks previously had
  // no document column at all (migration 202613290000). Both tables carry operating_company_id
  // directly (no cross-company authorization bridge needed, unlike driver above).
  medical_card: { table: "safety.medical_cards", labelSelect: "NULLIF(TRIM(COALESCE(d.card_number, '')), '')", scopePredicate: "d.operating_company_id = $1::uuid" },
  background_check: { table: "safety.background_checks", labelSelect: "NULLIF(TRIM(COALESCE(d.check_type, '')), '')", scopePredicate: "d.operating_company_id = $1::uuid" },
};

/** Hydrate document links from canonical records in the same operating company. */
export async function hydrateEntityLabels(
  client: DocsLabelClient,
  operatingCompanyId: string,
  files: Array<{ links?: DocsEntityLink[] }>
) {
  const byType = new Map<string, Set<string>>();
  for (const file of files) {
    for (const link of file.links ?? []) {
      if (!link.entity_type || !link.entity_id) continue;
      const ids = byType.get(link.entity_type) ?? new Set<string>();
      ids.add(link.entity_id);
      byType.set(link.entity_type, ids);
    }
  }

  const labelMap = new Map<string, string>();
  for (const [entityType, ids] of byType.entries()) {
    const config = ENTITY_LABEL_SQL[entityType];
    if (!config) continue;
    const res = await client.query(
      `SELECT d.id AS entity_id, ${config.labelSelect} AS label
       FROM ${config.table} d
       WHERE ${config.scopePredicate}
         AND d.id = ANY($2::uuid[])`,
      [operatingCompanyId, Array.from(ids)]
    );
    for (const row of res.rows) {
      if (row.entity_id && row.label != null) {
        labelMap.set(`${entityType}:${String(row.entity_id)}`, String(row.label));
      }
    }
  }

  for (const file of files) {
    for (const link of file.links ?? []) {
      if (!link.entity_type || !link.entity_id) continue;
      link.entity_label = labelMap.get(`${link.entity_type}:${link.entity_id}`) ?? null;
    }
  }
}
