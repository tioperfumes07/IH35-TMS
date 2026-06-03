export type EntityClassification = {
  id: string;
  tag_key: string;
  tag_label: string;
  applied_at: string | null;
  applied_by_user_id: string | null;
};

type QueryableClient = {
  query: (
    sql: string,
    values?: unknown[]
  ) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

export async function listActiveCustomerClassifications(
  client: QueryableClient,
  customerId: string,
  operatingCompanyId: string
): Promise<EntityClassification[]> {
  const res = await client.query(
    `
      SELECT id, tag_key, tag_label, applied_at, applied_by_user_id
      FROM accounting.customer_classifications
      WHERE customer_id = $1
        AND operating_company_id = $2
        AND archived_at IS NULL
      ORDER BY tag_label ASC
    `,
    [customerId, operatingCompanyId]
  );
  return res.rows.map(mapClassificationRow);
}

export async function listActiveVendorClassifications(
  client: QueryableClient,
  vendorId: string,
  operatingCompanyId: string
): Promise<EntityClassification[]> {
  const res = await client.query(
    `
      SELECT id, tag_key, tag_label, applied_at, applied_by_user_id
      FROM accounting.vendor_classifications
      WHERE vendor_id = $1
        AND operating_company_id = $2
        AND archived_at IS NULL
      ORDER BY tag_label ASC
    `,
    [vendorId, operatingCompanyId]
  );
  return res.rows.map(mapClassificationRow);
}

function mapClassificationRow(row: Record<string, unknown>): EntityClassification {
  return {
    id: String(row.id),
    tag_key: String(row.tag_key),
    tag_label: String(row.tag_label),
    applied_at: row.applied_at == null ? null : String(row.applied_at),
    applied_by_user_id: row.applied_by_user_id == null ? null : String(row.applied_by_user_id),
  };
}
