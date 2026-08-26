import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { resolveApiUrl } from "../../api/client";
import { userFacingApiError } from "../../lib/api-error-message";
import { ListErrorState } from "../../components/ListErrorState";

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

// SAF-F06: these page-local helpers called bare fetch(path), so with
// VITE_API_BASE_URL set and NO /api rewrite on the static site the request hit
// app.ih35dispatch.com and got index.html back with HTTP 200 — res.ok was true, the
// !res.ok guard never fired, and res.json() threw on HTML. Every load failed silently
// and rendered as empty data. resolveApiUrl() is the shared client's URL resolver.
async function apiGet(path: string) {
  const res = await fetch(resolveApiUrl(path), { credentials: "include" });
  if (!res.ok) throw new Error(`request_failed_${res.status}`);
  return res.json();
}

async function apiPost(path: string, body?: unknown) {
  const res = await fetch(resolveApiUrl(path), {
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
  const companyGenerationRef = useRef(0);

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
    mutationFn: (input: { companyId: string; generation: number; year: number; quarter: number }) =>
      apiPost("/api/v1/compliance/drug-alcohol/draws/run", {
        operating_company_id: input.companyId,
        year: input.year,
        quarter: input.quarter,
      }),
    onSuccess: async (_result, input) => {
      if (input.generation !== companyGenerationRef.current) return;
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["compliance", "drug-alcohol", "annual-rate", input.companyId, input.year],
        }),
        queryClient.invalidateQueries({ queryKey: ["compliance", "drug-alcohol", "pool", input.companyId] }),
        queryClient.invalidateQueries({ queryKey: ["compliance", "drug-alcohol", "rtd", input.companyId] }),
      ]);
    },
  });

  useEffect(() => {
    companyGenerationRef.current += 1;
    drawMutation.reset();
  }, [companyId]);

  const rate = rateQ.data;
  const poolSize = rate?.pool_size ?? (poolQ.data as { members?: unknown[] })?.members?.length ?? 0;
  const openRtd = ((rtdQ.data as { processes?: unknown[] })?.processes ?? []).length;
  const retryFailedDashboardQueries = async () => {
    await Promise.all([
      rateQ.isError ? rateQ.refetch() : Promise.resolve(),
      poolQ.isError ? poolQ.refetch() : Promise.resolve(),
      rtdQ.isError ? rtdQ.refetch() : Promise.resolve(),
    ]);
  };

  if (!companyId) {
    return <p className="text-xs text-slate-600">Select an operating company.</p>;
  }

  return (
    <section className="space-y-3" data-testid="drug-alcohol-dashboard">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">FMCSA annual rate compliance ({year})</h2>
        <button
          type="button"
          disabled={drawMutation.isPending}
          className="rounded-sm bg-[#1f2a44] px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
          onClick={() =>
            drawMutation.mutate({
              companyId,
              generation: companyGenerationRef.current,
              year,
              quarter: currentQuarter(),
            })
          }
        >
          Run Q{currentQuarter()} random draw
        </button>
      </div>
      {drawMutation.isError && drawMutation.variables?.generation === companyGenerationRef.current ? (
        <p className="text-xs text-red-700" data-testid="drug-alcohol-dashboard-draw-error">
          {userFacingApiError(drawMutation.error, "Could not run the random drug/alcohol draw.")}
        </p>
      ) : null}
      {rateQ.isError || poolQ.isError || rtdQ.isError ? (
        <div data-testid="drug-alcohol-dashboard-query-error">
          <ListErrorState
            title="Couldn't load drug/alcohol compliance status"
            status={0}
            message={userFacingApiError(rateQ.error ?? poolQ.error ?? rtdQ.error, "Could not load drug/alcohol compliance rates.")}
            onRetry={() => void retryFailedDashboardQueries()}
            className="py-4"
          />
        </div>
      ) : null}

      {/* Flat KPI grid — each tile is its own single frame; no outer bordered card (CLS-BOX-IN-BOX). */}
      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-sm border border-gray-200 bg-white p-3 text-xs">
          <div className="text-slate-500">Pool size</div>
          <div className="mt-1 text-lg font-semibold">{rateQ.isError || poolQ.isError ? "—" : poolSize}</div>
        </div>
        <div className="rounded-sm border border-gray-200 bg-white p-3 text-xs">
          <div className="text-slate-500">Drug rate</div>
          <div className="mt-1 text-lg font-semibold">
            {rateQ.isError ? "—" : `${rate?.drug_rate_pct ?? 0}%`}{" "}
            {!rateQ.isError ? (
              <span className={rate?.drug_on_track ? "text-slate-700" : "text-slate-700"}>
                (min {rate?.drug_minimum_pct ?? 50}%)
              </span>
            ) : null}
          </div>
        </div>
        <div className="rounded-sm border border-gray-200 bg-white p-3 text-xs">
          <div className="text-slate-500">Alcohol rate</div>
          <div className="mt-1 text-lg font-semibold">
            {rateQ.isError ? "—" : `${rate?.alcohol_rate_pct ?? 0}%`}{" "}
            {!rateQ.isError ? (
              <span className={rate?.alcohol_on_track ? "text-slate-700" : "text-slate-700"}>
                (min {rate?.alcohol_minimum_pct ?? 10}%)
              </span>
            ) : null}
          </div>
        </div>
        <div className="rounded-sm border border-gray-200 bg-white p-3 text-xs">
          <div className="text-slate-500">Open RTD processes</div>
          <div className="mt-1 text-lg font-semibold">{rtdQ.isError ? "—" : openRtd}</div>
        </div>
      </div>
    </section>
  );
}
