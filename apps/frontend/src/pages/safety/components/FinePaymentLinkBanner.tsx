import { formatDateUS } from "../../../lib/formatDate";
import { EntityLink } from "../../../components/shared/EntityLink";
import { entityLabel } from "../../../lib/entity-label";

type Props = {
  bankTransactionId?: string | null;
  paidDate?: string | null;
  paidAmountCents?: number | null;
};

export function FinePaymentLinkBanner({ bankTransactionId, paidDate, paidAmountCents }: Props) {
  if (!bankTransactionId) return null;
  return (
    <div className="rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] px-3 py-2 text-xs text-[#1F2A44]">
      Linked bank payment:{" "}
      <EntityLink
        kind="bank_transaction"
        id={bankTransactionId}
        label={entityLabel(null, bankTransactionId, "Bank transaction")}
      /> · Paid{" "}
      {paidDate ? formatDateUS(paidDate) : "—"} · Amount ${((paidAmountCents ?? 0) / 100).toFixed(2)}
    </div>
  );
}
