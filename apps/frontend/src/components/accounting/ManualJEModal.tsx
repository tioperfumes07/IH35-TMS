import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createJournalEntry, listClassesForJe, listCoaAccountsForJe } from "../../api/accounting";
import { Button } from "../Button";
import { Modal } from "../Modal";
import { MoneyInput } from "../forms/MoneyInput";
import { useToast } from "../Toast";
import { SelectCombobox } from "../shared/SelectCombobox";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onSaved: () => void;
  prefill?: { date?: string; memo?: string; referenceNumber?: string } | null;
};

type LineRow = {
  account_id: string;
  class_id: string;
  debit: number;
  credit: number;
  description: string;
};

const emptyLine = (): LineRow => ({
  account_id: "",
  class_id: "",
  debit: 0,
  credit: 0,
  description: "",
});

export function ManualJEModal({ open, operatingCompanyId, onClose, onSaved, prefill = null }: Props) {
  const { pushToast } = useToast();
  const [step, setStep] = useState<1 | 2>(1);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [memo, setMemo] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [lines, setLines] = useState<LineRow[]>([emptyLine(), emptyLine()]);
  const [loading, setLoading] = useState(false);

  const accountsQuery = useQuery({
    queryKey: ["manual-je", "accounts"],
    queryFn: listCoaAccountsForJe,
    enabled: open && step === 2,
  });
  const classesQuery = useQuery({
    queryKey: ["manual-je", "classes"],
    queryFn: listClassesForJe,
    enabled: open && step === 2,
  });

  const totalDebitCents = useMemo(
    () => lines.reduce((sum, line) => sum + Math.round(Number(line.debit || 0) * 100), 0),
    [lines]
  );
  const totalCreditCents = useMemo(
    () => lines.reduce((sum, line) => sum + Math.round(Number(line.credit || 0) * 100), 0),
    [lines]
  );
  const balanced = totalDebitCents === totalCreditCents && totalDebitCents > 0;
  const linesValid = balanced && lines.every((line) => line.account_id.trim().length > 0);
  const canContinueStep1 = date.trim().length > 0;

  const reset = () => {
    setStep(1);
    setDate(new Date().toISOString().slice(0, 10));
    setMemo("");
    setReferenceNumber("");
    setLines([emptyLine(), emptyLine()]);
  };

  useEffect(() => {
    if (!open) return;
    reset();
    if (prefill?.date) setDate(prefill.date);
    if (prefill?.memo) setMemo(prefill.memo);
    if (prefill?.referenceNumber) setReferenceNumber(prefill.referenceNumber);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset + optional prefill when opening
  }, [open, prefill?.date, prefill?.memo, prefill?.referenceNumber]);

  const save = async () => {
    if (!linesValid) {
      pushToast("Debits and credits must balance before saving", "error");
      return;
    }
    setLoading(true);
    try {
      const postings = lines
        .flatMap((line) => [
          line.debit > 0
            ? {
                account_id: line.account_id,
                class_id: line.class_id || null,
                debit_or_credit: "debit" as const,
                amount_cents: Math.round(line.debit * 100),
                description: line.description || null,
              }
            : null,
          line.credit > 0
            ? {
                account_id: line.account_id,
                class_id: line.class_id || null,
                debit_or_credit: "credit" as const,
                amount_cents: Math.round(line.credit * 100),
                description: line.description || null,
              }
            : null,
        ])
        .filter(Boolean) as Array<{
        account_id: string;
        class_id?: string | null;
        debit_or_credit: "debit" | "credit";
        amount_cents: number;
        description?: string | null;
      }>;
      await createJournalEntry(operatingCompanyId, {
        entry_date: date,
        memo: memo.trim() || undefined,
        reference_number: referenceNumber.trim() || undefined,
        source: "manual",
        postings,
      });
      pushToast("Manual journal entry posted", "success");
      onSaved();
      reset();
      onClose();
    } catch (error) {
      pushToast(String((error as Error).message || "Failed"), "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title={step === 1 ? "Manual Journal Entry — Step 1: Header" : "Manual Journal Entry — Step 2: Lines"}
    >
      <div className="space-y-2 text-xs">
        {step === 1 ? (
          <>
            <p className="text-[11px] text-gray-600">Enter the journal header. Line items are added on the next step.</p>
            <label className="block">
              Journal date
              <input
                type="date"
                className="mt-1 h-8 w-full rounded border border-gray-300 px-2"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <label className="block">
              Reference number (optional)
              <input
                className="mt-1 h-8 w-full rounded border border-gray-300 px-2"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
              />
            </label>
            <label className="block">
              Memo
              <textarea
                className="mt-1 min-h-16 w-full rounded border border-gray-300 px-2 py-1"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
              />
            </label>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  reset();
                  onClose();
                }}
              >
                Cancel
              </Button>
              <Button size="sm" disabled={!canContinueStep1} onClick={() => setStep(2)}>
                Continue to Lines
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] text-gray-700">
              <span className="font-semibold">Date:</span> {date}
              {referenceNumber.trim() ? (
                <>
                  {" · "}
                  <span className="font-semibold">Ref:</span> {referenceNumber.trim()}
                </>
              ) : null}
              {memo.trim() ? (
                <>
                  {" · "}
                  <span className="font-semibold">Memo:</span> {memo.trim()}
                </>
              ) : null}
            </div>
            <div className="space-y-1">
              <div className="grid grid-cols-5 gap-1 px-1.5 text-[10px] font-semibold uppercase text-gray-500">
                <span>Account</span>
                <span>Class</span>
                <span>Debit</span>
                <span>Credit</span>
                <span>Description</span>
              </div>
              {lines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-5 gap-1 rounded border border-gray-200 p-1.5">
                  <SelectCombobox
                    className="h-8 rounded border border-gray-300 px-1"
                    value={line.account_id}
                    onChange={(e) => setLines((prev) => prev.map((row, i) => (i === idx ? { ...row, account_id: e.target.value } : row)))}
                  >
                    <option value="">Account</option>
                    {(accountsQuery.data?.accounts ?? []).map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.account_number} - {account.account_name}
                      </option>
                    ))}
                  </SelectCombobox>
                  <SelectCombobox
                    className="h-8 rounded border border-gray-300 px-1"
                    value={line.class_id}
                    onChange={(e) => setLines((prev) => prev.map((row, i) => (i === idx ? { ...row, class_id: e.target.value } : row)))}
                  >
                    <option value="">Class</option>
                    {(classesQuery.data?.classes ?? []).map((klass) => (
                      <option key={klass.id} value={klass.id}>
                        {klass.class_code ? `${klass.class_code} - ` : ""}
                        {klass.class_name}
                      </option>
                    ))}
                  </SelectCombobox>
                  {/* M-1: dollars-mode QBO money entry; debit/credit DOLLARS → Math.round(*100)=amount_cents byte-for-byte. */}
                  <MoneyInput
                    valueDollars={line.debit || null}
                    onChangeDollars={(d) => setLines((prev) => prev.map((row, i) => (i === idx ? { ...row, debit: d ?? 0 } : row)))}
                    ariaLabel="Debit"
                    placeholder="Debit"
                  />
                  <MoneyInput
                    valueDollars={line.credit || null}
                    onChangeDollars={(d) => setLines((prev) => prev.map((row, i) => (i === idx ? { ...row, credit: d ?? 0 } : row)))}
                    ariaLabel="Credit"
                    placeholder="Credit"
                  />
                  <div className="flex items-center gap-1">
                    <input
                      className="h-8 flex-1 rounded border border-gray-300 px-2"
                      placeholder="Description"
                      value={line.description}
                      onChange={(e) =>
                        setLines((prev) => prev.map((row, i) => (i === idx ? { ...row, description: e.target.value } : row)))
                      }
                    />
                    <button
                      type="button"
                      className="text-red-700"
                      onClick={() => setLines((prev) => (prev.length <= 2 ? prev : prev.filter((_, i) => i !== idx)))}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="text-slate-700 underline"
              onClick={() => setLines((prev) => [...prev, emptyLine()])}
            >
              + Add line
            </button>
            <div
              className={
                balanced
                  ? "rounded border border-green-200 bg-green-50 px-2 py-1 text-green-700"
                  : "rounded border border-red-200 bg-red-50 px-2 py-1 text-red-700"
              }
            >
              Debits ${(totalDebitCents / 100).toFixed(2)} / Credits ${(totalCreditCents / 100).toFixed(2)}{" "}
              {balanced ? "Balanced ✓" : "Not balanced"}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setStep(1)}>
                Back to Header
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  reset();
                  onClose();
                }}
              >
                Cancel
              </Button>
              <Button size="sm" disabled={!linesValid} loading={loading} onClick={() => void save()}>
                Save journal entry
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
