// ROUND 315 (FINAL) step 3 — the Factoring module's "Submit Invoice" tab: Submit to Factor.
// Every open invoice of the company (not the 13-of-105 submission-queue subset), selectable, with its customer, PO,
// load, settlement / pre-settlement, PU / DEL dates, expected escrow reserve / cash reserve / fee from the customer's
// factor assignment, docs (BOL / POD / rate confirmation) and a per-row "Customer direct pay" action. The totals panel
// previews the purchase; Save creates the purchase (POST /factoring/purchases — the server runs the FEED GATE on every
// invoice first) and posts it (POST /:id/post) through the one secured-borrowing poster. "Save and send" also emails
// the invoices + their documents to the factor. Owner-only: the server refuses everyone else (403).
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../api/client";
import {
  createFactoringPurchase,
  listDirectPayInvoices,
  listPurchaseCandidates,
  markInvoiceDirectPay,
  postFactoringPurchase,
  sendFactoringPurchase,
  undoInvoiceDirectPay,
  voidFactoringPurchase,
  type FactoringPurchaseDetail,
  type FeedGateBlocked,
  type PurchaseCandidate,
} from "../../api/factoring-purchases";
import { Button } from "../../components/Button";
import { EntityPicker } from "../../components/EntityPicker";
import { Modal } from "../../components/Modal";
import { DatePicker } from "../../components/forms/DatePicker";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { SaveDropdown } from "../../components/forms/SaveDropdown";
import { DataPanel } from "../../components/layout/DataPanel";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { ReferenceSelect } from "../../components/parity/ReferenceSelect";
import { EntityLink } from "../../components/shared/EntityLink";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { CollapsedListFilters } from "../../components/table/CollapsedListFilters";
import { TableSearch } from "../../components/table/TableSearch";
import { colors, FORM_FIELD_CONTROL_SIZE_CLASS, typography } from "../../design/tokens";
import { entityLabel } from "../../lib/entity-label";
import { formatDateUS } from "../../lib/formatDate";
import { formatUsdCents } from "../../lib/money";

export const OWNER_ONLY_MESSAGE = "Only the Owner creates, closes or matches a factoring purchase.";

type Filters = { customerId: string; from: string; to: string };
const EMPTY_FILTERS: Filters = { customerId: "", from: "", to: "" };

const FIELD_LABEL_STYLE = {
  fontSize: typography.sectionSubhead,
  fontWeight: 700,
  color: colors.columnHeader,
  letterSpacing: typography.tightUpper,
} as const;

function todayIso() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dateCell(v: string | null) {
  return v ? formatDateUS(v) : "—";
}

export function loadDocsUploadPath(loadId: string) {
  return `/dispatch/loads/${encodeURIComponent(loadId)}?tab=Documents`;
}

/** Selection totals — the same formula the purchase engine applies (purchase.service.ts). */
/** Faro's actual split for one invoice (from its purchase report). Absent = the expected split from the factor rates. */
export type LineActuals = { escrow_reserve_cents: number; cash_reserve_cents: number; fee_cents: number };

export function lineFigures(r: PurchaseCandidate, actuals?: LineActuals) {
  return actuals ?? { escrow_reserve_cents: r.expected_escrow_reserve_cents, cash_reserve_cents: r.expected_cash_reserve_cents, fee_cents: r.expected_fee_cents };
}

export function computeSelectionTotals(rows: PurchaseCandidate[], wireFeeCents: number, actuals: Record<string, LineActuals> = {}) {
  const gross = rows.reduce((a, r) => a + r.open_cents, 0);
  const escrow = rows.reduce((a, r) => a + lineFigures(r, actuals[r.invoice_id]).escrow_reserve_cents, 0);
  const cash = rows.reduce((a, r) => a + lineFigures(r, actuals[r.invoice_id]).cash_reserve_cents, 0);
  const fee = rows.reduce((a, r) => a + lineFigures(r, actuals[r.invoice_id]).fee_cents, 0);
  const advance = gross - escrow - fee;
  const net = advance - cash - wireFeeCents;
  return { count: rows.length, gross, escrow, cash, fee, wire: wireFeeCents, advance, net };
}

type SaveError =
  | { kind: "owner_only" }
  | { kind: "feed_gate"; blocked: FeedGateBlocked[] }
  | { kind: "per_invoice"; title: string; rows: Array<{ invoice_id: string; reason: string }> }
  | { kind: "missing_docs"; rows: Array<{ invoice_id: string; invoice_display_id: string | null; load_id: string | null; load_number: string | null; missing: string[] }> }
  | { kind: "message"; text: string };

