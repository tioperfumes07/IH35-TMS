import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { useAuth } from "../../auth/useAuth";
import { useCompanyContext } from "../../contexts/CompanyContext";

type BasicCategory =
  | "unsafe_driving"
  | "hos_compliance"
  | "driver_fitness"
  | "controlled_substances_alcohol"
  | "vehicle_maintenance"
  | "hazmat_compliance"
  | "crash_indicator";

type BasicTile = {
  basic_category: BasicCategory;
  label: string;
  latest_score: number | null;
  latest_percentile: number | null;
  threshold: number;
  latest_alert_status: "yes" | "no" | "inconclusive";
  projected_score_30d: number | null;
  slope_per_day: number;
  trending_toward_alert: boolean;
  risk_band: "ok" | "watch" | "alert" | "unknown";
};

type TrendPoint = {
  snapshot_date: string;
  score: number | null;
};

type CurrentResponse = {
  snapshot_date: string | null;
  pulled_at: string | null;
  pull_age_days: number | null;
  is_stale: boolean;
  basics: BasicTile[];
};

type TrendResponse = {
  basic: BasicCategory;
  history: TrendPoint[];
};

const BASIC_ORDER: BasicCategory[] = [
  "unsafe_driving",
  "hos_compliance",
  "driver_fitness",
  "controlled_substances_alcohol",
  "vehicle_maintenance",
  "hazmat_compliance",
  "crash_indicator",
];

function formatScore(value: number | null) {
  return value == null ? "-" : value.toFixed(2);
}

function bandClassName(band: BasicTile["risk_band"]) {
  if (band === "alert") return "text-red-700";
  if (band === "watch") return "text-amber-700";
  if (band === "ok") return "text-emerald-700";
  return "text-slate-500";
}

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return <div className="h-8 text-[10px] text-slate-400">No trend yet</div>;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const coordinates = points
    .map((value, idx) => {
      const x = (idx / (points.length - 1)) * 100;
      const y = 100 - ((value - min) / span) * 100;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox="0 0 100 100" className="h-8 w-full">
      <polyline points={coordinates} fill="none" stroke="currentColor" strokeWidth="6" className="text-slate-500" />
    </svg>
  );
}

async function fetchCurrent(companyId: string) {
  return apiRequest<CurrentResponse>(`/api/v1/compliance/csa/current?operating_company_id=${encodeURIComponent(companyId)}`);
}

async function fetchTrend(companyId: string, basic: BasicCategory) {
  return apiRequest<TrendResponse>(
    `/api/v1/compliance/csa/trend?operating_company_id=${encodeURIComponent(companyId)}&basic=${encodeURIComponent(basic)}`
  );
}

async function pullNow(companyId: string) {
  return apiRequest<{ row_count: number; snapshot_date: string }>("/api/v1/compliance/csa/pull-now", {
    method: "POST",
    body: { operating_company_id: companyId },
  });
}

export function CSAScorePage() {
  const { selectedCompanyId } = useCompanyContext();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const companyId = selectedCompanyId ?? "";
  const canPull = ["Owner", "Administrator", "Manager", "Safety"].includes(String(auth.user?.role ?? ""));

  const currentQuery = useQuery({
    queryKey: ["compliance-csa", "current", companyId],
    queryFn: () => fetchCurrent(companyId),
    enabled: Boolean(companyId),
  });

  const trendsQuery = useQuery({
    queryKey: ["compliance-csa", "trends", companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const entries = await Promise.all(
        BASIC_ORDER.map(async (basic) => {
          const trend = await fetchTrend(companyId, basic);
          return [basic, trend.history] as const;
        })
      );
      return Object.fromEntries(entries) as Record<BasicCategory, TrendPoint[]>;
    },
  });

  const pullMutation = useMutation({
    mutationFn: () => pullNow(companyId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["compliance-csa", "current", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["compliance-csa", "trends", companyId] });
    },
  });

  const tiles = useMemo(() => {
    const source = currentQuery.data?.basics ?? [];
    const byCategory = new Map<BasicCategory, BasicTile>();
    for (const tile of source) byCategory.set(tile.basic_category, tile);
    return BASIC_ORDER.map((category) => byCategory.get(category)).filter((tile): tile is BasicTile => Boolean(tile));
  }, [currentQuery.data?.basics]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-200 bg-white p-3 text-xs">
        <div className="space-y-1">
          <div className="text-sm font-semibold text-slate-800">CSA BASIC Score</div>
          <div className="text-slate-600">
            Last pull {currentQuery.data?.pulled_at ? new Date(currentQuery.data.pulled_at).toLocaleString() : "not available"}
            {typeof currentQuery.data?.pull_age_days === "number" ? ` (${currentQuery.data.pull_age_days} days ago)` : ""}
          </div>
          {currentQuery.data?.is_stale ? (
            <div className="font-semibold text-amber-700">CSA pull is stale (&gt;7 days). Run pull now and check cron.</div>
          ) : null}
        </div>
        <button
          type="button"
          className="rounded border border-slate-300 px-3 py-1 font-semibold text-slate-700 disabled:opacity-60"
          onClick={() => pullMutation.mutate()}
          disabled={!companyId || pullMutation.isPending || !canPull}
        >
          Pull from FMCSA SAFER
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {tiles.map((tile) => {
          const trend = trendsQuery.data?.[tile.basic_category] ?? [];
          const sparklinePoints = trend
            .map((point) => (point.score == null ? null : Number(point.score)))
            .filter((value): value is number => Number.isFinite(value));
          return (
            <div key={tile.basic_category} className="rounded border border-gray-200 bg-white p-3">
              <div className="flex items-center justify-between text-xs">
                <div className="font-semibold text-slate-700">{tile.label}</div>
                <div className={`font-semibold ${bandClassName(tile.risk_band)}`}>{tile.risk_band.toUpperCase()}</div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                <div>
                  <div>Score</div>
                  <div className="text-sm font-semibold text-slate-800">{formatScore(tile.latest_score)}</div>
                </div>
                <div>
                  <div>Percentile</div>
                  <div className="text-sm font-semibold text-slate-800">{formatScore(tile.latest_percentile)}</div>
                </div>
                <div>
                  <div>Threshold</div>
                  <div className="font-semibold text-slate-800">{tile.threshold.toFixed(0)}</div>
                </div>
                <div>
                  <div>Projected 30d</div>
                  <div className={`font-semibold ${bandClassName(tile.risk_band)}`}>{formatScore(tile.projected_score_30d)}</div>
                </div>
              </div>
              <div className="mt-2 text-[10px] text-slate-500">
                Alert status: {tile.latest_alert_status} · Trending toward alert: {tile.trending_toward_alert ? "yes" : "no"}
              </div>
              <div className="mt-2 rounded bg-slate-50 p-1 text-slate-600">
                <Sparkline points={sparklinePoints} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default CSAScorePage;
