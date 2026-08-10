import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getRelayCompanyCards,
  getRelayDeposits,
  putRelayCompanyCard,
  type RelayDepositByCardRow,
  type RelayDepositClassification,
} from "../../../api/relayDeposits";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { useToast } from "../../../components/Toast";

const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const CLASS_LABEL: Record<RelayDepositClassification, string> = {
  company: "Company-funded",
  unclassified: "Unclassified (needs owner review)",
  canceled: "Canceled pre-auth (not money)",
};

/**
 * Relay deposit-funding review queue (Part B). DISPLAY only — separates money funded INTO Relay by its
 * funding card, so company-funded deposits reconcile to the bank and unclassified cards route to the
 * owner. Nothing posts. The owner adds a card to the company set to reclassify its deposits.
 */
export function RelayDepositReview({ companyId }: { companyId: string }) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const depositsQuery = useQuery({
    queryKey: ["relay", "deposits", companyId],
    queryFn: () => getRelayDeposits(companyId),
    enabled: Boolean(companyId),
  });
  const cardsQuery = useQuery({
    queryKey: ["relay", "company-cards", companyId],
    queryFn: () => getRelayCompanyCards(companyId),
    enabled: Boolean(companyId),
  });

  const summary = depositsQuery.data?.summary ?? [];
  const byCard = depositsQuery.data?.by_card ?? [];
  const companyCards = useMemo(() => new Set((cardsQuery.data?.cards ?? []).filter((c) => c.is_active).map((c) => c.card_last4)), [cardsQuery.data]);

  const settledFor = (cls: RelayDepositClassification) => summary.find((s) => s.classification === cls)?.settled_cents ?? 0;
  const countFor = (cls: RelayDepositClassification) => summary.find((s) => s.classification === cls)?.n ?? 0;

  const [newCard, setNewCard] = useState("");
  const [newLabel, setNewLabel] = useState("");

  const addCardMutation = useMutation({
    mutationFn: (card: string) => putRelayCompanyCard(companyId, { card_last4: card, label: newLabel || undefined, is_active: true }),
    onSuccess: (res) => {
      pushToast(`Card ${res.card_last4} added — reclassified ${res.reclassified_deposits} deposit(s) as company`, "success");
      setNewCard("");
      setNewLabel("");
      void queryClient.invalidateQueries({ queryKey: ["relay"] });
    },
    onError: (e) => pushToast(e instanceof Error ? e.message : "Failed to add card", "error"),
  });

  const deactivateMutation = useMutation({
    mutationFn: (card: string) => putRelayCompanyCard(companyId, { card_last4: card, is_active: false }),
    onSuccess: (res) => {
      pushToast(`Card ${res.card_last4} removed — ${res.reclassified_deposits} deposit(s) back to unclassified`, "success");
      void queryClient.invalidateQueries({ queryKey: ["relay"] });
    },
    onError: (e) => pushToast(e instanceof Error ? e.message : "Failed to remove card", "error"),
  });

  if (!companyId) {
    return <section className="rounded-sm border border-gray-200 bg-white p-4 text-xs text-gray-500">Select a company to review Relay deposits.</section>;
  }
  if (depositsQuery.isLoading) {
    return <section className="rounded-sm border border-gray-200 bg-white p-4 text-xs text-gray-500">Loading Relay deposits…</section>;
  }
  if (depositsQuery.isError || cardsQuery.isError) {
    return (
      <section className="rounded-sm border border-gray-200 bg-white p-4">
        <ListErrorBanner onRetry={() => {
          void depositsQuery.refetch();
          void cardsQuery.refetch();
        }} />
      </section>
    );
  }

  const unclassifiedCards = byCard.filter((c) => c.classification === "unclassified");

  return (
    <div className="space-y-3">
      {/* Layer note — the three layers must never be summed */}
      <section className="rounded-sm border border-gray-200 bg-white p-4 text-xs text-gray-600">
        <h3 className="text-sm font-semibold text-gray-900">Relay deposit funding</h3>
        <p className="mt-1">
          Money funded INTO the Relay wallet (separate from fuel pumped and from bank payments to Relay). Each deposit is
          classified by its funding card. Company-funded deposits reconcile to the bank; unclassified cards need you to identify them.
        </p>
      </section>

      {/* Summary tiles */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {(["company", "unclassified", "canceled"] as RelayDepositClassification[]).map((cls) => (
          <div key={cls} className="rounded-sm border border-gray-200 bg-white p-3">
            <div className="text-xs font-semibold text-gray-600">{CLASS_LABEL[cls]}</div>
            <div className="mt-1 text-lg font-semibold text-gray-900">{cls === "canceled" ? "—" : usd(settledFor(cls))}</div>
            <div className="text-xs text-gray-500">{countFor(cls)} deposit(s)</div>
          </div>
        ))}
      </div>

      {/* Unclassified review queue — the owner action */}
      {unclassifiedCards.length > 0 ? (
        <section className="rounded-sm border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-900">Owner review — unidentified funding cards</h3>
          <p className="mt-1 text-xs text-gray-600">
            These cards funded Relay but are not in the company-card set. Identify each: if it is a company card, add it below (its
            deposits reclassify to company). If it is personal, it will be booked separately as a loan/capital contribution (owner-gated, not here).
          </p>
          <table className="mt-3 w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-1">Card (last 4)</th>
                <th className="py-1">Deposits</th>
                <th className="py-1 text-right">Settled amount</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {unclassifiedCards.map((c: RelayDepositByCardRow) => (
                <tr key={c.funding_card_last4 ?? "none"} className="border-b border-gray-100">
                  <td className="py-1 font-mono">•••• {c.funding_card_last4 ?? "—"}</td>
                  <td className="py-1">{c.n}</td>
                  <td className="py-1 text-right">{usd(c.settled_cents)}</td>
                  <td className="py-1 text-right">
                    {c.funding_card_last4 ? (
                      <button
                        type="button"
                        className="rounded-sm border border-slate-300 px-2 py-0.5 font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                        disabled={addCardMutation.isPending}
                        onClick={() => addCardMutation.mutate(c.funding_card_last4!)}
                      >
                        Mark as company card
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {/* Company-card set editor */}
      <section className="rounded-sm border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-900">Company card set</h3>
        <p className="mt-1 text-xs text-gray-600">Cards confirmed to belong to the operating company. Deposits funded by these reconcile to the bank.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(cardsQuery.data?.cards ?? []).filter((c) => c.is_active).map((c) => (
            <span key={c.id} className="inline-flex items-center gap-2 rounded-sm border border-gray-200 bg-gray-50 px-2 py-1 text-xs">
              <span className="font-mono">•••• {c.card_last4}</span>
              {c.label ? <span className="text-gray-500">{c.label}</span> : null}
              <button
                type="button"
                className="text-slate-500 hover:text-red-600 disabled:opacity-50"
                title="Remove from company set"
                disabled={deactivateMutation.isPending}
                onClick={() => deactivateMutation.mutate(c.card_last4)}
              >
                ×
              </button>
            </span>
          ))}
          {companyCards.size === 0 ? <span className="text-xs text-gray-500">No company cards set.</span> : null}
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-2 text-xs">
          <label className="flex flex-col gap-1">
            <span className="font-semibold text-gray-600">Card last 4</span>
            <input value={newCard} onChange={(e) => setNewCard(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="1234" className="w-24 rounded-sm border border-gray-300 px-2 py-1 font-mono" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-semibold text-gray-600">Label (optional)</span>
            <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Amex Platinum" className="w-48 rounded-sm border border-gray-300 px-2 py-1" />
          </label>
          <button
            type="button"
            disabled={newCard.length !== 4 || addCardMutation.isPending}
            onClick={() => addCardMutation.mutate(newCard)}
            className="rounded-sm bg-slate-800 px-3 py-1.5 font-semibold text-white disabled:opacity-50"
          >
            + Add company card
          </button>
        </div>
      </section>

      {/* Full deposit list */}
      <section className="rounded-sm border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-900">All deposits</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-1">Date</th>
                <th className="py-1">Status</th>
                <th className="py-1">Card</th>
                <th className="py-1 text-right">Amount</th>
                <th className="py-1">Classification</th>
              </tr>
            </thead>
            <tbody>
              {(depositsQuery.data?.deposits ?? []).map((d) => (
                <tr key={d.id} className="border-b border-gray-100">
                  <td className="py-1">{new Date(d.relay_created_at).toLocaleDateString()}</td>
                  <td className="py-1">{d.status}</td>
                  <td className="py-1 font-mono">•••• {d.funding_card_last4 ?? "—"}</td>
                  <td className="py-1 text-right">{usd(d.total_amount_cents)}</td>
                  <td className="py-1">{CLASS_LABEL[d.classification]}</td>
                </tr>
              ))}
              {(depositsQuery.data?.deposits ?? []).length === 0 ? (
                <tr><td colSpan={5} className="py-2 text-center text-gray-500">No Relay deposits imported yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
