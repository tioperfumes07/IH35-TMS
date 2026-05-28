export type AllocationMethod = "equal" | "by_value" | "by_miles" | "manual_pct";

export type AllocationAsset = {
  id: string;
  insured_value_cents?: number | null;
};

export type AllocationRow = {
  asset_id: string;
  allocation_method: AllocationMethod;
  allocation_pct: number;
  allocated_amount_cents: number;
};

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function assertTotal(totalCents: number) {
  if (!Number.isInteger(totalCents) || totalCents <= 0) {
    throw new Error("allocation_total_must_be_positive_integer");
  }
}

function assertAssets(assets: AllocationAsset[]) {
  if (!Array.isArray(assets) || assets.length === 0) {
    throw new Error("allocation_assets_required");
  }
}

function allocateCentsFromWeights(assetIds: string[], totalCents: number, weights: Map<string, number>) {
  const weightTotal = assetIds.reduce((sum, id) => sum + (weights.get(id) ?? 0), 0);
  if (!Number.isFinite(weightTotal) || weightTotal <= 0) {
    throw new Error("allocation_weight_sum_must_be_positive");
  }

  const rows = assetIds.map((assetId) => {
    const weight = weights.get(assetId) ?? 0;
    return {
      asset_id: assetId,
      raw_pct: (weight / weightTotal) * 100,
      allocated_amount_cents: Math.floor((totalCents * weight) / weightTotal),
    };
  });

  const allocated = rows.reduce((sum, row) => sum + row.allocated_amount_cents, 0);
  rows[0].allocated_amount_cents += totalCents - allocated;

  const pctTail = rows.slice(1).reduce((sum, row) => sum + round4(row.raw_pct), 0);
  const firstPct = round4(100 - pctTail);

  return rows.map((row, index) => ({
    asset_id: row.asset_id,
    allocation_pct: index === 0 ? firstPct : round4(row.raw_pct),
    allocated_amount_cents: row.allocated_amount_cents,
  }));
}

export function resolveAllocation(
  method: AllocationMethod,
  assets: AllocationAsset[],
  totalCents: number,
  manualPcts?: Record<string, number>,
  miles?: Record<string, number>
): AllocationRow[] {
  assertAssets(assets);
  assertTotal(totalCents);
  const assetIds = assets.map((asset) => asset.id);

  let rows: Array<{ asset_id: string; allocation_pct: number; allocated_amount_cents: number }>;
  if (method === "equal") {
    const weights = new Map(assetIds.map((id) => [id, 1]));
    rows = allocateCentsFromWeights(assetIds, totalCents, weights);
  } else if (method === "by_value") {
    const weights = new Map(
      assets.map((asset) => [
        asset.id,
        Number.isFinite(Number(asset.insured_value_cents ?? 0))
          ? Math.max(0, Number(asset.insured_value_cents ?? 0))
          : 0,
      ])
    );
    rows = allocateCentsFromWeights(assetIds, totalCents, weights);
  } else if (method === "by_miles") {
    if (!miles) throw new Error("allocation_miles_required");
    const weights = new Map(assetIds.map((id) => [id, Math.max(0, Number(miles[id] ?? 0))]));
    rows = allocateCentsFromWeights(assetIds, totalCents, weights);
  } else if (method === "manual_pct") {
    if (!manualPcts) throw new Error("allocation_manual_pcts_required");
    const pctRows = assetIds.map((id) => ({
      asset_id: id,
      pct: Number(manualPcts[id] ?? 0),
    }));
    const pctSum = pctRows.reduce((sum, row) => sum + row.pct, 0);
    if (Math.abs(pctSum - 100) > 0.0001) {
      throw new Error("allocation_manual_pct_sum_invalid");
    }

    const allocated = pctRows.map((row) => ({
      asset_id: row.asset_id,
      allocation_pct: round4(row.pct),
      allocated_amount_cents: Math.floor((totalCents * row.pct) / 100),
    }));
    const centsSum = allocated.reduce((sum, row) => sum + row.allocated_amount_cents, 0);
    allocated[0].allocated_amount_cents += totalCents - centsSum;
    rows = allocated;
  } else {
    throw new Error("allocation_method_invalid");
  }

  return rows.map((row) => ({
    asset_id: row.asset_id,
    allocation_method: method,
    allocation_pct: row.allocation_pct,
    allocated_amount_cents: row.allocated_amount_cents,
  }));
}
