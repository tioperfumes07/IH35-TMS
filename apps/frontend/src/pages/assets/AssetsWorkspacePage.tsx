import { useCallback, useEffect, useMemo, useState } from "react";
import { resolveApiUrl } from "../../api/client";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader";
import { ListErrorState } from "../../components/ListErrorState";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AssetFiltersBar } from "../../components/assets/AssetFiltersBar";
import { AssetListTable } from "../../components/assets/AssetListTable";
import { AssetSummaryCards } from "../../components/assets/AssetSummaryCards";
import type { AssetKind, AssetLifecycle, AssetRow, AssetSummary } from "../../components/assets/types";

const EMPTY_SUMMARY: AssetSummary = {
  total_assets: 0,
  active_assets: 0,
  maintenance_assets: 0,
  out_of_service_assets: 0,
};

type BackendAsset = {
  id: string;
  unit_code?: string | null;
  asset_type?: string | null;
  vin?: string | null;
  status?: string | null;
};

type FetchError = Error & { status?: number };

function mapKind(assetType: string | null | undefined): AssetKind {
  if (assetType === "tractor") return "tractor";
  if (assetType === "dry_van" || assetType === "reefer" || assetType === "flatbed") return "trailer";
  return "other";
}

function mapLifecycle(status: string | null | undefined): AssetLifecycle {
  if (status === "sold" || status === "retired") return "out_of_service";
  if (status === "in_repair" || status === "damaged") return "maintenance";
  return "active";
}

function mapBackendAsset(row: BackendAsset): AssetRow {
  return {
    id: row.id,
    unit_number: row.unit_code?.trim() || row.id.slice(0, 8),
    vin: row.vin ?? null,
    kind: mapKind(row.asset_type),
    lifecycle: mapLifecycle(row.status),
    assigned_driver_name: null,
    assigned_load_display: null,
    location_label: null,
    utilization_score: null,
  };
}

function summarize(rows: AssetRow[]): AssetSummary {
  return {
    total_assets: rows.length,
    active_assets: rows.filter((row) => row.lifecycle === "active").length,
    maintenance_assets: rows.filter((row) => row.lifecycle === "maintenance").length,
    out_of_service_assets: rows.filter((row) => row.lifecycle === "out_of_service").length,
  };
}

async function fetchAssetRows(companyId: string): Promise<AssetRow[]> {
  // Real list route is GET /api/v1/assets (max limit 200).
  const params = new URLSearchParams({ operating_company_id: companyId, limit: "200" });
  const response = await fetch(resolveApiUrl(`/api/v1/assets?${params.toString()}`), { credentials: "include" });
  if (!response.ok) {
    const err: FetchError = new Error(`asset list request failed (${response.status})`);
    err.status = response.status;
    throw err;
  }
  const payload = (await response.json()) as { assets?: BackendAsset[] };
  return (payload.assets ?? []).map(mapBackendAsset);
}

export function AssetsWorkspacePage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [rows, setRows] = useState<AssetRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<FetchError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [lifecycle, setLifecycle] = useState<AssetLifecycle | "all">("all");
  const [search, setSearch] = useState("");

  const retry = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    if (!companyId) {
      setRows([]);
      setLoadError(null);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);
    fetchAssetRows(companyId)
      .then((liveRows) => {
        if (cancelled) return;
        setRows(liveRows);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setRows([]);
        setLoadError(err instanceof Error ? (err as FetchError) : new Error(String(err)));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, reloadToken]);

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (lifecycle !== "all" && row.lifecycle !== lifecycle) return false;
      if (!query) return true;
      const haystack = [
        row.unit_number,
        row.vin || "",
        row.assigned_driver_name || "",
        row.location_label || "",
        row.assigned_load_display || "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [rows, lifecycle, search]);

  const summary = useMemo(() => summarize(rows), [rows]);

  return (
    <div className="space-y-3">
      <PageHeader
        title="Assets"
        subtitle="Asset lifecycle visibility across fleet units."
        actions={
          <div className="flex items-center gap-2">
            <Link
              to="/maintenance/vehicles"
              className="rounded-sm border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-800 hover:bg-gray-50"
            >
              Open Vehicle Master Data
            </Link>
          </div>
        }
      />

      {!companyId ? (
        <p className="rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Select an operating company to load assets.
        </p>
      ) : null}

      {loadError ? (
        <ListErrorState
          title="Couldn't load assets"
          status={loadError.status ?? 0}
          message={loadError.message}
          onRetry={retry}
        />
      ) : (
        <>
          <AssetSummaryCards summary={rows.length ? summary : EMPTY_SUMMARY} />
          <AssetFiltersBar lifecycle={lifecycle} search={search} onLifecycleChange={setLifecycle} onSearchChange={setSearch} />
          <AssetListTable rows={visibleRows} isLoading={isLoading} />
        </>
      )}
    </div>
  );
}
