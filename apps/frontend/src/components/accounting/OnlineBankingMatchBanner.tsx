/**
 * B-1 §5 — "online banking match" banner on the original document.
 * DATE | TYPE | AMOUNT | BANK DETAIL | MODE | [Unmatch]
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "../Button";
import { EntityLink } from "../shared/EntityLink";
import { useToast } from "../Toast";
import { unmatchBankTransaction } from "../../api/banking";
import { formatDateUS } from "../../lib/formatDate";
import { formatUsdCents } from "../../lib/money";
import { userFacingApiError } from "../../lib/api-error-message";

export type OnlineBankingMatchBannerProps = {
  companyId: string;
  bankTransactionId: string;
  txnDate?: string | null;
  description?: string | null;
  amountCents?: number | string | null;
  modeLabel?: string;
  /** Query keys to invalidate after Unmatch (document detail + register). */
  invalidateKeys?: unknown[][];
};

export function OnlineBankingMatchBanner({
  companyId,
  bankTransactionId,
  txnDate,
  description,
  amountCents,
  modeLabel = "Matched",
  invalidateKeys = [],
}: OnlineBankingMatchBannerProps) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const unmatchMutation = useMutation({
    meta: { loads: true },
    mutationFn: () =>
      unmatchBankTransaction({
        operating_company_id: companyId,
        bank_transaction_id: bankTransactionId,
      }),
    onSuccess: () => {
      pushToast("Bank match removed — register ✓ returns to blank", "success");
      for (const key of invalidateKeys) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      void queryClient.invalidateQueries({ queryKey: ["account-register", companyId] });
    },
    onError: (error) => {
      pushToast(userFacingApiError(error, "Could not unmatch bank transaction"), "error");
    },
  });

  const amount =
    amountCents == null || amountCents === ""
      ? "—"
      : formatUsdCents(typeof amountCents === "string" ? Number(amountCents) : amountCents);

  return (
    <div
      className="mb-3 rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] px-2 py-2"
      data-testid="b1-online-banking-match-banner"
    >
      <div className="mb-1 text-xs font-bold uppercase text-[#4B5563]">1 online banking match</div>
      <div
        className="grid min-w-[640px] grid-cols-[auto_auto_auto_1fr_auto_auto] gap-x-1 text-xs text-[#0F1219]"
        role="grid"
        aria-label="Online banking match"
      >
        {["Date", "Type", "Amount", "Bank detail", "Mode", ""].map((h, i) => (
          <div
            key={h || "action"}
            role="columnheader"
            className={`border-b border-[#E5E7EB] px-1 py-1 text-center text-xs font-bold uppercase text-[#4B5563] ${i === 3 ? "text-left" : ""}`}
          >
            {h}
          </div>
        ))}
        <div role="gridcell" className="px-1 py-1 text-center whitespace-nowrap">
          {txnDate ? formatDateUS(txnDate) : "—"}
        </div>
        <div role="gridcell" className="px-1 py-1 text-center">Bank</div>
        <div role="gridcell" className="px-1 py-1 text-center tabular-nums whitespace-nowrap">{amount}</div>
        <div role="gridcell" className="px-1 py-1 text-left">
          <EntityLink
            kind="bank_transaction"
            id={bankTransactionId}
            label={description?.trim() || "Bank transaction"}
          />
        </div>
        <div role="gridcell" className="px-1 py-1 text-center whitespace-nowrap">{modeLabel}</div>
        <div role="gridcell" className="px-1 py-1 text-right">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={unmatchMutation.isPending}
            onClick={() => unmatchMutation.mutate()}
            data-testid="b1-online-banking-unmatch"
          >
            Unmatch
          </Button>
        </div>
      </div>
    </div>
  );
}
