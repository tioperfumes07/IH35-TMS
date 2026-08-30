import type { CustomerRelationshipScore } from "../../api/mdata";
import { ListErrorState } from "../ListErrorState";

type Props = {
  score: CustomerRelationshipScore | null | undefined;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
};

// CUST-01 C3(b): with every subscore null (a brand-new customer with no history), the backend
// weighted average legitimately returns 0 (nothing to weight), and 0 maps to "at_risk" --
// printing "0.0/100, At Risk" in red on a customer we simply have no data about yet. That is a
// false, factually-unsupported accusation, not a real risk signal. Detect the "zero signal" case
// client-side (every subscore is null, not one of them being a real 0) and label it honestly
// instead of asserting a tier -- no backend/schema change needed, all 5 subscores already ship
// in the response.
function hasAnyData(score: CustomerRelationshipScore | null | undefined) {
  if (!score) return false;
  return (
    typeof score.engagement_subscore === "number" ||
    typeof score.payment_behavior_subscore === "number" ||
    typeof score.service_quality_subscore === "number" ||
    typeof score.margin_trend_subscore === "number" ||
    typeof score.complaint_subscore === "number"
  );
}

function tierLabel(tier: CustomerRelationshipScore["health_tier"] | null | undefined, unavailable = false, noData = false) {
  if (unavailable) return "Unavailable";
  if (noData) return "No data yet";
  if (!tier) return "Unknown";
  if (tier === "at_risk") return "At Risk";
  if (tier === "thriving") return "Thriving";
  if (tier === "healthy") return "Healthy";
  return "Watch";
}

function tierClass(tier: CustomerRelationshipScore["health_tier"] | null | undefined, unavailable = false, noData = false) {
  if (unavailable || noData) return "bg-slate-100 text-slate-700";
  if (tier === "thriving") return "bg-slate-100 text-slate-700";
  if (tier === "healthy") return "bg-teal-100 text-teal-800";
  if (tier === "watch") return "bg-slate-100 text-slate-700";
  if (tier === "at_risk") return "bg-red-100 text-red-800";
  return "bg-gray-100 text-gray-700";
}

function subscoreValue(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return Number(value).toFixed(1);
}

export function CustomerRelationshipScore({ score, loading = false, error = null, onRetry }: Props) {
  const noData = !loading && !error && !hasAnyData(score);
  return (
    <section className="rounded-sm border border-gray-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Relationship Health</h3>
        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${tierClass(score?.health_tier, Boolean(error), noData)}`}>
          {tierLabel(score?.health_tier, Boolean(error), noData)}
        </span>
      </div>

      {loading ? <p className="text-xs text-gray-500">Loading relationship score...</p> : null}
      {!loading && error && onRetry ? <ListErrorState status={0} message={error} onRetry={onRetry} /> : null}
      {noData ? <p className="text-xs text-gray-500">Not enough activity yet to score this customer.</p> : null}

      {!loading && !error && !noData ? (
        <>
          <div className="mb-2 flex items-end gap-2">
            <p className="text-2xl font-semibold text-gray-900">
              {typeof score?.overall_health_score === "number" ? score.overall_health_score.toFixed(1) : "—"}
            </p>
            <span className="pb-1 text-xs text-gray-500">/ 100</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-sm border border-gray-100 bg-gray-50 px-2 py-1">
              <span className="text-gray-500">Engagement</span>
              <p className="font-semibold text-gray-900">{subscoreValue(score?.engagement_subscore)}</p>
            </div>
            <div className="rounded-sm border border-gray-100 bg-gray-50 px-2 py-1">
              <span className="text-gray-500">Payment</span>
              <p className="font-semibold text-gray-900">{subscoreValue(score?.payment_behavior_subscore)}</p>
            </div>
            <div className="rounded-sm border border-gray-100 bg-gray-50 px-2 py-1">
              <span className="text-gray-500">Service</span>
              <p className="font-semibold text-gray-900">{subscoreValue(score?.service_quality_subscore)}</p>
            </div>
            <div className="rounded-sm border border-gray-100 bg-gray-50 px-2 py-1">
              <span className="text-gray-500">Margin Trend</span>
              <p className="font-semibold text-gray-900">{subscoreValue(score?.margin_trend_subscore)}</p>
            </div>
            <div className="rounded-sm border border-gray-100 bg-gray-50 px-2 py-1 col-span-2">
              <span className="text-gray-500">Complaints</span>
              <p className="font-semibold text-gray-900">{subscoreValue(score?.complaint_subscore)}</p>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
