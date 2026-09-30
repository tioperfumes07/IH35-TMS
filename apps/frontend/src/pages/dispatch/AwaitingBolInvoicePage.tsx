import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { listAwaitingBolInvoice, type AwaitingBolInvoiceRow } from "../../api/dispatch";
import { ListErrorState } from "../../components/ListErrorState";
import { PageHeader } from "../../components/layout/PageHeader";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { StatusBadge } from "../../components/StatusBadge";
import { useCompanyContext } from "../../contexts/CompanyContext";

/**
 * ROUND 285.4.10 / #60 — named queue: delivered loads waiting on a BOL before
 * auto-invoice → Faro. Upload BOL on the load Documents tab; the delivery latch
 * + docs upload hook fire autoInvoiceOnBol then Faro submit.
 */
export function AwaitingBolInvoicePage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const queueQ = useQuery({
    queryKey: ["dispatch", "awaiting-bol-invoice", companyId],
    queryFn: () => listAwaitingBolInvoice(companyId),
    enabled: Boolean(companyId),
    refetchInterval: 60_000,
  });

  const rows = queueQ.data?.rows ?? [];

  const columns = useMemo<ParityColumn<AwaitingBolInvoiceRow>[]>(
    () => [
      {
        key: "load_number",
        label: "Load #",
        sortable: true,
        className: "font-medium",
        render: (row) => (
          <EntityLinkOrTombstone kind="load" id={row.load_id} name={row.load_number} noun="Load" />
        ),
      },
      {
        key: "status",
        label: "Status",
        sortable: true,
        render: (row) => <StatusBadge status={row.status} />,
      },
      {
        key: "customer_name",
        label: "Customer",
        sortable: true,
        render: (row) => row.customer_name ?? "—",
      },
      {
        key: "waiting_for",
        label: "Waiting for",
        sortable: true,
        render: (row) => row.waiting_for,
      },
      {
        key: "has_invoice",
        label: "Invoice",
        sortable: true,
        render: (row) => (row.has_invoice ? "Yes" : "No — will create on BOL"),
      },
    ],
    [],
  );

  if (!companyId) {
    return (
      <div className="rounded-sm border bg-white p-4 text-xs text-slate-600">
        Select an operating company.
      </div>
    );
  }

  return (
    <div data-testid="awaiting-bol-invoice-page" className="mx-auto max-w-5xl space-y-4 p-4">
      <PageHeader
        title="Awaiting BOL for invoice"
        subtitle="Delivered loads with no BOL on file. Upload the BOL on the load Documents tab — invoice send and Faro submit fire automatically."
        actions={
          <Link to="/dispatch/pod-review" className="rounded-sm border px-3 py-1.5 text-xs">
            POD Review
          </Link>
        }
      />

      {queueQ.isError ? (
        <ListErrorState
          title="Couldn't load the awaiting-BOL queue"
          status={0}
          message={(queueQ.error as Error)?.message}
          onRetry={() => void queueQ.refetch()}
        />
      ) : (
        <ParityTable<AwaitingBolInvoiceRow>
          columns={columns}
          rows={rows}
          rowKey={(row) => row.load_id}
          loading={queueQ.isLoading}
          emptyText="No loads waiting on a BOL."
          storageKey="dispatch-awaiting-bol-invoice"
          exportFilename="awaiting-bol-invoice"
          tableTestId="awaiting-bol-invoice-table"
        />
      )}
      <p className="text-section-header text-gray-500" data-testid="awaiting-bol-invoice-count">
        {rows.length} load{rows.length === 1 ? "" : "s"} waiting for BOL
        {queueQ.data?.count != null && queueQ.data.count !== rows.length
          ? ` (API count ${queueQ.data.count})`
          : ""}
        .
      </p>
    </div>
  );
}
