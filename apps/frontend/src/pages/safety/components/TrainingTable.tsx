import { useMemo, useState } from "react";
import { DataTable } from "../../../components/DataTable";
import { EntityLink } from "../../../components/shared/EntityLink";
import { entityLabel } from "../../../lib/entity-label";
import { formatDateUS } from "../../../lib/formatDate";
import { DatePicker } from "../../../components/forms/DatePicker";
import { SelectCombobox } from "../../../components/Combobox";
import {
  applyUniversalDatePreset,
  QBO_DATE_PRESETS,
} from "../../../components/table/UniversalListToolbar";

// AUTO-15 — migrated onto the shared DataTable (sort/resize/paging/search/gear). Same 4 columns,
// same cell rendering — additive only. Non-financial safety sub-list.
type Row = Record<string, unknown>;
type Props = {
  rows: Row[];
  hidePager?: boolean;
};

function rowDay(row: Row): string {
  const raw = row.completed_at ?? row.due_at;
  return String(raw ?? "").slice(0, 10);
}

export function TrainingTable({ rows, hidePager = false }: Props) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [preset, setPreset] = useState("custom");

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      const day = rowDay(row);
      if (!day) return !(from || to);
      if (from && day < from) return false;
      if (to && day > to) return false;
      return true;
    });
  }, [rows, from, to]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <SelectCombobox
          className="h-[34px] rounded-sm border border-[#E5E7EB] px-2 text-xs"
          value={preset}
          onChange={(e) => {
            const next = e.target.value;
            setPreset(next);
            const bounds = applyUniversalDatePreset(next);
            if (bounds) {
              setFrom(bounds.from);
              setTo(bounds.to);
            }
          }}
          aria-label="Training date preset"
        >
          {QBO_DATE_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </SelectCombobox>
        <DatePicker
          id="training-date-from"
          value={from}
          onChange={(v) => {
            setPreset("custom");
            setFrom(v);
          }}
          className="h-[34px]"
          aria-label="Training date from"
        />
        <span className="text-xs text-[#6B7280]">to</span>
        <DatePicker
          id="training-date-to"
          value={to}
          onChange={(v) => {
            setPreset("custom");
            setTo(v);
          }}
          className="h-[34px]"
          aria-label="Training date to"
        />
      </div>
      <DataTable<Row>
        rows={filtered}
        rowKey={(row) => String(row.id)}
        tableKey="safety-training"
        hidePager={hidePager}
        columns={[
          {
            key: "completed_at",
            label: "Date",
            sortable: true,
            className: "min-w-[132px] w-[132px]",
            render: (row) => formatDateUS(row.completed_at ?? row.due_at),
          },
          {
            key: "driver_id",
            label: "Driver",
            sortable: true,
            render: (row) => (
              <EntityLink
                kind="driver"
                id={row.driver_id ? String(row.driver_id) : undefined}
                label={entityLabel(row.driver_name, row.driver_id ? String(row.driver_id) : undefined, "Driver")}
              />
            ),
          },
          {
            key: "training_type",
            label: "Training",
            sortable: true,
            render: (row) => String(row.training_type ?? row.name ?? "Training"),
          },
          { key: "status", label: "Status", sortable: true, render: (row) => String(row.status ?? "complete") },
        ]}
      />
    </div>
  );
}
