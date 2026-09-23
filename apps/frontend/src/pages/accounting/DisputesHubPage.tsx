// ROUND 23.3 Part C (owner/Lead, 2026-09-13) — the unified dispute window hub.
//
// The full disputes.disputes / 12-subject-type schema (dispute_events WORM, dispute_evidence,
// dispute_window_policies, catalogs.dispute_reasons) is migration-blocked: CC-2 is hard-barred from
// authoring migrations (verify-migration-lane-band.mjs), and that schema needs a real migration.
// This hub does NOT wait on that migration to ship real value — it surfaces the two ALREADY-BUILT,
// ALREADY-LIVE dispute tracks side by side, using routes that already exist:
//   - A/R invoice disputes (accounting/invoice-disputes.routes.ts, wired 2026-09-13 — this hub is
//     its first real UI surface) — must show invoices 13581 and 13586 on first load (both open,
//     status='open', the default filter).
//   - Settlement disputes (the pre-existing /accounting/dispute-queue page's own data source).
// When the disputes.disputes schema lands, this hub is the natural place to fold both into one
// unified table; until then, two honestly-labelled sections beat a fabricated unification.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  decideDisputeFault,
  listInvoiceDisputeQueue,
  type FaultParty,
  type InvoiceDisputeRow,
} from "../../api/invoice-disputes";
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

function money(cents: number | null | undefined) {
  if (cents == null || !Number.isFinite(Number(cents))) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(cents) / 100);
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
        <h3 className="text-xs font-semibold text-slate-900">
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
            className="rounded-sm bg-slate-800 px-3 py-1 text-xs font-semibold text-white disabled:opacity-40"
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

function InvoiceDisputesSection({ companyId }: { companyId: string }) {
  const query = useQuery({
    queryKey: ["accounting", "invoice-disputes", "hub", companyId],
    queryFn: () => listInvoiceDisputeQueue(companyId, "open"),
    enabled: Boolean(companyId),
  });
  const rows = query.data?.disputes ?? [];
  const [faultTarget, setFaultTarget] = useState<InvoiceDisputeRow | null>(null);

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
            <span className={row.fault_party === "unassigned" ? "text-slate-500" : "text-slate-700"}>
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
            className="text-xs font-semibold text-slate-700 underline"
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

export function DisputesHubPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  if (!companyId) {
    return (
      <AccountingSubNavWrapper title="Disputes" subtitle="Unified dispute window — invoice + settlement">
        <p className="text-xs text-red-600">Select operating company.</p>
      </AccountingSubNavWrapper>
    );
  }

  return (
    <AccountingSubNavWrapper title="Disputes" subtitle="Unified dispute window — invoice + settlement">
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Invoice disputes</h2>
          <InvoiceDisputesSection companyId={companyId} />
        </section>
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Settlement disputes</h2>
          <SettlementDisputesSection companyId={companyId} />
        </section>
      </div>
    </AccountingSubNavWrapper>
  );
}
