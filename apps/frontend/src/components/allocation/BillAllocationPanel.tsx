import { useEffect, useMemo, useState } from "react";
import { resolveApiUrl } from "../../api/client";
import { OFFLINE_PREVIEW_BANNER } from "../../lib/prodEmptyStateCopy";
import { AllocationMethodPicker } from "./AllocationMethodPicker";
import { AllocationPreviewTable } from "./AllocationPreviewTable";
import type {
  AllocateBillRequest,
  AllocateBillResponse,
  AllocationAssetOption,
  AllocationMethod,
  AllocationPreviewRow,
} from "./types";

const FALLBACK_ASSETS: AllocationAssetOption[] = [
  { id: "asset-demo-tractor-1", unit_code: "TRK-112", insured_value_cents: 9500000 },
  { id: "asset-demo-trailer-1", unit_code: "TRL-533", insured_value_cents: 4200000 },
];

type Props = {
  companyId: string;
  billId: string;
  billLabel: string;
  billAmountCents: number;
};

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

function previewEqual(totalCents: number, assets: AllocationAssetOption[]): AllocationPreviewRow[] {
  const count = assets.length;
  if (!count) return [];
  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;
  return assets.map((asset, index) => ({
    asset_id: asset.id,
    unit_code: asset.unit_code,
    allocation_method: "equal",
    allocation_pct: Number((100 / count).toFixed(4)),
    allocated_amount_cents: base + (index === 0 ? remainder : 0),
  }));
}

async function fetchAssets(companyId: string): Promise<AllocationAssetOption[]> {
  const params = new URLSearchParams({ operating_company_id: companyId, limit: "250" });
  const response = await fetch(resolveApiUrl(`/api/v1/assets?${params.toString()}`), { credentials: "include" });
  if (!response.ok) throw new Error(`asset list failed (${response.status})`);
  const payload = (await response.json()) as {
    assets?: Array<{ id: string; unit_code: string; insured_value_cents?: number | null }>;
  };
  return (payload.assets ?? []).map((row) => ({
    id: row.id,
    unit_code: row.unit_code,
    insured_value_cents: row.insured_value_cents,
  }));
}

async function allocateBill(
  companyId: string,
  billId: string,
  body: AllocateBillRequest
): Promise<AllocateBillResponse> {
  const params = new URLSearchParams({ operating_company_id: companyId });
  const response = await fetch(resolveApiUrl(`/api/v1/accounting/bills/${billId}/allocate?${params.toString()}`), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`allocate failed (${response.status})`);
  return (await response.json()) as AllocateBillResponse;
}

