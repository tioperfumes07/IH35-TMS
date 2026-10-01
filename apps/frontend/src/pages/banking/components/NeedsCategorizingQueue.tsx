import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { categorizeBankTransaction } from "../../../api/banking";
import { useToast } from "../../../components/Toast";
import { formatDateUS } from "../../../lib/formatDate";
import { formatUsd } from "../../../lib/money";
import { userFacingApiError } from "../../../lib/api-error-message";

export type NeedsCategorizingRow = {
  id: string;
  date: string | null;
  description: string;
  suggestedAccount: string | null;
  suggestedAccountId: string | null;
  unit: string | null;
  amountCents: number;
  categoryKind?: string;
};

type Props = {
  companyId: string;
  rows: NeedsCategorizingRow[];
  onChange: (row: NeedsCategorizingRow) => void;
  onAccepted?: () => void;
};

function missing(v: string | null | undefined) {
  const s = String(v ?? "").trim();
  return s ? s : "—";
}

/**
 * C-64 — Needs categorizing queue on Banking Home.
 * Date 132px · Description · Suggested account · Unit · Amount · Accept / Change.
 * Accept-all in the footer. Never auto-match — human accepts or changes.
 */
export function NeedsCategorizingQueue({ companyId, rows, onChange, onAccepted }: Props) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const acceptOne = useMutation({
    mutationFn: async (row: NeedsCategorizingRow) => {
      if (!row.suggestedAccountId) {
        throw new Error("No suggested account — use Change to pick one.");
      }
      return categorizeBankTransaction(row.id, companyId, {
        category_kind: row.categoryKind || "expense",
        gl_account_id: row.suggestedAccountId,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["banking"] });
      onAccepted?.();
    },
  });

  const acceptable = useMemo(
    () => rows.filter((r) => Boolean(r.suggestedAccountId)),
    [rows],
  );

  const acceptAll = async () => {
    if (acceptable.length === 0) {
      pushToast("No rows have a suggested account to accept.", "info");
      return;
    }
    let ok = 0;
    let fail = 0;
    for (const row of acceptable) {
      setBusyId(row.id);
      try {
        await acceptOne.mutateAsync(row);
        ok += 1;
      } catch {
        fail += 1;
      }
    }
    setBusyId(null);
    if (ok) pushToast(`Accepted ${ok} suggestion${ok === 1 ? "" : "s"}.`, "success");
    if (fail) pushToast(`${fail} row(s) could not be accepted.`, "error");
  };

  return (
    <section
      className="rounded-sm border border-[#E5E7EB] bg-white"
      data-testid="needs-categorizing-queue"
      data-c64-needs-categorizing="1"
    >
      <div className="border-b border-[#E5E7EB] px-3 py-2">
        <p className="text-xs font-bold uppercase tracking-wide text-[#4B5563]">Needs categorizing</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-[#E5E7EB] bg-[#F7F8FA] text-center text-[11px] font-bold uppercase tracking-wide text-[#4B5563]">
              <th className="px-2 py-1.5 font-bold" style={{ width: 132 }}>
                Date
              </th>
              <th className="px-2 py-1.5 text-left font-bold">Description</th>
              <th className="px-2 py-1.5 font-bold">Suggested account</th>
              <th className="px-2 py-1.5 font-bold">Unit</th>
              <th className="px-2 py-1.5 text-right font-bold" style={{ width: 120 }}>
                Amount
              </th>
              <th className="px-2 py-1.5 font-bold" style={{ width: 160 }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center text-[#6B7280]">
                  Nothing waiting to categorize
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const amt = row.amountCents / 100;
                const dateLabel = row.date ? formatDateUS(row.date) : "—";
                return (
                  <tr
                    key={row.id}
                    className="border-b border-[#E5E7EB] last:border-b-0"
                    data-testid={`needs-cat-row-${row.id}`}
                  >
                    <td className="px-2 py-1.5 text-center tabular-nums" style={{ width: 132 }}>
                      {dateLabel}
                    </td>
                    <td className="max-w-[220px] truncate px-2 py-1.5 text-left text-[#0F1219]">
                      {missing(row.description)}
                    </td>
                    <td className="px-2 py-1.5 text-center text-[#1F2A44]">
                      {missing(row.suggestedAccount)}
                    </td>
                    <td className="px-2 py-1.5 text-center">{missing(row.unit)}</td>
                    <td
                      className="px-2 py-1.5 text-right tabular-nums font-medium text-[#0F1219]"
                      style={{ width: 120 }}
                    >
                      {formatUsd(amt)}
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          disabled={!row.suggestedAccountId || busyId === row.id}
                          className="inline-flex h-[34px] items-center rounded-sm bg-[#14314F] px-2 text-xs font-bold text-white disabled:opacity-40"
                          onClick={() => {
                            setBusyId(row.id);
                            acceptOne
                              .mutateAsync(row)
                              .then(() => pushToast("Accepted suggestion.", "success"))
                              .catch((err) => pushToast(userFacingApiError(err, "Could not accept suggestion"), "error"))
                              .finally(() => setBusyId(null));
                          }}
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-[34px] items-center rounded-sm border border-[#E5E7EB] px-2 text-xs font-medium text-[#1F2A44] hover:bg-[#F7F8FA]"
                          onClick={() => onChange(row)}
                        >
                          Change
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-[#E5E7EB] px-3 py-2">
        <p className="text-xs text-[#6B7280]">
          {rows.length} row{rows.length === 1 ? "" : "s"} · suggestions only — never auto-matched
        </p>
        <button
          type="button"
          className="inline-flex h-[34px] items-center rounded-sm border border-[#14314F] px-3 text-xs font-bold text-[#14314F] hover:bg-[#F7F8FA] disabled:opacity-40"
          disabled={acceptable.length === 0}
          data-testid="needs-categorizing-accept-all"
          onClick={() => void acceptAll()}
        >
          Accept all
        </button>
      </div>
    </section>
  );
}
