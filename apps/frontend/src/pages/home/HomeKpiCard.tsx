import type { ReactNode } from "react";
import { UnclearedDocumentsNote } from "../../components/accounting/UnclearedDocumentsNote";
import { KpiCard } from "../../components/layout/KpiCard";
import { ListErrorState } from "../../components/ListErrorState";
import { formatQueryErrorDetail } from "../../lib/tableError";
import type { HomeFactoringBalance } from "../../api/home";
import { formatMoneyCents } from "../../lib/formatMoney";
import { formatDate } from "../../lib/formatDate";

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
  /** Drill-down route — makes the KPI clickable (GLOBAL clickable-KPI behavior). */
  to?: string;
};

export function HomeKpiCard({ label, number, accent, isLoading, isError, error, onRetry, subtext, delta, to }: Props) {
  if (isLoading) {
    return (
      <div className="flex min-h-[118px] flex-col rounded-sm border border-[#E5E7EB] bg-white p-3 shadow-xs">
        <div className="text-xs font-semibold uppercase tracking-[0.04em] text-[#6B7280]">{label}</div>
        <div className="mt-2 flex flex-1 flex-col justify-center space-y-2">
          <div className="h-6 animate-pulse rounded-sm bg-[#E5E7EB]" />
          <div className="h-3 w-2/3 animate-pulse rounded-sm bg-[#E5E7EB]" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex min-h-[118px] flex-col rounded-sm border border-[#E5E7EB] bg-white p-3 shadow-xs">
        <div className="text-xs font-semibold uppercase tracking-[0.04em] text-[#6B7280]">{label}</div>
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
      <KpiCard label={label} number={number} accent={accent} to={to} />
      {delta ? <div className="px-3 text-xs">{delta}</div> : null}
      {subtext ? <div className="px-3 text-xs leading-snug text-[#6B7280]">{subtext}</div> : null}
    </div>
  );
}

/** ROUND 443.258-B (D002) — always two decimals via shared formatMoney. */
export function formatUsdFromCents(cents: number): string {
  return formatMoneyCents(cents);
}

/** ROUND 443.258-B (D004) — MM/DD/YYYY. */
export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return formatDate(iso) || "—";
}

/** 363-CUR-A — Factoring Balance KPI names unmatched Faro advances beside the GL liability. */
export function FactoringBalanceClearedNote({ fb }: { fb: HomeFactoringBalance | undefined }) {
  if (!fb || fb.status === "unverifiable" || fb.status === "accounting_exception") return null;
  if (fb.outstanding_cents == null) return null;
  return (
    <div className="space-y-1">
      <div>
        Cleared {formatUsdFromCents(fb.cleared_open_cents ?? fb.outstanding_cents)}. Applied factoring
        advances that have not been matched or categorized in Banking are named not cleared.
      </div>
      <UnclearedDocumentsNote docs={fb.uncleared_documents ?? []} />
    </div>
  );
}
