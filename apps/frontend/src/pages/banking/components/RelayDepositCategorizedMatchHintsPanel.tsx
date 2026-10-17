import { userFacingApiError } from "../../../lib/api-error-message";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getRelayDepositMatchReview, type RelayDepositMatchReviewRow } from "../../../api/banking";
import { CappedListNotice } from "../../../components/CappedListNotice";
import { MoneyCell } from "../../../components/shared/MoneyCell";
import { formatDateUS } from "../../../lib/formatDate";

import { InfoPopover } from "../../../components/shared/InfoPopover";
type Props = {
  companyId: string;
};

const COLS =
  "grid grid-cols-[minmax(4.5rem,1fr)_repeat(4,minmax(4.5rem,1fr))_minmax(6rem,1.4fr)_minmax(4.5rem,1fr)]";

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
            Lines already categorized to the Relay fuel wallet account.{" "}
            <InfoPopover label="About these match hints">
              Each row shows the settled company deposit that would match (charged = wallet + 3.25% fee). Use
              Match on the transaction to link; this list does not change categorization.
            </InfoPopover>
          </p>
          {isLoading ? (
            <p className="text-xs text-[#6B7280]">Loading…</p>
          ) : isError ? (
            <p className="text-xs text-red-700">{userFacingApiError(error, "Failed to load")}</p>
          ) : rows.length === 0 ? (
            <p className="text-xs text-[#6B7280]">No wallet-categorized outflows need review.</p>
          ) : (
            <>
              <CappedListNotice shown={rows.length} limit={2000} total={total} />
              <div className="mt-2 max-h-64 overflow-auto border-t border-[#E5E7EB]">
                <div
                  role="table"
                  aria-label="Relay deposit match hints"
                  className="w-full text-xs tabular-nums text-[#0F1219]"
                >
                  <div
                    role="row"
                    className={`${COLS} border-b border-[#E5E7EB] bg-[#F7F8FA]`}
                  >
                    {["Date", "Bank", "Wallet", "Fee", "Charged", "Deposit", "Gap $"].map((label) => (
                      <div
                        key={label}
                        role="columnheader"
                        className="px-2 py-1 text-center font-bold uppercase tracking-wide text-[#4B5563]"
                      >
                        {label}
                      </div>
                    ))}
                  </div>
                  {rows.map((r: RelayDepositMatchReviewRow) => (
                    <div
                      key={r.bank_transaction_id}
                      role="row"
                      className={`${COLS} border-b border-[#E5E7EB]`}
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
                      <div role="cell" className="px-2 py-1">
                        <MoneyCell
                          cents={r.wallet_cents}
                          drill={{ entity: { kind: "bank_transaction", id: r.bank_transaction_id } }}
                        />
                      </div>
                      <div role="cell" className="px-2 py-1">
                        <MoneyCell
                          cents={r.fee_cents}
                          drill={{ entity: { kind: "bank_transaction", id: r.bank_transaction_id } }}
                        />
                      </div>
                      <div role="cell" className="px-2 py-1">
                        <MoneyCell
                          cents={r.charged_cents}
                          drill={{ entity: { kind: "bank_transaction", id: r.bank_transaction_id } }}
                        />
                      </div>
                      <div role="cell" className="px-2 py-1 text-center whitespace-nowrap">
                        {r.relay_deposit_id ?? r.suggested_relay_deposit_id ?? "—"}
                      </div>
                      <div role="cell" className="px-2 py-1">
                        <MoneyCell
                          cents={r.amount_gap_cents}
                          drill={{ entity: { kind: "bank_transaction", id: r.bank_transaction_id } }}
                        />
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
