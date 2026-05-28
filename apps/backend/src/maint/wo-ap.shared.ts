export type RmPseLane = "R&M-INT" | "R&M-EXT" | "R&M-OTR" | "R&M-RS";

export type MaintWoApLinePreview = {
  wo_line_uuid: string;
  line_type: string;
  description: string | null;
  amount_cents: number;
  section: string | null;
};

export type MaintWoApPsePreview = {
  rm_lane: RmPseLane;
  ps_category_qbo_id: string | null;
  ps_item_qbo_id: string | null;
  resolved_coa_account_id: string | null;
  coa_account_id: string | null;
};

export type MaintWoApPostingPreview = {
  work_order_id: string;
  operating_company_id: string;
  status: string | null;
  vendor_id: string | null;
  asset_id: string | null;
  asset_unit_code: string | null;
  ready: boolean;
  blocking_errors: string[];
  pse: MaintWoApPsePreview;
  lines: MaintWoApLinePreview[];
  bill_total_cents: number;
  existing_bill_id: string | null;
};

export function resolveRmPseLane(bucket: string | null | undefined, repairLocation?: string | null): RmPseLane {
  const normalized = String(bucket ?? repairLocation ?? "in_house")
    .trim()
    .toLowerCase();
  if (normalized === "roadside" || normalized === "rs") return "R&M-RS";
  if (normalized === "external") return "R&M-EXT";
  if (normalized.includes("otr") || normalized === "over_the_road") return "R&M-OTR";
  return "R&M-INT";
}

export function amountToCents(value: string | number | null | undefined) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}
