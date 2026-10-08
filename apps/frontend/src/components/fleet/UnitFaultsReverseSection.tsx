import { Link } from "react-router-dom";

type Props = {
  unitId: string;
  activeFaultCount: number;
  pendingFaultDraftCount: number;
  loading?: boolean;
};

/** ORDERS-2026-10-01 — Faults under the unit's maintenance view (E-40 board filtered both ways). */
export function UnitFaultsReverseSection({
  unitId,
  activeFaultCount,
  pendingFaultDraftCount,
  loading = false,
}: Props) {
  const faultsHref = `/maintenance/fault-code-alerts?unit_id=${encodeURIComponent(unitId)}`;
  return (
    <section
      className="mt-3 rounded-sm border border-gray-200 bg-white p-3"
      data-testid="vp-section-unit-faults"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold text-[#0F1219]">Faults</h2>
        <Link to={faultsHref} className="text-xs text-[#1F2A44] hover:underline" data-testid="vp-unit-faults-board-link">
          Open fault board →
        </Link>
      </div>
      {loading ? (
        <p className="mt-2 text-xs text-[#6B7280]">Loading faults…</p>
      ) : (
        <p className="mt-2 text-xs text-[#1F2A44]" data-testid="vp-unit-faults-summary">
          {activeFaultCount} unresolved
          {pendingFaultDraftCount > 0 ? ` · ${pendingFaultDraftCount} auto work order draft${pendingFaultDraftCount === 1 ? "" : "s"}` : ""}
        </p>
      )}
    </section>
  );
}
