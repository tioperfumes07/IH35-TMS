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
      ON CONFLICT (operating_company_id, entity_type, entity_uuid) DO UPDATE SET
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
                                  AND c.operating_company_id = $1::uuid
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
             -- SRCH-F64: mdata.drivers has NO driver_code column, so this statement failed at parse
             -- time and search.indexer_incremental had NEVER succeeded. The real display identifier
             -- is employee_id_display. Deliberately NOT cdl_number / visa_number / passport_number /
             -- ine_number / b1_visa_number — those exist on the table and would push government ID
             -- numbers into a universal search index that any authorised user can query.
             COALESCE(d.employee_id_display, '') AS secondary_text
      FROM mdata.drivers d
      WHERE (
              d.operating_company_id = $1::uuid
              OR EXISTS (
                SELECT 1
                FROM mdata.driver_company_authorizations universal_driver_dca
                WHERE universal_driver_dca.driver_id = d.id
                  AND universal_driver_dca.company_id = $1::uuid
                  AND universal_driver_dca.is_authorized = true
                  AND universal_driver_dca.deactivated_at IS NULL
              )
            )
        AND d.deactivated_at IS NULL
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

  // The index is derived data. Remove only selected-company driver rows that no longer have a
  // home-company or active-authorization path, after successful upserts so a transient read/write
  // failure cannot blank the company's Cmd-K driver results first.
  await client.query(
    `
      DELETE FROM search.universal_index ui
      WHERE ui.operating_company_id = $1::uuid
        AND ui.entity_type = 'driver'
        AND NOT EXISTS (
          SELECT 1
          FROM mdata.drivers d
          WHERE d.id = ui.entity_uuid
            AND d.deactivated_at IS NULL
            AND (
              d.operating_company_id = $1::uuid
              OR EXISTS (
                SELECT 1
                FROM mdata.driver_company_authorizations universal_driver_cleanup_dca
                WHERE universal_driver_cleanup_dca.driver_id = d.id
                  AND universal_driver_cleanup_dca.company_id = $1::uuid
                  AND universal_driver_cleanup_dca.is_authorized = true
                  AND universal_driver_cleanup_dca.deactivated_at IS NULL
              )
            )
        )
    `,
    [operatingCompanyId]
  );
  return res.rows.length;
}
