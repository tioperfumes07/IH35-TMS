import { openWorkOrderPredicate } from "../kpi/canonical-kpis.js";

export type WorkOrderBucket = "in_house" | "external" | "roadside";

type QueryClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export function assertRoadsideFields(input: {
  bucket?: WorkOrderBucket;
  roadside_callout_at?: string;
  roadside_provider_vendor_id?: string;
  roadside_location?: string;
  roadside_breakdown_load_id?: string;
}) {
  if (input.bucket !== "roadside") return;
  if (!input.roadside_callout_at) throw new Error("E_ROADSIDE_CALLOUT_REQUIRED");
  if (!input.roadside_provider_vendor_id) throw new Error("E_ROADSIDE_PROVIDER_REQUIRED");
  if (!input.roadside_breakdown_load_id) throw new Error("E_ROADSIDE_BREAKDOWN_LOAD_REQUIRED");
  if (!input.roadside_location || input.roadside_location.trim().length < 10) {
    throw new Error("E_ROADSIDE_LOCATION_MIN_10");
  }
}

export async function listWorkOrdersByBucket(client: QueryClient, operatingCompanyId: string) {
  const result = await client.query(
    `
      SELECT
        w.*,
        COALESCE(w.bucket::text,
          CASE
            WHEN w.repair_location = 'mobile_roadside' THEN 'roadside'
            WHEN w.repair_location = 'in_house' THEN 'in_house'
            ELSE 'external'
          END
        ) AS normalized_bucket,
        v.vendor_name AS roadside_provider_name,
        u.unit_number,
        TRIM(CONCAT(d.first_name, ' ', d.last_name)) AS driver_name
      FROM maintenance.work_orders w
      LEFT JOIN mdata.vendors v ON v.id = w.roadside_provider_vendor_id AND v.operating_company_id = w.operating_company_id
      LEFT JOIN mdata.units u ON u.id = w.unit_id
                              AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = w.operating_company_id
      LEFT JOIN mdata.drivers d ON d.id = w.driver_id AND d.operating_company_id = w.operating_company_id
      WHERE w.operating_company_id = $1::uuid
        AND ${openWorkOrderPredicate("w")}
      ORDER BY w.opened_at DESC NULLS LAST, w.created_at DESC
      LIMIT 80
    `,
    [operatingCompanyId]
  );

  const buckets: { in_house: Record<string, unknown>[]; external: Record<string, unknown>[]; roadside: Record<string, unknown>[] } = {
    in_house: [],
    external: [],
    roadside: [],
  };
  for (const row of result.rows) {
    const bucket = String((row as { normalized_bucket?: string }).normalized_bucket ?? "in_house");
    if (bucket === "roadside") buckets.roadside.push(row);
    else if (bucket === "external") buckets.external.push(row);
    else buckets.in_house.push(row);
  }
  return buckets;
}
