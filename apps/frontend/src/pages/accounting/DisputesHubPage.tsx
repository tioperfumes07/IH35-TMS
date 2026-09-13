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
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listInvoiceDisputeQueue, type InvoiceDisputeRow } from "../../api/invoice-disputes";
import { listDisputeQueue, type SettlementDisputeQueueRow } from "../../api/disputes";
import { ApiError } from "../../api/client";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatDateUS } from "../../lib/formatDate";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { statusPill } from "../../components/shared/statusPill";

function money(cents: number | null | undefined) {
  if (cents == null || !Number.isFinite(Number(cents))) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(cents) / 100);
}

function InvoiceDisputesSection({ companyId }: { companyId: string }) {
  const query = useQuery({
    queryKey: ["accounting", "invoice-disputes", "hub", companyId],
    queryFn: () => listInvoiceDisputeQueue(companyId, "open"),
    enabled: Boolean(companyId),
  });
  const rows = query.data?.disputes ?? [];

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
