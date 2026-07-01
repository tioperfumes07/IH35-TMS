import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMatchCandidates, type BankMatchCandidate, type BankMatchCandidateKind } from "../../../api/banking";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";

type Props = {
  open: boolean;
  bankTransactionId: string | null;
  operatingCompanyId: string;
  onClose: () => void;
};

const KIND_LABELS: Record<BankMatchCandidateKind, string> = {
  payment: "Payment",
  bill_payment: "Bill Payment",
  transfer: "Transfer",
  je: "Journal Entry",
  bill: "Bill",
  expense: "Expense",
};

function formatMoneyCents(cents: number | null | undefined) {
  if (cents == null || Number.isNaN(Number(cents))) return "—";
  const n = Number(cents) / 100;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Math.abs(n));
}

function kindBadge(kind: BankMatchCandidateKind) {
  return (
    <span
      data-testid="match-candidate-kind"
      className="inline-flex items-center rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700"
    >
      {KIND_LABELS[kind]}
    </span>
  );
}

export function MatchDrawer({ open, bankTransactionId, operatingCompanyId, onClose }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const candidatesQuery = useQuery({
    queryKey: ["banking", "match-candidates", operatingCompanyId, bankTransactionId],
    queryFn: () => getMatchCandidates(String(bankTransactionId), operatingCompanyId),
    enabled: open && Boolean(operatingCompanyId && bankTransactionId),
  });

  if (!open || !bankTransactionId) return null;

  const candidates: BankMatchCandidate[] = candidatesQuery.data?.candidates ?? [];
  const topAutoMatchId = candidates.find((c) => c.auto_match)?.ledger_entry_id ?? null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} data-testid="match-drawer-scrim" />
      <aside
        data-testid="match-drawer"
        className="fixed right-0 top-0 z-50 h-full w-[480px] overflow-y-auto border-l border-slate-200 bg-white p-4"
      >
        <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-2">
          <h2 className="text-sm font-semibold text-slate-900">Match transaction</h2>
          <button
            type="button"
            data-testid="match-drawer-close"
            className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <p className="mb-3 text-[11px] text-slate-500">
          Ranked matchable records (amount, date, memo). Review-only in this build; confirming a match wires in a later step.
        </p>

        {candidatesQuery.isError ? <ListErrorBanner onRetry={() => void candidatesQuery.refetch()} /> : null}
        {candidatesQuery.isLoading ? <p className="text-sm text-slate-600">Loading candidates…</p> : null}

        <div className="space-y-2" data-testid="match-candidate-list">
          {candidates.map((c) => {
            const isTopAuto = c.ledger_entry_id === topAutoMatchId;
            const isSelected = c.ledger_entry_id === selectedId;
            const isBill = c.ledger_entry_kind === "bill";
            return (
              <div
                key={`${c.ledger_entry_kind}:${c.ledger_entry_id}`}
                data-testid="match-candidate-row"
                className={`rounded border px-3 py-2 ${
                  isTopAuto ? "border-slate-400 bg-slate-50" : "border-slate-200 bg-white"
                } ${isSelected ? "ring-1 ring-slate-400" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <input
                      type="radio"
                      name="match-candidate"
                      data-testid="match-candidate-select"
                      className="accent-slate-700"
                      checked={isSelected}
                      onChange={() => setSelectedId(c.ledger_entry_id)}
                    />
                    {kindBadge(c.ledger_entry_kind)}
                    {isTopAuto ? (
                      <span
                        data-testid="match-candidate-top"
                        className="inline-flex items-center rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white"
                      >
                        Best match
                      </span>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-slate-900" data-testid="match-candidate-amount">
                    {formatMoneyCents(c.amount_cents)}
                  </span>
                </div>

                <div className="mt-1 truncate text-[11px] text-slate-700" title={c.memo}>
                  {c.memo?.trim() ? c.memo : "—"}
                </div>

                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-500">
                  <span data-testid="match-candidate-date">Date: {String(c.event_date ?? "").slice(0, 10) || "—"}</span>
                  <span>Amount gap: {formatMoneyCents(c.amount_gap_cents)}</span>
                  <span>Date gap: {c.date_gap_days}d</span>
                  <span>Score: {c.match_score.toFixed(3)}</span>
                </div>

                <div className="mt-2 flex items-center justify-end gap-2">
                  {isBill ? (
                    <span className="text-[10px] text-slate-400">Posting available after CHAIN-04</span>
                  ) : null}
                  <button
                    type="button"
                    data-testid="match-candidate-confirm"
                    className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-400"
                    disabled
                    title={
                      isBill
                        ? "Recording the bill payment is CHAIN-04 (Part 2b)"
                        : "Confirming a match wires in Part 2"
                    }
                  >
                    Confirm match
                  </button>
                </div>
              </div>
            );
          })}
          {!candidatesQuery.isLoading && candidates.length === 0 ? (
            <p className="text-sm text-slate-600" data-testid="match-candidate-empty">
              No matchable records found in the ±7-day window for this transaction.
            </p>
          ) : null}
        </div>
      </aside>
    </>
  );
}
