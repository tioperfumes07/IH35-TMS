import { apiRequest } from "./client";

export type HeatmapBucketRow = {
  lat_bucket: number;
  lng_bucket: number;
  hit_count: number;
};

export function getTelematicsHeatmap(args: {
  operating_company_id: string;
  from?: string;
  to?: string;
  unit_id?: string;
}) {
  const qs = new URLSearchParams({ operating_company_id: args.operating_company_id });
  if (args.from) qs.set("from", args.from);
  if (args.to) qs.set("to", args.to);
  if (args.unit_id) qs.set("unit_id", args.unit_id);
  return apiRequest<{ from: string; to: string; bucket_size_degrees: number; rows: HeatmapBucketRow[] }>(
    `/api/v1/telematics/heatmap?${qs.toString()}`
  );
}
