// ROUND 23.3 Part C (owner/Lead, 2026-09-13) — dispute window hub.
// C-25 (owner 2026-09-30): split presentation THREE ways (Driver / Customer / Vendor).
// Do NOT unify into one mixed table — different counterparty, money direction, and remedy.
// Vendor register does not exist yet (CC-1 A-25); panel is honest-empty, no invented table.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  decideDisputeFault,
  listInvoiceDisputeQueue,
  openInvoiceDispute,
  type FaultParty,
  type InvoiceDisputeReason,
  type InvoiceDisputeRow,
} from "../../api/invoice-disputes";
import { listInvoices, type Invoice } from "../../api/accounting";
import { listDisputeQueue, type SettlementDisputeQueueRow } from "../../api/disputes";
import { ApiError } from "../../api/client";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityLink } from "../../components/shared/EntityLink";
import { EntityPicker } from "../../components/EntityPicker";
import { SelectCombobox } from "../../components/Combobox";
import { entityLabel } from "../../lib/entity-label";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatDateUS } from "../../lib/formatDate";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { statusPill } from "../../components/shared/statusPill";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import { SegmentedControl } from "../../components/SegmentedControl";
import { formatUsdCents, TABLE_MISSING } from "../../utils/qboFormat";

function money(cents: number | null | undefined) {
  if (cents == null || !Number.isFinite(Number(cents))) return TABLE_MISSING;
  return formatUsdCents(Number(cents));
}

// Round 88 (owner law) — the closed fault vocabulary, in the order a dispatcher would triage a
// late/short-pay: driver first (the case that unlocks a recovery), then the non-driver causes,
// then the honest not-yet-decided default.
const FAULT_PARTY_OPTIONS: Array<{ value: FaultParty; label: string }> = [
  { value: "unassigned", label: "Not yet decided" },
  { value: "driver", label: "Driver" },
  { value: "carrier", label: "Carrier (our dispatch/equipment)" },
  { value: "customer", label: "Customer (shipper/receiver)" },
  { value: "broker", label: "Broker" },
  { value: "force_majeure", label: "Force majeure (weather/border/accident)" },
];

function faultPartyLabel(party: FaultParty): string {
  return FAULT_PARTY_OPTIONS.find((o) => o.value === party)?.label ?? party;
}

/**
 * Round 88 (owner law, migration 202614290000) — "IF WE ARE LATE DUE TO DRIVER FAULT, WE WILL
 * DEDUCT." The fault decision is a NAMED HUMAN ACT: the operator must pick who was at fault and
 * say why, in a real reason (min 10 chars — matches the DB's own non-empty CHECK, tightened so
 * "n/a" can't satisfy it). Only 'driver' may ever name a driver; the database (not this modal)
 * refuses a recovery against any other fault_party and refuses recovering more than the customer
 * withheld — this screen's only job is collecting the decision honestly.
 */
