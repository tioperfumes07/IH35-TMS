/**
 * GAP-49 — DVIR severity badge.
 *
 * Renders a major / minor / observation severity pill used by the pre-flight
 * DVIR queue, the work-order detail page, and the dispatch board.  Major is the
 * dispatch-blocking class (49 CFR §396.11).
 */

export type DvirSeverityValue = "major" | "minor" | "observation" | string;

const STYLES: Record<string, { className: string; label: string }> = {
  major: { className: "bg-red-100 text-red-800 border-red-300", label: "Major" },
  minor: { className: "bg-amber-100 text-amber-800 border-amber-300", label: "Minor" },
  observation: { className: "bg-slate-100 text-slate-700 border-slate-300", label: "Observation" },
};

export function DvirSeverityBadge({
  severity,
  className = "",
}: {
  severity: DvirSeverityValue | null | undefined;
  className?: string;
}) {
  const key = String(severity ?? "").toLowerCase();
  const style = STYLES[key] ?? { className: "bg-gray-100 text-gray-600 border-gray-300", label: severity ? String(severity) : "—" };
  return (
    <span
      data-testid="dvir-severity-badge"
      data-severity={key || "unknown"}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${style.className} ${className}`}
    >
      {style.label}
    </span>
  );
}
