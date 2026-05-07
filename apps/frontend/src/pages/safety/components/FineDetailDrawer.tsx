import { useState } from "react";
import { FineConvertConfirmModal } from "./FineConvertConfirmModal";
import { FinePaymentLinkBanner } from "./FinePaymentLinkBanner";

type Props = {
  open: boolean;
  fine: Record<string, unknown> | null;
  operatingCompanyId: string;
  converting?: boolean;
  onClose: () => void;
  onConvertToLiability: (fineId: string) => void;
  onUpdated: () => void;
};

export function FineDetailDrawer({ open, fine, converting, onClose, onConvertToLiability }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  if (!open || !fine) return null;

  const fineId = String(fine.id ?? "");
  const canConvert =
    String(fine.subject_type ?? "") === "driver" &&
    !fine.converted_to_liability_id &&
    ["open", "reduced"].includes(String(fine.status ?? ""));

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <aside className="fixed right-0 top-0 z-50 h-full w-[560px] max-w-full overflow-y-auto border-l border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Fine Detail</h3>
          <button type="button" className="text-xs text-gray-500" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="mt-3 space-y-2 text-sm">
          <div><strong>Status:</strong> {String(fine.status ?? "open")}</div>
          <div><strong>Subject:</strong> {String(fine.subject_type ?? "—")}</div>
          <div><strong>Violation:</strong> {String(fine.violation_description ?? "—")}</div>
          <div><strong>Authority:</strong> {String(fine.issued_by_authority ?? "—")}</div>
          <div><strong>Issued date:</strong> {String(fine.issued_date ?? "").slice(0, 10)}</div>
          <div><strong>Amount:</strong> ${(Number(fine.amount_cents ?? 0) / 100).toFixed(2)}</div>
          <div><strong>Converted liability:</strong> {String(fine.converted_to_liability_id ?? "No")}</div>
        </div>

        <div className="mt-3">
          <FinePaymentLinkBanner
            bankTransactionId={String(fine.paid_via_bank_transaction_id ?? "") || null}
            paidDate={String(fine.paid_date ?? "") || null}
            paidAmountCents={Number(fine.paid_amount_cents ?? 0)}
          />
        </div>

        {canConvert ? (
          <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <p>Converting this fine creates a driver liability and locks violation/amount fields.</p>
            <button
              type="button"
              className="mt-2 rounded bg-amber-700 px-3 py-1 font-semibold text-white"
              onClick={() => setConfirmOpen(true)}
            >
              Convert to Driver Liability
            </button>
          </div>
        ) : null}
      </aside>

      <FineConvertConfirmModal
        open={confirmOpen}
        amountCents={Number(fine.amount_cents ?? 0)}
        driverLabel={String(fine.subject_driver_id ?? "driver")}
        loading={converting}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          onConvertToLiability(fineId);
          setConfirmOpen(false);
        }}
      />
    </>
  );
}
