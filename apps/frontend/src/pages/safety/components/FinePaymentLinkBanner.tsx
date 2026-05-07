type Props = {
  bankTransactionId?: string | null;
  paidDate?: string | null;
  paidAmountCents?: number | null;
};

export function FinePaymentLinkBanner({ bankTransactionId, paidDate, paidAmountCents }: Props) {
  if (!bankTransactionId) return null;
  return (
    <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
      Linked bank payment: {bankTransactionId} · Paid {paidDate ? String(paidDate).slice(0, 10) : "—"} · Amount $
      {((paidAmountCents ?? 0) / 100).toFixed(2)}
    </div>
  );
}
