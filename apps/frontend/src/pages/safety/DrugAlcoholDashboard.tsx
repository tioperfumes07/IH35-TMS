import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompanyContext } from "../../contexts/CompanyContext";

type AnnualRateStatus = {
  year: number;
  pool_size: number;
  drug_tests_completed: number;
  alcohol_tests_completed: number;
  drug_rate_pct: number;
  alcohol_rate_pct: number;
  drug_minimum_pct: number;
  alcohol_minimum_pct: number;
  drug_on_track: boolean;
  alcohol_on_track: boolean;
};

async function apiGet(path: string) {
  const res = await fetch(path, { credentials: "include" });
  if (!res.ok) throw new Error(`request_failed_${res.status}`);
  return res.json();
}

async function apiPost(path: string, body?: unknown) {
  const res = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`request_failed_${res.status}`);
  return res.json();
}

function currentQuarter() {
  return Math.floor(new Date().getUTCMonth() / 3) + 1;
}

export function DrugAlcoholDashboard() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const year = new Date().getUTCFullYear();
  const queryClient = useQueryClient();

  const rateQ = useQuery({
    queryKey: ["compliance", "drug-alcohol", "annual-rate", companyId, year],
    enabled: Boolean(companyId),
    queryFn: () =>
      apiGet(
        `/api/v1/compliance/drug-alcohol/annual-rate-status?operating_company_id=${encodeURIComponent(companyId)}&year=${year}`
      ) as Promise<AnnualRateStatus>,
  });

  const poolQ = useQuery({
    queryKey: ["compliance", "drug-alcohol", "pool", companyId],
    enabled: Boolean(companyId),
    queryFn: () => apiGet(`/api/v1/compliance/drug-alcohol/pool?operating_company_id=${encodeURIComponent(companyId)}`),
  });

  const rtdQ = useQuery({
    queryKey: ["compliance", "drug-alcohol", "rtd", companyId],
    enabled: Boolean(companyId),
    queryFn: () => apiGet(`/api/v1/compliance/drug-alcohol/rtd?operating_company_id=${encodeURIComponent(companyId)}`),
  });

  const drawMutation = useMutation({
    mutationFn: () =>
      apiPost("/api/v1/compliance/drug-alcohol/draws/run", {
        operating_company_id: companyId,
        year,
        quarter: currentQuarter(),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["compliance", "drug-alcohol"] });
    },
  });

  const rate = rateQ.data;
  const poolSize = rate?.pool_size ?? (poolQ.data as { members?: unknown[] })?.members?.length ?? 0;
  const openRtd = ((rtdQ.data as { processes?: unknown[] })?.processes ?? []).length;

  if (!companyId) {
    return <p className="text-xs text-slate-600">Select an operating company.</p>;
  }

  return (
    <div className="space-y-3 rounded border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">FMCSA annual rate compliance ({year})</h2>
        <button
          type="button"
          disabled={drawMutation.isPending}
          className="rounded bg-slate-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
          onClick={() => drawMutation.mutate()}
        >
          Run Q{currentQuarter()} random draw
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded border border-white bg-white p-3 text-xs">
          <div className="text-slate-500">Pool size</div>
          <div className="mt-1 text-lg font-semibold">{poolSize}</div>
        </div>
        <div className="rounded border border-white bg-white p-3 text-xs">
          <div className="text-slate-500">Drug rate</div>
          <div className="mt-1 text-lg font-semibold">
            {rate?.drug_rate_pct ?? 0}%{" "}
            <span className={rate?.drug_on_track ? "text-emerald-700" : "text-amber-700"}>
              (min {rate?.drug_minimum_pct ?? 50}%)
            </span>
          </div>
        </div>
        <div className="rounded border border-white bg-white p-3 text-xs">
          <div className="text-slate-500">Alcohol rate</div>
          <div className="mt-1 text-lg font-semibold">
            {rate?.alcohol_rate_pct ?? 0}%{" "}
            <span className={rate?.alcohol_on_track ? "text-emerald-700" : "text-amber-700"}>
              (min {rate?.alcohol_minimum_pct ?? 10}%)
            </span>
          </div>
        </div>
        <div className="rounded border border-white bg-white p-3 text-xs">
          <div className="text-slate-500">Open RTD processes</div>
          <div className="mt-1 text-lg font-semibold">{openRtd}</div>
        </div>
      </div>
    </div>
  );
}