function toSaveError(err: unknown, fallback: string): SaveError {
  if (err instanceof ApiError) {
    const data = (err.data ?? {}) as { error?: string; details?: unknown; message?: string };
    if (err.status === 403 && data.error === "factoring_purchase_owner_only") return { kind: "owner_only" };
    if (data.error === "feed_gate_blocked" && Array.isArray(data.details)) return { kind: "feed_gate", blocked: data.details as FeedGateBlocked[] };
    if (data.error === "factoring_send_missing_docs" && Array.isArray(data.details)) {
      return { kind: "missing_docs", rows: data.details as Extract<SaveError, { kind: "missing_docs" }>["rows"] };
    }
    if (Array.isArray(data.details)) {
      return {
        kind: "per_invoice",
        title: String(data.error ?? fallback),
        rows: (data.details as Array<Record<string, unknown>>).map((d) => ({
          invoice_id: String(d.invoice_id ?? ""),
          reason: String(d.reason ?? d.status ?? data.error ?? ""),
        })),
      };
    }
    const detailMsg = data.details && typeof data.details === "object" ? (data.details as { message?: string }).message : undefined;
    return { kind: "message", text: detailMsg ?? data.message ?? data.error ?? err.message ?? fallback };
  }
  return { kind: "message", text: err instanceof Error ? err.message : fallback };
}

type Props = { companyId: string; isOwner: boolean };