function DecideFaultModal({
  dispute,
  companyId,
  onClose,
}: {
  dispute: InvoiceDisputeRow;
  companyId: string;
  onClose: () => void;
}) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [faultParty, setFaultParty] = useState<FaultParty>(dispute.fault_party === "unassigned" ? "driver" : dispute.fault_party);
  const [reason, setReason] = useState(dispute.fault_reason ?? "");
  const [driverId, setDriverId] = useState<string | null>(dispute.driver_id);

  const mutation = useMutation({
    mutationFn: () =>
      decideDisputeFault(dispute.id, {
        operating_company_id: companyId,
        fault_party: faultParty,
        fault_reason: reason.trim(),
        driver_id: faultParty === "driver" ? driverId : null,
        load_id: faultParty === "driver" ? undefined : null,
      }),
    onSuccess: () => {
      pushToast("Fault decision recorded", "success");
      void queryClient.invalidateQueries({ queryKey: ["accounting", "invoice-disputes", "hub", companyId] });
      onClose();
    },
    onError: (error) => pushToast(userFacingApiError(error, "Failed to record fault decision"), "error"),
  });

  const canSubmit = reason.trim().length >= 10 && (faultParty !== "driver" || Boolean(driverId));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" data-testid="decide-fault-modal">
      <div className="w-[420px] rounded-sm border border-gray-300 bg-white p-4 shadow-lg">
        <h3 className="text-xs font-semibold text-[#0F1219]">
          Decide fault — invoice{" "}
          <EntityLink
            kind="invoice"
            id={dispute.invoice_id}
            label={entityLabel(dispute.invoice_display_id, dispute.invoice_id, "Invoice")}
          />
        </h3>
        <p className="mt-1 text-xs text-gray-500">
          Only a driver-fault decision may produce a driver deduction. The database refuses recovering more than
          the {money(dispute.disputed_amount_cents)} withheld.
        </p>
        <label className="mt-3 block text-xs">
          <div className="mb-1 text-gray-500">Fault</div>
          <SelectCombobox
            value={faultParty}
            onChange={(event) => setFaultParty(event.target.value as FaultParty)}
            data-testid="fault-party-select"
          >
            {FAULT_PARTY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </SelectCombobox>
        </label>
        {faultParty === "driver" ? (
          <label className="mt-3 block text-xs">
            <div className="mb-1 text-gray-500">Driver</div>
            <EntityPicker
              kind="driver"
              operatingCompanyId={companyId}
              value={driverId}
              onChange={setDriverId}
              allowCreate={false}
              placeholder="Select driver"
              className="w-full"
              dataTestId="fault-driver-picker"
            />
          </label>
        ) : null}
        <label className="mt-3 block text-xs">
          <div className="mb-1 text-gray-500">Reason (required — at least 10 characters)</div>
          <textarea
            className="w-full rounded-sm border border-gray-300 p-2 text-xs"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            data-testid="fault-reason-input"
          />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="rounded-sm border border-gray-300 px-3 py-1 text-xs" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="rounded-sm bg-[#1F2A44] px-3 py-1 text-xs font-semibold text-white disabled:opacity-40"
            disabled={!canSubmit || mutation.isPending}
            data-testid="fault-decision-confirm"
            onClick={() => mutation.mutate()}
          >
            Record decision
          </button>
        </div>
      </div>
    </div>
  );
}

const DISPUTE_REASON_OPTIONS: Array<{ value: InvoiceDisputeReason; label: string }> = [
  { value: "short_pay", label: "Short pay" },
  { value: "mis_entry", label: "Mis-entry" },
  { value: "customer_discount", label: "Customer discount" },
  { value: "under_billing", label: "Under-billing" },
  { value: "over_payment", label: "Over-payment" },
  { value: "late_fine", label: "Late fine" },
  { value: "chargeback", label: "Chargeback" },
  { value: "driver_no_answer", label: "Driver no answer" },
  { value: "other", label: "Other" },
];

