import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { getPlaidBankAccounts } from "../../../api/banking";
import {
  getAuditFeed,
  getBankTransactionMatchCandidates,
  postBankTransactionAttachment,
  postBankTransactionCategorizeExtended,
  postBankTransactionExclude,
  postBankTransactionMatch,
  postBankingRulesFromTransaction,
  postCreditCardPaymentWave2,
  postBankTransferWave2,
  uploadDocumentSimple,
} from "../../../api/banking-wave2";
import { ApiError } from "../../../api/client";
import { QboCombobox } from "../../../components/forms/QboCombobox";
import { LocationMapModal } from "../../../components/maintenance/LocationMapModal";
import { Modal } from "../../../components/Modal";
import { useToast } from "../../../components/Toast";
import { formatCurrencyCents, formatDate } from "../../../lib/format";

export type CategorizeModalMode = "categorize" | "match" | "transfer" | "credit_card_payment";

export type CategorizeResult =
  | { saved: true; mode: CategorizeModalMode; transactionIds: string[] }
  | { saved: false };

const categorizeSchema = z.object({
  transactionDate: z.string().min(1, "Date required"),
  accountId: z.string().min(1, "Account required"),
  vendorId: z.string().nullable().optional(),
  customerId: z.string().nullable().optional(),
  productServiceId: z.string().nullable().optional(),
  allocateCustomerId: z.string().nullable().optional(),
  classId: z.string().optional(),
  memo: z.string().optional(),
  billable: z.boolean(),
});

type CategorizeForm = z.infer<typeof categorizeSchema>;

export type CategorizeTransactionModalProps = {
  operatingCompanyId: string;
  /** One or many transaction IDs (bulk uses same payload per ID). */
  transactionIds: string[];
  open: boolean;
  initialMode?: CategorizeModalMode;
  /** Snippet from parent list/detail row. */
  transactionPreview?: Record<string, unknown>;
  onClose: () => void;
  onSaved: (result: CategorizeResult) => void;
};

function txDate(preview: Record<string, unknown> | undefined): string {
  const raw = String(preview?.transaction_date ?? "").slice(0, 10);
  if (raw) return raw;
  return new Date().toISOString().slice(0, 10);
}

function bankDetailSnippet(preview: Record<string, unknown> | undefined): string {
  if (!preview) return "—";
  return String(preview.description ?? preview.merchant_name ?? preview.bank_detail ?? "—");
}

function amountCents(preview: Record<string, unknown> | undefined): number {
  if (!preview || preview.amount_cents == null) return 0;
  return Number(preview.amount_cents);
}

