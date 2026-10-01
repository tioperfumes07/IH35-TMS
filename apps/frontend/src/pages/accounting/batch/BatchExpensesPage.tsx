/**
 * BATCH TRANSACTIONS — Expenses / Checks (Lead 2026-10-01, owner QBO spec §23: "+ Create → Other → Batch
 * transactions … one spreadsheet-style grid … paste from a spreadsheet; duplicate a row; fill-down;
 * validation per cell (red) before Save; Save posts every row as its own document in one batch; errors
 * keep the row unsaved with the reason"). Each row becomes a REAL expense through the same engine as the
 * single creator (POST /api/v1/expenses → expense + lines + journal entry), never a bypass.
 * Bills already have their own batch creator (Create Multiple Bills); this grid covers expenses and
 * checks (payment method = check with a check number).
 */
import { useMemo, useRef, useState, type ClipboardEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { AccountingSubNavWrapper } from "../AccountingSubNavWrapper";
import { Button } from "../../../components/Button";
import { DatePicker } from "../../../components/forms/DatePicker";
import { MoneyInput } from "../../../components/forms/MoneyInput";
import { ReferenceSelect, type ReferenceOption } from "../../../components/parity/ReferenceSelect";
import { coaAccountReferenceOption, vendorReferenceOption } from "../../../components/parity/referenceOptionLabels";
import { EntityLink } from "../../../components/shared/EntityLink";
import { ListErrorState } from "../../../components/ListErrorState";
import { formatQueryErrorDetail } from "../../../lib/tableError";
import { formatCurrencyFromCents } from "../../lists/accounting/coa-list-utils";
import { listCatalogAccounts } from "../../../api/catalog-accounts";
import { classesCatalogClient } from "../../../api/catalogs-accounting";
import { listVendors } from "../../../api/mdata";
import { createExpense } from "../../../api/accounting";
import { isExpenseAccount, isPaymentAccount } from "../../../lib/account-picker-scope";
import { userFacingApiError } from "../../../lib/api-error-message";
import {
  batchTotals, dollarsToCents, duplicateRow, fillDown, isRowEmpty, newRow, parsePastedRows, validateRow,
  type BatchExpenseField, type BatchExpenseRow,
} from "./batchExpenseRows";

const METHODS = ["ach", "card", "check", "wire", "cash"] as const;

export function BatchExpensesPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const qc = useQueryClient();
  const [rows, setRows] = useState<BatchExpenseRow[]>(() => Array.from({ length: 5 }, () => newRow()));
  const [saving, setSaving] = useState(false);
  const [lastBatch, setLastBatch] = useState<{ saved: number; failed: number; cents: number } | null>(null);
  const pasteRef = useRef<HTMLTextAreaElement | null>(null);

  const accountsQ = useQuery({ queryKey: ["batch-expenses", "accounts", companyId], queryFn: () => listCatalogAccounts({ status: "active", operating_company_id: companyId, postable_only: true }), enabled: !!companyId, staleTime: 60_000 });
  const vendorsQ = useQuery({ queryKey: ["batch-expenses", "vendors", companyId], queryFn: () => listVendors({ operating_company_id: companyId, limit: 200 }), enabled: !!companyId, staleTime: 60_000 });
  const classesQ = useQuery({ queryKey: ["batch-expenses", "classes", companyId], queryFn: () => classesCatalogClient.list({ operating_company_id: companyId, is_active: "true", limit: 200 }), enabled: !!companyId, staleTime: 60_000 });

  const accounts = accountsQ.data?.accounts ?? [];
  const paymentAccounts = useMemo(() => accounts.filter(isPaymentAccount), [accounts]);
  const categoryAccounts = useMemo(() => accounts.filter(isExpenseAccount), [accounts]);
  const vendors = vendorsQ.data?.vendors ?? [];
  const classes = classesQ.data?.rows ?? [];
  const vendorOptions = useMemo<ReferenceOption[]>(() => vendors.map(vendorReferenceOption), [vendors]);
  const paymentOptions = useMemo<ReferenceOption[]>(() => paymentAccounts.map((a) => coaAccountReferenceOption({ id: a.id, account_name: a.account_name, account_type: a.account_type ?? null, account_number: a.account_number ?? null })), [paymentAccounts]);
  const categoryOptions = useMemo<ReferenceOption[]>(() => categoryAccounts.map((a) => coaAccountReferenceOption({ id: a.id, account_name: a.account_name, account_type: a.account_type ?? null, account_number: a.account_number ?? null })), [categoryAccounts]);

  const resolvers = useMemo(() => {
    const byName = <T,>(list: T[], name: (t: T) => string, id: (t: T) => string) => (q: string) => {
      const n = q.trim().toLowerCase();
      const hit = list.find((t) => name(t).toLowerCase() === n) ?? list.find((t) => name(t).toLowerCase().includes(n));
      return hit ? id(hit) : null;
    };
    // Paste resolution only: a pasted cell may carry the account NUMBER the sheet had, so it is matched
    // here; it is never rendered — every visible label goes through formatAccountDisplayLabel (showAccountNumbers gate).
    return {
      vendorByName: byName(vendors, (v) => v.name, (v) => v.id),
      accountByName: byName(categoryAccounts, (a) => `${a.account_number ?? ""} ${a.account_name}`, (a) => a.id),
      // same paste-only match as accountByName above; display stays behind formatAccountDisplayLabel / showAccountNumbers
      paymentAccountByName: byName(paymentAccounts, (a) => `${a.account_number ?? ""} ${a.account_name}`, (a) => a.id),
      classByName: byName(classes, (c) => c.display_name || c.code, (c) => c.id),
    };
  }, [vendors, categoryAccounts, paymentAccounts, classes]);

  const set = (key: string, patch: Partial<BatchExpenseRow>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch, status: r.status === "saved" ? "saved" : "draft", error: r.status === "saved" ? r.error : null } : r)));
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData("text/plain");
    if (!text.trim()) return;
    e.preventDefault();
    const parsed = parsePastedRows(text, resolvers);
    setRows((prev) => [...prev.filter((r) => !isRowEmpty(r)), ...parsed, newRow()]);
    if (pasteRef.current) pasteRef.current.value = "";
  };

  const totals = batchTotals(rows);

  const saveAll = async () => {
    setSaving(true);
    let saved = 0, failed = 0, cents = 0;
    const snapshot = rows.filter((r) => !isRowEmpty(r) && r.status !== "saved");
    for (const r of snapshot) {
      const errs = validateRow(r);
      if (Object.keys(errs).length) { failed += 1; set(r.key, { status: "error", error: Object.values(errs).join("; ") }); continue; }
      set(r.key, { status: "saving", error: null });
      try {
        const amount = dollarsToCents(r.amount);
        const res = await createExpense(companyId, {
          category_account_id: r.category,
          expense_date: r.date,
          amount_cents: amount,
          payment_account_uuid: r.paymentAccount,
          memo: [r.memo.trim(), `Payment: ${r.paymentMethod.toUpperCase()}`, r.refNo.trim() ? `Ref: ${r.refNo.trim()}` : null, r.loadNumber.trim() ? `Load: ${r.loadNumber.trim()}` : null, "Batch transactions"].filter(Boolean).join(" · "),
          ...(r.payee ? { vendor_uuid: r.payee } : {}),
          ...(r.classId ? { class_id: r.classId } : {}),
          ...(r.refNo.trim() ? { vendor_document_number: r.refNo.trim() } : {}),
        });
        saved += 1; cents += amount;
        setRows((prev) => prev.map((x) => (x.key === r.key ? { ...x, status: "saved", error: null, expenseId: res.expense_id } : x)));
      } catch (err) {
        failed += 1;
        setRows((prev) => prev.map((x) => (x.key === r.key ? { ...x, status: "error", error: userFacingApiError(err, "Could not save this row") } : x)));
      }
    }
    setLastBatch({ saved, failed, cents });
    setSaving(false);
    void qc.invalidateQueries({ queryKey: ["expenses"] });
  };

  const cellCls = (r: BatchExpenseRow, f: BatchExpenseField) => {
    const errs = r.status === "saved" || isRowEmpty(r) ? {} : validateRow(r);
    return `h-7 w-full rounded border px-1 text-xs ${errs[f] ? "border-red-500 bg-red-50" : "border-gray-300"} ${r.status === "saved" ? "bg-slate-50 text-slate-500" : ""}`;
  };
  const title = (r: BatchExpenseRow, f: BatchExpenseField) => (r.status === "saved" ? "Saved" : validateRow(r)[f]) ?? "";

  return (
    <AccountingSubNavWrapper title="Batch transactions — Expenses / Checks" subtitle="Enter or paste many expenses at once. Every row posts as its own real expense through the standard engine (expense → lines → journal entry); rows with errors stay unsaved with the reason.">
      <div className="mb-2 flex flex-wrap items-center gap-2 rounded border border-gray-200 bg-white p-2 text-xs" data-testid="batch-expenses-toolbar">
        <textarea ref={pasteRef} onPaste={onPaste} placeholder="Paste rows from a spreadsheet here: Date | Payee | Paid from | Method | Ref no. | Amount | Category | Class | Load | Memo" className="h-9 min-w-[28rem] flex-1 rounded border border-dashed border-gray-400 px-2 py-1 text-xs" data-testid="batch-expenses-paste" />
        <Button type="button" size="sm" variant="tertiary" onClick={() => setRows((p) => [...p, ...Array.from({ length: 5 }, () => newRow())])}>+ 5 rows</Button>
        <Button type="button" size="sm" variant="tertiary" onClick={() => setRows((p) => p.filter((r) => r.status === "saved" || !isRowEmpty(r)))}>Remove empty</Button>
        <span className="ml-auto font-semibold" data-testid="batch-expenses-totals">{totals.rows} row(s) · {formatCurrencyFromCents(totals.cents)} · {totals.ready} ready · {totals.errors} with errors · {totals.saved} saved</span>
        <Button type="button" size="sm" loading={saving} disabled={totals.ready === 0} onClick={() => void saveAll()} data-testid="batch-expenses-save">Save {totals.ready} expense(s)</Button>
      </div>
      {accountsQ.error ? <ListErrorState {...formatQueryErrorDetail(accountsQ.error)} onRetry={() => void accountsQ.refetch()} /> : null}
      {lastBatch ? <div className="mb-2 rounded border border-slate-200 bg-slate-100 p-2 text-xs" data-testid="batch-expenses-result">Batch saved: {lastBatch.saved} expense(s) posted ({formatCurrencyFromCents(lastBatch.cents)}), {lastBatch.failed} kept unsaved with their reason.</div> : null}
      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="w-full min-w-[80rem] text-xs" data-testid="batch-expenses-grid">
          <thead className="bg-slate-50 text-left uppercase tracking-wide text-gray-600">
            <tr><th className="p-1 w-8">#</th><th className="p-1">Date</th><th className="p-1">Payee</th><th className="p-1">Paid from</th><th className="p-1">Method</th><th className="p-1">Ref / check no.</th><th className="p-1 text-right">Amount</th><th className="p-1">Category</th><th className="p-1">Class / unit</th><th className="p-1">Load</th><th className="p-1">Memo</th><th className="p-1">Status</th><th className="p-1"></th></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.key} className="border-t border-gray-100" data-testid={`batch-expenses-row-${i}`}>
                <td className="p-1 text-slate-500">{i + 1}</td>
                <td className="p-1" title={title(r, "date")}><DatePicker value={r.date} onChange={(next) => set(r.key, { date: next })} className={cellCls(r, "date")} disabled={r.status === "saved"} /></td>
                <td className="p-1 min-w-[12rem]" title={title(r, "payee") || r.payeeText}>
                  <ReferenceSelect size="sm" value={r.payee || null} onChange={(next) => set(r.key, { payee: next ?? "", payeeText: "" })} options={vendorOptions} createKind="vendor" operatingCompanyId={companyId} placeholder={r.payeeText ? `? ${r.payeeText}` : "— no payee —"} disabled={r.status === "saved"} loading={vendorsQ.isLoading} onOptionCreated={() => void vendorsQ.refetch()} />
                </td>
                <td className="p-1 min-w-[12rem]" title={title(r, "paymentAccount")}>
                  <ReferenceSelect size="sm" value={r.paymentAccount || null} onChange={(next) => set(r.key, { paymentAccount: next ?? "" })} options={paymentOptions} createKind="account" operatingCompanyId={companyId} placeholder="Select…" disabled={r.status === "saved"} loading={accountsQ.isLoading} onOptionCreated={() => void accountsQ.refetch()} />
                </td>
                <td className="p-1">
                  <select value={r.paymentMethod} onChange={(e) => set(r.key, { paymentMethod: e.target.value as BatchExpenseRow["paymentMethod"] })} className={cellCls(r, "paymentMethod")} title={title(r, "paymentMethod")} disabled={r.status === "saved"}>
                    <option value="">Select…</option>
                    {METHODS.map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}
                  </select>
                </td>
                <td className="p-1"><input value={r.refNo} onChange={(e) => set(r.key, { refNo: e.target.value })} className={cellCls(r, "refNo")} title={title(r, "refNo")} disabled={r.status === "saved"} /></td>
                <td className="p-1" title={title(r, "amount")}><MoneyInput valueDollars={r.amount === "" ? null : Number(String(r.amount).replace(/[$,\s]/g, ""))} onChangeDollars={(next) => set(r.key, { amount: next == null ? "" : String(next) })} className={`${cellCls(r, "amount")} text-right tabular-nums`} disabled={r.status === "saved"} ariaLabel="Amount" /></td>
                <td className="p-1 min-w-[12rem]" title={title(r, "category") || r.categoryText}>
                  <ReferenceSelect size="sm" value={r.category || null} onChange={(next) => set(r.key, { category: next ?? "", categoryText: "" })} options={categoryOptions} createKind="account" operatingCompanyId={companyId} placeholder={r.categoryText ? `? ${r.categoryText}` : "Select…"} disabled={r.status === "saved"} loading={accountsQ.isLoading} onOptionCreated={() => void accountsQ.refetch()} />
                </td>
                <td className="p-1">
                  <select value={r.classId} onChange={(e) => set(r.key, { classId: e.target.value, classText: "" })} className={cellCls(r, "classId")} title={title(r, "classId") || r.classText} disabled={r.status === "saved"}>
                    <option value="">{r.classText ? `? ${r.classText}` : "—"}</option>
                    {classes.map((c) => <option key={c.id} value={c.id}>{c.display_name || c.code}</option>)}
                  </select>
                </td>
                <td className="p-1"><input value={r.loadNumber} onChange={(e) => set(r.key, { loadNumber: e.target.value })} className={cellCls(r, "loadNumber")} disabled={r.status === "saved"} placeholder="13xxx" /></td>
                <td className="p-1"><input value={r.memo} onChange={(e) => set(r.key, { memo: e.target.value })} className={cellCls(r, "memo")} disabled={r.status === "saved"} /></td>
                <td className="p-1 whitespace-nowrap">
                  {r.status === "saved" && r.expenseId ? <EntityLink kind="expense" id={r.expenseId} label="Saved → open" /> : r.status === "error" ? <span className="text-red-700" title={r.error ?? ""}>Error: {r.error}</span> : r.status === "saving" ? "Saving…" : isRowEmpty(r) ? "" : Object.keys(validateRow(r)).length ? <span className="text-slate-700">Fix red cells</span> : "Ready"}
                </td>
                <td className="p-1 whitespace-nowrap">
                  <button type="button" className="mr-1 underline" onClick={() => setRows((p) => duplicateRow(p, i))} title="Duplicate row">Dup</button>
                  <button type="button" className="mr-1 underline" onClick={() => setRows((p) => fillDown(fillDown(fillDown(p, "date", i), "paymentAccount", i), "paymentMethod", i))} title="Fill date / paid-from / method down into blank rows">Fill↓</button>
                  {r.status !== "saved" ? <button type="button" className="underline" onClick={() => setRows((p) => p.filter((x) => x.key !== r.key))} title="Remove row">✕</button> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AccountingSubNavWrapper>
  );
}
