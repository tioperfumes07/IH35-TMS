import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { ListErrorState } from "../ListErrorState";
import { ParityTable, type ParityColumn } from "../parity/ParityTable";
import type { EntityKind } from "../shared/EntityLink";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";

export type OperationsColumn = {
  key: string;
  label: string;
  /**
   * When set, renders this cell as an <EntityLink> drill-through of this kind (LAW OF THE LAND
   * total-connectivity) instead of plain text. The id value is read from `idKey` when given,
   * otherwise from `key` itself — letting a column display one field (e.g. a unit number) while
   * linking through a different raw id field on the same row (e.g. unit_id).
   */
  entityKind?: EntityKind;
  idKey?: string;
};

type OperationsRow = Record<string, unknown>;

type PagedResponse = {
  sub_view: string;
  rows: OperationsRow[];
  page: number;
  page_size: number;
  total: number;
  has_more: boolean;
};

type Props = {
  driverId: string;
  operatingCompanyId: string;
  subView: string;
  title: string;
  description?: string;
  columns: OperationsColumn[];
};

function formatCell(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function linkNoun(kind: EntityKind): string {
  switch (kind) {
    case "driver":
      return "Driver";
    case "unit":
      return "Unit";
    case "load":
      return "Load";
    case "work_order":
      return "Work order";
    case "customer":
      return "Customer";
    case "vendor":
      return "Vendor";
    case "invoice":
      return "Invoice";
    case "bill":
      return "Bill";
    case "settlement":
      return "Settlement";
    case "trailer":
      return "Trailer";
    default:
      return "Record";
  }
}

function renderCell(row: OperationsRow, column: OperationsColumn) {
  if (column.entityKind) {
    const idValue = row[column.idKey ?? column.key];
    const id = idValue == null ? null : String(idValue);
    const labelValue = row[column.key];
    const name = labelValue === null || labelValue === undefined || labelValue === "" ? null : formatCell(labelValue);
    return (
      <EntityLinkOrTombstone
        kind={column.entityKind}
        id={id}
        name={name}
        noun={linkNoun(column.entityKind)}
      />
    );
  }
  return formatCell(row[column.key]);
}

/**
 * Generic read-only paged history table shared by all 12 driver operations-depth
 * sub-views. Fetches from /api/drivers/:uuid/operations/<sub-view>.
 */
export function OperationsHistoryTable({ driverId, operatingCompanyId, subView, title, description, columns }: Props) {
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ["driver-operations", subView, driverId, operatingCompanyId, page],
    queryFn: () =>
      apiRequest<PagedResponse>(
        `/api/drivers/${driverId}/operations/${subView}?operating_company_id=${operatingCompanyId}&page=${page}&page_size=25`
      ),
    enabled: Boolean(driverId) && Boolean(operatingCompanyId),
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;
  const hasMore = query.data?.has_more ?? false;

  // Stable keys for ParityTable (rowKey is (row) => string — no index arg).
  const keyedRows = useMemo(
    () =>
      rows.map((row, index) => ({
        ...row,
        __rowKey: String(row.uuid ?? `${subView}-${page}-${index}`),
      })),
    [rows, subView, page]
  );

  const parityColumns = useMemo<Array<ParityColumn<OperationsRow>>>(
    () =>
      columns.map((column) => ({
        key: column.key,
        label: column.label,
        sortable: true,
        sortValue: (row) => {
          const value = row[column.key];
          if (value === null || value === undefined || value === "") return null;
          if (typeof value === "number") return value;
          if (typeof value === "boolean") return value ? 1 : 0;
          return String(value);
        },
        render: (row) => renderCell(row, column),
      })),
    [columns]
  );

  return (
    <div className="space-y-2" data-testid={`driver-operations-${subView}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          {description ? <p className="text-xs text-gray-600">{description}</p> : null}
        </div>
        <span className="rounded-sm bg-gray-100 px-2 py-1 text-xs text-gray-600">{total} record(s)</span>
      </div>

      {query.isError ? (
        <ListErrorState
          title="Couldn't load operations history"
          status={0}
          message={(query.error as Error)?.message}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <div className="overflow-x-auto rounded-sm border border-gray-200 bg-white p-2">
          <ParityTable
            rows={keyedRows}
            columns={parityColumns}
            rowKey={(row) => String(row.__rowKey)}
            loading={query.isLoading}
            storageKey={`driver-operations-${subView}`}
            emptyText="No records found for this driver."
            initialPageSize={25}
            pageSizeOptions={[25]}
            tableTestId={`driver-operations-${subView}-table`}
            rowTestId={(row) => `driver-operations-${subView}-row-${String(row.__rowKey)}`}
          />
        </div>
      )}

      <div className="flex items-center justify-end gap-2 text-xs">
        <button
          type="button"
          className="rounded-sm border border-gray-300 px-2 py-1 disabled:opacity-50"
          onClick={() => setPage((current) => Math.max(1, current - 1))}
          disabled={page <= 1 || query.isLoading}
        >
          Previous
        </button>
        <span className="text-gray-600">Page {page}</span>
        <button
          type="button"
          className="rounded-sm border border-gray-300 px-2 py-1 disabled:opacity-50"
          onClick={() => setPage((current) => current + 1)}
          disabled={!hasMore || query.isLoading}
        >
          Next
        </button>
      </div>
    </div>
  );
}