export function SubmitToFactorTab({ companyId, isOwner }: Props) {
  const queryClient = useQueryClient();
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [vendorId, setVendorId] = useState<string>("");
  const [purchaseDate, setPurchaseDate] = useState(todayIso());
  const [wireDate, setWireDate] = useState(todayIso());
  const [reportRef, setReportRef] = useState("");
  const [wireFeeCents, setWireFeeCents] = useState<number | null>(0);
  const [sendTo, setSendTo] = useState("");
  // Faro's actual escrow / cash reserve / fee per invoice (its purchase report): Faro holds ONE 1.5% Security Reserve per
  // invoice, normally as Escrow Rsv and on some invoices as Cash Rsv instead (measured on all 89 Faro purchases).
  const [lineActuals, setLineActuals] = useState<Record<string, LineActuals>>({});
  // Owner override approval: send although selected loads are missing BOL / POD / rate confirmation.
  const [docsOverrideReason, setDocsOverrideReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<SaveError | null>(null);
  const [created, setCreated] = useState<{ purchase: FactoringPurchaseDetail; sentTo: string | null; sendError: SaveError | null } | null>(null);
  const [directPay, setDirectPay] = useState<{ row: { invoice_id: string; label: string }; mode: "mark" | "undo" } | null>(null);
  const [directPayReason, setDirectPayReason] = useState("");
  const [directPayError, setDirectPayError] = useState<string | null>(null);
  const [directPayBusy, setDirectPayBusy] = useState(false);
  const [showDirectPayList, setShowDirectPayList] = useState(false);

  const filters = { from: applied.from || undefined, to: applied.to || undefined, customer_id: applied.customerId || undefined, search: search.trim() || undefined };
  const candidatesQuery = useQuery({
    queryKey: ["factoring", "purchase-candidates", companyId, filters],
    queryFn: () => listPurchaseCandidates(companyId, filters),
    enabled: Boolean(companyId),
  });
  const directPayQuery = useQuery({
    queryKey: ["factoring", "purchase-direct-pay", companyId],
    queryFn: () => listDirectPayInvoices(companyId).then((r) => r.invoices),
    enabled: Boolean(companyId) && showDirectPayList,
  });

  const rows = candidatesQuery.data?.candidates ?? [];
  const vendors = candidatesQuery.data?.factoring_vendors ?? [];
  const effectiveVendorId = vendorId || vendors.find((v) => v.is_default)?.id || "";
  const vendor = vendors.find((v) => v.id === effectiveVendorId) ?? null;
  const recipient = sendTo.trim() || vendor?.email || "";

  // Selection survives a filter change only for rows still listed (the totals are over what is actually sent).
  const byId = useMemo(() => new Map(rows.map((r) => [r.invoice_id, r])), [rows]);
  const selectedRows = useMemo(() => selected.map((id) => byId.get(id)).filter(Boolean) as PurchaseCandidate[], [selected, byId]);
  const totals = computeSelectionTotals(selectedRows, wireFeeCents ?? 0, lineActuals);
  const docsOverrideOk = docsOverrideReason.trim().length >= 10;
  const missingDocsRows = selectedRows.filter((r) => !r.docs_complete);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["factoring"] });
  };

  async function save(andSend: boolean) {
    setSaveError(null);
    setCreated(null);
    if (!isOwner) {
      setSaveError({ kind: "owner_only" });
      return;
    }
    if (!selectedRows.length) {
      setSaveError({ kind: "message", text: "Select at least one invoice." });
      return;
    }
    if (!effectiveVendorId) {
      setSaveError({ kind: "message", text: "Select the factoring company." });
      return;
    }
    // ROUND 321: missing documents block Save AND Save and send unless the Owner gives an override reason (the Feed Gate
    // records it as 'na' with the reason; the load + posted A/R JE stay hard requirements).
    if (missingDocsRows.length && !docsOverrideOk) {
      setSaveError({
        kind: "missing_docs",
        rows: missingDocsRows.map((r) => ({ invoice_id: r.invoice_id, invoice_display_id: r.invoice_display_id, load_id: r.load_id, load_number: r.load_number, missing: r.missing_docs })),
      });
      return;
    }
    if (andSend && !recipient) {
      setSaveError({ kind: "message", text: "The factoring company has no email on file — enter the factor's submission email in Send to." });
      return;
    }
    if (totals.net < 0) {
      setSaveError({ kind: "message", text: "Net to IH35 is negative — check the wire fee." });
      return;
    }
    setSaving(true);
    try {
      const draftPurchase = await createFactoringPurchase(companyId, {
        factoring_company_vendor_id: effectiveVendorId,
        purchase_date: purchaseDate,
        wire_date: wireDate || null,
        faro_report_ref: reportRef.trim() || null,
        wire_fee_cents: wireFeeCents ?? 0,
        lines: selectedRows.map((r) => ({ invoice_id: r.invoice_id, ...lineFigures(r, lineActuals[r.invoice_id]) })),
        ...(missingDocsRows.length && docsOverrideOk ? { docs_override_reason: docsOverrideReason.trim() } : {}),
      });
      let posted: FactoringPurchaseDetail;
      try {
        posted = await postFactoringPurchase(companyId, draftPurchase.id);
      } catch (postErr) {
        // A draft that failed to post must not hold its invoices off the list: void it (nothing was posted, so the
        // void reverses nothing) and show why the post failed.
        const e = toSaveError(postErr, "Post failed");
        const why = e.kind === "message" ? e.text : e.kind === "owner_only" ? OWNER_ONLY_MESSAGE : "post refused";
        let voidNote = `Draft ${draftPurchase.display_id} was voided; the invoices are back on the list.`;
        try {
          await voidFactoringPurchase(companyId, draftPurchase.id, `Post failed from Submit to Factor: ${why}`.slice(0, 500));
        } catch {
          voidNote = `Draft ${draftPurchase.display_id} could not be voided automatically — void it before retrying.`;
        }
        setSaveError(e.kind === "message" ? { kind: "message", text: `${e.text} — ${voidNote}` } : e);
        if (e.kind !== "message") setCreated(null);
        await refresh();
        return;
      }
      let sentTo: string | null = null;
      let sendError: SaveError | null = null;
      if (andSend) {
        try {
          const sent = await sendFactoringPurchase(companyId, posted.id, sendTo.trim() || null, missingDocsRows.length ? docsOverrideReason : null);
          sentTo = sent.to;
        } catch (err) {
          sendError = toSaveError(err, "Send failed");
        }
      }
      setCreated({ purchase: posted, sentTo, sendError });
      setSelected([]);
      setReportRef("");
      setLineActuals({});
      setDocsOverrideReason("");
      await refresh();
    } catch (err) {
      setSaveError(toSaveError(err, "Save failed"));
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  async function retrySend() {
    if (!created) return;
    setSaving(true);
    try {
      const sent = await sendFactoringPurchase(companyId, created.purchase.id, sendTo.trim() || null, docsOverrideOk ? docsOverrideReason : null);
      setCreated({ ...created, sentTo: sent.to, sendError: null });
    } catch (err) {
      setCreated({ ...created, sendError: toSaveError(err, "Send failed") });
    } finally {
      setSaving(false);
    }
  }

  async function confirmDirectPay() {
    if (!directPay) return;
    if (directPayReason.trim().length < 3) {
      setDirectPayError("Enter a reason (at least 3 characters).");
      return;
    }
    setDirectPayBusy(true);
    setDirectPayError(null);
    try {
      if (directPay.mode === "mark") await markInvoiceDirectPay(companyId, directPay.row.invoice_id, directPayReason.trim());
      else await undoInvoiceDirectPay(companyId, directPay.row.invoice_id, directPayReason.trim());
      setSelected((s) => s.filter((id) => id !== directPay.row.invoice_id));
      setDirectPay(null);
      setDirectPayReason("");
      await refresh();
    } catch (err) {
      const e = toSaveError(err, "Request failed");
      setDirectPayError(e.kind === "owner_only" ? OWNER_ONLY_MESSAGE : e.kind === "message" ? e.text : "Request failed");
    } finally {
      setDirectPayBusy(false);
    }
  }

  const columns: Array<ParityColumn<PurchaseCandidate>> = [
    {
      key: "invoice_display_id",
      label: "Invoice #",
      sortable: true,
      render: (r) => <EntityLink kind="invoice" id={r.invoice_id} label={entityLabel(r.invoice_display_id, r.invoice_id, "Invoice")} />,
    },
    { key: "issue_date", label: "Invoice date", sortable: true, render: (r) => dateCell(r.issue_date) },
    {
      key: "customer_name",
      label: "Customer",
      sortable: true,
      render: (r) => <EntityLink kind="customer" id={r.customer_id} label={entityLabel(r.customer_name, r.customer_id, "Customer")} />,
    },
    {
      key: "customer_po_number",
      label: "Customer PO",
      sortable: true,
      render: (r) => r.customer_po_number || r.customer_wo_number || "—",
    },
    {
      key: "load_number",
      label: "Load #",
      sortable: true,
      render: (r) => (r.load_id ? <EntityLink kind="load" id={r.load_id} label={entityLabel(r.load_number, r.load_id, "Load")} /> : "—"),
    },
    {
      key: "settlement_display_id",
      label: "Settlement",
      sortable: true,
      render: (r) =>
        r.settlement_id ? (
          <EntityLink
            kind="settlement"
            id={r.settlement_id}
            label={`${r.settlement_is_presettlement ? "Pre " : ""}${entityLabel(r.settlement_display_id, r.settlement_id, "Settlement")}`}
            title={r.settlement_is_presettlement ? "Pre-settlement" : `Settlement · ${r.settlement_status ?? ""}`}
          />
        ) : (
          "—"
        ),
    },
    { key: "pickup_at", label: "PU date", sortable: true, render: (r) => dateCell(r.pickup_at) },
    { key: "delivery_at", label: "DEL date", sortable: true, render: (r) => dateCell(r.delivery_at) },
    { key: "total_cents", label: "Total", sortable: true, kind: "money", render: (r) => formatUsdCents(r.total_cents) },
    { key: "open_cents", label: "Open", sortable: true, kind: "money", render: (r) => formatUsdCents(r.open_cents) },
    {
      key: "expected_escrow_reserve_cents",
      label: "Escrow reserve",
      sortable: true,
      kind: "money",
      headerTitle: "Expected from the customer's factor assignment reserve rate",
      render: (r) => formatUsdCents(r.expected_escrow_reserve_cents),
    },
    { key: "expected_cash_reserve_cents", label: "Cash reserve", sortable: true, kind: "money", render: (r) => formatUsdCents(r.expected_cash_reserve_cents) },
    { key: "expected_fee_cents", label: "Fee", sortable: true, kind: "money", render: (r) => formatUsdCents(r.expected_fee_cents) },
    {
      key: "docs_complete",
      label: "Docs",
      sortable: true,
      sortValue: (r) => (r.docs_complete ? 1 : 0),
      render: (r) =>
        r.docs_complete ? (
          <span className="font-semibold text-[#16A34A]" data-testid={`submit-factor-docs-ok-${r.invoice_id}`}>
            BOL · POD · RC
          </span>
        ) : r.load_id ? (
          <Link
            to={loadDocsUploadPath(r.load_id)}
            className="text-red-700 underline"
            title={`Missing: ${r.missing_docs.join(", ")} — upload on the load`}
            data-testid={`submit-factor-docs-upload-${r.invoice_id}`}
          >
            Upload {r.missing_docs.join(", ")}
          </Link>
        ) : (
          <span className="text-red-700">No load</span>
        ),
    },
    {
      key: "direct_pay",
      label: "Direct pay",
      render: (r) => (
        <Button
          type="button"
          variant="tertiary"
          size="sm"
          disabled={!isOwner}
          title={isOwner ? "Customer pays IH35 directly — not sold to the factor" : OWNER_ONLY_MESSAGE}
          onClick={() => {
            setDirectPayReason("");
            setDirectPayError(null);
            setDirectPay({ row: { invoice_id: r.invoice_id, label: r.invoice_display_id ?? r.invoice_id }, mode: "mark" });
          }}
          data-testid={`submit-factor-direct-pay-${r.invoice_id}`}
        >
          Customer direct pay
        </Button>
      ),
    },
  ];

  const activeFilterCount = [applied.customerId, applied.from, applied.to].filter(Boolean).length;

  return (
    <div className="space-y-3" data-testid="submit-to-factor-tab">
      {!isOwner ? (
        <div className="rounded-sm border border-slate-200 bg-slate-100 px-3 py-2 text-xs text-slate-700" data-testid="submit-factor-owner-only-note">
          {OWNER_ONLY_MESSAGE} You can review the open invoices; Save is the Owner&apos;s.
        </div>
      ) : null}

      {candidatesQuery.isError ? <ListErrorBanner onRetry={() => void candidatesQuery.refetch()} /> : null}

      <ParityTable
        rows={rows}
        rowKey={(r) => r.invoice_id}
        columns={columns}
        storageKey="factoring-submit-to-factor"
        tableTestId="submit-factor-candidates-table"
        exportFilename="factoring-submit-candidates"
        loading={candidatesQuery.isLoading}
        emptyText={candidatesQuery.isLoading ? "Loading open invoices…" : "No open invoice is waiting to be factored."}
        selectable
        selectedKeys={selected}
        onSelectionChange={setSelected}
        initialPageSize={100}
        allowAllPageSize
        suppressToolbarSearch
        suppressToolbarRange
        filterBar={
          <CollapsedListFilters
            activeFilterCount={activeFilterCount}
            onApply={() => setApplied(draft)}
            onCancel={() => setDraft(applied)}
            onReset={() => {
              setDraft(EMPTY_FILTERS);
              setApplied(EMPTY_FILTERS);
            }}
            applyDisabled={JSON.stringify(draft) === JSON.stringify(applied)}
            testIdPrefix="submit-factor"
            applyTestId="submit-factor-filter-apply"
            cancelTestId="submit-factor-filter-cancel"
            resetTestId="submit-factor-filter-reset"
            searchSlot={
              <TableSearch value={search} onChange={setSearch} placeholder="Search invoice, customer, load, PO…" data-testid="submit-factor-search" />
            }
          >
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-xs text-slate-600">
                Customer
                <EntityPicker
                  kind="customer"
                  operatingCompanyId={companyId}
                  value={draft.customerId || null}
                  onChange={(next) => setDraft((d) => ({ ...d, customerId: next ?? "" }))}
                  allowCreate={false}
                  placeholder="All customers"
                  dataTestId="submit-factor-filter-customer"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-600">
                Invoice date from
                <DatePicker value={draft.from} onChange={(v) => setDraft((d) => ({ ...d, from: v }))} className="h-8" data-testid="submit-factor-filter-from" />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-600">
                Invoice date to
                <DatePicker value={draft.to} onChange={(v) => setDraft((d) => ({ ...d, to: v }))} className="h-8" data-testid="submit-factor-filter-to" />
              </label>
            </div>
          </CollapsedListFilters>
        }
      />
      {candidatesQuery.data?.capped ? (
        <div className="text-xs text-slate-600">Showing the first {candidatesQuery.data.limit} open invoices — narrow the filters to see the rest.</div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <DataPanel title="Purchase">
          <div className="grid grid-cols-2 gap-3 p-3 text-xs" data-testid="submit-factor-form">
            <label className="col-span-2 flex flex-col gap-1">
              <span className="uppercase" style={FIELD_LABEL_STYLE}>Factoring company</span>
              <ReferenceSelect
                value={effectiveVendorId || null}
                onChange={(next) => setVendorId(next ?? "")}
                options={vendors.map((v) => ({ value: v.id, label: v.vendor_name, type: v.email ?? "no email on file" }))}
                createKind="vendor"
                operatingCompanyId={companyId}
                placeholder={vendors.length ? "Select factoring company…" : "No Faro vendor found"}
                onOptionCreated={() => void candidatesQuery.refetch()}
                size="sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="uppercase" style={FIELD_LABEL_STYLE}>Purchase date</span>
              <DatePicker value={purchaseDate} onChange={setPurchaseDate} className={FORM_FIELD_CONTROL_SIZE_CLASS} data-testid="submit-factor-purchase-date" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="uppercase" style={FIELD_LABEL_STYLE}>Wire date</span>
              <DatePicker value={wireDate} onChange={setWireDate} className={FORM_FIELD_CONTROL_SIZE_CLASS} data-testid="submit-factor-wire-date" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="uppercase" style={FIELD_LABEL_STYLE}>Faro report ref</span>
              <input
                className={`${FORM_FIELD_CONTROL_SIZE_CLASS} rounded-sm border border-gray-300 px-2`}
                value={reportRef}
                maxLength={80}
                onChange={(e) => setReportRef(e.target.value)}
                data-testid="submit-factor-report-ref"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="uppercase" style={FIELD_LABEL_STYLE}>Wire fee</span>
              <MoneyInput valueCents={wireFeeCents} onChangeCents={(c) => setWireFeeCents(c ?? 0)} className={FORM_FIELD_CONTROL_SIZE_CLASS} ariaLabel="Wire fee" />
            </label>
            <label className="col-span-2 flex flex-col gap-1">
              <span className="uppercase" style={FIELD_LABEL_STYLE}>Send to (Save and send)</span>
              <input
                type="email"
                className={`${FORM_FIELD_CONTROL_SIZE_CLASS} rounded-sm border border-gray-300 px-2`}
                value={sendTo}
                placeholder={vendor?.email ?? "Factor submission email"}
                onChange={(e) => setSendTo(e.target.value)}
                data-testid="submit-factor-send-to"
              />
            </label>
          </div>
        </DataPanel>

        {selectedRows.length ? (
          <DataPanel title="Selected invoices — Faro actuals">
            <div className="p-3 text-xs" data-testid="submit-factor-actuals">
              <p className="mb-2 text-slate-600">
                Faro holds one 1.5% Security Reserve per invoice — normally as escrow reserve, on some invoices as cash reserve instead. Enter
                Faro's purchase-report figures here when they differ from the expected split.
              </p>
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="text-left uppercase" style={FIELD_LABEL_STYLE}>Invoice</th>
                    <th className="text-right uppercase" style={FIELD_LABEL_STYLE}>Escrow reserve</th>
                    <th className="text-right uppercase" style={FIELD_LABEL_STYLE}>Cash reserve</th>
                    <th className="text-right uppercase" style={FIELD_LABEL_STYLE}>Fee</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {selectedRows.map((r) => {
                    const f = lineFigures(r, lineActuals[r.invoice_id]);
                    const setF = (patch: Partial<LineActuals>) => setLineActuals((m) => ({ ...m, [r.invoice_id]: { ...f, ...patch } }));
                    return (
                      <tr key={r.invoice_id} data-testid={`submit-factor-actuals-row-${r.invoice_id}`}>
                        <td>
                          <EntityLink kind="invoice" id={r.invoice_id} label={r.invoice_display_id ?? "invoice"} />
                        </td>
                        <td className="py-1 text-right">
                          <MoneyInput valueCents={f.escrow_reserve_cents} onChangeCents={(c) => setF({ escrow_reserve_cents: c ?? 0 })} className={FORM_FIELD_CONTROL_SIZE_CLASS} ariaLabel={`Escrow reserve ${r.invoice_display_id ?? ""}`} />
                        </td>
                        <td className="py-1 text-right">
                          <MoneyInput valueCents={f.cash_reserve_cents} onChangeCents={(c) => setF({ cash_reserve_cents: c ?? 0 })} className={FORM_FIELD_CONTROL_SIZE_CLASS} ariaLabel={`Cash reserve ${r.invoice_display_id ?? ""}`} />
                        </td>
                        <td className="py-1 text-right">
                          <MoneyInput valueCents={f.fee_cents} onChangeCents={(c) => setF({ fee_cents: c ?? 0 })} className={FORM_FIELD_CONTROL_SIZE_CLASS} ariaLabel={`Fee ${r.invoice_display_id ?? ""}`} />
                        </td>
                        <td className="py-1 pl-2 text-right">
                          <button
                            type="button"
                            className="rounded-sm border border-gray-300 px-2 py-0.5 text-xs text-slate-700"
                            onClick={() => setF({ cash_reserve_cents: f.cash_reserve_cents + f.escrow_reserve_cents, escrow_reserve_cents: 0 })}
                            disabled={f.escrow_reserve_cents === 0}
                            data-testid={`submit-factor-reserve-to-cash-${r.invoice_id}`}
                          >
                            Reserve in cash
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </DataPanel>
        ) : null}

        {missingDocsRows.length ? (
          <DataPanel title="Override approval — missing documents">
            <div className="p-3 text-xs" data-testid="submit-factor-docs-override">
              <p className="mb-2 text-slate-600">
                {missingDocsRows.length} selected load(s) are missing BOL / POD / rate confirmation. The Owner may approve sending to the factor
                anyway; the reason is stamped on the purchase and audited.
              </p>
              <label className="flex flex-col gap-1">
                <span className="uppercase" style={FIELD_LABEL_STYLE}>Override reason (Owner)</span>
                <input
                  className={`${FORM_FIELD_CONTROL_SIZE_CLASS} rounded-sm border border-gray-300 px-2`}
                  value={docsOverrideReason}
                  maxLength={1000}
                  disabled={!isOwner}
                  placeholder="At least 10 characters — why these loads go without documents"
                  onChange={(e) => setDocsOverrideReason(e.target.value)}
                  data-testid="submit-factor-docs-override-reason"
                />
              </label>
            </div>
          </DataPanel>
        ) : null}

        <DataPanel title="Selection totals">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 p-3 text-xs" data-testid="submit-factor-totals">
            <dt className="text-slate-600">Invoices</dt>
            <dd className="text-right font-semibold" data-testid="submit-factor-total-count">{totals.count}</dd>
            <dt className="text-slate-600">Gross</dt>
            <dd className="text-right font-semibold" data-testid="submit-factor-total-gross">{formatUsdCents(totals.gross)}</dd>
            <dt className="text-slate-600">Escrow reserve</dt>
            <dd className="text-right" data-testid="submit-factor-total-escrow">{formatUsdCents(totals.escrow)}</dd>
            <dt className="text-slate-600">Factoring fee</dt>
            <dd className="text-right" data-testid="submit-factor-total-fee">{formatUsdCents(totals.fee)}</dd>
            <dt className="text-slate-600">Advance (gross − escrow − fee)</dt>
            <dd className="text-right font-semibold" data-testid="submit-factor-total-advance">{formatUsdCents(totals.advance)}</dd>
            <dt className="text-slate-600">Cash reserve</dt>
            <dd className="text-right" data-testid="submit-factor-total-cash">{formatUsdCents(totals.cash)}</dd>
            <dt className="text-slate-600">Wire fee</dt>
            <dd className="text-right" data-testid="submit-factor-total-wire">{formatUsdCents(totals.wire)}</dd>
            <dt className="font-semibold text-slate-800">Net to IH35</dt>
            <dd className={`text-right font-semibold ${totals.net < 0 ? "text-red-700" : "text-[#16A34A]"}`} data-testid="submit-factor-total-net">
              {formatUsdCents(totals.net)}
            </dd>
          </dl>
          <div className="flex items-center justify-between gap-2 border-t border-gray-200 px-3 py-2">
            <span className="text-xs text-slate-600">
              {missingDocsRows.length
                ? docsOverrideOk
                  ? `${missingDocsRows.length} invoice(s) missing docs — Owner override approved`
                  : `${missingDocsRows.length} selected invoice(s) missing docs — Save needs an Owner override approval`
                : "Expected split from the factor rates unless Faro's actuals are entered per invoice."}
            </span>
            <SaveDropdown
              storageKey="factoring-submit-to-factor"
              primaryLabel="Save"
              onSave={() => save(false)}
              onSaveAndSend={() => save(true)}
              disabled={!isOwner || saving || selectedRows.length === 0}
              loading={saving}
              title={!isOwner ? OWNER_ONLY_MESSAGE : selectedRows.length === 0 ? "Select at least one invoice" : undefined}
            />
          </div>
        </DataPanel>
      </div>

      {saveError ? <SaveErrorPanel error={saveError} rows={byId} /> : null}

      {created ? (
        <div className="rounded-sm border border-slate-200 bg-slate-100 px-3 py-2 text-xs text-slate-700" data-testid="submit-factor-created">
          Purchase{" "}
          {created.purchase.factoring_advance_id ? (
            <EntityLink kind="factoring_advance" id={created.purchase.factoring_advance_id} label={created.purchase.display_id} data-testid="submit-factor-created-link" />
          ) : (
            <span>(not posted)</span>
          )}{" "}
          posted — {created.purchase.invoice_count} invoice(s), gross {formatUsdCents(created.purchase.gross_cents)}, net to IH35{" "}
          {formatUsdCents(created.purchase.net_to_company_cents)}.
          {created.purchase.journal_entry_id ? (
            <>
              {" "}
              Journal entry <EntityLink kind="journal_entry" id={created.purchase.journal_entry_id} label="view" />.
            </>
          ) : null}
          {created.sentTo ? <> Sent to {created.sentTo}.</> : null}
          {created.sendError ? (
            <div className="mt-2">
              <SaveErrorPanel error={created.sendError} rows={byId} prefix="Not sent: " />
              <Button type="button" variant="secondary" size="sm" className="mt-1" onClick={() => void retrySend()} disabled={saving}>
                Retry send
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="text-xs">
        <button type="button" className="text-slate-700 underline" onClick={() => setShowDirectPayList((v) => !v)} data-testid="submit-factor-direct-pay-toggle">
          {showDirectPayList ? "Hide" : "Show"} customer direct pay invoices
        </button>
        {showDirectPayList ? (
          <ul className="mt-2 space-y-1" data-testid="submit-factor-direct-pay-list">
            {(directPayQuery.data ?? []).length === 0 ? <li className="text-slate-500">None marked.</li> : null}
            {(directPayQuery.data ?? []).map((d) => (
              <li key={d.invoice_id} className="flex flex-wrap items-center gap-2">
                <EntityLink kind="invoice" id={d.invoice_id} label={entityLabel(d.invoice_display_id, d.invoice_id, "Invoice")} />
                <EntityLink kind="customer" id={d.customer_id} label={entityLabel(d.customer_name, d.customer_id, "Customer")} />
                <span>{formatUsdCents(d.total_cents)}</span>
                <span className="text-slate-500">{d.reason}</span>
                <Button
                  type="button"
                  variant="tertiary"
                  size="sm"
                  disabled={!isOwner}
                  onClick={() => {
                    setDirectPayReason("");
                    setDirectPayError(null);
                    setDirectPay({ row: { invoice_id: d.invoice_id, label: d.invoice_display_id ?? d.invoice_id }, mode: "undo" });
                  }}
                >
                  Undo direct pay
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <Modal
        open={Boolean(directPay)}
        onClose={() => setDirectPay(null)}
        title={directPay?.mode === "undo" ? `Undo customer direct pay — ${directPay.row.label}` : `Customer direct pay — ${directPay?.row.label ?? ""}`}
      >
        <div className="space-y-2 text-xs">
          <p>
            {directPay?.mode === "undo"
              ? "The invoice returns to the Submit to Factor list."
              : "The customer pays IH35 directly; this invoice will not be sold to the factor and leaves the Submit to Factor list."}
          </p>
          <label className="flex flex-col gap-1">
            <span className="uppercase" style={FIELD_LABEL_STYLE}>Reason</span>
            <textarea
              className="min-h-[60px] rounded-sm border border-gray-300 p-2 text-xs"
              value={directPayReason}
              onChange={(e) => setDirectPayReason(e.target.value)}
              data-testid="submit-factor-direct-pay-reason"
            />
          </label>
          {directPayError ? <div className="text-red-700">{directPayError}</div> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setDirectPay(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void confirmDirectPay()} loading={directPayBusy} data-testid="submit-factor-direct-pay-confirm">
              Confirm
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function SaveErrorPanel({ error, rows, prefix = "" }: { error: SaveError; rows: Map<string, PurchaseCandidate>; prefix?: string }) {
  const label = (invoiceId: string) => rows.get(invoiceId)?.invoice_display_id ?? invoiceId;
  return (
    <div className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800" role="alert" data-testid="submit-factor-error">
      {error.kind === "owner_only" ? <strong>{prefix}{OWNER_ONLY_MESSAGE}</strong> : null}
      {error.kind === "message" ? <span>{prefix}{error.text}</span> : null}
      {error.kind === "feed_gate" ? (
        <>
          <strong>{prefix}Feed Gate blocked {error.blocked.length} invoice(s) — fix these before they can enter a purchase:</strong>
          <ul className="mt-1 space-y-1">
            {error.blocked.map((b) => (
              <li key={b.invoice_id}>
                <EntityLink kind="invoice" id={b.invoice_id} label={label(b.invoice_id)} />
                <ul className="ml-4 list-disc">
                  {b.reds.length === 0 ? <li>{b.error}</li> : null}
                  {b.reds.map((r, i) => (
                    <li key={`${r.check_key}-${i}`}>
                      {r.subject_label ? `${r.subject_label}: ` : ""}
                      {r.missing ?? r.check_key}{" "}
                      {r.fix_link ? (
                        <Link to={r.fix_link} className="underline">
                          fix
                        </Link>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {error.kind === "per_invoice" ? (
        <>
          <strong>{prefix}{error.title}</strong>
          <ul className="mt-1 ml-4 list-disc">
            {error.rows.map((r, i) => (
              <li key={`${r.invoice_id}-${i}`}>
                {r.invoice_id ? <EntityLink kind="invoice" id={r.invoice_id} label={label(r.invoice_id)} /> : null} {r.reason}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {error.kind === "missing_docs" ? (
        <>
          <strong>{prefix}Save and send is blocked — these loads are missing documents:</strong>
          <ul className="mt-1 ml-4 list-disc">
            {error.rows.map((r) => (
              <li key={r.invoice_id}>
                <EntityLink kind="invoice" id={r.invoice_id} label={r.invoice_display_id ?? label(r.invoice_id)} /> — {r.missing.join(", ")}{" "}
                {r.load_id ? (
                  <Link to={loadDocsUploadPath(r.load_id)} className="underline">
                    upload on load {r.load_number ?? ""}
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
