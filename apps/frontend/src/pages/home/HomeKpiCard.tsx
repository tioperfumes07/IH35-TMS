import type { ReactNode } from "react";
import { KpiCard } from "../../components/layout/KpiCard";
import { ListErrorState } from "../../components/ListErrorState";
import { formatQueryErrorDetail } from "../../lib/tableError";

type Props = {
  label: string;
  number: string | number;
  accent?: string;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
  subtext?: ReactNode;
  delta?: ReactNode;
};

export function HomeKpiCard({ label, number, accent, isLoading, isError, error, onRetry, subtext, delta }: Props) {
  if (isLoading) {
    return (
      <div className="flex min-h-[118px] flex-col rounded border border-slate-200 bg-white p-3 shadow-sm">
        <div className="text-[10px] font-semibold uppercase tracking-[0.04em] text-slate-500">{label}</div>
        <div className="mt-2 flex flex-1 flex-col justify-center space-y-2">
          <div className="h-6 animate-pulse rounded bg-slate-100" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-slate-100" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex min-h-[118px] flex-col rounded border border-slate-200 bg-white p-3 shadow-sm">
        <div className="text-[10px] font-semibold uppercase tracking-[0.04em] text-slate-500">{label}</div>
        <div className="mt-1 flex-1 overflow-hidden">
          {(() => {
            const { status, message } = formatQueryErrorDetail(error);
            return (
              <ListErrorState
                title="Couldn't load"
                status={status}
                message={message}
                onRetry={onRetry}
                className="scale-90 px-1 py-2"
              />
            );
          })()}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[118px] flex-col gap-1">
      <KpiCard label={label} number={number} accent={accent} />
      {delta ? <div className="px-3 text-[11px]">{delta}</div> : null}
      {subtext ? <div className="px-3 text-[11px] leading-snug text-slate-500">{subtext}</div> : null}
    </div>
  );
}

export function formatUsdFromCents(cents: number): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
