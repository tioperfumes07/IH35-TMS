// U16 (owner UI register 2026-10-03) — "a stored copy of the work order opens from the document". Lists the copies the
// database captured when this bill / expense was linked to a work order; each opens the work order as it was then,
// printed with the same letter as the live work order.
import { useQuery } from "@tanstack/react-query";
import { listDocumentWorkOrderCopies } from "../../api/accounting";
import { formatDateTimeUS } from "../../lib/formatDate";
import { openPrintableDocument } from "../../lib/openPrintableDocument";
import { DataPanelRow } from "../layout/DataPanelRow";

export function WorkOrderCopyLinks({
  kind,
  documentId,
  operatingCompanyId,
}: {
  kind: "bill" | "expense";
  documentId: string;
  operatingCompanyId: string;
}) {
  const copiesQuery = useQuery({
    queryKey: ["work-order-copies", operatingCompanyId, kind, documentId],
    queryFn: () => listDocumentWorkOrderCopies(operatingCompanyId, kind, documentId),
    enabled: Boolean(operatingCompanyId && documentId),
  });
  const rows = copiesQuery.data?.rows ?? [];
  if (copiesQuery.isError) {
    return (
      <DataPanelRow>
        <span className="text-xs font-semibold text-gray-600">Work order copy</span>
        <span className="text-xs text-red-600" data-testid="wo-copy-error">
          Stored work order copy could not be loaded.{" "}
          <button type="button" className="underline" onClick={() => void copiesQuery.refetch()}>
            Retry
          </button>
        </span>
      </DataPanelRow>
    );
  }
  if (rows.length === 0) return null;
  return (
    <DataPanelRow>
      <span className="text-xs font-semibold text-gray-600">Work order copy</span>
      <span className="flex flex-wrap gap-2" data-testid="wo-copy-links">
        {rows.map((c) => (
          <button
            key={c.id}
            type="button"
            className="text-xs text-slate-700 underline"
            title={`The work order as it was when this ${kind} was linked`}
            onClick={() =>
              openPrintableDocument(
                `/api/v1/accounting/work-order-copies/${c.id}.html?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
              )
            }
          >
            {c.work_order_display_id ?? "Work order"} — stored {formatDateTimeUS(c.captured_at)}
          </button>
        ))}
      </span>
    </DataPanelRow>
  );
}
