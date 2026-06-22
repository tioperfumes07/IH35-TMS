import { Link } from "react-router-dom";
import type { HomeVendorMappingIntegrity } from "../../api/home";
import { Button } from "../Button";

type Props = {
  data?: HomeVendorMappingIntegrity;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
};

function pillClass(status: "green" | "yellow" | "red") {
  if (status === "green") return "border-emerald-300 bg-emerald-50 text-emerald-700";
  if (status === "yellow") return "border-amber-300 bg-amber-50 text-amber-700";
  return "border-red-300 bg-red-50 text-red-700";
}

function statusLabel(status: "green" | "yellow" | "red") {
  if (status === "green") return "Healthy";
  if (status === "yellow") return "Warning";
  return "Critical";
}

export function VendorMappingIntegrityCard({ data, isLoading, isError, onRetry }: Props) {
  if (isLoading) {
    return (
      <section className="rounded border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900">Vendor Mapping Integrity</div>
        <div className="space-y-2 p-3">
          <div className="h-6 animate-pulse rounded bg-slate-100" />
          <div className="h-6 animate-pulse rounded bg-slate-100" />
          <div className="h-6 animate-pulse rounded bg-slate-100" />
        </div>
      </section>
    );
  }

  if (isError) {
    return (
      <section className="rounded border border-red-200 bg-red-50">
        <div className="border-b border-red-200 px-3 py-2 text-sm font-semibold text-red-900">Vendor Mapping Integrity</div>
        <div className="flex items-center justify-between px-3 py-3 text-sm text-red-800">
          <span>Failed to load mapping integrity.</span>
          <Button variant="secondary" onClick={onRetry}>
            Refresh
          </Button>
        </div>
      </section>
    );
  }

  const status = data?.status ?? "green";
  const totals = data?.totals ?? {
    unmapped_drivers: 0,
    duplicate_mapping: 0,
    name_mismatch: 0,
    major_drift: 0,
    total_issues: 0,
  };

  return (
    <section className="rounded border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <div className="text-sm font-semibold text-slate-900">Vendor Mapping Integrity</div>
        <span className={`inline-flex rounded border px-2 py-0.5 text-[11px] font-semibold ${pillClass(status)}`}>{statusLabel(status)}</span>
      </div>
      <div className="space-y-1 px-3 py-2">
        <div className="flex items-center justify-between rounded bg-slate-50 px-2 py-1.5 text-xs">
          <span className="text-slate-600">Total issues</span>
          <span className="font-semibold text-slate-800">{totals.total_issues}</span>
        </div>
        <div className="flex items-center justify-between rounded bg-slate-50 px-2 py-1.5 text-xs">
          <span className="text-slate-600">Unmapped drivers</span>
          <span className="font-semibold text-slate-800">{totals.unmapped_drivers}</span>
        </div>
        <div className="flex items-center justify-between rounded bg-slate-50 px-2 py-1.5 text-xs">
          <span className="text-slate-600">Duplicate mappings</span>
          <span className="font-semibold text-slate-800">{totals.duplicate_mapping}</span>
        </div>
        <div className="flex items-center justify-between rounded bg-slate-50 px-2 py-1.5 text-xs">
          <span className="text-slate-600">Name drift</span>
          <span className="font-semibold text-slate-800">{totals.name_mismatch}</span>
        </div>
      </div>
      <div className="border-t border-slate-100 px-3 py-2">
        <Link className="text-xs font-medium text-slate-700 hover:underline" to="/samsara/vendor-mapping-integrity">
          Open mapping integrity details
        </Link>
      </div>
    </section>
  );
}
