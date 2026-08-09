import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getFactoringBatchDetail, getReserveMovements, type FactoringReserveMovement } from "../../api/factoring";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { titleize } from "../../lib/titleize";
import { formatDateUS } from "../../lib/formatDate";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function asMoney(cents: number) {
  return money.format((Number(cents) || 0) / 100);
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
      <span className={row.signed_amount_cents >= 0 ? "text-slate-700" : "text-red-700"}>
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
    return <div className="text-sm text-gray-500">Loading submitted batch detail...</div>;
  }
  if (detailQuery.isError) {
    return (
      <ListErrorState
        title="Couldn't load batch detail"
        status={0}
        message={(detailQuery.error as Error)?.message}
        onRetry={() => void detailQuery.refetch()}
      />
    );
  }
  if (!detail) {
    return <div className="text-sm text-gray-500">Batch detail unavailable.</div>;
  }

  return (
    <div className="space-y-3">
      <div className="rounded-sm border border-gray-200 p-3 text-sm">
        <div className="font-semibold text-gray-900">{detail.batch.batch_number}</div>
        <div className="text-gray-700">
          Status: {titleize(detail.batch.status)} · Face: {asMoney(detail.batch.total_face_cents)} · Advance: {asMoney(detail.batch.expected_advance_cents)} · Fee:{" "}
          {asMoney(detail.batch.expected_fee_cents)}
        </div>
        <div className="mt-2 text-xs text-gray-600">Included invoices: {detail.invoices.length}</div>
      </div>

      <div className="rounded-sm border border-gray-200 p-3">
        <div className="mb-2 text-sm font-medium text-gray-900">Reserve Movements</div>
        {reserveMovementsQuery.isError ? (
          <ListErrorState
            title="Couldn't load reserve movements"
            status={0}
            message={(reserveMovementsQuery.error as Error)?.message}
            onRetry={() => void reserveMovementsQuery.refetch()}
          />
        ) : (
          <ParityTable
            columns={RESERVE_COLUMNS}
            rows={reserveRows}
            rowKey={(row) => row.id}
            loading={reserveMovementsQuery.isLoading}
            emptyText="No reserve movements for this batch."
            storageKey="factoring-batch-reserve-movements"
            tableTestId="factoring-batch-reserve-movements-table"
          />
        )}
      </div>
    </div>
  );
}
