type LabelRow = { entity_id?: unknown; label?: unknown };

export type DocsLabelClient = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: LabelRow[] }>;
};

export type DocsEntityLink = {
  entity_type: string;
  entity_id: string;
  entity_label?: string | null;
};

const ENTITY_LABEL_SQL: Record<string, { table: string; labelSelect: string }> = {
  driver: { table: "mdata.drivers", labelSelect: "COALESCE(NULLIF(d.first_name || ' ' || d.last_name, ' '), d.id::text)" },
  customer: { table: "mdata.customers", labelSelect: "d.customer_name" },
  vendor: { table: "mdata.vendors", labelSelect: "d.vendor_name" },
  unit: { table: "mdata.units", labelSelect: "d.unit_number::text" },
  equipment: { table: "mdata.equipment", labelSelect: "d.equipment_number" },
  load: { table: "mdata.loads", labelSelect: "d.load_number" },
  settlement: { table: "driver_finance.driver_settlements", labelSelect: "d.display_id" },
  invoice: { table: "accounting.invoices", labelSelect: "d.display_id" },
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
       WHERE d.operating_company_id = $1::uuid
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
