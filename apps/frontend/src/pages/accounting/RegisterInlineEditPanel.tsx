/**
 * B-1c — QBO register row inline edit (§3).
 * Save commits memo + location through the register engine; date/payee/amount/account
 * require Edit → original document (posted reverse+repost not invented here).
 * Delete voids via the document's existing void route. Cancel collapses.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { DatePicker } from "../../components/forms/DatePicker";
import { useToast } from "../../components/Toast";
import {
  saveAccountRegisterInline,
  type AccountRegisterRow,
} from "../../api/account-register";
import {
  voidExpense,
  voidJournalEntry,
  voidPayment,
  voidVendorBill,
  voidVendorBillPayment,
} from "../../api/accounting";
import { type AttachmentEntityType } from "../../api/attachments";
import { UploadZone } from "../../components/UploadZone";
import { formatUsdCents } from "../../lib/money";
import { userFacingApiError } from "../../lib/api-error-message";

const inputCls = "h-7 w-full rounded-sm border border-[#E5E7EB] px-2 text-xs text-[#0F1219]";

function attachmentEntityType(sourceType: string | null): AttachmentEntityType | null {
  const t = (sourceType ?? "").toLowerCase();
  if (t === "expense") return "expense";
  if (t === "bill") return "bill";
  if (t === "invoice") return "invoice";
  if (t === "customer_payment") return "payment";
  if (t === "transfer") return "transfer";
  if (t === "bank_categorization") return "bank_transaction";
  return "journal_entry";
}

function defaultAttachmentCategory(sourceType: string | null): "receipt" | "vendor_invoice" | "other" {
  const t = (sourceType ?? "").toLowerCase();
  if (t === "expense") return "receipt";
  if (t === "bill" || t === "bill_payment") return "vendor_invoice";
  return "other";
}

export type RegisterInlineEditPanelProps = {
  row: AccountRegisterRow;
  companyId: string;
  onEditOriginal: () => void;
  onCancel: () => void;
  onVoided: () => void;
};

export function RegisterInlineEditPanel({
  row,
  companyId,
  onEditOriginal,
  onCancel,
  onVoided,
}: RegisterInlineEditPanelProps) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const [entryDate, setEntryDate] = useState(row.entry_date);
  const [reference, setReference] = useState(row.reference ?? "");
  const [payee, setPayee] = useState(row.payee ?? "");
  const [memo, setMemo] = useState(row.memo ?? row.description ?? "");
  const [location, setLocation] = useState(row.location ?? "");
  const [voidReason, setVoidReason] = useState("");
  const [confirmVoid, setConfirmVoid] = useState(false);

  useEffect(() => {
    setEntryDate(row.entry_date);
    setReference(row.reference ?? "");
    setPayee(row.payee ?? "");
    setMemo(row.memo ?? row.description ?? "");
    setLocation(row.location ?? "");
    setConfirmVoid(false);
    setVoidReason("");
  }, [row.posting_id, row.entry_date, row.reference, row.payee, row.memo, row.description, row.location]);

  const attType = attachmentEntityType(row.source_transaction_type);
  const attEntityId =
    attType === "journal_entry"
      ? row.journal_entry_id
      : row.source_transaction_id;

  const dirtyNeedsOriginal = useMemo(() => {
    const dateDirty = entryDate !== row.entry_date;
    const refDirty = reference.trim() !== (row.reference ?? "").trim();
    const payeeDirty = payee.trim() !== (row.payee ?? "").trim();
    return dateDirty || refDirty || payeeDirty;
  }, [entryDate, reference, payee, row.entry_date, row.reference, row.payee]);

  const memoDirty = memo.trim() !== (row.memo ?? row.description ?? "").trim();
  const locationDirty = location.trim() !== (row.location ?? "").trim();

  const saveMutation = useMutation({
    mutationFn: () =>
      saveAccountRegisterInline({
        operating_company_id: companyId,
        posting_id: row.posting_id,
        memo: memoDirty ? memo.trim() || null : undefined,
        location: locationDirty ? location.trim() || null : undefined,
        requires_original_document: dirtyNeedsOriginal,
      }),
    onSuccess: () => {
      pushToast("Saved", "success");
      void queryClient.invalidateQueries({ queryKey: ["account-register", companyId] });
    },
    onError: (error) => {
      const code = String((error as { body?: { error?: string } })?.body?.error ?? "");
      if (code === "open_original_document") {
        pushToast("Date, payee, and amount change on the original document — opening Edit", "info");
        onEditOriginal();
        return;
      }
      if (code === "reconcile_status_locked") {
        pushToast("Reconciled (R) is locked — reopen the reconciliation report first", "error");
        return;
      }
      if (code === "nothing_to_save") {
        pushToast("Nothing to save", "info");
        return;
      }
      pushToast(userFacingApiError(error, "Could not save"), "error");
    },
  });

  const voidMutation = useMutation({
    mutationFn: async (reason: string) => {
      const t = (row.source_transaction_type ?? "").toLowerCase();
      const id = row.source_transaction_id;
      if (!id && t !== "journal_entry") {
        return voidJournalEntry(row.journal_entry_id, companyId, reason);
      }
      if (t === "expense" && id) return voidExpense(id, companyId, reason);
      if (t === "bill" && id) return voidVendorBill(id, companyId, reason);
      if (t === "bill_payment" && id) return voidVendorBillPayment(id, companyId, reason);
      if (t === "customer_payment" && id) return voidPayment(id, companyId, reason);
      return voidJournalEntry(row.journal_entry_id, companyId, reason);
    },
    onSuccess: () => {
      pushToast("Voided (reversal posted)", "success");
      void queryClient.invalidateQueries({ queryKey: ["account-register", companyId] });
      onVoided();
    },
    onError: (error) => {
      pushToast(userFacingApiError(error, "Could not void"), "error");
    },
  });

  const paymentCents = row.debit_cents > 0 ? row.debit_cents : 0;
  const depositCents = row.credit_cents > 0 ? row.credit_cents : 0;
  const showPayment = paymentCents > 0 || depositCents === 0;
  const showDeposit = depositCents > 0;

  const onSave = () => {
    if (dirtyNeedsOriginal) {
      pushToast("Date, payee, and amount change on the original document — opening Edit", "info");
      onEditOriginal();
      return;
    }
    if (!memoDirty && !locationDirty) {
      pushToast("Nothing to save", "info");
      return;
    }
    saveMutation.mutate();
  };

  return (
    <div className="space-y-2 px-2 py-2 text-xs text-[#0F1219]" data-b1-inline-edit="1" data-testid="b1-inline-edit-panel">
      <p className="text-xs text-[#6B7280]">
        Inline Save updates memo and location. Date, payee, payment, deposit, and account open the original
        document (Edit). Delete voids with a reversing entry — never deletes the row. Attachments upload
        onto the source document here.
      </p>
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
        <label className="block">
          <span className="mb-0.5 block text-xs font-bold uppercase text-[#4B5563]">Date</span>
          <DatePicker value={entryDate} onChange={setEntryDate} className={inputCls} data-testid="b1-inline-date" />
        </label>
        <label className="block">
          <span className="mb-0.5 block text-xs font-bold uppercase text-[#4B5563]">Ref no.</span>
          <input
            className={inputCls}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            data-testid="b1-inline-ref"
          />
        </label>
        <label className="block">
          <span className="mb-0.5 block text-xs font-bold uppercase text-[#4B5563]">Payee</span>
          <input
            className={inputCls}
            value={payee}
            onChange={(e) => setPayee(e.target.value)}
            data-testid="b1-inline-payee"
          />
        </label>
        <label className="block">
          <span className="mb-0.5 block text-xs font-bold uppercase text-[#4B5563]">Class</span>
          <div className="flex h-7 items-center px-1 text-xs">{row.class_name ?? "—"}</div>
        </label>
        <label className="block">
          <span className="mb-0.5 block text-xs font-bold uppercase text-[#4B5563]">Payment</span>
          <div className="flex h-7 items-center px-1 tabular-nums" data-testid="b1-inline-payment">
            {showPayment && paymentCents > 0 ? formatUsdCents(paymentCents) : "—"}
          </div>
        </label>
        <label className="block">
          <span className="mb-0.5 block text-xs font-bold uppercase text-[#4B5563]">Deposit</span>
          <div className="flex h-7 items-center px-1 tabular-nums" data-testid="b1-inline-deposit">
            {showDeposit ? formatUsdCents(depositCents) : "—"}
          </div>
        </label>
        <label className="block">
          <span className="mb-0.5 block text-xs font-bold uppercase text-[#4B5563]">✓</span>
          <div className="flex h-7 items-center px-1" data-b1-reconcile-status={row.reconcile_status || "blank"}>
            {row.reconcile_status || "blank"}
          </div>
        </label>
        <label className="block">
          <span className="mb-0.5 block text-xs font-bold uppercase text-[#4B5563]">Type</span>
          <div className="flex h-7 items-center px-1">{row.type}</div>
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-0.5 block text-xs font-bold uppercase text-[#4B5563]">Account</span>
          <div className="flex h-7 items-center truncate px-1" title={row.split_account ?? undefined}>
            {row.split_account ?? "—"}
          </div>
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-0.5 block text-xs font-bold uppercase text-[#4B5563]">Location</span>
          <input
            className={inputCls}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Bank categorization location"
            data-testid="b1-inline-location"
          />
        </label>
        <label className="block sm:col-span-3 lg:col-span-4">
          <span className="mb-0.5 block text-xs font-bold uppercase text-[#4B5563]">Memo</span>
          <input
            className={inputCls}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            data-testid="b1-inline-memo"
          />
        </label>
      </div>

      <div className="rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] px-2 py-1.5" data-testid="b1-inline-attachments">
        {companyId && attType && attEntityId ? (
          <UploadZone
            operatingCompanyId={companyId}
            entityType={attType}
            entityId={attEntityId}
            defaultCategory={defaultAttachmentCategory(row.source_transaction_type)}
            title={`Attachments${row.attachment_count > 0 ? ` (${row.attachment_count})` : ""}`}
            onUploaded={() => {
              void queryClient.invalidateQueries({ queryKey: ["account-register", companyId] });
            }}
          />
        ) : (
          <p className="text-xs text-[#6B7280]">
            No source document id on this row — open Edit to attach files.
            {row.attachment_count > 0 ? ` Register shows ${row.attachment_count} linked.` : ""}
          </p>
        )}
      </div>

      {confirmVoid ? (
        <div className="flex flex-wrap items-end gap-2 rounded-sm border border-red-200 bg-red-50 px-2 py-2" data-testid="b1-inline-void-confirm">
          <label className="min-w-[220px] flex-1">
            <span className="mb-0.5 block text-xs font-bold uppercase text-[#4B5563]">Void reason</span>
            <input
              className={inputCls}
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="Required — why is this voided?"
              data-testid="b1-inline-void-reason"
            />
          </label>
          <Button
            type="button"
            variant="danger"
            size="sm"
            disabled={voidReason.trim().length < 3 || voidMutation.isPending}
            onClick={() => voidMutation.mutate(voidReason.trim())}
            data-testid="b1-inline-void-confirm-btn"
          >
            Confirm void
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => setConfirmVoid(false)}>
            Keep
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="danger"
          size="sm"
          onClick={() => setConfirmVoid(true)}
          disabled={confirmVoid || row.reconcile_status === "R"}
          title={row.reconcile_status === "R" ? "Reconciled rows cannot be voided from the register" : undefined}
          data-testid="b1-register-delete"
        >
          Delete
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onEditOriginal}
          data-testid="b1-register-edit-original"
        >
          Edit
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onCancel} data-testid="b1-register-cancel">
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={onSave}
          disabled={saveMutation.isPending}
          data-testid="b1-register-save"
        >
          Save
        </Button>
      </div>
    </div>
  );
}
