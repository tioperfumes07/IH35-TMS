import { formatDateUS } from "../../../lib/formatDate";
import { EntityLink } from "../../../components/shared/EntityLink";

type Props = {
  bankTransactionId?: string | null;
  paidDate?: string | null;
  paidAmountCents?: number | null;
};

export function FinePaymentLinkBanner({ bankTransactionId, paidDate, paidAmountCents }: Props) {
  if (!bankTransactionId) return null;
  return (
    <div className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
      Linked bank payment:{" "}
      <EntityLink kind="bank_transaction" id={bankTransactionId} label={bankTransactionId.slice(0, 8)} /> · Paid{" "}
      {paidDate ? formatDateUS(paidDate) : "—"} · Amount ${((paidAmountCents ?? 0) / 100).toFixed(2)}
    </div>
  );
}
