type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

/**
 * Active fleet brands from trucks (units.make), trailers (equipment.make),
 * and reefer units (equipment.reefer_brand). Uses deactivated_at for active rows
 * (mdata.units/equipment do not use archived_at). When A19 lands, extend with
 * trailer_reefer_specs.reefer_brand.
 */
export const FLEET_BRAND_SOURCES_SQL = `
  SELECT DISTINCT UPPER(TRIM(make)) AS brand
  FROM mdata.units
  WHERE deactivated_at IS NULL
    AND make IS NOT NULL
    AND TRIM(make) <> ''
  UNION
  SELECT DISTINCT UPPER(TRIM(make)) AS brand
  FROM mdata.equipment
  WHERE deactivated_at IS NULL
    AND make IS NOT NULL
    AND TRIM(make) <> ''
  UNION
  SELECT DISTINCT UPPER(TRIM(reefer_brand)) AS brand
  FROM mdata.equipment
  WHERE deactivated_at IS NULL
    AND reefer_brand IS NOT NULL
    AND TRIM(reefer_brand) <> ''
`;

export async function fetchFleetBrands(client: Queryable): Promise<Set<string>> {
  const res = await client.query<{ brand: string }>(FLEET_BRAND_SOURCES_SQL);
  const brands = new Set<string>();
  for (const row of res.rows) {
    const brand = String(row.brand ?? "").trim();
    if (brand) brands.add(brand);
  }
  return brands;
}

export function normalizeBrandKey(value: string): string {
  return value.trim().toUpperCase();
}
