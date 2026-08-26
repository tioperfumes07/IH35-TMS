import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getRelayCompanyCards,
  getRelayDeposits,
  putRelayCompanyCard,
  type RelayDepositByCardRow,
  type RelayDepositClassification,
  type RelayDepositRow,
} from "../../../api/relayDeposits";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
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
  const deposits = depositsQuery.data?.deposits ?? [];
  const companyCards = useMemo(
    () => new Set((cardsQuery.data?.cards ?? []).filter((c) => c.is_active).map((c) => c.card_last4)),
    [cardsQuery.data],
  );

  const settledFor = (cls: RelayDepositClassification) => summary.find((s) => s.classification === cls)?.settled_cents ?? 0;
  const countFor = (cls: RelayDepositClassification) => summary.find((s) => s.classification === cls)?.n ?? 0;

  const [newCard, setNewCard] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const lifecycleGenerationRef = useRef(0);

  const addCardMutation = useMutation({
    mutationFn: (input: { companyId: string; card: string; label?: string; generation: number }) =>
      putRelayCompanyCard(input.companyId, { card_last4: input.card, label: input.label, is_active: true }),
    onSuccess: (res, input) => {
      if (input.generation !== lifecycleGenerationRef.current) return;
      pushToast(`Card ${res.card_last4} added — reclassified ${res.reclassified_deposits} deposit(s) as company`, "success");
      setNewCard("");
      setNewLabel("");
      void queryClient.invalidateQueries({ queryKey: ["relay", "deposits", input.companyId] });
      void queryClient.invalidateQueries({ queryKey: ["relay", "company-cards", input.companyId] });
    },
    onError: (e, input) => {
      if (input.generation !== lifecycleGenerationRef.current) return;
      pushToast(e instanceof Error ? e.message : "Failed to add card", "error");
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (input: { companyId: string; card: string; generation: number }) =>
      putRelayCompanyCard(input.companyId, { card_last4: input.card, is_active: false }),
    onSuccess: (res, input) => {
      if (input.generation !== lifecycleGenerationRef.current) return;
      pushToast(`Card ${res.card_last4} removed — ${res.reclassified_deposits} deposit(s) back to unclassified`, "success");
      void queryClient.invalidateQueries({ queryKey: ["relay", "deposits", input.companyId] });
      void queryClient.invalidateQueries({ queryKey: ["relay", "company-cards", input.companyId] });
    },
    onError: (e, input) => {
      if (input.generation !== lifecycleGenerationRef.current) return;
      pushToast(e instanceof Error ? e.message : "Failed to remove card", "error");
    },
  });

  useEffect(() => {
    lifecycleGenerationRef.current += 1;
    addCardMutation.reset();
    deactivateMutation.reset();
    setNewCard("");
    setNewLabel("");
  }, [companyId]); // Mutation reset functions are stable; company transitions own a fresh review draft.

  const unclassifiedCards = byCard.filter((c) => c.classification === "unclassified");

  const unclassifiedColumns = useMemo<ParityColumn<RelayDepositByCardRow>[]>(
    () => [
      {
        key: "funding_card_last4",
        label: "Card (last 4)",
        render: (c) => <span className="font-mono">•••• {c.funding_card_last4 ?? "—"}</span>,
      },
      {
        key: "n",
        label: "Deposits",
        sortable: true,
        render: (c) => String(c.n),
      },
      {
        key: "settled_cents",
        label: "Settled amount",
        sortable: true,
        render: (c) => <span className="tabular-nums">{usd(c.settled_cents)}</span>,
      },
      {
        key: "action",
        label: "Action",
        render: (c) =>
          c.funding_card_last4 ? (
            <button
              type="button"
              className="rounded-sm border border-slate-300 px-2 py-0.5 font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              disabled={addCardMutation.isPending}
              onClick={() => addCardMutation.mutate({
                companyId,
                card: c.funding_card_last4!,
                generation: lifecycleGenerationRef.current,
              })}
            >
              Mark as company card
            </button>
          ) : null,
      },
    ],
    [addCardMutation.isPending, addCardMutation.mutate],
  );

  const depositColumns = useMemo<ParityColumn<RelayDepositRow>[]>(
    () => [
      {
        key: "relay_created_at",
        label: "Date",
        sortable: true,
        render: (d) => new Date(d.relay_created_at).toLocaleDateString(),
      },
      {
        key: "status",
        label: "Status",
        render: (d) => d.status,
      },
      {
        key: "funding_card_last4",
        label: "Card",
        render: (d) => <span className="font-mono">•••• {d.funding_card_last4 ?? "—"}</span>,
      },
      {
        key: "total_amount_cents",
        label: "Amount",
        sortable: true,
        render: (d) => <span className="tabular-nums">{usd(d.total_amount_cents)}</span>,
      },
      {
        key: "classification",
        label: "Classification",
        render: (d) => CLASS_LABEL[d.classification],
      },
    ],
    [],
  );

  if (!companyId) {
    return (
      <section className="rounded-sm border border-gray-200 bg-white p-4 text-xs text-gray-500">
        Select a company to review Relay deposits.
      </section>
    );
  }
  if (depositsQuery.isError || cardsQuery.isError) {
    return (
      <section className="rounded-sm border border-gray-200 bg-white p-4">
        <ListErrorBanner
          onRetry={() => {
            void depositsQuery.refetch();
            void cardsQuery.refetch();
          }}
        />
      </section>
    );
  }

  return (
    <div className="space-y-3">
      <section className="rounded-sm border border-gray-200 bg-white p-4 text-xs text-gray-600">
        <h3 className="text-sm font-semibold text-gray-900">Relay deposit funding</h3>
        <p className="mt-1">
          Money funded INTO the Relay wallet (separate from fuel pumped and from bank payments to Relay). Each deposit is
          classified by its funding card. Company-funded deposits reconcile to the bank; unclassified cards need you to identify
          them.
        </p>
      </section>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {(["company", "unclassified", "canceled"] as RelayDepositClassification[]).map((cls) => (
          <div key={cls} className="rounded-sm border border-gray-200 bg-white p-3">
            <div className="text-xs font-semibold text-gray-600">{CLASS_LABEL[cls]}</div>
            <div className="mt-1 text-lg font-semibold text-gray-900">{cls === "canceled" ? "—" : usd(settledFor(cls))}</div>
            <div className="text-xs text-gray-500">{countFor(cls)} deposit(s)</div>
          </div>
        ))}
      </div>

      {/* FUEL-F3550: always mount ParityTable (Search+Range+gear) for owner review queue. */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-900">Owner review — unidentified funding cards</h3>
        <p className="text-xs text-gray-600">
          These cards funded Relay but are not in the company-card set. Identify each: if it is a company card, add it below (its
          deposits reclassify to company). If it is personal, it will be booked separately as a loan/capital contribution
          (a separate, disabled step — not here).
        </p>
        <ParityTable<RelayDepositByCardRow>
          columns={unclassifiedColumns}
          rows={unclassifiedCards}
          rowKey={(c) => c.funding_card_last4 ?? "none"}
          loading={depositsQuery.isLoading}
          emptyText="No unidentified funding cards — all deposits are company-classified or canceled."
          storageKey="relay-deposit-unclassified-cards"
          exportFilename="relay-deposit-unclassified-cards"
          tableTestId="relay-deposit-unclassified-table"
        />
      </section>

      <section className="rounded-sm border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-900">Company card set</h3>
        <p className="mt-1 text-xs text-gray-600">
          Cards confirmed to belong to the operating company. Deposits funded by these reconcile to the bank.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(cardsQuery.data?.cards ?? [])
            .filter((c) => c.is_active)
            .map((c) => (
              <span key={c.id} className="inline-flex items-center gap-2 rounded-sm border border-gray-200 bg-gray-50 px-2 py-1 text-xs">
                <span className="font-mono">•••• {c.card_last4}</span>
                {c.label ? <span className="text-gray-500">{c.label}</span> : null}
                <button
                  type="button"
                  className="text-slate-500 hover:text-red-600 disabled:opacity-50"
                  title="Remove from company set"
                  disabled={deactivateMutation.isPending}
                  onClick={() => deactivateMutation.mutate({
                    companyId,
                    card: c.card_last4,
                    generation: lifecycleGenerationRef.current,
                  })}
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
            <input
              value={newCard}
              onChange={(e) => setNewCard(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="1234"
              className="w-24 rounded-sm border border-gray-300 px-2 py-1 font-mono"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-semibold text-gray-600">Label (optional)</span>
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Amex Platinum"
              className="w-48 rounded-sm border border-gray-300 px-2 py-1"
            />
          </label>
          <button
            type="button"
            disabled={newCard.length !== 4 || addCardMutation.isPending}
            onClick={() => addCardMutation.mutate({
              companyId,
              card: newCard,
              label: newLabel || undefined,
              generation: lifecycleGenerationRef.current,
            })}
            className="rounded-sm bg-slate-800 px-3 py-1.5 font-semibold text-white disabled:opacity-50"
          >
            + Add company card
          </button>
        </div>
      </section>

      {/* FUEL-F3550: always mount ParityTable for full deposit list. */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-900">All deposits</h3>
        <ParityTable<RelayDepositRow>
          columns={depositColumns}
          rows={deposits}
          rowKey={(d) => d.id}
          loading={depositsQuery.isLoading}
          emptyText="No Relay deposits imported yet."
          storageKey="relay-deposit-all"
          exportFilename="relay-deposits"
          tableTestId="relay-deposit-all-table"
        />
      </section>
    </div>
  );
}
