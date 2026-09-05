export const USMCA_OPERATING_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
export const TRANSPORTATION_OPERATING_COMPANY_ID = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

/**
 * Samsara is one physical fleet feed. Since the operating cutover, USMCA is its
 * ingestion owner; running the same token for Transportation duplicates every
 * position and assignment under the frozen entity.
 */
export async function listSamsaraIngestionTenantIds(client: DbClient): Promise<string[]> {
  const result = await client.query<{ operating_company_id: string }>(
    `
      SELECT c.id::text AS operating_company_id
      FROM org.companies c
      JOIN integrations.samsara_config cfg
        ON cfg.operating_company_id = c.id
       AND cfg.is_enabled = true
       AND cfg.disconnected_at IS NULL
      WHERE c.is_active = true
        AND c.deactivated_at IS NULL
        AND (
          c.id <> $1::uuid
          OR NOT EXISTS (
            SELECT 1
            FROM integrations.samsara_config usmca_cfg
            WHERE usmca_cfg.operating_company_id = $2::uuid
              AND usmca_cfg.is_enabled = true
              AND usmca_cfg.disconnected_at IS NULL
          )
        )
      ORDER BY c.id
    `,
    [TRANSPORTATION_OPERATING_COMPANY_ID, USMCA_OPERATING_COMPANY_ID]
  );
  return result.rows.map((row) => row.operating_company_id);
}
