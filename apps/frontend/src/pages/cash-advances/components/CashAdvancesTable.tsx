import { EntityLink } from "../../../components/shared/EntityLink";
import { entityLabel } from "../../../lib/entity-label";

type Props = {
  rows: Array<Record<string, unknown>>;
  onOpenDetail: (row: Record<string, unknown>) => void;
  onMarkDisbursed: (row: Record<string, unknown>) => void;
  /** SETL-S02 — show spinner row while parent useListState is loading. */
  isLoading?: boolean;
};

function statusPill(status: string) {
  if (status === "pending_approval") return "bg-slate-100 text-slate-700";
  if (status === "approved") return "bg-slate-100 text-slate-700";
  if (status === "disbursed") return "bg-slate-100 text-slate-700";
  if (status === "failed") return "bg-red-100 text-red-700";
  if (status === "reversed") return "bg-gray-100 text-gray-700";
  return "bg-gray-100 text-gray-700";
}

export function CashAdvancesTable({ rows, onOpenDetail, onMarkDisbursed, isLoading = false }: Props) {
  return (
    <div className="overflow-x-auto rounded-sm border border-gray-200 bg-white">
      <table className="min-w-[1200px] w-full text-left text-xs">
        <thead className="bg-gray-50 text-[10px] uppercase text-gray-600">
          <tr>
            <th className="px-2 py-1">Display ID</th>
            <th className="px-2 py-1">Driver</th>
            <th className="px-2 py-1">Amount</th>
            <th className="px-2 py-1">Purpose</th>
            <th className="px-2 py-1">Method</th>
            <th className="px-2 py-1">Disbursement Status</th>
            <th className="px-2 py-1">Outstanding</th>
            <th className="px-2 py-1">Created</th>
            <th className="px-2 py-1">Action</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td colSpan={9} className="px-2 py-3 text-center text-gray-500">
                Loading cash advances…
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const status = String(row.disbursement_status ?? "pending_approval");
              return (
                <tr key={String(row.id)} className="border-t border-gray-100">
                  <td className="px-2 py-1 font-medium">{entityLabel(row.display_id != null ? String(row.display_id) : null, String(row.id), "Advance")}</td>
                  <td className="px-2 py-1">
                    <EntityLink
                      kind="driver"
                      id={row.driver_id ? String(row.driver_id) : null}
                      label={String(row.driver_full_name ?? "—")}
                      onClick={(event) => event.stopPropagation()}
                    />
                  </td>
                  <td className="px-2 py-1">${Number(row.amount ?? 0).toFixed(2)}</td>
                  <td className="px-2 py-1">{String(row.purpose ?? "—")}</td>
                  <td className="px-2 py-1">{String(row.disbursement_method ?? "—")}</td>
                  <td className="px-2 py-1">
                    <span className={`rounded-full px-2 py-0.5 ${statusPill(status)}`}>{status}</span>
                  </td>
                  <td className="px-2 py-1">${Number(row.outstanding_balance ?? 0).toFixed(2)}</td>
                  <td className="px-2 py-1">{String(row.created_at ?? "").slice(0, 10) || "—"}</td>
                  <td className="px-2 py-1">
                    <div className="flex gap-2">
                      <button type="button" className="text-slate-700 underline" onClick={() => onOpenDetail(row)}>
                        View Detail
                      </button>
                      {status !== "disbursed" && status !== "reversed" ? (
                        <button type="button" className="text-slate-700 underline" onClick={() => onMarkDisbursed(row)}>
                          Mark Disbursed
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