export function CategorizeTransactionModal({
  operatingCompanyId,
  transactionIds,
  open,
  initialMode = "categorize",
  transactionPreview,
  onClose,
  onSaved,
}: CategorizeTransactionModalProps) {
  const qc = useQueryClient();
  const { pushToast } = useToast();
  const primaryId = transactionIds[0] ?? "";
  const [mode, setMode] = useState<CategorizeModalMode>(initialMode);
  const [locationMapOpen, setLocationMapOpen] = useState(false);
  const [locationCodes, setLocationCodes] = useState<string[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [excludeOpen, setExcludeOpen] = useState(false);
  const [excludeReason, setExcludeReason] = useState("");
  const [transferPending404, setTransferPending404] = useState(false);
  const [ccPending404, setCcPending404] = useState(false);

  const [vendorKind, setVendorKind] = useState<"vendor" | "customer">("vendor");
  const [vId, setVId] = useState<string | null>(null);
  const [vLabel, setVLabel] = useState("");
  const [acctId, setAcctId] = useState<string | null>(null);
  const [acctLabel, setAcctLabel] = useState("");
  const [itemId, setItemId] = useState<string | null>(null);
  const [itemLabel, setItemLabel] = useState("");
  const [custAllocId, setCustAllocId] = useState<string | null>(null);
  const [custAllocLabel, setCustAllocLabel] = useState("");

  const [toBankId, setToBankId] = useState("");
  const [xferMemo, setXferMemo] = useState("");
  const [xferDate, setXferDate] = useState(txDate(transactionPreview));

  const [ccAcctId, setCcAcctId] = useState("");
  const [ccPayDate, setCcPayDate] = useState(txDate(transactionPreview));
  const [ccMemo, setCcMemo] = useState("");

  const fileRef = useRef<HTMLInputElement | null>(null);

  const form = useForm<CategorizeForm>({
    defaultValues: {
      transactionDate: txDate(transactionPreview),
      accountId: "",
      vendorId: null,
      customerId: null,
      productServiceId: null,
      allocateCustomerId: null,
      classId: "",
      memo: "",
      billable: false,
    },
  });

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    form.reset({
      transactionDate: txDate(transactionPreview),
      accountId: "",
      memo: "",
      billable: false,
      classId: "",
      vendorId: null,
      customerId: null,
      productServiceId: null,
      allocateCustomerId: null,
    });
    setVId(null);
    setVLabel("");
    setAcctId(null);
    setAcctLabel("");
    setItemId(null);
    setItemLabel("");
    setCustAllocId(null);
    setCustAllocLabel("");
    setLocationCodes([]);
    setXferDate(txDate(transactionPreview));
    setXferMemo("");
    setToBankId("");
    setCcPayDate(txDate(transactionPreview));
    setCcMemo("");
    setCcAcctId("");
    setTransferPending404(false);
    setCcPending404(false);
  }, [open, initialMode, transactionPreview, form]);

  const candidatesQuery = useQuery({
    queryKey: ["banking", "categorize-modal-candidates", operatingCompanyId, primaryId],
    queryFn: () => getBankTransactionMatchCandidates(primaryId, operatingCompanyId),
    enabled: open && Boolean(primaryId) && mode === "match",
  });

  const auditQuery = useQuery({
    queryKey: ["audit", "bank_tx", primaryId],
    queryFn: () => getAuditFeed(operatingCompanyId, "bank_transaction", primaryId),
    enabled: historyOpen && Boolean(primaryId),
  });

  const banksQuery = useQuery({
    queryKey: ["banking", "plaid-accounts", operatingCompanyId, "categorize-modal"],
    queryFn: () => getPlaidBankAccounts(operatingCompanyId),
    enabled: open && Boolean(operatingCompanyId) && (mode === "transfer" || mode === "credit_card_payment"),
  });

  const fromBankId = String(transactionPreview?.bank_account_id ?? "");

  const bankOptions = useMemo(() => banksQuery.data?.accounts ?? [], [banksQuery.data?.accounts]);
  const toBankChoices = useMemo(() => bankOptions.filter((b) => b.id !== fromBankId), [bankOptions, fromBankId]);

  const saveCategorize = async (_addAnother: boolean) => {
    const parsed = categorizeSchema.safeParse({
      transactionDate: form.getValues("transactionDate"),
      accountId: acctId ?? "",
      vendorId: vendorKind === "vendor" ? vId : null,
      customerId: vendorKind === "customer" ? vId : null,
      productServiceId: itemId,
      allocateCustomerId: custAllocId,
      classId: form.getValues("classId")?.trim(),
      memo: form.getValues("memo")?.trim(),
      billable: form.getValues("billable"),
    });
    if (!parsed.success) {
      const first = parsed.error.issues[0]?.message ?? "Check required fields";
      pushToast(first, "error");
      return;
    }
    const payloads = transactionIds.length ? transactionIds : [primaryId];
    try {
      await Promise.all(
        payloads.map((tid) =>
          postBankTransactionCategorizeExtended(tid, operatingCompanyId, {
            vendor_id: parsed.data.vendorId ?? null,
            customer_id: parsed.data.customerId ?? null,
            account_id: parsed.data.accountId,
            product_service_id: parsed.data.productServiceId ?? null,
            billable: parsed.data.billable,
            location_codes: locationCodes,
            class_id: parsed.data.classId ?? null,
            memo: parsed.data.memo ?? null,
          })
        )
      );
      pushToast("Saved", "success");
      void qc.invalidateQueries({ queryKey: ["banking"] });
      onSaved({ saved: true, mode: "categorize", transactionIds: payloads });
      if (!_addAnother) onClose();
    } catch (e) {
      pushToast(String((e as Error).message ?? "Save failed"), "error");
    }
  };

  const matchMut = useMutation({
    mutationFn: (args: { kind: string; target_id: string }) => postBankTransactionMatch(primaryId, operatingCompanyId, args),
    onSuccess: () => {
      pushToast("Matched", "success");
      void qc.invalidateQueries({ queryKey: ["banking"] });
      onSaved({ saved: true, mode: "match", transactionIds: [primaryId] });
      onClose();
    },
    onError: (e) => pushToast(String((e as Error).message ?? "Match failed"), "error"),
  });

  const transferMut = useMutation({
    mutationFn: async () => {
      try {
        await postBankTransferWave2(operatingCompanyId, {
          from_bank_account_id: fromBankId,
          to_bank_account_id: toBankId,
          transfer_date: xferDate,
          amount_cents: Math.abs(amountCents(transactionPreview)),
          memo: xferMemo.trim() || undefined,
          source_bank_transaction_id: primaryId,
        });
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          setTransferPending404(true);
          pushToast("Transfer endpoint pending Wave 2 deploy", "info");
          return "pending" as const;
        }
        throw e;
      }
      return "ok" as const;
    },
    onSuccess: (r) => {
      if (r === "pending") return;
      pushToast("Transfer saved", "success");
      void qc.invalidateQueries({ queryKey: ["banking"] });
      onSaved({ saved: true, mode: "transfer", transactionIds: [primaryId] });
      onClose();
    },
    onError: (e) => pushToast(String((e as Error).message ?? "Transfer failed"), "error"),
  });

  const ccMut = useMutation({
    mutationFn: async () => {
      try {
        await postCreditCardPaymentWave2(operatingCompanyId, {
          credit_card_account_id: ccAcctId,
          from_bank_account_id: fromBankId,
          payment_date: ccPayDate,
          amount_cents: Math.abs(amountCents(transactionPreview)),
          memo: ccMemo.trim() || undefined,
          source_bank_transaction_id: primaryId,
        });
        return "ok" as const;
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          setCcPending404(true);
          pushToast("Credit card payment endpoint pending Wave 2 deploy", "info");
          return "pending" as const;
        }
        throw e;
      }
    },
    onSuccess: (r) => {
      if (r === "pending") return;
      pushToast("Payment saved", "success");
      void qc.invalidateQueries({ queryKey: ["banking"] });
      onSaved({ saved: true, mode: "credit_card_payment", transactionIds: [primaryId] });
      onClose();
    },
    onError: (e) => pushToast(String((e as Error).message ?? "Payment failed"), "error"),
  });

  const excludeMut = useMutation({
    mutationFn: () => postBankTransactionExclude(primaryId, operatingCompanyId, { reason: excludeReason.trim() }),
    onSuccess: () => {
      pushToast("Excluded", "success");
      void qc.invalidateQueries({ queryKey: ["banking"] });
      setExcludeOpen(false);
      onClose();
    },
    onError: (e) => pushToast(String((e as Error).message ?? "Exclude failed"), "error"),
  });

  const ruleMut = useMutation({
    mutationFn: () => postBankingRulesFromTransaction(primaryId, operatingCompanyId, "description_contains"),
    onSuccess: () => pushToast("Rule draft created", "success"),
    onError: () => pushToast("Rule endpoint unavailable", "info"),
  });

  const onAttach = useCallback(async () => {
    const inp = fileRef.current;
    const file = inp?.files?.[0];
    if (!file) return;
    try {
      const up = await uploadDocumentSimple(file, operatingCompanyId);
      await postBankTransactionAttachment(primaryId, operatingCompanyId, { document_id: up.id });
      pushToast("Attachment linked", "success");
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        pushToast("Upload endpoint pending deploy", "info");
      } else {
        pushToast(String((e as Error).message ?? "Upload failed"), "error");
      }
    } finally {
      if (inp) inp.value = "";
    }
  }, [operatingCompanyId, primaryId, pushToast]);

  const title = "Categorize transaction";

  if (!primaryId && open) {
    return null;
  }

  const events = auditQuery.data?.items ?? auditQuery.data?.events ?? [];

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={title}
        modalKind="categorize-bank-tx"
        sizePreset="xl"
        resizable
        confirmDiscardOnClose
        isDirty={form.formState.isDirty}
      >
        <div className="space-y-4 text-sm text-gray-900">
          <fieldset className="flex flex-wrap gap-4 border-0 p-0">
            <legend className="sr-only">Transaction action</legend>
            {(
              [
                ["categorize", "Categorize"],
                ["match", "Match"],
                ["transfer", "Record as transfer"],
                ["credit_card_payment", "Record as credit card payment"],
              ] as const
            ).map(([id, label]) => (
              <label key={id} className="flex cursor-pointer items-center gap-2">
                <input type="radio" name="cat-mode" checked={mode === id} onChange={() => setMode(id)} aria-label={label} />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>

          {mode === "categorize" ? (
            <div className="space-y-3">
              <div className="grid gap-3 lg:grid-cols-6 lg:items-end">
                <label className="lg:col-span-1">
                  <span className="text-xs font-medium text-gray-600">Transaction date</span>
                  <input type="date" className="mt-1 w-full rounded border border-gray-300 px-2 py-1" {...form.register("transactionDate")} aria-label="Transaction date" />
                </label>
                <div className="lg:col-span-1">
                  <span className="text-xs font-medium text-gray-600">Vendor / Customer / project</span>
                  <div className="mt-1 flex gap-2">
                    <select className="rounded border border-gray-300 px-1 py-1 text-xs" value={vendorKind} onChange={(e) => setVendorKind(e.target.value as "vendor" | "customer")} aria-label="Entity kind for primary combobox">
                      <option value="vendor">Vendor</option>
                      <option value="customer">Customer</option>
                    </select>
                  </div>
                  <QboCombobox
                    entityType={vendorKind}
                    operatingCompanyId={operatingCompanyId}
                    value={vId}
                    displayValue={vLabel}
                    onChange={(qid, label) => {
                      setVId(qid);
                      setVLabel(label);
                    }}
                    onPick={(row) => setVId(row.id)}
                    placeholder="Search vendor or customer…"
                  />
                </div>
                <div className="lg:col-span-1">
                  <span className="text-xs font-medium text-gray-600">Account*</span>
                  <QboCombobox
                    entityType="account"
                    operatingCompanyId={operatingCompanyId}
                    value={acctId}
                    displayValue={acctLabel}
                    onChange={(qid, label) => {
                      setAcctId(qid);
                      setAcctLabel(label);
                      form.setValue("accountId", qid ?? "", { shouldDirty: true });
                    }}
                    onPick={(row) => {
                      setAcctId(row.id);
                      form.setValue("accountId", row.id, { shouldDirty: true });
                    }}
                    placeholder="Required account…"
                    allowFreeText={false}
                  />
                  {form.formState.errors.accountId || !acctId ? (
                    <p className="text-xs text-red-600">{acctId ? "" : "Account required"}</p>
                  ) : null}
                </div>
                <div className="flex items-center justify-center text-xs text-gray-500 lg:col-span-1">or</div>
                <div className="lg:col-span-1">
                  <span className="text-xs font-medium text-gray-600">Product / Service</span>
                  <QboCombobox
                    entityType="item"
                    operatingCompanyId={operatingCompanyId}
                    value={itemId}
                    displayValue={itemLabel}
                    onChange={(qid, label) => {
                      setItemId(qid);
                      setItemLabel(label);
                    }}
                    onPick={(row) => setItemId(row.id)}
                    placeholder="Optional item…"
                  />
                </div>
                <div className="lg:col-span-1">
                  <span className="text-xs font-medium text-gray-600">Customer / project (alloc.)</span>
                  <QboCombobox
                    entityType="customer"
                    operatingCompanyId={operatingCompanyId}
                    value={custAllocId}
                    displayValue={custAllocLabel}
                    onChange={(qid, label) => {
                      setCustAllocId(qid);
                      setCustAllocLabel(label);
                    }}
                    onPick={(row) => setCustAllocId(row.id)}
                    placeholder="Optional…"
                  />
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <label className="flex items-center gap-2">
                  <input type="checkbox" {...form.register("billable")} aria-label="Billable" />
                  Billable
                </label>
                <div>
                  <span className="text-xs font-medium text-gray-600">Location</span>
                  <div className="mt-1 flex gap-2">
                    <input readOnly className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs" value={locationCodes.join(", ")} aria-label="Selected location codes" />
                    <button type="button" className="rounded border border-gray-300 px-2 py-1 text-xs" data-open-map="" aria-label="Open location map" onClick={() => setLocationMapOpen(true)}>
                      Map
                    </button>
                  </div>
                </div>
                <label>
                  <span className="text-xs font-medium text-gray-600">Class</span>
                  <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1" {...form.register("classId")} aria-label="Class id" />
                </label>
              </div>
              <label className="block">
                <span className="text-xs font-medium text-gray-600">Memo</span>
                <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1" {...form.register("memo")} aria-label="Memo" />
              </label>
            </div>
          ) : null}

          {mode === "match" ? (
            <div className="space-y-2">
              {candidatesQuery.isLoading ? <p>Loading matches…</p> : null}
              {(candidatesQuery.data?.candidates ?? []).map((c, i) => (
                <div key={i} className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-100 p-2">
                  <div className="text-xs">
                    <div className="font-medium">{String(c.vendor_name ?? c.label ?? "")}</div>
                    <div className="text-gray-600">
                      {formatCurrencyCents(Number(c.amount_cents ?? 0))} · {formatDate(String((c as Record<string, unknown>).date ?? ""))} ·{" "}
                      {String((c as Record<string, unknown>).kind ?? (c as Record<string, unknown>).type ?? "")}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white"
                    aria-label="Match to candidate"
                    onClick={() =>
                    matchMut.mutate({
                      kind: String((c as Record<string, unknown>).kind ?? (c as Record<string, unknown>).type ?? "record"),
                      target_id: String((c as Record<string, unknown>).target_id ?? (c as Record<string, unknown>).id ?? ""),
                    })
                  }
                  >
                    Match
                  </button>
                </div>
              ))}
              {(candidatesQuery.data?.candidates ?? []).length === 0 && !candidatesQuery.isLoading ? (
                <p className="text-xs text-gray-600">No candidates.</p>
              ) : null}
            </div>
          ) : null}

          {mode === "transfer" ? (
            <div className="space-y-2">
              {transferPending404 ? <p className="text-amber-800">Transfer endpoint pending Wave 2 deploy</p> : null}
              <p className="text-xs text-gray-600">From account (readonly): {fromBankId || "—"}</p>
              <label className="block">
                To account
                <select className="mt-1 w-full rounded border border-gray-300 px-2 py-1" value={toBankId} onChange={(e) => setToBankId(e.target.value)} aria-label="To bank account">
                  <option value="">—</option>
                  {toBankChoices.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.account_name} · {b.account_mask}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                Date
                <input type="date" className="mt-1 w-full rounded border border-gray-300 px-2 py-1" value={xferDate} onChange={(e) => setXferDate(e.target.value)} aria-label="Transfer date" />
              </label>
              <label className="block">
                Memo
                <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1" value={xferMemo} onChange={(e) => setXferMemo(e.target.value)} aria-label="Transfer memo" />
              </label>
            </div>
          ) : null}

          {mode === "credit_card_payment" ? (
            <div className="space-y-2">
              {ccPending404 ? <p className="text-amber-800">Credit card payment endpoint pending Wave 2 deploy</p> : null}
              <label className="block">
                Credit card account (COA)
                <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1" value={ccAcctId} onChange={(e) => setCcAcctId(e.target.value)} aria-label="Credit card account id" placeholder="Account UUID" />
              </label>
              <label className="block">
                Payment date
                <input type="date" className="mt-1 w-full rounded border border-gray-300 px-2 py-1" value={ccPayDate} onChange={(e) => setCcPayDate(e.target.value)} aria-label="Payment date" />
              </label>
              <label className="block">
                Memo
                <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1" value={ccMemo} onChange={(e) => setCcMemo(e.target.value)} aria-label="Payment memo" />
              </label>
            </div>
          ) : null}

          <div className="rounded bg-gray-50 px-3 py-2 text-xs text-gray-700">
            <span className="font-semibold">Bank detail:</span> {bankDetailSnippet(transactionPreview)}
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-3 text-xs">
            <input ref={fileRef} type="file" className="hidden" aria-label="Attachment file input" onChange={() => void onAttach()} />
            <button type="button" className="text-blue-700 hover:underline" aria-label="Add attachment" onClick={() => fileRef.current?.click()}>
              Add attachment
            </button>
            <button type="button" className="text-blue-700 hover:underline" aria-label="Create a rule from this transaction" onClick={() => void ruleMut.mutate()}>
              Create a rule
            </button>
            <button type="button" className="text-blue-700 hover:underline" aria-label="Exclude transaction" onClick={() => setExcludeOpen(true)}>
              Exclude
            </button>
            <button type="button" className="text-blue-700 hover:underline" aria-label="View categorization history" onClick={() => setHistoryOpen(true)}>
              Categorization history
            </button>
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-3">
            <button type="button" className="rounded border border-gray-300 px-4 py-2 text-sm" aria-label="Cancel categorize modal" onClick={onClose}>
              Cancel
            </button>
            {mode === "categorize" ? (
              <>
                <button
                  type="button"
                  className="rounded border border-gray-300 px-4 py-2 text-sm"
                  aria-label="Save and add another"
                  onClick={() => void saveCategorize(true)}
                >
                  Save and add another
                </button>
                <button
                  type="button"
                  className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
                  aria-label="Save and close"
                  onClick={() => void saveCategorize(false)}
                >
                  Save and close
                </button>
              </>
            ) : null}
            {mode === "transfer" ? (
              <button
                type="button"
                className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
                aria-label="Save transfer"
                disabled={!toBankId || transferMut.isPending || transferPending404}
                onClick={() => void transferMut.mutateAsync()}
              >
                Save and close
              </button>
            ) : null}
            {mode === "credit_card_payment" ? (
              <button
                type="button"
                className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
                aria-label="Save credit card payment"
                disabled={!ccAcctId || ccMut.isPending || ccPending404}
                onClick={() => void ccMut.mutateAsync()}
              >
                Save and close
              </button>
            ) : null}
          </div>
        </div>
      </Modal>

      <LocationMapModal
        open={locationMapOpen}
        selectedCodes={locationCodes}
        onClose={() => setLocationMapOpen(false)}
        onApply={(codes) => {
          setLocationCodes(codes);
          setLocationMapOpen(false);
        }}
      />

      <Modal open={excludeOpen} onClose={() => setExcludeOpen(false)} title="Exclude transaction" sizePreset="sm">
        <div className="space-y-2 text-sm">
          <label className="block">
            Reason
            <textarea className="mt-1 w-full rounded border px-2 py-1" value={excludeReason} onChange={(e) => setExcludeReason(e.target.value)} aria-label="Exclude reason" rows={3} />
          </label>
          <button
            type="button"
            className="w-full rounded bg-red-600 py-2 text-white"
            aria-label="Confirm exclude"
            disabled={excludeReason.trim().length < 3 || excludeMut.isPending}
            onClick={() => void excludeMut.mutateAsync()}
          >
            Exclude
          </button>
        </div>
      </Modal>

      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title="Categorization history" sizePreset="lg" resizable modalKind="bank-tx-audit">
        <ul className="max-h-80 space-y-2 overflow-auto text-xs">
          {events.map((ev, i) => (
            <li key={i} className="rounded border border-gray-100 p-2">
              <pre className="whitespace-pre-wrap break-all">{JSON.stringify(ev, null, 2)}</pre>
            </li>
          ))}
          {!auditQuery.isLoading && events.length === 0 ? <li className="text-gray-600">No audit events.</li> : null}
        </ul>
      </Modal>
    </>
  );
}
