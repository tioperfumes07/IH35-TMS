import type { ReactNode } from "react";

/**
 * V3 Accounting list KPI tile (Bills / Multiple bills grammar).
 * CLS-MONEY-KPI-FAKE-ZERO: callers must pass "—" / "Error loading" when the query failed —
 * never fabricate $0.00 from an empty default.
 */
export function moneyListKpiCard(
  label: string,
  value: string,
  sublabel: string,
  tone: "neutral" | "warn" | "danger" = "neutral",
): ReactNode {
  const toneClass =
    tone === "danger" ? "border-l-4 border-l-red-500" : tone === "warn" ? "border-l-4 border-l-[#6B7280]" : "border-l-4 border-l-[#E5E7EB]";
  return (
    <div className={`rounded-sm border border-gray-200 bg-white px-3 py-2 ${toneClass}`}>
      <p className="text-section-header font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-page-title font-semibold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500">{sublabel}</p>
    </div>
  );
}
