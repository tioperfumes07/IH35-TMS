/**
 * Round 296 filter law: a list whose route pages or caps (limit/offset + total) must hand its house toolbar the WHOLE
 * set, or search only sees the first page and "N of M" lies. Reads page after page until `total` rows are in hand.
 */
export async function fetchAllCatalogPages<Row, F extends { limit?: number; offset?: number }>(
  list: (filters: F) => Promise<{ rows: Row[]; total: number }>,
  filters: Omit<F, "limit" | "offset">,
  pageSize = 200,
): Promise<{ rows: Row[]; total: number }> {
  let rows: Row[] = [];
  let total = 0;
  let offset = 0;
  do {
    const page = await list({ ...filters, limit: pageSize, offset } as F);
    rows = rows.concat(page.rows);
    total = page.total;
    offset += pageSize;
    if (page.rows.length === 0) break; // never spin on a route whose total disagrees with its pages
  } while (rows.length < total);
  return { rows, total };
}
