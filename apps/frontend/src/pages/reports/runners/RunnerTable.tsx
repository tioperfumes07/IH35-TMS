import { useMemo, useState } from "react";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import type { RunnerColumn } from "./runner-config";
import { EntityLink } from "../../../components/shared/EntityLink";
import { entityLabel } from "../../../lib/entity-label";
import { mmmDd } from "../../../lib/formatDate";

type Props = {
  columns: RunnerColumn[];
  rows: Record<string, unknown>[];
  onSort?: (key: string) => void;
  tableId?: string;
};

const currencyFormatter = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const numberFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

function formatCell(value: unknown, format: RunnerColumn["format"]) {
  if (value == null) return "";
  if (format === "currency") return currencyFormatter.format(Number(value) / 100);
  if (format === "percent") return `${numberFormatter.format(Number(value))}%`;
  if (format === "number") return numberFormatter.format(Number(value));
  if (format === "date") {
    return mmmDd(value) || String(value);
  }
  return String(value);
}

function sortValue(value: unknown, format: RunnerColumn["format"]): string | number | null {
  if (value == null || value === "") return null;
  if (format === "currency" || format === "percent" || format === "number") {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : String(value);
  }
  if (format === "date") {
    const timestamp = new Date(String(value)).getTime();
    return Number.isNaN(timestamp) ? String(value) : timestamp;
  }
  return String(value);
}

type ParityRunnerRow = {
  record: Record<string, unknown>;
  rowKey: string;
};

export function RunnerTable({ columns, rows, onSort, tableId = "reports-runner" }: Props) {
  const [sortKey, setSortKey] = useState("");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const parityRows = useMemo<ParityRunnerRow[]>(
    () =>
      rows.map((record, index) => ({
        record,
        rowKey: String(record.id ?? index),
      })),
    [rows],
  );

  const parityColumns = useMemo<ParityColumn<ParityRunnerRow>[]>(
    () =>
      columns.map((column) => {
        const alignment =
          column.align === "right"
            ? "text-right"
            : column.align === "center"
              ? "text-center"
              : "text-left";
        return {
          key: column.key,
          label: column.label,
          sortable: Boolean(column.sortable),
          className: alignment,
          cellClass: alignment,
          sortValue: (row) => sortValue(row.record[column.key], column.format),
          render: (row) => column.entityKind && column.entityIdKey
            ? <EntityLink kind={column.entityKind} id={row.record[column.entityIdKey] as string | null | undefined} label={entityLabel(row.record[column.key], row.record[column.entityIdKey], column.label)} />
            : formatCell(row.record[column.key], column.format),
        };
      }),
    [columns],
  );

  return (
    <ParityTable
      columns={parityColumns}
      rows={parityRows}
      rowKey={(row) => row.rowKey}
      storageKey={tableId}
      initialPageSize={50}
      pageSizeOptions={[50, 100, 300]}
      emptyText="No results for these filters"
      sortKey={sortKey}
      sortDirection={sortDirection}
      onSortChange={(key, direction) => {
        setSortKey(key);
        setSortDirection(direction);
        onSort?.(key);
      }}
    />
  );
}
