export type AssetLifecycle = "active" | "maintenance" | "out_of_service";

export type AssetKind = "tractor" | "trailer" | "other";

export type AssetRow = {
  id: string;
  unit_number: string;
  vin?: string | null;
  kind: AssetKind;
  lifecycle: AssetLifecycle;
  assigned_driver_name?: string | null;
  assigned_load_display?: string | null;
  location_label?: string | null;
  utilization_score?: number | null;
};

export type AssetSummary = {
  total_assets: number;
  active_assets: number;
  maintenance_assets: number;
  out_of_service_assets: number;
};
