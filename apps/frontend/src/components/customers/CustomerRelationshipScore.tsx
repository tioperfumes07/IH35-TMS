import type { CustomerRelationshipScore } from "../../api/mdata";

type Props = {
  score: CustomerRelationshipScore | null | undefined;
  loading?: boolean;
  error?: string | null;
};

function tierLabel(tier: CustomerRelationshipScore["health_tier"] | null | undefined) {
  if (!tier) return "Unknown";
  if (tier === "at_risk") return "At Risk";
  if (tier === "thriving") return "Thriving";
  if (tier === "healthy") return "Healthy";
  return "Watch";
}

function tierClass(tier: CustomerRelationshipScore["health_tier"] | null | undefined) {
  if (tier === "thriving") return "bg-emerald-100 text-emerald-800";
  if (tier === "healthy") return "bg-teal-100 text-teal-800";
  if (tier === "watch") return "bg-amber-100 text-amber-800";
  if (tier === "at_risk") return "bg-red-100 text-red-800";
  return "bg-gray-100 text-gray-700";
}

function subscoreValue(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return value.toFixed(1);
}

export function CustomerRelationshipScore({ score, loading = false, error = null }: Props) {
  return (
    <section className="rounded border border-gray-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Relationship Health</h3>
        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${tierClass(score?.health_tier)}`}>
          {tierLabel(score?.health_tier)}
        </span>
      </div>

      {loading ? <p className="text-xs text-gray-500">Loading relationship score...</p> : null}
      {!loading && error ? <p className="text-xs text-red-600">{error}</p> : null}

      {!loading && !error ? (
        <>
          <div className="mb-2 flex items-end gap-2">
            <p className="text-2xl font-semibold text-gray-900">
              {typeof score?.overall_health_score === "number" ? score.overall_health_score.toFixed(1) : "—"}
            </p>
            <span className="pb-1 text-xs text-gray-500">/ 100</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded border border-gray-100 bg-gray-50 px-2 py-1">
              <span className="text-gray-500">Engagement</span>
              <p className="font-semibold text-gray-900">{subscoreValue(score?.engagement_subscore)}</p>
            </div>
            <div className="rounded border border-gray-100 bg-gray-50 px-2 py-1">
              <span className="text-gray-500">Payment</span>
              <p className="font-semibold text-gray-900">{subscoreValue(score?.payment_behavior_subscore)}</p>
            </div>
            <div className="rounded border border-gray-100 bg-gray-50 px-2 py-1">
              <span className="text-gray-500">Service</span>
              <p className="font-semibold text-gray-900">{subscoreValue(score?.service_quality_subscore)}</p>
            </div>
            <div className="rounded border border-gray-100 bg-gray-50 px-2 py-1">
              <span className="text-gray-500">Margin Trend</span>
              <p className="font-semibold text-gray-900">{subscoreValue(score?.margin_trend_subscore)}</p>
            </div>
            <div className="rounded border border-gray-100 bg-gray-50 px-2 py-1 col-span-2">
              <span className="text-gray-500">Complaints</span>
              <p className="font-semibold text-gray-900">{subscoreValue(score?.complaint_subscore)}</p>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
