import { useQuery } from "@tanstack/react-query";
import { ApiError } from "../../../api/client";
import { getBankingSuggestions } from "../../../api/banking";
import { getBankTransactionMatchCandidates } from "../../../api/banking-wave2";
import { Modal } from "../../../components/Modal";
import { ActionButton } from "../../../components/shared/ActionButton";
import { formatCurrencyCents } from "../../../lib/format";

type Props = {
  open: boolean;
  transactionId: string | null;
  companyId: string;
  amountCents: number;
  onClose: () => void;
  onMatched: () => void;
  matchMutation: {
    mutateAsync: (args: { transactionId: string; kind: string; target_id: string }) => Promise<unknown>;
    isPending: boolean;
  };
};

export function BankingReviewMatchModal({ open, transactionId, companyId, amountCents, onClose, onMatched, matchMutation }: Props) {
  const candidatesQuery = useQuery({
    queryKey: ["banking", "match-candidates", transactionId, companyId],
    queryFn: async () => {
      if (!transactionId) return { candidates: [] as Array<Record<string, unknown>> };
      try {
        const res = await getBankTransactionMatchCandidates(transactionId, companyId);
        return { candidates: res.candidates ?? [] };
      } catch (e) {
        if (e instanceof ApiError && (e.status === 404 || e.status === 501)) {
          const leg = await getBankingSuggestions(transactionId, companyId);
          const suggestions = leg.suggestions ?? [];
          return {
            candidates: suggestions.map((s) => ({
              kind: String((s as Record<string, unknown>).obligation_type ?? "bill"),
              target_id: String((s as Record<string, unknown>).obligation_id ?? ""),
              label: String((s as Record<string, unknown>).label ?? ""),
              amount_cents: Number((s as Record<string, unknown>).amount_cents ?? 0),
            })),
          };
        }
        throw e;
      }
    },
    enabled: open && Boolean(transactionId) && Boolean(companyId),
  });

  const rows = candidatesQuery.data?.candidates ?? [];

  return (
    <Modal open={open} onClose={onClose} title="Match transaction" sizePreset="lg" resizable modalKind="banking-match">
      <div className="max-h-[70vh] space-y-3 overflow-y-auto text-sm">
        <p className="text-xs text-gray-600">
          Candidates within tolerance (invoice / bill / transfer). Amount: {formatCurrencyCents(amountCents)}
        </p>
        {candidatesQuery.isLoading ? <p className="text-gray-600">Loading candidates…</p> : null}
        {candidatesQuery.isError ? <p className="text-red-600">Unable to load match candidates.</p> : null}
        <ul className="space-y-2">
          {rows.map((c, idx) => {
            const row = c as Record<string, unknown>;
            const kind = String(row.kind ?? row.target_kind ?? "invoice");
            const targetId = String(row.target_id ?? row.id ?? "");
            const label = String(row.label ?? row.display_label ?? `${kind} ${targetId.slice(0, 8)}`);
            const amt = Number(row.amount_cents ?? row.open_balance_cents ?? 0);
            return (
              <li key={`${targetId}-${idx}`} className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-100 bg-gray-50 px-2 py-2">
                <div>
                  <div className="font-medium text-gray-900">{label}</div>
                  <div className="text-xs text-gray-600">
                    {formatCurrencyCents(amt)} · {kind}
                  </div>
                </div>
                <ActionButton
                  type="button"
                  className="border border-emerald-200 bg-emerald-50 text-emerald-900"
                  aria-label={`Match to ${label}`}
                  disabled={!targetId || matchMutation.isPending}
                  onClick={() =>
                    void matchMutation
                      .mutateAsync({ transactionId: transactionId!, kind, target_id: targetId })
                      .then(() => onMatched())
                      .catch(() => undefined)
                  }
                >
                  Match
                </ActionButton>
              </li>
            );
          })}
        </ul>
        {!candidatesQuery.isLoading && rows.length === 0 ? <p className="text-gray-600">No candidates found.</p> : null}
      </div>
    </Modal>
  );
}
