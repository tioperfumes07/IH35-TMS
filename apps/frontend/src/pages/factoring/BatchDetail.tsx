import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getFactoringBatchDetail, getReserveMovements, type FactoringReserveMovement } from "../../api/factoring";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function asMoney(cents: number) {
  return money.format((Number(cents) || 0) / 100);
}

function withRunningBalance(movements: FactoringReserveMovement[]) {
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
  if (!detail) {
    return <div className="text-sm text-gray-500">Batch detail unavailable.</div>;
  }

  return (
    <div className="space-y-3">
      <div className="rounded border border-gray-200 p-3 text-sm">
        <div className="font-semibold text-gray-900">{detail.batch.batch_number}</div>
        <div className="text-gray-700">
          Status: {detail.batch.status} · Face: {asMoney(detail.batch.total_face_cents)} · Advance: {asMoney(detail.batch.expected_advance_cents)} · Fee:{" "}
          {asMoney(detail.batch.expected_fee_cents)}
        </div>
        <div className="mt-2 text-xs text-gray-600">Included invoices: {detail.invoices.length}</div>
      </div>

      <div className="rounded border border-gray-200 p-3">
        <div className="mb-2 text-sm font-medium text-gray-900">Reserve Movements</div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-xs">
            <thead className="bg-gray-50 text-left uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-2 py-2">Created At</th>
                <th className="px-2 py-2">Reason</th>
                <th className="px-2 py-2">Direction</th>
                <th className="px-2 py-2 text-right">Amount</th>
                <th className="px-2 py-2 text-right">Running Reserve Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {reserveRows.map((movement) => (
                <tr key={movement.id}>
                  <td className="px-2 py-2">{new Date(movement.created_at).toLocaleString()}</td>
                  <td className="px-2 py-2">{movement.reason}</td>
                  <td className="px-2 py-2 capitalize">{movement.direction}</td>
                  <td className={`px-2 py-2 text-right ${movement.signed_amount_cents >= 0 ? "text-green-700" : "text-red-700"}`}>
                    {movement.signed_amount_cents >= 0 ? "+" : "-"}
                    {asMoney(Math.abs(movement.signed_amount_cents))}
                  </td>
                  <td className="px-2 py-2 text-right font-medium">{asMoney(movement.running_balance_cents)}</td>
                </tr>
              ))}
              {reserveMovementsQuery.isLoading ? (
                <tr>
                  <td className="px-2 py-3 text-gray-500" colSpan={5}>
                    Loading reserve movements...
                  </td>
                </tr>
              ) : null}
              {!reserveMovementsQuery.isLoading && reserveRows.length === 0 ? (
                <tr>
                  <td className="px-2 py-3 text-gray-500" colSpan={5}>
                    No reserve movements for this batch.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
