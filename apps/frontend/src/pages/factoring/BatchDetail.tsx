import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getFactoringBatchDetail, getReserveMovements, type FactoringBatchInvoice, type FactoringReserveMovement } from "../../api/factoring";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityLink } from "../../components/shared/EntityLink";
import { BoardSection } from "../../components/v3/BoardSection";
import { entityLabel } from "../../lib/entity-label";
import { titleize } from "../../lib/titleize";
import { formatDateUS } from "../../lib/formatDate";
import { formatUsdCents } from "../../lib/money";


function asMoney(cents: number) {
  return formatUsdCents(cents);
}

type ReserveMovementRow = FactoringReserveMovement & {
  signed_amount_cents: number;
  running_balance_cents: number;
};

function withRunningBalance(movements: FactoringReserveMovement[]): ReserveMovementRow[] {
  let running = 0;
  return movements.map((movement) => {
    const signed = movement.direction === "credit" ? movement.amount_cents : -movement.amount_cents;
    running += signed;
    return {
      ...movement,
      signed_amount_cents: signed,
      running_balance_cents: running,
    };
  });
}

const RESERVE_COLUMNS: Array<ParityColumn<ReserveMovementRow>> = [
  {
    key: "created_at",
    label: "Created At",
    sortable: true,
    render: (row) => formatDateUS(row.created_at),
  },
  {
    key: "reason",
    label: "Reason",
    sortable: true,
  },
  {
    key: "direction",
    label: "Direction",
    sortable: true,
    render: (row) => <span className="capitalize">{row.direction}</span>,
  },
  {
    key: "signed_amount_cents",
    label: "Amount",
    sortable: true,
    className: "text-right",
    sortValue: (row) => row.signed_amount_cents,
    render: (row) => (
      <span className={row.signed_amount_cents >= 0 ? "text-[#1F2A44]" : "text-red-700"}>
        {row.signed_amount_cents >= 0 ? "+" : "-"}
        {asMoney(Math.abs(row.signed_amount_cents))}
      </span>
    ),
  },
  {
    key: "running_balance_cents",
    label: "Running Reserve Balance",
    sortable: true,
    className: "text-right",
    sortValue: (row) => row.running_balance_cents,
    render: (row) => <span className="font-medium">{asMoney(row.running_balance_cents)}</span>,
  },
];

const INVOICE_COLUMNS: Array<ParityColumn<FactoringBatchInvoice>> = [
  {
    key: "display_id",
    label: "Invoice",
    sortable: true,
    render: (row) => (
      <EntityLink kind="invoice" id={row.id} label={entityLabel(row.display_id, row.id, "Invoice")} />
    ),
  },
  {
    key: "customer_name",
    label: "Customer",
    sortable: true,
    render: (row) =>
      row.customer_id ? (
        <EntityLink
          kind="customer"
          id={row.customer_id}
          label={entityLabel(row.customer_name, row.customer_id, "Customer")}
        />
      ) : (
        entityLabel(row.customer_name, null, "Customer")
      ),
  },
  {
    key: "total_cents",
    label: "Amount",
    sortable: true,
    className: "text-right",
    sortValue: (row) => row.total_cents,
    render: (row) => asMoney(row.total_cents),
  },
  {
    key: "status",
    label: "Status",
    sortable: true,
    render: (row) => titleize(row.status ?? ""),
  },
];

export function BatchDetail({ batchId, companyId }: { batchId: string; companyId: string }) {
  const detailQuery = useQuery({
    queryKey: ["factoring", "batch-detail", companyId, batchId],
    queryFn: () => getFactoringBatchDetail(batchId, companyId),
    enabled: Boolean(batchId && companyId),
  });

  const reserveMovementsQuery = useQuery({
    queryKey: ["factoring", "reserve-movements", companyId, batchId],
    queryFn: () => getReserveMovements(batchId, companyId).then((res) => res.movements),
    enabled: Boolean(batchId && companyId),
  });

  const reserveRows = useMemo(() => withRunningBalance(reserveMovementsQuery.data ?? []), [reserveMovementsQuery.data]);
  const detail = detailQuery.data;

  if (detailQuery.isLoading) {
    return (
      <BoardSection title="Batch detail" testId="factoring-batch-detail-loading">
        <div className="px-3.5 py-3 text-xs text-gray-500">Loading submitted batch detail...</div>
      </BoardSection>
    );
  }
  if (detailQuery.isError) {
    return (
      <BoardSection title="Batch detail" testId="factoring-batch-detail-error">
        <ListErrorState
          title="Couldn't load batch detail"
          status={0}
          message={(detailQuery.error as Error)?.message}
          onRetry={() => void detailQuery.refetch()}
        />
      </BoardSection>
    );
  }
  if (!detail) {
    return (
      <BoardSection title="Batch detail" testId="factoring-batch-detail-unavailable">
        <div className="px-3.5 py-3 text-xs text-gray-500">Batch detail unavailable.</div>
      </BoardSection>
    );
  }

  return (
    <div className="space-y-3">
      <BoardSection title={detail.batch.batch_number} testId="factoring-batch-detail-summary">
        <div className="space-y-2 px-3.5 py-2 text-xs">
          <div className="text-gray-700">
            Status: {titleize(detail.batch.status)} · Face: {asMoney(detail.batch.total_face_cents)} · Advance: {asMoney(detail.batch.expected_advance_cents)} · Fee:{" "}
            {asMoney(detail.batch.expected_fee_cents)} · Reserve:{" "}
            {/* WAVE-C-liability-batches-detail: same Net − Fee − Advance derivation as batches.create,
                header summary alongside the real per-movement Reserve Movements ledger below. */}
            <span data-testid="factoring-batch-detail-expected-reserve">
              {asMoney(detail.batch.total_face_cents - detail.batch.expected_advance_cents - detail.batch.expected_fee_cents)}
            </span>
          </div>
          <div className="text-xs text-gray-600">Included invoices: {detail.invoices.length}</div>
        </div>
      </BoardSection>

      <BoardSection title="Invoices in this batch" testId="factoring-batch-detail-invoices">
        <ParityTable
          title="Invoices in this batch"
          columns={INVOICE_COLUMNS}
          rows={detail.invoices}
          rowKey={(row) => row.id}
          storageKey="factoring-batch-invoices"
          tableTestId="factoring-batch-invoices-table"
          emptyText="No invoices on this batch."
        />
      </BoardSection>

      <BoardSection title="Reserve movements — this batch" testId="factoring-batch-detail-reserve-movements">
        {reserveMovementsQuery.isError ? (
          <ListErrorState
            title="Couldn't load reserve movements"
            status={0}
            message={(reserveMovementsQuery.error as Error)?.message}
            onRetry={() => void reserveMovementsQuery.refetch()}
          />
        ) : (
          <ParityTable
            title="Reserve movements — this batch"
            columns={RESERVE_COLUMNS}
            rows={reserveRows}
            rowKey={(row) => row.id}
            loading={reserveMovementsQuery.isLoading}
            emptyText="No reserve movements for this batch."
            storageKey="factoring-batch-reserve-movements"
            tableTestId="factoring-batch-reserve-movements-table"
          />
        )}
      </BoardSection>
    </div>
  );
}
