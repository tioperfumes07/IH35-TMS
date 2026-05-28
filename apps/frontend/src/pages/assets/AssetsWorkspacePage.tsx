import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AssetFiltersBar } from "../../components/assets/AssetFiltersBar";
import { AssetListTable } from "../../components/assets/AssetListTable";
import { AssetSummaryCards } from "../../components/assets/AssetSummaryCards";
import type { AssetLifecycle, AssetRow, AssetSummary } from "../../components/assets/types";

const FALLBACK_ROWS: AssetRow[] = [
  {
    id: "asset-demo-tractor-1",
    unit_number: "TRK-112",
    vin: "1FTRX18W3XNA12345",
    kind: "tractor",
    lifecycle: "active",
    assigned_driver_name: "J. Salinas",
    assigned_load_display: "LD-20414",
    location_label: "Dallas, TX",
    utilization_score: 91,
  },
  {
    id: "asset-demo-trailer-1",
    unit_number: "TRL-533",
    vin: "5TDAA1AA3XS000533",
    kind: "trailer",
    lifecycle: "maintenance",
    assigned_driver_name: null,
    assigned_load_display: null,
    location_label: "Shop A · Laredo",
    utilization_score: 48,
  },
];

const EMPTY_SUMMARY: AssetSummary = {
  total_assets: 0,
  active_assets: 0,
  maintenance_assets: 0,
  out_of_service_assets: 0,
};

function summarize(rows: AssetRow[]): AssetSummary {
  return {
    total_assets: rows.length,
    active_assets: rows.filter((row) => row.lifecycle === "active").length,
    maintenance_assets: rows.filter((row) => row.lifecycle === "maintenance").length,
    out_of_service_assets: rows.filter((row) => row.lifecycle === "out_of_service").length,
  };
}

async function fetchAssetRows(companyId: string): Promise<AssetRow[]> {
  const params = new URLSearchParams({ operating_company_id: companyId, limit: "250" });
  const response = await fetch(`/api/v1/assets/list?${params.toString()}`, { credentials: "include" });
  if (!response.ok) throw new Error(`asset list request failed (${response.status})`);
  const payload = (await response.json()) as { rows?: AssetRow[] };
  return payload.rows ?? [];
}

export function AssetsWorkspacePage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [rows, setRows] = useState<AssetRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sourceMode, setSourceMode] = useState<"live" | "fallback">("live");
  const [lifecycle, setLifecycle] = useState<AssetLifecycle | "all">("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!companyId) {
      setRows([]);
      setSourceMode("fallback");
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    fetchAssetRows(companyId)
      .then((liveRows) => {
        if (cancelled) return;
        setRows(liveRows);
        setSourceMode("live");
      })
      .catch(() => {
        if (cancelled) return;
        setRows(FALLBACK_ROWS);
        setSourceMode("fallback");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

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
        subtitle="Asset lifecycle visibility with fallback stubs until endpoint contracts are merged."
        actions={
          <div className="flex items-center gap-2">
            <Link
              to="/maintenance/vehicles"
              className="rounded border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-800 hover:bg-gray-50"
            >
              Open Vehicle Master Data
            </Link>
          </div>
        }
      />

      {!companyId ? (
        <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Select an operating company to load assets.
        </p>
      ) : null}

      {sourceMode === "fallback" ? (
        <p className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
          Contract stub mode: asset endpoint unavailable, showing deterministic local rows.
        </p>
      ) : null}

      <AssetSummaryCards summary={rows.length ? summary : EMPTY_SUMMARY} />
      <AssetFiltersBar lifecycle={lifecycle} search={search} onLifecycleChange={setLifecycle} onSearchChange={setSearch} />
      <AssetListTable rows={visibleRows} isLoading={isLoading} />
    </div>
  );
}
