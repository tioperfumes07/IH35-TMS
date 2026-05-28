export type AllocationMethod = "equal" | "by_value" | "by_miles" | "manual_pct";

export type AllocationAssetOption = {
  id: string;
  unit_code: string;
  insured_value_cents?: number | null;
};

export type AllocationPreviewRow = {
  asset_id: string;
  unit_code: string;
  allocation_method: AllocationMethod;
  allocation_pct: number;
  allocated_amount_cents: number;
};

export type AllocateBillRequest = {
  method: AllocationMethod;
  asset_ids: string[];
  manual_pcts?: Record<string, number>;
  miles?: Record<string, number>;
};

export type AllocateBillResponse = {
  rows: Array<{
    asset_id: string;
    allocation_method: AllocationMethod;
    allocation_pct: number;
    allocated_amount_cents: number;
  }>;
};
