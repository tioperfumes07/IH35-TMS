import { entityLabel } from "../../lib/entity-label";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listWorkqueue, type WorkqueueItem } from "../../api/factoring";
import { EntityLink } from "../../components/shared/EntityLink";
import { MoneyCell } from "../../components/shared/MoneyCell";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { BoardSection } from "../../components/v3/BoardSection";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatDateUS } from "../../lib/formatDate";
import { formatQuantityTable } from "../../lib/money";

const STATUS_LABEL: Record<string, string> = {
  submitted: "Submitted",
  advanced: "Funded",
  reserve_held: "Reserve Held",
  collected: "Collected",
  released: "Released",
  recourse_returned: "Recourse",
  disputed: "Disputed",
};

function StatusPill({ status }: { status: string | null }) {
  const label = status ? (STATUS_LABEL[status] ?? status) : "—";
  const colorClass =
    status === "advanced" || status === "collected" || status === "released"
      ? "bg-[#F7F8FA] text-[#1F2A44]"
      : status === "recourse_returned" || status === "disputed"
        ? "bg-red-100 text-red-700"
        : "bg-[#F7F8FA] text-[#4B5563]";
  return <span className={`rounded-sm px-1.5 py-0.5 text-xs font-semibold ${colorClass}`}>{label}</span>;
}

function RecourseRisk({ item }: { item: WorkqueueItem }) {
  const days = item.days_until_recourse_expiry;
  if (days == null) return <span className="text-[#6B7280]">—</span>;
  if (days < 0) return <span className="font-semibold text-red-600">Expired</span>;
  const label = `${formatQuantityTable(days, 0)}d`;
  if (days <= 14) return <span className="font-semibold text-red-500">{label}</span>;
  if (days <= 30) return <span className="font-semibold text-[#4B5563]">{label}</span>;
  return <span className="text-[#6B7280]">{label}</span>;
}

export function SubmissionWorkqueue() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const workqueueQuery = useQuery({
    queryKey: ["factoring", "workqueue", companyId],
    queryFn: () => listWorkqueue(companyId).then((r) => r.items),
    enabled: Boolean(companyId),
  });

  const items: WorkqueueItem[] = workqueueQuery.data ?? [];

  const columns = useMemo<ParityColumn<WorkqueueItem>[]>(
    () => [
      {
        key: "invoice_id",
        label: "Invoice",
        render: (item) => (
          <EntityLink
            kind="invoice"
            id={item.invoice_id}
            label={entityLabel(item.display_id, item.invoice_id, "Invoice")}
          />
        ),
      },
      {
        key: "customer_id",
        label: "Customer",
        render: (item) => (
          <EntityLink
            kind="customer"
            id={item.customer_id}
            label={entityLabel(item.customer_name, item.customer_id, "Customer")}
          />
        ),
      },
      {
        key: "batch_number",
        label: "Batch",
        render: (item) => <span className="font-mono text-[#6B7280]">{item.batch_number ?? "—"}</span>,
      },
      {
        key: "submitted_at",
        label: "Submitted",
        sortable: true,
        render: (item) => (item.submitted_at ? formatDateUS(item.submitted_at.slice(0, 10)) : "—"),
      },
      {
        key: "factoring_status",
        label: "Status",
        render: (item) => <StatusPill status={item.factoring_status} />,
      },
      {
        key: "factor_name",
        label: "Factor",
        render: (item) =>
          item.factor_vendor_id ? (
            <EntityLink
              kind="vendor"
              id={item.factor_vendor_id}
              label={entityLabel(item.factor_name, item.factor_vendor_id, "Factor")}
            />
          ) : (
            <span className="text-[#6B7280]">{item.factor_name ?? "—"}</span>
          ),
      },
      {
        key: "total_cents",
        label: "Linehaul",
        sortable: true,
        render: (item) => (
          <MoneyCell cents={Number(item.total_cents ?? 0)} drill={{ entity: { kind: "invoice", id: item.invoice_id } }} />
        ),
      },
      {
        key: "advance_cents",
        label: "Advance",
        sortable: true,
        render: (item) => (
          <MoneyCell cents={Number(item.advance_cents ?? 0)} drill={{ entity: { kind: "invoice", id: item.invoice_id } }} />
        ),
      },
      {
        key: "reserve_cents",
        label: "Reserve",
        sortable: true,
        render: (item) => (
          <MoneyCell cents={Number(item.reserve_cents ?? 0)} drill={{ entity: { kind: "invoice", id: item.invoice_id } }} />
        ),
      },
      {
        key: "fee_cents",
        label: "Fee",
        sortable: true,
        render: (item) => (
          <MoneyCell cents={Number(item.fee_cents ?? 0)} drill={{ entity: { kind: "invoice", id: item.invoice_id } }} />
        ),
      },
      {
        key: "chargeback_cents",
        label: "Chargeback",
        render: (item) =>
          item.chargeback_cents > 0 ? (
            <MoneyCell
              cents={Number(item.chargeback_cents ?? 0)}
              className="text-red-600"
              drill={{ entity: { kind: "invoice", id: item.invoice_id } }}
            />
          ) : (
            <span className="text-[#6B7280]">—</span>
          ),
      },
      {
        key: "days_until_recourse_expiry",
        label: "Recourse Risk",
        sortable: true,
        render: (item) => <RecourseRisk item={item} />,
      },
    ],
    [],
  );

  if (!companyId) {
    return (
      <BoardSection title="Factoring workqueue" testId="factoring-submission-workqueue-need-company">
        <p className="px-3 py-2 text-xs text-[#4B5563]">Select an operating company.</p>
      </BoardSection>
    );
  }

  if (workqueueQuery.isError) {
    return (
      <ListErrorState
        title="Couldn't load the factoring workqueue"
        status={0}
        message={(workqueueQuery.error as Error)?.message}
        onRetry={() => void workqueueQuery.refetch()}
      />
    );
  }

  return (
    // FAC-F3542: always mount ParityTable (Search+Range+gear); raw HTML table + empty early-return skipped surface bar.
    <ParityTable<WorkqueueItem> appearance="board"
      title="Invoices submitted to a factor"
      columns={columns}
      rows={items}
      rowKey={(item) => item.invoice_id}
      loading={workqueueQuery.isLoading}
      emptyText="No invoices in factoring workqueue. Invoices appear here once submitted to a factor."
      storageKey="factoring-submission-workqueue"
      exportFilename="factoring-submission-workqueue"
      tableTestId="factoring-submission-workqueue-table"
    />
  );
}
