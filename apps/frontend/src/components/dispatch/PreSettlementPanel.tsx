import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getPreSettlementForDriver, settleAndPay } from "../../api/driverFinance";
import { useToast } from "../Toast";
import { Button } from "../Button";

type Props = {
  driverId: string;
  operatingCompanyId: string;
  /** Called after a successful Settle & Pay so the parent can close/refresh. */
  onSettled?: () => void;
};

export function PreSettlementPanel({ driverId, operatingCompanyId, onSettled }: Props) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["pre-settlement", "by-driver", driverId, operatingCompanyId],
    queryFn: () => getPreSettlementForDriver(driverId, operatingCompanyId),
    enabled: Boolean(driverId && operatingCompanyId),
    retry: false,
  });

  const settleMutation = useMutation({
    mutationFn: ({ settlementId }: { settlementId: string }) =>
      settleAndPay(settlementId, operatingCompanyId),
    onSuccess: (data) => {
      const net = typeof data.net_pay === "number" ? `$${Number(data.net_pay).toFixed(2)}` : "";
      pushToast(`Settlement approved${net ? ` — net ${net}` : ""}`, "success");
      void queryClient.invalidateQueries({ queryKey: ["driver-finance", "settlements"] });
      void queryClient.invalidateQueries({ queryKey: ["pre-settlements-open"] });
      void query.refetch();
      onSettled?.();
    },
    onError: (err) => {
      pushToast(err instanceof Error ? err.message : "Settle & Pay failed", "error");
    },
  });

  if (query.isLoading) {
    return <div className="p-4 text-sm text-gray-500">Loading pre-settlement…</div>;
  }

  if (query.isError || !query.data?.settlement) {
    return (
      <div className="rounded border border-gray-200 p-4 text-sm text-gray-500">
        No active pre-settlement found for this driver.
      </div>
    );
  }

  const { settlement, lines } = query.data;

  const earningLines = lines.filter((l) =>
    ["earnings", "extra_pay", "team_split_primary", "team_split_secondary"].includes(l.line_type)
  );
  const deductionLines = lines.filter((l) => l.line_type === "deduction");
  const reimbLines = lines.filter((l) => l.line_type === "reimbursement");

  // Settle & Pay is enabled once the driver has returned (SB load delivered → trip_closed_at set).
  const isSettleEnabled =
    (settlement.status === "closed" || settlement.status === "open") &&
    Boolean(settlement.trip_closed_at);

  return (
    <div className="space-y-3 text-sm">
      {/* Header */}
      <div className="flex items-center justify-between rounded border border-gray-200 bg-gray-50 p-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Pre-Settlement</div>
          <div className="font-semibold text-gray-900">
            {settlement.display_id ?? settlement.id.slice(0, 8)}
          </div>
          <div className="mt-0.5 text-[11px] text-gray-500">
            {settlement.period_start ? new Date(settlement.period_start).toLocaleDateString() : "—"}
          </div>
        </div>
        <span
          className={`rounded-full px-2 py-1 text-xs font-semibold ${
            settlement.trip_closed_at
              ? "bg-emerald-100 text-emerald-700"
              : "bg-amber-100 text-amber-700"
          }`}
        >
          {settlement.trip_closed_at ? "Driver returned" : "Trip in progress"}
        </span>
      </div>

      {/* Linked trips */}
      <div className="space-y-1">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Linked Trips</div>
        {settlement.first_load_number ? (
          <div className="flex items-center gap-2 rounded border border-blue-100 bg-blue-50 px-2 py-1.5">
            <span className="rounded bg-blue-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-blue-800">
              NB
            </span>
            <span className="font-mono text-xs font-semibold text-blue-900">
              {settlement.first_load_number}
            </span>
          </div>
        ) : null}
        {settlement.last_load_number &&
        settlement.last_load_number !== settlement.first_load_number ? (
          <div className="flex items-center gap-2 rounded border border-emerald-100 bg-emerald-50 px-2 py-1.5">
            <span className="rounded bg-emerald-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-800">
              SB
            </span>
            <span className="font-mono text-xs font-semibold text-emerald-900">
              {settlement.last_load_number}
            </span>
          </div>
        ) : (
          <div className="rounded border border-dashed border-gray-200 px-2 py-1.5 text-xs text-gray-400">
            Return (SB) load not yet linked — use "Add to it" from the board
          </div>
        )}
      </div>

      {/* Earnings / deductions / reimbursements */}
      {lines.length > 0 ? (
        <div className="space-y-1">
          {earningLines.length > 0 ? (
            <>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                Earnings
              </div>
              {earningLines.map((l) => (
                <div key={l.id} className="flex items-center justify-between rounded bg-gray-50 px-2 py-1 text-xs">
                  <span className="text-gray-700">{l.description}</span>
                  <span className="font-semibold text-gray-900">${Number(l.amount).toFixed(2)}</span>
                </div>
              ))}
            </>
          ) : null}
          {deductionLines.length > 0 ? (
            <>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                Deductions
              </div>
              {deductionLines.map((l) => (
                <div key={l.id} className="flex items-center justify-between rounded bg-gray-50 px-2 py-1 text-xs">
                  <span className="text-gray-700">{l.description}</span>
                  <span className="font-semibold text-red-600">−${Number(l.amount).toFixed(2)}</span>
                </div>
              ))}
            </>
          ) : null}
          {reimbLines.length > 0 ? (
            <>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                Reimbursements
              </div>
              {reimbLines.map((l) => (
                <div key={l.id} className="flex items-center justify-between rounded bg-gray-50 px-2 py-1 text-xs">
                  <span className="text-gray-700">{l.description}</span>
                  <span className="font-semibold text-emerald-600">+${Number(l.amount).toFixed(2)}</span>
                </div>
              ))}
            </>
          ) : null}
        </div>
      ) : (
        <div className="text-xs text-gray-400">No lines yet — earnings post when each load is delivered.</div>
      )}

      {/* Totals */}
      <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm">
        <div className="flex justify-between py-0.5">
          <span className="text-gray-600">Gross pay</span>
          <span className="font-semibold text-gray-900">${Number(settlement.gross_pay).toFixed(2)}</span>
        </div>
        <div className="flex justify-between py-0.5">
          <span className="text-gray-600">Deductions</span>
          <span className="font-semibold text-red-600">
            −${Number(settlement.deductions_total).toFixed(2)}
          </span>
        </div>
        {Number(settlement.reimbursements_total) > 0 ? (
          <div className="flex justify-between py-0.5">
            <span className="text-gray-600">Reimbursements</span>
            <span className="font-semibold text-emerald-600">
              +${Number(settlement.reimbursements_total).toFixed(2)}
            </span>
          </div>
        ) : null}
        <div className="mt-1.5 flex justify-between border-t border-gray-200 pt-1.5">
          <span className="font-semibold text-gray-900">Net pay</span>
          <span className="font-bold text-emerald-700">${Number(settlement.net_pay).toFixed(2)}</span>
        </div>
      </div>

      {/* Settle & Pay guard message */}
      {!isSettleEnabled ? (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <strong>Settle &amp; Pay</strong> enables once the driver returns and the SB load is delivered
          (status → delivered/pending docs).
        </div>
      ) : null}

      {/* Settle & Pay action */}
      <Button
        type="button"
        size="sm"
        disabled={!isSettleEnabled || settleMutation.isPending}
        loading={settleMutation.isPending}
        onClick={() => {
          if (!isSettleEnabled) return;
          settleMutation.mutate({ settlementId: settlement.id });
        }}
      >
        Settle &amp; Pay
      </Button>
    </div>
  );
}
