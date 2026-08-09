import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createJournalEntry, listClassesForJe, listCoaAccountsForJe } from "../../../api/accounting";
import { Button } from "../../../components/Button";
import { ParityDrawer } from "../../../components/parity/ParityDrawer";
import { ReferenceSelect } from "../../../components/parity/ReferenceSelect";
import { MoneyInput } from "../../../components/forms/MoneyInput";
import { DatePicker } from "../../../components/forms/DatePicker";
import { useToast } from "../../../components/Toast";
import { JournalEntryTypePicker } from "../../../components/accounting/JournalEntryTypePicker";
import { userFacingApiError } from "../../../lib/api-error-message";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onSaved: () => void;
  prefill?: { date?: string; memo?: string } | null;
};

export function ManualJEModal({ open, operatingCompanyId, onClose, onSaved, prefill = null }: Props) {
  const { pushToast } = useToast();
  const [step, setStep] = useState<1 | 2>(1);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [memo, setMemo] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [journalEntryTypeId, setJournalEntryTypeId] = useState<string | null>(null);
  const [lines, setLines] = useState<
    Array<{ account_id: string; class_id: string; entity_uuid: string; debit: number; credit: number; description: string }>
  >([
    { account_id: "", class_id: "", entity_uuid: "", debit: 0, credit: 0, description: "" },
    { account_id: "", class_id: "", entity_uuid: "", debit: 0, credit: 0, description: "" },
  ]);
  const [loading, setLoading] = useState(false);

  const accountsQuery = useQuery({
    queryKey: ["manual-je", "accounts", operatingCompanyId],
    queryFn: () => listCoaAccountsForJe(operatingCompanyId, { postableOnly: true }),
    enabled: open && Boolean(operatingCompanyId),
  });
  const classesQuery = useQuery({
    queryKey: ["manual-je", "classes"],
    queryFn: listClassesForJe,
    enabled: open,
  });

  const accountOptions = useMemo(
    () =>
      (accountsQuery.data?.accounts ?? []).map((account) => ({
        value: account.id,
        label: account.account_name,
      })),
    [accountsQuery.data]
  );
  const classOptions = useMemo(
    () =>
      (classesQuery.data?.classes ?? []).map((klass) => ({
        value: klass.id,
        label: klass.class_code ? `${klass.class_code} - ${klass.class_name}` : klass.class_name,
      })),
    [classesQuery.data]
  );

  const totalDebitCents = useMemo(
    () => lines.reduce((sum, line) => sum + Math.round(Number(line.debit || 0) * 100), 0),
    [lines]
  );
  const totalCreditCents = useMemo(
    () => lines.reduce((sum, line) => sum + Math.round(Number(line.credit || 0) * 100), 0),
    [lines]
  );
  const balanced = totalDebitCents === totalCreditCents && totalDebitCents > 0;
  const canGoToConfirm = balanced && lines.every((line) => line.account_id.trim().length > 0);

  const reset = () => {
    setStep(1);
    setDate(new Date().toISOString().slice(0, 10));
    setMemo("");
    setReferenceNumber("");
    setJournalEntryTypeId(null);
    setLines([
      { account_id: "", class_id: "", entity_uuid: "", debit: 0, credit: 0, description: "" },
      { account_id: "", class_id: "", entity_uuid: "", debit: 0, credit: 0, description: "" },
    ]);
  };

  useEffect(() => {
    if (!open) return;
    reset();
    if (prefill?.date) setDate(prefill.date);
    if (prefill?.memo) setMemo(prefill.memo);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset + optional prefill when opening
  }, [open, prefill?.date, prefill?.memo]);

  const save = async () => {
    setLoading(true);
    try {
      const postings = lines
        .flatMap((line) => [
          line.debit > 0
            ? {
                account_id: line.account_id,
                class_id: line.class_id || null,
                entity_uuid: line.entity_uuid || null,
                debit_or_credit: "debit" as const,
                amount_cents: Math.round(line.debit * 100),
                description: line.description || null,
              }
            : null,
          line.credit > 0
            ? {
                account_id: line.account_id,
                class_id: line.class_id || null,
                entity_uuid: line.entity_uuid || null,
                debit_or_credit: "credit" as const,
                amount_cents: Math.round(line.credit * 100),
                description: line.description || null,
              }
            : null,
        ])
        .filter(Boolean) as Array<{
        account_id: string;
        class_id?: string | null;
        entity_uuid?: string | null;
        debit_or_credit: "debit" | "credit";
        amount_cents: number;
        description?: string | null;
      }>;
      const memoParts: string[] = [];
      if (referenceNumber.trim()) memoParts.push(`Ref: ${referenceNumber.trim()}`);
      if (memo.trim()) memoParts.push(memo.trim());
      const combinedMemo = memoParts.length > 0 ? memoParts.join(" · ") : undefined;
      await createJournalEntry(operatingCompanyId, {
        entry_date: date,
        memo: combinedMemo,
        journal_entry_type_id: journalEntryTypeId,
        source: "manual",
        postings,
      });
      pushToast("Manual journal entry posted", "success");
      onSaved();
      reset();
      onClose();
    } catch (error) {
      pushToast(userFacingApiError(error, "Failed"), "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ParityDrawer
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title={step === 1 ? "Manual Journal Entry - Step 1" : "Manual Journal Entry - Step 2 Confirm"}
      size="wide"
    >
      <div className="space-y-2 text-xs">
        {step === 1 ? (
          <>
            <p className="text-[11px] text-gray-600">Add debit/credit lines. Totals must match before you continue. Date, reference, and memo are set on the next step.</p>
            <div className="space-y-1">
              {lines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-6 gap-1 rounded-sm border border-gray-200 p-1.5">
                  <ReferenceSelect
                    value={line.account_id || null}
                    onChange={(next) => setLines((prev) => prev.map((row, i) => (i === idx ? { ...row, account_id: next ?? "" } : row)))}
                    options={accountOptions}
                    createKind="account"
                    operatingCompanyId={operatingCompanyId}
                    placeholder="Account"
                    onOptionCreated={() => void accountsQuery.refetch()}
                  />
                  <ReferenceSelect
                    value={line.class_id || null}
                    onChange={(next) => setLines((prev) => prev.map((row, i) => (i === idx ? { ...row, class_id: next ?? "" } : row)))}
                    options={classOptions}
                    createKind="class"
                    operatingCompanyId={operatingCompanyId}
                    placeholder="Class"
                    onOptionCreated={() => void classesQuery.refetch()}
                  />
                  <input
                    className="h-8 rounded-sm border border-gray-300 px-2"
                    placeholder="Entity UUID (optional)"
                    value={line.entity_uuid}
                    onChange={(e) => setLines((prev) => prev.map((row, i) => (i === idx ? { ...row, entity_uuid: e.target.value } : row)))}
                  />
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
                      className="h-8 flex-1 rounded-sm border border-gray-300 px-2"
                      placeholder="Description"
                      value={line.description}
                      onChange={(e) => setLines((prev) => prev.map((row, i) => (i === idx ? { ...row, description: e.target.value } : row)))}
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
              onClick={() =>
                setLines((prev) => [...prev, { account_id: "", class_id: "", entity_uuid: "", debit: 0, credit: 0, description: "" }])
              }
            >
              + Create line
            </button>
            <div className={balanced ? "rounded-sm border border-slate-200 bg-slate-100 px-2 py-1 text-slate-700" : "rounded-sm border border-red-200 bg-red-50 px-2 py-1 text-red-700"}>
              Debits ${(totalDebitCents / 100).toFixed(2)} / Credits ${(totalCreditCents / 100).toFixed(2)}{" "}
              {balanced ? "Balanced ✓" : "Not balanced"}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => { reset(); onClose(); }}>
                Cancel
              </Button>
              <Button size="sm" disabled={!canGoToConfirm} onClick={() => setStep(2)}>
                Continue to Confirm
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-sm border border-slate-300 bg-slate-100 px-2 py-2 text-[12px] text-slate-700">
              ⚡ High-risk action. Posting this manual journal entry immediately affects financial reporting.
            </div>
            <div className="rounded-sm border border-gray-200 p-2 text-xs">
              <div><span className="font-semibold">Lines:</span> {lines.length}</div>
              <div><span className="font-semibold">Debits:</span> ${(totalDebitCents / 100).toFixed(2)}</div>
              <div><span className="font-semibold">Credits:</span> ${(totalCreditCents / 100).toFixed(2)}</div>
            </div>
            <label className="block">
              Journal date
              <DatePicker className="mt-1 h-8 w-full rounded-sm border border-gray-300 px-2" value={date} onChange={setDate} />
            </label>
            <label className="block">
              Reference number (optional)
              <input className="mt-1 h-8 w-full rounded-sm border border-gray-300 px-2" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} />
            </label>
            <label className="block">
              Journal entry type
              <div className="mt-1">
                <JournalEntryTypePicker
                  operatingCompanyId={operatingCompanyId}
                  value={journalEntryTypeId}
                  onChange={setJournalEntryTypeId}
                />
              </div>
            </label>
            <label className="block">
              Memo
              <textarea className="mt-1 min-h-16 w-full rounded-sm border border-gray-300 px-2 py-1" value={memo} onChange={(e) => setMemo(e.target.value)} />
            </label>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setStep(1)}>
                Back to edit
              </Button>
              <Button size="sm" variant="secondary" onClick={() => { reset(); onClose(); }}>
                Cancel
              </Button>
              <Button size="sm" disabled={!canGoToConfirm || !date} loading={loading} onClick={() => void save()}>
                Post journal entry
              </Button>
            </div>
          </>
        )}
      </div>
    </ParityDrawer>
  );
}
