type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type IndexEntityInput = {
  operating_company_id: string;
  entity_type: string;
  entity_uuid: string;
  display: string;
  search_terms: string;
  url: string;
  icon?: string | null;
  secondary_text?: string | null;
};

export async function indexEntity(client: DbClient, input: IndexEntityInput): Promise<void> {
  const searchBlob = [input.display, input.search_terms, input.secondary_text ?? ""]
    .filter(Boolean)
    .join(" ");

  await client.query(
    `
      INSERT INTO search.universal_index (
        operating_company_id, entity_type, entity_uuid, display_text, search_text,
        secondary_text, url_path, icon, updated_at
      ) VALUES (
        $1::uuid, $2, $3::uuid, $4,
        to_tsvector('english', $5),
        $6, $7, $8, NOW()
      )
      ON CONFLICT (entity_type, entity_uuid) DO UPDATE SET
        operating_company_id = EXCLUDED.operating_company_id,
        display_text = EXCLUDED.display_text,
        search_text = EXCLUDED.search_text,
        secondary_text = EXCLUDED.secondary_text,
        url_path = EXCLUDED.url_path,
        icon = EXCLUDED.icon,
        updated_at = NOW()
    `,
    [
      input.operating_company_id,
      input.entity_type,
      input.entity_uuid,
      input.display,
      searchBlob,
      input.secondary_text ?? null,
      input.url,
      input.icon ?? null,
    ]
  );
}

export async function indexLoadsForCompany(client: DbClient, operatingCompanyId: string): Promise<number> {
  const res = await client.query<{ entity_uuid: string; display_text: string; secondary_text: string | null }>(
    `
      SELECT l.id::text AS entity_uuid,
             COALESCE(l.load_number, l.id::text) AS display_text,
             COALESCE(c.customer_name, '') AS secondary_text
      FROM mdata.loads l
      LEFT JOIN mdata.customers c ON c.id = l.customer_id
      WHERE l.operating_company_id = $1::uuid
        AND l.soft_deleted_at IS NULL
      LIMIT 5000
    `,
    [operatingCompanyId]
  );

  for (const row of res.rows) {
    await indexEntity(client, {
      operating_company_id: operatingCompanyId,
      entity_type: "load",
      entity_uuid: row.entity_uuid,
      display: row.display_text,
      search_terms: row.display_text,
      secondary_text: row.secondary_text,
      url: `/dispatch/loads/${row.entity_uuid}`,
      icon: "truck",
    });
  }
  return res.rows.length;
}

export async function indexDriversForCompany(client: DbClient, operatingCompanyId: string): Promise<number> {
  const res = await client.query<{ entity_uuid: string; display_text: string; secondary_text: string | null }>(
    `
      SELECT d.id::text AS entity_uuid,
             COALESCE(NULLIF(CONCAT_WS(' ', d.first_name, d.last_name), ''), d.id::text) AS display_text,
             COALESCE(d.driver_code, '') AS secondary_text
      FROM mdata.drivers d
      WHERE d.operating_company_id = $1::uuid
        AND d.deactivated_at IS NULL
      LIMIT 5000
    `,
    [operatingCompanyId]
  );

  for (const row of res.rows) {
    await indexEntity(client, {
      operating_company_id: operatingCompanyId,
      entity_type: "driver",
      entity_uuid: row.entity_uuid,
      display: row.display_text,
      search_terms: `${row.display_text} ${row.secondary_text ?? ""}`,
      secondary_text: row.secondary_text,
      url: `/drivers/${row.entity_uuid}`,
      icon: "user",
    });
  }
  return res.rows.length;
}
