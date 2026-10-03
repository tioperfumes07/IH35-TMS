/**
 * RECLASSIFY TRANSACTIONS — QBO Tools → Reclassify clone (owner click-through, spec §24/24b/24c/24d).
 * LEFT: chart of accounts with the period activity per account (click = working set).
 * RIGHT: From/To · Type · Class · search → Find → GL LINES grid (date, type, num, name, memo, account,
 * class, net amount) · select-all per page · live "N lines selected: $sum" · [Reclassify] → modal:
 * change account / class / vendor (each optional) + reason → Apply → one RECLASSIFICATION JE per
 * document, audit each, results per document, Undo per batch.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { DatePicker } from "../../components/forms/DatePicker";
import { SelectCombobox } from "../../components/Combobox";
import { ReferenceSelect, type ReferenceOption } from "../../components/parity/ReferenceSelect";
import { coaAccountReferenceOption } from "../../components/parity/referenceOptionLabels";
import { Button } from "../../components/Button";
import { EntityLink } from "../../components/shared/EntityLink";
import { ListErrorState } from "../../components/ListErrorState";
import { formatQueryErrorDetail } from "../../lib/tableError";
import { formatDateQboList } from "../../lib/formatDate";
import { formatCurrencyFromCents } from "../lists/accounting/coa-list-utils";
import { useShowAccountNumbers } from "../../lib/useShowAccountNumbers";
import { formatAccountDisplayLabel } from "../../lib/show-account-numbers";
import { listClassesForJe, listCoaAccountsForJe } from "../../api/accounting";
import { listCustomers, listVendors } from "../../api/mdata";
import { FuelStopLocationPicker } from "../../components/locations/FuelStopLocationPicker";
import {
  applyReclassify, findReclassifyLines, getReclassifyAccounts, listReclassifyBatches, undoReclassifyBatch,
  type ReclassifyAccount, type ReclassifyBatchResult, type ReclassifyLine,
} from "../../api/reclassify";

const PAGE = 100;
const SOURCE_TYPES = ["expense", "bill", "invoice", "bill_payment", "customer_payment", "deposit", "driver_settlement", "fuel_transaction", "journal_entry"] as const;

function firstOfPrevMonth() { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 10); }
function today() { return new Date().toISOString().slice(0, 10); }

function docKind(t: string | null): "expense" | "bill" | "invoice" | "journal_entry" {
  if (t === "expense" || t === "bill" || t === "invoice") return t;
  return "journal_entry";
}

export function ReclassifyTransactionsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const qc = useQueryClient();
  // Owner ruling (Round 83): account numbers hidden by default, shown only when the toggle is on.
  const [showAccountNumbers, setShowAccountNumbers] = useShowAccountNumbers();

  const [fromDate, setFromDate] = useState(firstOfPrevMonth());
  const [toDate, setToDate] = useState(today());
  const [accountId, setAccountId] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<string>("");
  const [classId, setClassId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState<{ from: string; to: string; accountId: string | null; sourceType: string; classId: string; search: string } | null>(null);
  const [offset, setOffset] = useState(0);
  const [gotoPageDraft, setGotoPageDraft] = useState("1");
  const [selected, setSelected] = useState<Map<string, ReclassifyLine>>(new Map());
  const [modalOpen, setModalOpen] = useState(false);
  const [toAccount, setToAccount] = useState("");
  const [toClass, setToClass] = useState("");
  const [toLocation, setToLocation] = useState<string | null>(null);
  const [toEntityKind, setToEntityKind] = useState<"vendor" | "customer">("vendor");
  const [toVendor, setToVendor] = useState("");
  const [reason, setReason] = useState("");
  const [lastResult, setLastResult] = useState<ReclassifyBatchResult | null>(null);
  const [accountFilter, setAccountFilter] = useState("");
  const [undoTarget, setUndoTarget] = useState<string | null>(null);
  const [undoReason, setUndoReason] = useState("");

  const accountsQ = useQuery({ queryKey: ["reclassify-accounts", companyId, fromDate, toDate], queryFn: () => getReclassifyAccounts(companyId, fromDate, toDate), enabled: !!companyId });
  const coaQ = useQuery({ queryKey: ["reclassify-coa", companyId], queryFn: () => listCoaAccountsForJe(companyId), enabled: !!companyId });
  const classesQ = useQuery({ queryKey: ["reclassify-classes"], queryFn: () => listClassesForJe() });
  const vendorsQ = useQuery({ queryKey: ["reclassify-vendors", companyId], queryFn: () => listVendors({ operating_company_id: companyId, limit: 1000 }), enabled: modalOpen && !!companyId && toEntityKind === "vendor" });
  const customersQ = useQuery({ queryKey: ["reclassify-customers", companyId], queryFn: () => listCustomers({ operating_company_id: companyId, limit: 1000 }), enabled: modalOpen && !!companyId && toEntityKind === "customer" });
  const batchesQ = useQuery({ queryKey: ["reclassify-batches", companyId], queryFn: () => listReclassifyBatches(companyId), enabled: !!companyId });

  const linesQ = useQuery({
    queryKey: ["reclassify-lines", companyId, applied, offset],
    queryFn: () => findReclassifyLines(companyId, {
      from_date: applied!.from, to_date: applied!.to, account_ids: applied!.accountId ? [applied!.accountId] : undefined,
      source_types: applied!.sourceType ? [applied!.sourceType] : undefined, class_id: applied!.classId || undefined, search: applied!.search || undefined, limit: PAGE, offset,
    }),
    enabled: !!companyId && !!applied,
  });

  const applyMut = useMutation({
    mutationFn: () => applyReclassify({
      operating_company_id: companyId, posting_ids: Array.from(selected.keys()), reason,
      to_account_id: toAccount || null, to_class_id: toClass || null, to_location_id: toLocation || null,
      to_entity_uuid: toVendor || null, to_entity_type: toVendor ? toEntityKind : null,
      filter_snapshot: applied ?? {},
    }),
    onSuccess: (res) => {
      setLastResult(res); setModalOpen(false); setSelected(new Map()); setToAccount(""); setToClass(""); setToLocation(null); setToVendor(""); setToEntityKind("vendor"); setReason("");
      void qc.invalidateQueries({ queryKey: ["reclassify-lines"] }); void qc.invalidateQueries({ queryKey: ["reclassify-accounts"] }); void qc.invalidateQueries({ queryKey: ["reclassify-batches"] });
    },
  });
  const undoMut = useMutation({
    mutationFn: (p: { batchId: string; reason: string }) => undoReclassifyBatch(companyId, p.batchId, p.reason),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["reclassify-lines"] }); void qc.invalidateQueries({ queryKey: ["reclassify-accounts"] }); void qc.invalidateQueries({ queryKey: ["reclassify-batches"] }); },
  });

  const accountRefOptions = useMemo<ReferenceOption[]>(() => (coaQ.data?.accounts ?? []).map((a) => coaAccountReferenceOption({ id: a.id, account_name: a.account_name, account_type: a.account_type ?? null, account_number: a.account_number })), [coaQ.data]);
  const vendorRefOptions = useMemo<ReferenceOption[]>(() => (vendorsQ.data?.vendors ?? []).map((v) => ({ value: v.id, label: v.name })), [vendorsQ.data]);
  const customerRefOptions = useMemo<ReferenceOption[]>(() => (customersQ.data?.customers ?? []).map((c) => ({ value: c.id, label: c.name?.trim() || c.id })), [customersQ.data]);
  const tree = useMemo(() => {
    const rows = (accountsQ.data?.accounts ?? []).filter((a) => a.period_activity_cents !== 0 || a.account_id === accountId);
    const f = accountFilter.trim().toLowerCase();
    return (f ? rows.filter((a) => `${a.account_code} ${a.account_name}`.toLowerCase().includes(f)) : rows).sort((a, b) => a.account_code.localeCompare(b.account_code));
  }, [accountsQ.data, accountFilter, accountId]);

  const lines = linesQ.data?.lines ?? [];
  const pageAllSelected = lines.length > 0 && lines.every((l) => selected.has(l.posting_id));
  const selectedSum = Array.from(selected.values()).reduce((s, l) => s + l.net_amount_cents, 0);
  const activeAccount: ReclassifyAccount | undefined = accountsQ.data?.accounts?.find((a) => a.account_id === applied?.accountId);

  const runFind = () => { setApplied({ from: fromDate, to: toDate, accountId, sourceType, classId, search }); setOffset(0); setGotoPageDraft("1"); setSelected(new Map()); };
  const toggle = (l: ReclassifyLine) => setSelected((prev) => { const n = new Map(prev); if (n.has(l.posting_id)) n.delete(l.posting_id); else n.set(l.posting_id, l); return n; });
  const togglePage = () => setSelected((prev) => { const n = new Map(prev); if (pageAllSelected) lines.forEach((l) => n.delete(l.posting_id)); else lines.forEach((l) => n.set(l.posting_id, l)); return n; });

  const chips: Array<{ label: string; clear: () => void }> = [];
  if (applied?.accountId) chips.push({ label: `Account: ${activeAccount ? `${activeAccount.account_code} ${activeAccount.account_name}` : "selected"}`, clear: () => { setAccountId(null); setApplied({ ...applied, accountId: null }); setSelected(new Map()); } });
  if (applied?.sourceType) chips.push({ label: `Type: ${applied.sourceType}`, clear: () => { setSourceType(""); setApplied({ ...applied, sourceType: "" }); } });
  if (applied?.classId) chips.push({ label: `Class: ${classesQ.data?.classes?.find((c) => c.id === applied.classId)?.class_name ?? applied.classId}`, clear: () => { setClassId(""); setApplied({ ...applied, classId: "" }); } });
  if (applied?.search) chips.push({ label: `Search: ${applied.search}`, clear: () => { setSearch(""); setApplied({ ...applied, search: "" }); } });

  return (
    <AccountingSubNavWrapper title="Reclassify transactions" subtitle="Change the account, class or vendor on many GL lines at once. Every document is re-posted through a linked RECLASSIFICATION journal entry; undo per batch.">
      <div className="flex min-h-[70vh] gap-3" data-testid="reclassify-page" data-b5-reclassify="1">
        {/* LEFT PANE — chart of accounts with period activity */}
        <aside className="w-72 shrink-0 overflow-y-auto rounded border border-gray-200 bg-white" data-testid="reclassify-account-tree" data-b5-period-balances="1">
          <div className="border-b border-gray-200 p-2">
            <div className="text-xs font-bold uppercase tracking-wide text-gray-600">Accounts · period balances</div>
            {/* BANK-F91048 — ORDERS §B-5 left pane PERIOD BALANCES (From/To); same state as right filters. */}
            <div className="mt-2 grid grid-cols-2 gap-1" data-b5-period-from-to="1" data-testid="reclassify-period-from-to">
              <label className="flex flex-col gap-0.5 text-xs font-semibold text-slate-600">
                From
                <DatePicker value={fromDate} onChange={setFromDate} className="h-8" data-testid="reclassify-period-from" />
              </label>
              <label className="flex flex-col gap-0.5 text-xs font-semibold text-slate-600">
                To
                <DatePicker value={toDate} onChange={setToDate} className="h-8" data-testid="reclassify-period-to" />
              </label>
            </div>
            <input value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} placeholder="Filter accounts" className="mt-1 h-8 w-full rounded border border-gray-300 px-2 text-xs" data-testid="reclassify-account-filter" />
            <label className="mt-1 flex items-center gap-1 text-xs text-slate-600"><input type="checkbox" checked={showAccountNumbers} onChange={(e) => setShowAccountNumbers(e.target.checked)} /> Show account numbers</label>
          </div>
          {accountsQ.isLoading ? <div className="p-2 text-xs text-slate-600">Loading…</div> : null}
          {accountsQ.error ? <div className="p-2"><ListErrorState {...formatQueryErrorDetail(accountsQ.error)} onRetry={() => void accountsQ.refetch()} /></div> : null}
          <ul className="text-xs">
            <li>
              <button type="button" onClick={() => { setAccountId(null); }} className={`flex w-full items-center justify-between px-2 py-1 text-left hover:bg-slate-50 ${accountId === null ? "bg-slate-100 font-semibold" : ""}`}>
                <span>All accounts</span>
              </button>
            </li>
            {tree.map((a) => (
              <li key={a.account_id}>
                <button type="button" onClick={() => setAccountId(a.account_id)} className={`flex w-full items-center justify-between gap-2 px-2 py-1 text-left hover:bg-slate-50 ${accountId === a.account_id ? "bg-slate-100 font-semibold" : ""}`} data-testid={`reclassify-account-${a.account_id}`}>
                  {/* showAccountNumbers gate — formatAccountDisplayLabel hides the number unless the toggle is on */}
                  <span className="min-w-0 truncate">{formatAccountDisplayLabel({ account_name: a.account_name, account_number: a.account_code }, { showNumber: showAccountNumbers })}</span>
                  <span className="shrink-0 tabular-nums">{formatCurrencyFromCents(a.period_activity_cents)}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* RIGHT PANE */}
        <section className="min-w-0 flex-1">
          <div className="flex flex-wrap items-end gap-2 rounded border border-gray-200 bg-white p-2" data-testid="reclassify-filters">
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">From<DatePicker value={fromDate} onChange={setFromDate} className="h-9" /></label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">To<DatePicker value={toDate} onChange={setToDate} className="h-9" /></label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">Type
              <SelectCombobox value={sourceType} onChange={(e) => setSourceType(e.target.value)} data-testid="reclassify-type">
                <option value="">All</option>
                {SOURCE_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
              </SelectCombobox>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">Class
              <SelectCombobox value={classId} onChange={(e) => setClassId(e.target.value)} data-testid="reclassify-class">
                <option value="">All</option>
                {(classesQ.data?.classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.class_name}</option>)}
              </SelectCombobox>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">Memo / description
              <input value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 rounded border border-gray-300 px-2 text-xs" placeholder="e.g. Dreamline" data-testid="reclassify-search" />
            </label>
            <Button type="button" onClick={runFind} data-testid="reclassify-find">Find transactions</Button>
          </div>

          {chips.length ? (
            <div className="mt-2 flex flex-wrap gap-1" data-testid="reclassify-chips">
              {chips.map((c) => (
                <span key={c.label} className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-xs">
                  {c.label}<button type="button" onClick={c.clear} aria-label={`Remove ${c.label}`} className="font-bold">×</button>
                </span>
              ))}
            </div>
          ) : null}

          {!applied ? (
            <div className="mt-3 rounded border border-dashed border-gray-300 p-6 text-center text-xs text-slate-600" data-testid="reclassify-empty">
              Do a quick cleanup — reclassify the account, class or vendor on a bunch of transactions at once. Select a date range (and an account on the left) to find the transaction lines you want to change.
            </div>
          ) : (
            <>
              <div className="mt-2 flex items-center justify-between rounded border border-gray-200 bg-white px-2 py-1 text-xs" data-testid="reclassify-selection-bar" data-b5-selection-bar="1">
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={pageAllSelected} onChange={togglePage} aria-label="Select all on this page" />
                  <Button type="button" size="sm" disabled={selected.size === 0} onClick={() => setModalOpen(true)} data-testid="reclassify-open-modal">Reclassify</Button>
                  <span className="font-semibold" data-testid="reclassify-selection-count">{selected.size} transaction line{selected.size === 1 ? "" : "s"} selected: {formatCurrencyFromCents(selectedSum)}</span>
                </div>
                <span className="text-slate-600">{linesQ.data ? `${linesQ.data.total_lines} line(s) match · net ${formatCurrencyFromCents(linesQ.data.total_net_amount_cents)}` : ""}</span>
              </div>
              {linesQ.error ? <ListErrorState {...formatQueryErrorDetail(linesQ.error)} onRetry={() => void linesQ.refetch()} /> : null}
              <div className="mt-1 overflow-x-auto rounded border border-gray-200 bg-white">
                <table className="w-full text-xs" data-testid="reclassify-grid" data-b5-account-no-col="1">
                  <thead className="bg-slate-50 text-left uppercase tracking-wide text-gray-600">
                    <tr>
                      <th className="p-2 w-6"></th>
                      <th className="p-2">Date</th>
                      <th className="p-2">Type</th>
                      <th className="p-2">Num</th>
                      <th className="p-2">Name</th>
                      <th className="p-2">Memo / description</th>
                      <th className="p-2" data-testid="reclassify-col-account-no">Account no.</th>
                      <th className="p-2">Account</th>
                      <th className="p-2">Class</th>
                      <th className="p-2 text-right">Net amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linesQ.isLoading ? <tr><td colSpan={11} className="p-3 text-slate-600">Finding…</td></tr> : null}
                    {!linesQ.isLoading && lines.length === 0 ? <tr><td colSpan={11} className="p-3 text-slate-600">No posted GL lines match these filters.</td></tr> : null}
                    {lines.map((l) => (
                      <tr key={l.posting_id} className={`border-t border-gray-100 ${selected.has(l.posting_id) ? "bg-slate-100" : ""}`} data-testid={`reclassify-line-${l.posting_id}`}>
                        <td className="p-2"><input type="checkbox" checked={selected.has(l.posting_id)} onChange={() => toggle(l)} aria-label="Select line" /></td>
                        <td className="p-2 whitespace-nowrap">{formatDateQboList(l.entry_date)}</td>
                        <td className="p-2">{(l.source_transaction_type ?? "journal entry").replace(/_/g, " ")}{l.already_reclassified_batch_id ? <span className="ml-1 rounded bg-slate-200 px-1 text-xs" title={`Reclassified in batch ${l.already_reclassified_batch_id}`}>reclassified</span> : null}</td>
                        <td className="p-2">{l.source_transaction_id ? <EntityLink kind={docKind(l.source_transaction_type)} id={l.source_transaction_type && docKind(l.source_transaction_type) !== "journal_entry" ? l.source_transaction_id : l.journal_entry_id} label={l.document_number ?? l.source_transaction_id.slice(0, 8)} /> : <EntityLink kind="journal_entry" id={l.journal_entry_id} label="JE" />}</td>
                        <td className="p-2">{l.entity_uuid && l.entity_type === "vendor" ? <EntityLink kind="vendor" id={l.entity_uuid} label={l.entity_name ?? l.entity_uuid} /> : l.entity_name ?? "—"}</td>
                        <td className="p-2 max-w-[22rem] truncate" title={l.description ?? ""}>{l.description ?? "—"}</td>
                        {/* BANK-F91042 — ORDERS §B-5 ACCOUNT NO. column; value gated by Show account numbers (house law). */}
                        <td className="p-2 whitespace-nowrap tabular-nums" data-b5-account-no="1">{showAccountNumbers ? ((l.account_number ?? "").trim() || "—") : "—"}</td>
                        <td className="p-2"><EntityLink kind="account" id={l.account_id} label={formatAccountDisplayLabel({ account_name: l.account_name, account_number: l.account_number }, { showNumber: false })} /></td>
                        <td className="p-2">{l.class_name ?? "—"}</td>
                        <td className="p-2 text-right tabular-nums">{formatCurrencyFromCents(l.net_amount_cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600" data-b5-goto-page="1" data-testid="reclassify-pager">
                <span>{linesQ.data ? `${Math.min(offset + 1, linesQ.data.total_lines)}–${Math.min(offset + PAGE, linesQ.data.total_lines)} of ${linesQ.data.total_lines}` : ""}</span>
                <span className="flex flex-wrap items-center gap-1">
                  <Button type="button" size="sm" variant="tertiary" disabled={offset === 0} onClick={() => { const next = Math.max(0, offset - PAGE); setOffset(next); setGotoPageDraft(String(Math.floor(next / PAGE) + 1)); }}>Previous</Button>
                  <label className="inline-flex items-center gap-1 font-semibold text-slate-600">
                    Go to page
                    <input
                      type="text"
                      inputMode="numeric"
                      className="h-7 w-12 rounded-sm border border-[#E5E7EB] px-1 text-center text-xs tabular-nums"
                      value={gotoPageDraft}
                      onChange={(e) => setGotoPageDraft(e.target.value.replace(/[^\d]/g, ""))}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" || !linesQ.data) return;
                        const totalPages = Math.max(1, Math.ceil(linesQ.data.total_lines / PAGE));
                        const page = Math.min(totalPages, Math.max(1, Number(gotoPageDraft) || 1));
                        setGotoPageDraft(String(page));
                        setOffset((page - 1) * PAGE);
                      }}
                      aria-label="Go to page"
                      data-testid="reclassify-goto-page"
                    />
                    of {linesQ.data ? Math.max(1, Math.ceil(linesQ.data.total_lines / PAGE)) : "—"}
                  </label>
                  <Button type="button" size="sm" variant="tertiary" disabled={!linesQ.data || offset + PAGE >= linesQ.data.total_lines} onClick={() => { const next = offset + PAGE; setOffset(next); setGotoPageDraft(String(Math.floor(next / PAGE) + 1)); }}>Next</Button>
                </span>
              </div>
            </>
          )}

          {lastResult ? (
            <div className="mt-3 rounded border border-slate-200 bg-slate-100 p-2 text-xs" data-testid="reclassify-result">
              <div className="font-semibold">Batch {lastResult.batch_id.slice(0, 8)}: {lastResult.lines_applied} line(s) reclassified ({formatCurrencyFromCents(lastResult.amount_cents_moved)} moved), {lastResult.lines_refused} refused.</div>
              <ul className="mt-1 space-y-0.5">
                {lastResult.documents.map((d, i) => (
                  <li key={i}>
                    {d.document_number ?? d.source_transaction_id ?? "line"} ({d.source_transaction_type ?? "journal entry"}): {d.refusal_reason ? <span className="text-red-700">refused — {d.refusal_reason}</span> : <>{d.lines_applied} line(s) → JE <EntityLink kind="journal_entry" id={d.reclass_journal_entry_id} label={d.reclass_journal_entry_id?.slice(0, 8) ?? ""} />{d.document_updated ? " · document updated" : <span className="text-slate-700 font-semibold"> · document NOT updated: {d.document_update_note}</span>}</>}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-3 rounded border border-gray-200 bg-white" data-testid="reclassify-batches">
            <div className="border-b border-gray-200 px-2 py-1 text-xs font-bold uppercase tracking-wide text-gray-600">Reclassify batches</div>
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-left"><tr><th className="p-2">When</th><th className="p-2">By</th><th className="p-2">Change</th><th className="p-2">Reason</th><th className="p-2 text-right">Lines</th><th className="p-2 text-right">Moved</th><th className="p-2">Status</th><th className="p-2"></th></tr></thead>
              <tbody>
                {(batchesQ.data?.batches ?? []).map((b) => (
                  <tr key={b.id} className="border-t border-gray-100">
                    <td className="p-2 whitespace-nowrap">{formatDateQboList(b.created_at)}</td>
                    <td className="p-2">{b.created_by_email ?? "—"}</td>
                    <td className="p-2">{[b.to_account_name ? `→ ${formatAccountDisplayLabel({ account_name: b.to_account_name, account_number: b.to_account_number }, { showNumber: showAccountNumbers })}` : null, b.to_class_name ? `class → ${b.to_class_name}` : null, b.to_location_name ? `location → ${b.to_location_name}` : null, b.to_entity_uuid ? `${b.to_entity_type} → ${b.to_entity_uuid.slice(0, 8)}` : null].filter(Boolean).join(" · ")}</td>
                    <td className="p-2 max-w-[18rem] truncate" title={b.reason}>{b.reason}</td>
                    <td className="p-2 text-right tabular-nums">{b.lines_applied}/{b.lines_requested}{b.lines_refused ? ` (${b.lines_refused} refused)` : ""}</td>
                    <td className="p-2 text-right tabular-nums">{formatCurrencyFromCents(b.amount_cents_moved)}</td>
                    <td className="p-2">{b.status}{b.undone_at ? ` ${formatDateQboList(b.undone_at)}` : ""}</td>
                    <td className="p-2">
                      {b.status === "applied" && b.lines_applied > 0 ? (
                        undoTarget === b.id ? (
                          <span className="flex items-center gap-1">
                            <input value={undoReason} onChange={(e) => setUndoReason(e.target.value)} placeholder="Undo reason" className="h-7 w-40 rounded border border-gray-300 px-1 text-xs" data-testid={`reclassify-undo-reason-${b.id}`} />
                            <Button type="button" size="sm" loading={undoMut.isPending} disabled={undoReason.trim().length < 3} onClick={() => undoMut.mutate({ batchId: b.id, reason: undoReason.trim() }, { onSuccess: () => { setUndoTarget(null); setUndoReason(""); } })} data-testid={`reclassify-undo-confirm-${b.id}`}>Confirm undo</Button>
                            <Button type="button" size="sm" variant="tertiary" onClick={() => { setUndoTarget(null); setUndoReason(""); }}>Cancel</Button>
                          </span>
                        ) : (
                          <Button type="button" size="sm" variant="tertiary" onClick={() => setUndoTarget(b.id)} data-testid={`reclassify-undo-${b.id}`}>Undo</Button>
                        )
                      ) : null}
                    </td>
                  </tr>
                ))}
                {batchesQ.data && batchesQ.data.batches.length === 0 ? <tr><td colSpan={8} className="p-2 text-slate-600">No batches yet.</td></tr> : null}
              </tbody>
            </table>
            {undoMut.error ? <div className="p-2"><ListErrorState {...formatQueryErrorDetail(undoMut.error)} onRetry={() => undoMut.reset()} /></div> : null}
          </div>
        </section>
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" role="dialog" aria-modal="true" data-testid="reclassify-modal" data-b5-reclassify-modal="1">
          <div className="w-[32rem] rounded border border-gray-300 bg-white p-4 shadow-lg">
            <h2 className="text-xs font-bold uppercase tracking-wide">Reclassify {selected.size} transaction line{selected.size === 1 ? "" : "s"} · {formatCurrencyFromCents(selectedSum)}</h2>
            <p className="mt-1 text-xs text-slate-600">You can now reclassify the vendor/customer name from this page. Leave a field blank to keep it unchanged. Each document gets its own linked RECLASSIFICATION journal entry; a bill's vendor is the A/P subledger and is not changed here.</p>
            <div className="mt-3 flex flex-col gap-1 text-xs font-semibold text-slate-600">Change account to
              {/* ReferenceSelect createKind="account" — canonical picker, showAccountNumbers gate via coaAccountReferenceOption */}
              <ReferenceSelect value={toAccount || null} onChange={(next) => setToAccount(next ?? "")} options={accountRefOptions} createKind="account" operatingCompanyId={companyId} placeholder="Select…" loading={coaQ.isLoading} onOptionCreated={() => void coaQ.refetch()} />
            </div>
            {/* BANK-F91056 — ORDERS §B-5 Change class named for Chrome / guard (parity with location + vendor). */}
            <label className="mt-2 flex flex-col gap-1 text-xs font-semibold text-slate-600" data-b5-change-class="1">Change class to
              <SelectCombobox value={toClass} onChange={(e) => setToClass(e.target.value)} data-testid="reclassify-to-class">
                <option value="">Select…</option>
                {(classesQ.data?.classes ?? []).map((c) => <option key={c.id} value={c.id}>{c.class_name}</option>)}
              </SelectCombobox>
            </label>
            <label className="mt-2 flex flex-col gap-1 text-xs font-semibold text-slate-600" data-b5-change-location="1">
              Change location to
              <div data-testid="reclassify-to-location">
                <FuelStopLocationPicker
                  operatingCompanyId={companyId}
                  value={toLocation}
                  onChange={(id) => setToLocation(id)}
                  placeholder="Select…"
                  fuelStopOnly={false}
                />
              </div>
            </label>
            <div className="mt-2 flex flex-col gap-1 text-xs font-semibold text-slate-600" data-b5-change-vendor-customer="1">
              Change vendor/customer to
              <div className="flex gap-2">
                <SelectCombobox
                  value={toEntityKind}
                  onChange={(e) => {
                    setToEntityKind(e.target.value as "vendor" | "customer");
                    setToVendor("");
                  }}
                  data-testid="reclassify-to-entity-kind"
                >
                  <option value="vendor">Vendor</option>
                  <option value="customer">Customer</option>
                </SelectCombobox>
                <div className="min-w-0 flex-1">
                  {toEntityKind === "vendor" ? (
                    <ReferenceSelect value={toVendor || null} onChange={(next) => setToVendor(next ?? "")} options={vendorRefOptions} createKind="vendor" operatingCompanyId={companyId} placeholder="Select…" loading={vendorsQ.isLoading} onOptionCreated={() => void vendorsQ.refetch()} />
                  ) : (
                    <ReferenceSelect value={toVendor || null} onChange={(next) => setToVendor(next ?? "")} options={customerRefOptions} createKind="customer" operatingCompanyId={companyId} placeholder="Select…" loading={customersQ.isLoading} onOptionCreated={() => void customersQ.refetch()} />
                  )}
                </div>
              </div>
            </div>
            <label className="mt-2 flex flex-col gap-1 text-xs font-semibold text-slate-600">Reason (required, audited on every document)
              <input value={reason} onChange={(e) => setReason(e.target.value)} className="h-9 rounded border border-gray-300 px-2 text-xs" placeholder="e.g. Zelle to Dreamline belongs on Relay/Dreamline payables" data-testid="reclassify-reason" />
            </label>
            {applyMut.error ? <div className="mt-2"><ListErrorState {...formatQueryErrorDetail(applyMut.error)} onRetry={() => applyMut.reset()} /></div> : null}
            <div className="mt-3 flex justify-end gap-2">
              <Button type="button" variant="tertiary" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button type="button" loading={applyMut.isPending} disabled={reason.trim().length < 3 || (!toAccount && !toClass && !toLocation && !toVendor)} onClick={() => applyMut.mutate()} data-testid="reclassify-apply">Apply</Button>
            </div>
          </div>
        </div>
      ) : null}
    </AccountingSubNavWrapper>
  );
}
