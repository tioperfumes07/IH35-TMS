type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type UniversalSearchResult = {
  uuid: string;
  entity_type: string;
  entity_uuid: string;
  display_text: string;
  secondary_text: string | null;
  url_path: string;
  icon: string | null;
  rank: number;
};

export type UniversalSearchOptions = {
  limit?: number;
  entity_types?: string[] | null;
};

export async function universalSearch(
  client: DbClient,
  operatingCompanyId: string,
  query: string,
  opts: UniversalSearchOptions = {}
): Promise<UniversalSearchResult[]> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
  const trimmed = query.trim();
  if (!trimmed) return [];

  const values: unknown[] = [operatingCompanyId, trimmed, limit];
  let typeFilter = "";
  if (opts.entity_types && opts.entity_types.length > 0) {
    values.push(opts.entity_types);
    typeFilter = `AND entity_type = ANY($${values.length}::text[])`;
  }

  const res = await client.query<UniversalSearchResult>(
    `
      SELECT
        uuid::text,
        entity_type,
        entity_uuid::text,
        display_text,
        secondary_text,
        url_path,
        icon,
        ts_rank(search_text, plainto_tsquery('english', $2::text)) AS rank
      FROM search.universal_index
      WHERE operating_company_id = $1::uuid
        AND search_text @@ plainto_tsquery('english', $2::text)
        ${typeFilter}
      ORDER BY rank DESC, updated_at DESC
      LIMIT $3::int
    `,
    values
  );

  return res.rows;
}
