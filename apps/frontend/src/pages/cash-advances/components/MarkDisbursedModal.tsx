import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { markCashAdvanceDisbursed, type CashAdvanceMethod } from "../../../api/cashAdvances";
import { Button } from "../../../components/Button";
import { useToast } from "../../../components/Toast";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  advanceId: string | null;
  onClose: () => void;
  onDone: () => void;
};

export function MarkDisbursedModal({ open, operatingCompanyId, advanceId, onClose, onDone }: Props) {
  const { pushToast } = useToast();
  const [method, setMethod] = useState<CashAdvanceMethod>("direct_bank_transfer");
  const [bankTxnId, setBankTxnId] = useState("");
  const [comdataTxnId, setComdataTxnId] = useState("");
  const [checkNumber, setCheckNumber] = useState("");
  const [wireRef, setWireRef] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      markCashAdvanceDisbursed(advanceId!, operatingCompanyId, {
        disbursement_method: method,
        bank_txn_id: bankTxnId || undefined,
        comdata_txn_id: comdataTxnId || undefined,
        check_number: checkNumber || undefined,
        wire_confirmation_ref: wireRef || undefined,
      }),
    onSuccess: () => {
      pushToast("Advance marked disbursed", "success");
      onDone();
    },
    onError: (error) => pushToast(String((error as Error).message || "Failed"), "error"),
  });

  if (!open || !advanceId) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <div className="fixed inset-x-0 top-20 z-50 mx-auto w-full max-w-lg rounded border border-gray-200 bg-white p-4 text-xs shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Mark Disbursed</h3>
          <button type="button" className="text-gray-500 underline" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="grid gap-2">
          <label className="space-y-1">
            <span>Disbursement Method</span>
            <SelectCombobox className="w-full rounded border border-gray-300 px-2 py-1" value={method} onChange={(e) => setMethod(e.target.value as CashAdvanceMethod)}>
              <option value="direct_bank_transfer">Direct bank transfer</option>
              <option value="wire">Wire</option>
              <option value="comdata">Comdata / EFS</option>
              <option value="in_person_check">In-person check</option>
            </SelectCombobox>
          </label>

          {method === "direct_bank_transfer" ? (
            <label className="space-y-1">
              <span>Bank transaction ID/reference</span>
              <input className="w-full rounded border border-gray-300 px-2 py-1" value={bankTxnId} onChange={(e) => setBankTxnId(e.target.value)} />
            </label>
          ) : null}
          {method === "wire" ? (
            <label className="space-y-1">
              <span>Wire confirmation reference</span>
              <input className="w-full rounded border border-gray-300 px-2 py-1" value={wireRef} onChange={(e) => setWireRef(e.target.value)} />
            </label>
          ) : null}
          {method === "comdata" ? (
            <label className="space-y-1">
              <span>Comdata transaction ID</span>
              <input className="w-full rounded border border-gray-300 px-2 py-1" value={comdataTxnId} onChange={(e) => setComdataTxnId(e.target.value)} />
            </label>
          ) : null}
          {method === "in_person_check" ? (
            <label className="space-y-1">
              <span>Check number</span>
              <input className="w-full rounded border border-gray-300 px-2 py-1" value={checkNumber} onChange={(e) => setCheckNumber(e.target.value)} />
            </label>
          ) : null}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" loading={mutation.isPending} onClick={() => mutation.mutate()}>
            Confirm Disbursement
          </Button>
        </div>
      </div>
    </>
  );
}