function OpenDisputeModal({
  companyId,
  onClose,
}: {
  companyId: string;
  onClose: () => void;
}) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [reasonCode, setReasonCode] = useState<InvoiceDisputeReason>("short_pay");
  const [reasonText, setReasonText] = useState("");
  const [expectedDollars, setExpectedDollars] = useState("");

  const invoicesQuery = useQuery({
    queryKey: ["invoice-search-for-dispute", companyId, search],
    queryFn: () =>
      listInvoices(companyId, { search: search.trim() || undefined, status: ["invoiced", "sent", "posted"], limit: 20 }),
    enabled: Boolean(companyId),
  });
  const invoices = invoicesQuery.data?.invoices ?? [];

  const expectedCents = Math.round(parseFloat(expectedDollars || "0") * 100);
  const invoicedCents = selectedInvoice?.total_cents ?? 0;
  const disputedCents = invoicedCents - expectedCents;

  const mutation = useMutation({
    mutationFn: () => {
      if (!selectedInvoice) throw new Error("No invoice selected");
      return openInvoiceDispute(selectedInvoice.id, {
        operating_company_id: companyId,
        disputed_amount_cents: disputedCents,
        expected_amount_cents: expectedCents,
        reason_code: reasonCode,
        reason_text: reasonText.trim() || undefined,
      });
    },
    onSuccess: () => {
      pushToast("Dispute opened", "success");
      void queryClient.invalidateQueries({ queryKey: ["accounting", "invoice-disputes", "hub", companyId] });
      onClose();
    },
    onError: (error) => pushToast(userFacingApiError(error, "Failed to open dispute"), "error"),
  });

  const canSubmit =
    Boolean(selectedInvoice) &&
    disputedCents > 0 &&
    expectedCents >= 0 &&
    !isNaN(parseFloat(expectedDollars));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      data-testid="open-dispute-modal"
    >
      <div className="w-[460px] rounded-sm border border-gray-300 bg-white p-4 shadow-lg">
        <h3 className="text-xs font-semibold text-[#0F1219]">Open invoice dispute</h3>
        <p className="mt-1 text-xs text-gray-500">
          Select an invoiced invoice, enter the expected amount, and the difference becomes the disputed amount.
        </p>

        <label className="mt-3 block text-xs">
          <div className="mb-1 text-gray-500">Search invoices</div>
          <input
            type="text"
            className="w-full rounded-sm border border-[#E5E7EB] px-2 py-1 text-xs"
            placeholder="Invoice # or customer…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelectedInvoice(null);
            }}
            data-testid="open-dispute-invoice-search"
          />
        </label>

        {invoices.length > 0 && !selectedInvoice ? (
          <ul
            className="mt-1 max-h-40 overflow-y-auto rounded-sm border border-[#E5E7EB] bg-white text-xs"
            data-testid="open-dispute-invoice-list"
          >
            {invoices.map((inv) => (
              <li key={inv.id} className="flex items-center gap-2 px-2 py-1 hover:bg-[#F7F8FA]">
                <EntityLink kind="invoice" id={inv.id} label={entityLabel(inv.display_id, inv.id, "Invoice")} className="font-semibold" />
                <span className="flex-1 text-[#4B5563]">
                  {inv.customer_name ?? "—"} — {money(inv.total_cents)}
                </span>
                <button
                  type="button"
                  className="rounded-sm border border-[#E5E7EB] px-2 py-0.5 text-xs hover:bg-white"
                  onClick={() => {
                    setSelectedInvoice(inv);
                    setSearch(inv.display_id);
                  }}
                  data-testid={`open-dispute-pick-${inv.id}`}
                >
                  Select
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {selectedInvoice ? (
          <div className="mt-2 rounded-sm bg-[#F7F8FA] p-2 text-xs text-[#1F2A44]" data-testid="open-dispute-selected-invoice">
            <EntityLink kind="invoice" id={selectedInvoice.id} label={entityLabel(selectedInvoice.display_id, selectedInvoice.id, "Invoice")} className="font-semibold" />
            {" · "}{selectedInvoice.customer_name ?? "—"}
            {" · invoiced: "}<span className="font-semibold">{money(selectedInvoice.total_cents)}</span>
          </div>
        ) : null}

        <label className="mt-3 block text-xs">
          <div className="mb-1 text-gray-500">Expected amount (USD)</div>
          <input
            type="number"
            min="0"
            step="0.01"
            className="w-full rounded-sm border border-[#E5E7EB] px-2 py-1 text-xs"
            placeholder="0.00"
            value={expectedDollars}
            onChange={(e) => setExpectedDollars(e.target.value)}
            data-testid="open-dispute-expected-amount"
          />
          {selectedInvoice && expectedDollars ? (
            <div className="mt-1 text-[#6B7280]">
              Difference (disputed): {disputedCents > 0 ? money(disputedCents) : <span className="text-red-500">Expected exceeds invoiced</span>}
            </div>
          ) : null}
        </label>

        <label className="mt-3 block text-xs">
          <div className="mb-1 text-gray-500">Reason</div>
          <SelectCombobox
            value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value as InvoiceDisputeReason)}
            data-testid="open-dispute-reason-select"
          >
            {DISPUTE_REASON_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </SelectCombobox>
        </label>

        <label className="mt-2 block text-xs">
          <div className="mb-1 text-gray-500">Notes (optional)</div>
          <textarea
            className="w-full rounded-sm border border-[#E5E7EB] px-2 py-1 text-xs"
            rows={2}
            value={reasonText}
            onChange={(e) => setReasonText(e.target.value)}
            data-testid="open-dispute-notes"
          />
        </label>

        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-sm border border-[#E5E7EB] px-3 py-1 text-xs"
            onClick={onClose}
            data-testid="open-dispute-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-sm bg-[#1F2A44] px-3 py-1 text-xs font-semibold text-white disabled:opacity-40"
            disabled={!canSubmit || mutation.isPending}
            onClick={() => mutation.mutate()}
            data-testid="open-dispute-submit"
          >
            Open dispute
          </button>
        </div>
      </div>
    </div>
  );
}

function InvoiceDisputesSection({ companyId }: { companyId: string }) {
  const query = useQuery({
    queryKey: ["accounting", "invoice-disputes", "hub", companyId],
    queryFn: () => listInvoiceDisputeQueue(companyId, "open"),
    enabled: Boolean(companyId),
  });
  const rows = query.data?.disputes ?? [];
  const [faultTarget, setFaultTarget] = useState<InvoiceDisputeRow | null>(null);
  const [openingDispute, setOpeningDispute] = useState(false);

  const columns = useMemo<ParityColumn<InvoiceDisputeRow>[]>(
    () => [
      {
        key: "invoice_display_id",
        label: "Invoice",
        sortable: true,
        render: (row) => (
          <EntityLink
            kind="invoice"
            id={row.invoice_id}
            label={entityLabel(row.invoice_display_id, row.invoice_id, "Invoice")}
            data-testid="invoice-dispute-invoice-link"
          />
        ),
      },
      {
        key: "customer_name",
        label: "Customer",
        sortable: true,
        render: (row) => row.customer_name ?? "—",
      },
      {
        key: "reason_code",
        label: "Reason",
        sortable: true,
        render: (row) => (
          <span title={row.reason_text ?? undefined}>{String(row.reason_code).replaceAll("_", " ")}</span>
        ),
      },
      {
        key: "invoiced_amount_cents",
        label: "Invoiced",
        sortable: true,
        render: (row) => money(row.invoiced_amount_cents),
      },
      {
        key: "disputed_amount_cents",
        label: "Disputed",
        sortable: true,
        render: (row) => money(row.disputed_amount_cents),
      },
      {
        key: "expected_amount_cents",
        label: "Expected",
        sortable: true,
        render: (row) => money(row.expected_amount_cents),
      },
      {
        key: "status",
        label: "Status",
        sortable: true,
        render: (row) => <span className={statusPill(String(row.status))}>{String(row.status)}</span>,
      },
      {
        key: "opened_at",
        label: "Opened",
        sortable: true,
        render: (row) => formatDateUS(row.opened_at),
      },
      {
        // Round 88 (owner law) — a named human decision, never blank: "Not yet decided" is the
        // honest default state, distinct from every real fault answer.
        key: "fault_party",
        label: "Fault",
        sortable: true,
        render: (row) =>
          row.fault_party === "driver" && row.driver_id ? (
            <span className="flex items-center gap-1">
              <EntityLink kind="driver" id={row.driver_id} label={entityLabel(null, row.driver_id, "Driver")} />
            </span>
          ) : (
            <span className={row.fault_party === "unassigned" ? "text-[#6B7280]" : "text-[#1F2A44]"}>
              {faultPartyLabel(row.fault_party)}
            </span>
          ),
      },
      {
        key: "fault_action",
        label: "",
        sortable: false,
        render: (row) => (
          <button
            type="button"
            className="text-xs font-semibold text-[#1F2A44] underline"
            data-testid={`decide-fault-${row.id}`}
            onClick={() => setFaultTarget(row)}
          >
            {row.fault_party === "unassigned" ? "Decide fault" : "Change"}
          </button>
        ),
      },
    ],
    []
  );

  if (query.isError) {
    return (
      <ListErrorState
        title="Couldn't load invoice disputes"
        status={(query.error as ApiError | undefined)?.status ?? 0}
        message={(query.error as Error | undefined)?.message}
        onRetry={() => void query.refetch()}
      />
    );
  }

  return (
    <>
      <div className="flex justify-end" data-testid="invoice-disputes-toolbar">
        <button
          type="button"
          className="rounded-sm bg-[#1F2A44] px-3 py-1 text-xs font-semibold text-white"
          onClick={() => setOpeningDispute(true)}
          data-testid="open-dispute-btn"
        >
          Open dispute
        </button>
      </div>
      <ParityTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        loading={query.isPending}
        storageKey="invoice-disputes-hub"
        exportFilename="invoice-disputes"
        initialPageSize={50}
        emptyText="No open invoice disputes."
      />
      {faultTarget ? (
        <DecideFaultModal dispute={faultTarget} companyId={companyId} onClose={() => setFaultTarget(null)} />
      ) : null}
      {openingDispute ? (
        <OpenDisputeModal companyId={companyId} onClose={() => setOpeningDispute(false)} />
      ) : null}
    </>
  );
}

function SettlementDisputesSection({ companyId }: { companyId: string }) {
  const query = useQuery({
    queryKey: ["accounting", "settlement-disputes", "hub", companyId],
    queryFn: () => listDisputeQueue(companyId, { status: "all" }),
    enabled: Boolean(companyId),
  });
  const rows = query.data?.disputes ?? [];

  const columns = useMemo<ParityColumn<SettlementDisputeQueueRow>[]>(
    () => [
      {
        key: "settlement_display_id",
        label: "Settlement",
        sortable: true,
        render: (row) => (
          <EntityLink
            kind="settlement"
            id={row.settlement_id}
            label={entityLabel(row.settlement_display_id, row.settlement_id, "Settlement")}
          />
        ),
      },
      {
        key: "driver_name",
        label: "Driver",
        sortable: true,
        render: (row) => (
          <EntityLink kind="driver" id={row.driver_id} label={entityLabel(row.driver_name, row.driver_id, "Driver")} />
        ),
      },
      {
        key: "reason_code",
        label: "Reason",
        sortable: true,
        render: (row) => String(row.reason_code).replaceAll("_", " "),
      },
      {
        key: "claimed_adjustment_cents",
        label: "Claimed",
        sortable: true,
        render: (row) => money(row.claimed_adjustment_cents),
      },
      {
        key: "status",
        label: "Status",
        sortable: true,
        render: (row) => <span className={statusPill(String(row.status))}>{String(row.status).replaceAll("_", " ")}</span>,
      },
      {
        key: "submitted_at",
        label: "Submitted",
        sortable: true,
        render: (row) => formatDateUS(row.submitted_at),
      },
    ],
    []
  );

  if (query.isError) {
    return (
      <ListErrorState
        title="Couldn't load settlement disputes"
        status={(query.error as ApiError | undefined)?.status ?? 0}
        message={(query.error as Error | undefined)?.message}
        onRetry={() => void query.refetch()}
      />
    );
  }

  return (
    <ParityTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      loading={query.isPending}
      storageKey="settlement-disputes-hub"
      exportFilename="settlement-disputes"
      initialPageSize={50}
      emptyText="No settlement disputes."
    />
  );
}

/**
 * C-25 (owner 2026-09-30): three counterparties, three money directions — never one mixed table.
 *   DRIVER   — settlement pay dispute (we owe the driver)     → driver_finance.* via /api/v1/disputes
 *   CUSTOMER — invoice dispute (they owe us)                  → accounting.invoice_disputes
 *   VENDOR   — bill dispute (we owe the vendor)               → no TMS table yet (CC-1 A-25); honest empty
 * Freeze: presentation split only — touch no dispute rows.
 */
type DisputeParty = "driver" | "customer" | "vendor";

const DISPUTE_PARTY_OPTIONS: Array<{ value: DisputeParty; label: string }> = [
  { value: "driver", label: "Driver" },
  { value: "customer", label: "Customer" },
  { value: "vendor", label: "Vendor" },
];

function readDisputePartyFromUrl(): DisputeParty {
  if (typeof window === "undefined") return "customer";
  const raw = new URLSearchParams(window.location.search).get("party");
  if (raw === "driver" || raw === "customer" || raw === "vendor") return raw;
  return "customer";
}

function VendorDisputesSection() {
  // C-25 + A-25: do not invent a vendor dispute table. CC-1 must name it or say none exists.
  return (
    <div
      className="rounded-sm border border-[#E5E7EB] bg-white p-4 text-xs text-[#1F2A44]"
      data-testid="vendor-disputes-unavailable"
      data-c25-party="vendor"
    >
      <p className="font-semibold uppercase tracking-wide text-[#4B5563]">Vendor disputes — not in TMS yet</p>
      <p className="mt-2 text-[#6B7280]">
        We owe the vendor on this side of money. There is no vendor/bill dispute register in the app today —
        CC-1 A-25 names the table (or confirms none). This panel stays empty on purpose; it does not reuse
        invoice or settlement dispute queries.
      </p>
    </div>
  );
}

export function DisputesHubPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [party, setParty] = useState<DisputeParty>(() => readDisputePartyFromUrl());

  const setPartyAndUrl = (next: DisputeParty) => {
    setParty(next);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("party", next);
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  };

  if (!companyId) {
    return (
      <AccountingSubNavWrapper
        title="Disputes"
        subtitle="Driver · Customer · Vendor — separate objects, separate money directions"
      >
        <p className="text-xs text-red-600">Select operating company.</p>
      </AccountingSubNavWrapper>
    );
  }

  return (
    <AccountingSubNavWrapper
      title="Disputes"
      subtitle="Driver · Customer · Vendor — separate objects, separate money directions"
    >
      <div className="flex flex-col gap-4" data-testid="disputes-hub-c25" data-c25-party={party}>
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl
            value={party}
            onChange={setPartyAndUrl}
            options={DISPUTE_PARTY_OPTIONS}
            testId="disputes-party-segment"
            dataAttributes={{ "aria-label": "Dispute counterparty" }}
          />
          <p className="text-xs text-[#6B7280]">
            {party === "driver"
              ? "Driver pay disputes — we owe the driver (settlement)."
              : party === "customer"
                ? "Customer invoice disputes — they owe us (A/R)."
                : "Vendor bill disputes — we owe the vendor (A/P)."}
          </p>
        </div>

        {party === "driver" ? (
          <section className="flex flex-col gap-2" data-c25-section="driver">
            <h2 className="text-xs font-bold uppercase tracking-wide text-[#4B5563]">
              Driver — settlement pay disputes
            </h2>
            <SettlementDisputesSection companyId={companyId} />
          </section>
        ) : null}

        {party === "customer" ? (
          <section className="flex flex-col gap-2" data-c25-section="customer">
            <h2 className="text-xs font-bold uppercase tracking-wide text-[#4B5563]">
              Customer — invoice disputes
            </h2>
            <InvoiceDisputesSection companyId={companyId} />
          </section>
        ) : null}

        {party === "vendor" ? (
          <section className="flex flex-col gap-2" data-c25-section="vendor">
            <h2 className="text-xs font-bold uppercase tracking-wide text-[#4B5563]">
              Vendor — bill disputes
            </h2>
            <VendorDisputesSection />
          </section>
        ) : null}
      </div>
    </AccountingSubNavWrapper>
  );
}
