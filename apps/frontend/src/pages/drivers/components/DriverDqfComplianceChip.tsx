import { type DqfComplianceSummary, dqfComplianceChipClass } from "../../../lib/driverDqf";

type Props = {
  summary: DqfComplianceSummary;
  compact?: boolean;
};

export function DriverDqfComplianceChip({ summary, compact = false }: Props) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${dqfComplianceChipClass(summary.level)}`}
      title={
        compact
          ? `${summary.label} · ${summary.itemCount} items`
          : `${summary.presentCount} present · ${summary.missingCount} missing · ${summary.expiredCount} expired`
      }
    >
      {summary.label}
      {!compact && summary.itemCount > 0 ? <span className="ml-1 font-normal normal-case">({summary.itemCount})</span> : null}
    </span>
  );
}
