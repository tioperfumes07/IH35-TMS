import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getRelayDepositMatchReview, type RelayDepositMatchReviewRow } from "../../../api/banking";
import { CappedListNotice } from "../../../components/CappedListNotice";
import { formatDateUS } from "../../../lib/formatDate";
import { formatUsdCents, QBO_MONEY_CELL_CLASS } from "../../../utils/qboFormat";

type Props = {
  companyId: string;
};

export function RelayDepositCategorizedMatchHintsPanel({ companyId }: Props) {
  const [open, setOpen] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["relay-deposit-match-review", companyId],
    queryFn: () => getRelayDepositMatchReview(companyId, 2000),
    enabled: Boolean(companyId) && open,
    staleTime: 60_000,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? rows.length;

  return (
    <div
      className="mb-2 rounded-sm border border-[#E5E7EB] bg-white px-3 py-2"
      data-testid="relay-deposit-categorized-match-hints"
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="text-xs font-bold uppercase tracking-wide text-[#4B5563]">
          Relay wallet outflows — suggested deposit match (read-only)
        </span>
        <span className="text-xs text-[#6B7280]">{open ? "Hide" : "Show"}</span>
      </button>
      {open ? (
        <div className="mt-2">
          <p className="mb-2 text-xs text-[#6B7280]">
            Lines already categorized to the Relay fuel wallet account. Each row shows the settled company
            deposit that would match (charged = wallet + 3.25% fee). Use Match on the transaction to link;
            this list does not change categorization.
          </p>
          {isLoading ? (
            <p className="text-xs text-[#6B7280]">Loading…</p>
          ) : isError ? (
            <p className="text-xs text-red-700">{String((error as Error)?.message ?? "Failed to load")}</p>
          ) : rows.length === 0 ? (
            <p className="text-xs text-[#6B7280]">No wallet-categorized outflows need review.</p>
          ) : (
            <>
              <CappedListNotice shown={rows.length} limit={2000} total={total} />
              <div className="mt-2 max-h-64 overflow-auto rounded-sm border border-[#E5E7EB]">
                <table className="w-full border-collapse text-xs tabular-nums text-[#0F1219]">
                  <thead>
                    <tr className="border-b border-[#E5E7EB] bg-[#F7F8FA]">
                      <th className="px-2 py-1 text-center font-bold uppercase tracking-wide text-[#4B5563]">
                        Date
                      </th>
                      <th className="px-2 py-1 text-center font-bold uppercase tracking-wide text-[#4B5563]">
                        Bank
                      </th>
                      <th className="px-2 py-1 text-center font-bold uppercase tracking-wide text-[#4B5563]">
                        Wallet
                      </th>
                      <th className="px-2 py-1 text-center font-bold uppercase tracking-wide text-[#4B5563]">
                        Fee
                      </th>
                      <th className="px-2 py-1 text-center font-bold uppercase tracking-wide text-[#4B5563]">
                        Charged
                      </th>
                      <th className="px-2 py-1 text-center font-bold uppercase tracking-wide text-[#4B5563]">
                        Deposit
                      </th>
                      <th className="px-2 py-1 text-center font-bold uppercase tracking-wide text-[#4B5563]">
                        Gap $
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r: RelayDepositMatchReviewRow) => (
                      <tr key={r.bank_transaction_id} className="border-b border-[#E5E7EB]">
                        <td className="px-2 py-1 text-center whitespace-nowrap">
                          {r.transaction_date ? formatDateUS(r.transaction_date) : "—"}
                        </td>
                        <td className={`px-2 py-1 ${QBO_MONEY_CELL_CLASS}`}>{formatUsdCents(r.amount_cents)}</td>
                        <td className={`px-2 py-1 ${QBO_MONEY_CELL_CLASS}`}>
                          {r.wallet_cents != null ? formatUsdCents(r.wallet_cents) : "—"}
                        </td>
                        <td className={`px-2 py-1 ${QBO_MONEY_CELL_CLASS}`}>
                          {r.fee_cents != null ? formatUsdCents(r.fee_cents) : "—"}
                        </td>
                        <td className={`px-2 py-1 ${QBO_MONEY_CELL_CLASS}`}>
                          {r.charged_cents != null ? formatUsdCents(r.charged_cents) : "—"}
                        </td>
                        <td className="px-2 py-1 text-center whitespace-nowrap">
                          {r.relay_deposit_id ?? r.suggested_relay_deposit_id ?? "—"}
                        </td>
                        <td className={`px-2 py-1 ${QBO_MONEY_CELL_CLASS}`}>
                          {r.amount_gap_cents != null ? formatUsdCents(r.amount_gap_cents) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