export function BillAllocationPanel({ companyId, billId, billLabel, billAmountCents }: Props) {
  const [assets, setAssets] = useState<AllocationAssetOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [method, setMethod] = useState<AllocationMethod>("equal");
  const [manualPct, setManualPct] = useState<Record<string, string>>({});
  const [miles, setMiles] = useState<Record<string, string>>({});
  const [previewRows, setPreviewRows] = useState<AllocationPreviewRow[]>([]);
  const [sourceMode, setSourceMode] = useState<"live" | "fallback">("live");
  const [isLoadingAssets, setIsLoadingAssets] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) {
      setAssets(FALLBACK_ASSETS);
      setSelectedIds(FALLBACK_ASSETS.map((row) => row.id));
      setSourceMode("fallback");
      return;
    }
    let cancelled = false;
    setIsLoadingAssets(true);
    fetchAssets(companyId)
      .then((rows) => {
        if (cancelled) return;
        const usable = rows.length ? rows : FALLBACK_ASSETS;
        setAssets(usable);
        setSelectedIds(usable.slice(0, 2).map((row) => row.id));
        setSourceMode(rows.length ? "live" : "fallback");
      })
      .catch(() => {
        if (cancelled) return;
        setAssets(FALLBACK_ASSETS);
        setSelectedIds(FALLBACK_ASSETS.map((row) => row.id));
        setSourceMode("fallback");
      })
      .finally(() => {
        if (!cancelled) setIsLoadingAssets(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const selectedAssets = useMemo(
    () => assets.filter((asset) => selectedIds.includes(asset.id)),
    [assets, selectedIds]
  );

  useEffect(() => {
    if (!selectedAssets.length || billAmountCents <= 0) {
      setPreviewRows([]);
      return;
    }
    if (sourceMode === "fallback" || method === "equal") {
      setPreviewRows(previewEqual(billAmountCents, selectedAssets));
      return;
    }
    setPreviewRows(previewEqual(billAmountCents, selectedAssets));
  }, [billAmountCents, method, selectedAssets, sourceMode]);

  function toggleAsset(assetId: string) {
    setSelectedIds((current) =>
      current.includes(assetId) ? current.filter((id) => id !== assetId) : [...current, assetId]
    );
  }

  async function onAllocate() {
    if (!companyId || !selectedIds.length) return;
    setIsSubmitting(true);
    setMessage(null);
    const body: AllocateBillRequest = {
      method,
      asset_ids: selectedIds,
    };
    if (method === "manual_pct") {
      body.manual_pcts = Object.fromEntries(
        selectedIds.map((id) => [id, Number(manualPct[id] ?? "0")])
      );
    }
    if (method === "by_miles") {
      body.miles = Object.fromEntries(selectedIds.map((id) => [id, Number(miles[id] ?? "0")]));
    }

    try {
      const response = await allocateBill(companyId, billId, body);
      const byId = new Map(assets.map((asset) => [asset.id, asset.unit_code]));
      setPreviewRows(
        response.rows.map((row) => ({
          ...row,
          unit_code: byId.get(row.asset_id) ?? row.asset_id.slice(0, 8),
        }))
      );
      setSourceMode("live");
      setMessage("Allocation saved.");
    } catch {
      setPreviewRows(previewEqual(billAmountCents, selectedAssets));
      setSourceMode("fallback");
      setMessage("Allocation service unavailable; showing a local preview only.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="space-y-3 rounded border border-gray-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Bill unit allocation</h3>
          <p className="text-xs text-gray-600">
            {billLabel} · total {money(billAmountCents)}
          </p>
        </div>
        <button
          type="button"
          className="rounded bg-[#1F2A44] px-3 py-1 text-sm font-medium text-white hover:bg-[#1F2A44] disabled:opacity-60"
          disabled={isSubmitting || !selectedIds.length}
          onClick={() => void onAllocate()}
        >
          {isSubmitting ? "Saving…" : "Save allocation"}
        </button>
      </div>

      {sourceMode === "fallback" ? (
        <p className="rounded border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-700">
          {OFFLINE_PREVIEW_BANNER}
        </p>
      ) : null}
      {message ? <p className="text-sm text-gray-700">{message}</p> : null}

      <AllocationMethodPicker value={method} onChange={setMethod} disabled={isSubmitting} />

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Assets</p>
        {isLoadingAssets ? <p className="text-sm text-gray-500">Loading assets…</p> : null}
        <div className="grid gap-2 md:grid-cols-2">
          {assets.map((asset) => (
            <label key={asset.id} className="flex items-center gap-2 rounded border border-gray-200 px-2 py-1 text-sm">
              <input
                type="checkbox"
                checked={selectedIds.includes(asset.id)}
                onChange={() => toggleAsset(asset.id)}
                disabled={isSubmitting}
              />
              <span className="font-medium text-gray-900">{asset.unit_code}</span>
              <span className="text-xs text-gray-500">
                insured {money(Number(asset.insured_value_cents ?? 0))}
              </span>
            </label>
          ))}
        </div>
      </div>

      {method === "manual_pct" ? (
        <div className="grid gap-2 md:grid-cols-2">
          {selectedAssets.map((asset) => (
            <label key={asset.id} className="text-xs font-semibold text-gray-600">
              {asset.unit_code} %
              <input
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm font-normal text-gray-900"
                value={manualPct[asset.id] ?? ""}
                onChange={(event) => setManualPct((current) => ({ ...current, [asset.id]: event.target.value }))}
              />
            </label>
          ))}
        </div>
      ) : null}

      {method === "by_miles" ? (
        <div className="grid gap-2 md:grid-cols-2">
          {selectedAssets.map((asset) => (
            <label key={asset.id} className="text-xs font-semibold text-gray-600">
              {asset.unit_code} miles
              <input
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm font-normal text-gray-900"
                value={miles[asset.id] ?? ""}
                onChange={(event) => setMiles((current) => ({ ...current, [asset.id]: event.target.value }))}
              />
            </label>
          ))}
        </div>
      ) : null}

      <AllocationPreviewTable rows={previewRows} totalCents={billAmountCents} isLoading={isSubmitting} />
    </section>
  );
}
