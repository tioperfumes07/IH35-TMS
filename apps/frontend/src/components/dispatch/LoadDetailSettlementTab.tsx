import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { formatMoneyCents } from "./constants";

type SettlementLeg = {
  load_id: string;
  load_number: string;
};

type SettlementSummary = {
  id: string;
  display_id: string | null;
  status: string;
  is_open: boolean;
  driver_id: string;
  driver_name: string | null;
  gross_pay: number;
  deductions_total: number;
  reimbursements_total: number;
  net_pay: number;
  period_start: string | null;
  period_end: string | null;
  nb_leg: SettlementLeg | null;
  sb_leg: SettlementLeg | null;
};

type Props = {
  loadId: string;
  operatingCompanyId: string;
  currencyCode: "USD" | "MXN";
};

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  open: { label: "Open (pre-settlement)", className: "bg-amber-100 text-amber-800" },
  closed: { label: "Closed", className: "bg-slate-100 text-slate-700" },
  finalized: { label: "Finalized", className: "bg-slate-100 text-slate-700" },
  paid: { label: "Paid", className: "bg-green-100 text-green-800" },
  void: { label: "Void", className: "bg-red-100 text-red-700" },
};

function statusBadge(status: string) {
  const entry = STATUS_BADGE[status] ?? { label: status, className: "bg-gray-100 text-gray-700" };
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${entry.className}`}>{entry.label}</span>
  );
}

function LegRow({ label, leg, isCurrent }: { label: string; leg: SettlementLeg | null; isCurrent: boolean }) {
  if (!leg) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <span className="w-5 text-xs font-bold text-gray-400">{label}</span>
        <span className="text-xs italic">No load linked yet</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={`w-5 text-xs font-bold ${isCurrent ? "text-slate-700" : "text-gray-500"}`}>{label}</span>
      <span className={`font-mono text-xs ${isCurrent ? "font-bold text-slate-700" : "text-gray-700"}`}>
        {leg.load_number}
      </span>
      {isCurrent && (
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
          this load
        </span>
      )}
    </div>
  );
}

export function LoadDetailSettlementTab({ loadId, operatingCompanyId, currencyCode }: Props) {
  const query = useQuery({
    queryKey: ["load-settlement-summary", loadId, operatingCompanyId],
    queryFn: () =>
      apiRequest<{ settlement: SettlementSummary | null }>(
        `/api/v1/dispatch/loads/${encodeURIComponent(loadId)}/settlement-summary?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
      ),
  });

  if (query.isLoading) {
    return <div className="py-8 text-center text-sm text-gray-500">Loading settlement info…</div>;
  }

  if (query.error) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load settlement data.
      </div>
    );
  }

  const settlement: SettlementSummary | null = query.data?.settlement ?? null;

  if (!settlement) {
    return (
      <div className="rounded border border-gray-200 bg-gray-50 p-4 text-center text-sm text-gray-500">
        No settlement or pre-settlement found for this load.
        <div className="mt-1 text-xs text-gray-400">
          A pre-settlement is created automatically when the driver delivers the northbound leg.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs text-gray-500">Settlement</div>
          <div className="font-semibold text-gray-900">{settlement.display_id ?? settlement.id.slice(0, 8)}</div>
          {settlement.driver_name ? (
            <div className="text-xs text-gray-600">{settlement.driver_name}</div>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-1">
          {statusBadge(settlement.status)}
          {settlement.is_open && (
            <span className="text-[10px] text-amber-600">Awaiting southbound return to close</span>
          )}
        </div>
      </div>

      {/* Trip legs */}
      <div className="rounded border border-gray-200 p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Trip Legs</div>
        <div className="space-y-2">
          <LegRow
            label="NB"
            leg={settlement.nb_leg}
            isCurrent={settlement.nb_leg?.load_id === loadId}
          />
          <LegRow
            label="SB"
            leg={settlement.sb_leg}
            isCurrent={settlement.sb_leg?.load_id === loadId}
          />
        </div>
      </div>

      {/* Pay summary */}
      <div className="grid grid-cols-2 gap-2 rounded border border-gray-200 bg-gray-50 p-3 text-sm">
        <div>
          <div className="text-xs text-gray-500">Gross pay</div>
          <div className="font-semibold text-gray-900">{formatMoneyCents(settlement.gross_pay, currencyCode)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Deductions</div>
          <div className="font-semibold text-red-600">
            {settlement.deductions_total > 0
              ? `−${formatMoneyCents(settlement.deductions_total, currencyCode)}`
              : formatMoneyCents(0, currencyCode)}
          </div>
        </div>
        {settlement.reimbursements_total > 0 ? (
          <div>
            <div className="text-xs text-gray-500">Reimbursements</div>
            <div className="font-semibold text-slate-700">
              +{formatMoneyCents(settlement.reimbursements_total, currencyCode)}
            </div>
          </div>
        ) : null}
        <div className="col-span-2 border-t border-gray-200 pt-2">
          <div className="text-xs font-semibold text-gray-500">Net pay</div>
          <div className={`text-base font-bold ${settlement.net_pay >= 0 ? "text-green-700" : "text-red-700"}`}>
            {formatMoneyCents(settlement.net_pay, currencyCode)}
          </div>
        </div>
      </div>

      {/* Period */}
      {(settlement.period_start || settlement.period_end) ? (
        <div className="flex gap-4 text-xs text-gray-500">
          {settlement.period_start ? (
            <div>
              <span className="font-medium">Period start:</span>{" "}
              {new Date(settlement.period_start).toLocaleDateString()}
            </div>
          ) : null}
          {settlement.period_end ? (
            <div>
              <span className="font-medium">Period end:</span>{" "}
              {new Date(settlement.period_end).toLocaleDateString()}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
