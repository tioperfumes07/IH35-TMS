/**
 * ROUND 443.54-7 — suggested related-party bank↔Relay pairs.
 * Owner confirms; nothing auto-pairs. Confirm categorizes as Due to/from + links deposit.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  confirmRelatedPartyPair,
  getRelatedPartyPairSuggestions,
  type RelatedPartyPairSuggestionRow,
} from "../../../api/banking";
import { CappedListNotice } from "../../../components/CappedListNotice";
import { MoneyCell } from "../../../components/shared/MoneyCell";
import { formatDateUS } from "../../../lib/formatDate";

type Props = {
  companyId: string;
};

const COLS =
  "grid grid-cols-[minmax(4.5rem,1fr)_minmax(5rem,1.1fr)_minmax(7rem,1.6fr)_minmax(5rem,1.1fr)_minmax(4rem,1fr)_minmax(5.5rem,1.2fr)_minmax(4.5rem,1fr)_minmax(5rem,1fr)]";

export function RelatedPartyPairSuggestionsPanel({ companyId }: Props) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["related-party-pairs", companyId],
    queryFn: () => getRelatedPartyPairSuggestions(companyId, 2000),
    enabled: Boolean(companyId) && open,
    staleTime: 60_000,
  });

  const confirmMut = useMutation({
    mutationFn: (row: RelatedPartyPairSuggestionRow) =>
      confirmRelatedPartyPair({
        operating_company_id: companyId,
        bank_transaction_id: row.bank_transaction_id,
        relay_deposit_id: row.suggested_relay_deposit_id,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["related-party-pairs", companyId] });
      void qc.invalidateQueries({ queryKey: ["banking-transactions"] });
    },
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? rows.length;
  const suggestedCount = rows.filter((r) => r.pair_status === "suggested").length;

  return (
    <div
      className="mb-2 rounded-sm border border-[#E5E7EB] bg-white px-3 py-2"
      data-testid="related-party-pair-suggestions"
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="text-xs font-bold uppercase tracking-wide text-[#4B5563]">
          Related-party pairs — suggested{suggestedCount > 0 ? ` (${suggestedCount})` : ""}
        </span>
        <span className="text-xs text-[#6B7280]">{open ? "Hide" : "Show"}</span>
      </button>
      {open ? (
        <div className="mt-2">
          <p className="mb-2 text-xs text-[#6B7280]">
            Bank outflows to a related party matched to a Relay deposit on that party&apos;s card with the
            same amount within 5 days. Confirm categorizes the bank line as a related-party transfer (Due
            to/from) and links the deposit — nothing posts twice. Card 0275 is a Scentsx suggestion only.
          </p>
          {isLoading ? (
            <p className="text-xs text-[#6B7280]">Loading…</p>
          ) : isError ? (
            <p className="text-xs text-red-700">{String((error as Error)?.message ?? "Failed to load")}</p>
          ) : rows.length === 0 ? (
            <p className="text-xs text-[#6B7280]">No related-party outflows need review.</p>
          ) : (
            <>
              <CappedListNotice shown={rows.length} limit={2000} total={total} />
              {confirmMut.isError ? (
                <p className="mb-2 text-xs text-red-700">
                  {String((confirmMut.error as Error)?.message ?? "Confirm failed")}
                </p>
              ) : null}
              {confirmMut.isSuccess && confirmMut.data.related_party_loan_id ? (
                <p className="mb-2 text-xs text-slate-700">
                  Confirmed{" "}
                  <Link
                    to={`/accounting/loans-advances?loan_id=${confirmMut.data.related_party_loan_id}`}
                    className="font-medium text-slate-700 underline hover:text-slate-900"
                  >
                    {confirmMut.data.related_party_loan_display_id}
                  </Link>{" "}
                  — 1 transfer, 0 duplicate postings.
                </p>
              ) : confirmMut.isSuccess ? (
                <p className="mb-2 text-xs text-slate-700">
                  Confirmed — 1 transfer, 0 duplicate postings.
                </p>
              ) : null}
              <div className="mt-2 max-h-64 overflow-auto border-t border-[#E5E7EB]">
                <div
                  role="table"
                  aria-label="Related-party pair suggestions"
                  className="w-full text-xs tabular-nums text-[#0F1219]"
                >
                  <div role="row" className={`${COLS} border-b border-[#E5E7EB] bg-[#F7F8FA]`}>
                    {["Date", "Amount", "Bank line", "Party", "Card", "Deposit", "Gap", ""].map(
                      (label) => (
                        <div
                          key={label || "action"}
                          role="columnheader"
                          className="px-2 py-1 text-center font-bold uppercase tracking-wide text-[#4B5563]"
                        >
                          {label}
                        </div>
                      )
                    )}
                  </div>
                  {rows.map((r) => (
                    <div
                      key={r.bank_transaction_id}
                      role="row"
                      className={`${COLS} border-b border-[#E5E7EB]`}
                      data-pair-status={r.pair_status}
                    >
                      <div role="cell" className="px-2 py-1 text-center whitespace-nowrap">
                        {r.transaction_date ? formatDateUS(r.transaction_date) : "—"}
                      </div>
                      <div role="cell" className="px-2 py-1">
                        <MoneyCell
                          cents={r.amount_cents}
                          drill={{ entity: { kind: "bank_transaction", id: r.bank_transaction_id } }}
                        />
                      </div>
                      <div
                        role="cell"
                        className="px-2 py-1 text-center truncate"
                        title={r.description ?? ""}
                      >
                        {r.description ?? "—"}
                      </div>
                      <div role="cell" className="px-2 py-1 text-center">
                        {r.party_name ?? "—"}
                        {r.card_confirmed === false ? (
                          <span className="ml-1 text-[#6B7280]">(suggested)</span>
                        ) : null}
                      </div>
                      <div role="cell" className="px-2 py-1 text-center">
                        {r.funding_card_last4 ? `····${r.funding_card_last4}` : "—"}
                      </div>
                      <div role="cell" className="px-2 py-1 text-center whitespace-nowrap">
                        {r.pair_status === "suggested"
                          ? (r.relay_deposit_id ?? r.suggested_relay_deposit_id ?? "—")
                          : "unpaired"}
                      </div>
                      <div role="cell" className="px-2 py-1 text-center">
                        {r.date_gap_days != null ? `${r.date_gap_days}d` : "—"}
                      </div>
                      <div role="cell" className="px-2 py-1 text-center">
                        <button
                          type="button"
                          className="h-7 rounded-sm border border-[#E5E7EB] bg-white px-2 text-xs text-[#0F1219] hover:bg-[#F7F8FA] disabled:opacity-50"
                          disabled={confirmMut.isPending || !r.party_name}
                          title={
                            !r.party_name
                              ? "Resolve the related party before confirming"
                              : r.pair_status === "unpaired"
                                ? "Confirm as unpaired related-party transfer"
                                : "Confirm pair — categorize + link deposit"
                          }
                          onClick={() => confirmMut.mutate(r)}
                        >
                          Confirm
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
