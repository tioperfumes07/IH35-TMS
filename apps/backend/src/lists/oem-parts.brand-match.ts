type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

/**
 * Active fleet brands from trucks (units.make), trailers (equipment.make),
 * and reefer units (equipment.reefer_brand). Uses deactivated_at for active rows
 * (mdata.units/equipment do not use archived_at). When A19 lands, extend with
 * trailer_reefer_specs.reefer_brand.
 *
 * CLS-JOIN-ENTITY-UNSCOPED fix (round 5): mdata.units/equipment have no operating_company_id
 * column, so scope by the owner/leased pair (same rule as everywhere else in the codebase).
 * Before this fix the query ran with no company predicate at all — any authenticated caller's
 * "fleet brand match" flag and `fleet_brands` list reflected EVERY company's fleet mix, not
 * just their own. $1 is the caller's resolved operating_company_id, bound by every call site.
 */
export const FLEET_BRAND_SOURCES_SQL = `
  SELECT DISTINCT UPPER(TRIM(make)) AS brand
  FROM mdata.units
  WHERE deactivated_at IS NULL
    AND make IS NOT NULL
    AND TRIM(make) <> ''
    AND COALESCE(currently_leased_to_company_id, owner_company_id) = $1::uuid
  UNION
  SELECT DISTINCT UPPER(TRIM(make)) AS brand
  FROM mdata.equipment
  WHERE deactivated_at IS NULL
    AND make IS NOT NULL
    AND TRIM(make) <> ''
    AND COALESCE(currently_leased_to_company_id, owner_company_id) = $1::uuid
  UNION
  SELECT DISTINCT UPPER(TRIM(reefer_brand)) AS brand
  FROM mdata.equipment
  WHERE deactivated_at IS NULL
    AND reefer_brand IS NOT NULL
    AND TRIM(reefer_brand) <> ''
    AND COALESCE(currently_leased_to_company_id, owner_company_id) = $1::uuid
`;

export async function fetchFleetBrands(client: Queryable, operatingCompanyId: string): Promise<Set<string>> {
  const res = await client.query<{ brand: string }>(FLEET_BRAND_SOURCES_SQL, [operatingCompanyId]);
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
