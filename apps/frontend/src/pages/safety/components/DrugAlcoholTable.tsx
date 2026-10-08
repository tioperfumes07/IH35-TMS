import { useMemo, useState } from "react";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { EntityLink } from "../../../components/shared/EntityLink";
import { entityLabel } from "../../../lib/entity-label";
import { DatePicker } from "../../../components/forms/DatePicker";
import {
import { SelectCombobox } from "../../../components/Combobox";
  applyUniversalDatePreset,
  QBO_DATE_PRESETS,
} from "../../../components/table/UniversalListToolbar";

// AUTO-15 — migrated onto the shared DataTable (sort/resize/paging/search/gear). Same 4 columns,
// same cell rendering — additive only. Non-financial safety sub-list.
type Row = Record<string, unknown>;
type Props = {
  rows: Row[];
  pageSize?: number;
  hidePager?: boolean;
};

function rowDay(row: Row): string {
  return String(row.test_date ?? "").slice(0, 10);
}

export function DrugAlcoholTable({ rows, pageSize = 50, hidePager = false }: Props) {
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

  const columns: Array<ParityColumn<Row>> = [
    {
      key: "test_date",
      label: "Test Date",
      sortable: true,
      minWidth: 132,
      render: (row) => String(row.test_date ?? "").slice(0, 10),
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
    { key: "test_type", label: "Type", sortable: true, render: (row) => String(row.test_type ?? "—") },
    { key: "result", label: "Result", sortable: true, render: (row) => String(row.result ?? "—") },
  ];
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
          aria-label="Test date preset"
        >
          {QBO_DATE_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </SelectCombobox>
        <DatePicker
          id="drug-alcohol-test-date-from"
          value={from}
          onChange={(v) => {
            setPreset("custom");
            setFrom(v);
          }}
          className="h-[34px]"
          aria-label="Test date from"
        />
        <span className="text-xs text-[#6B7280]">to</span>
        <DatePicker
          id="drug-alcohol-test-date-to"
          value={to}
          onChange={(v) => {
            setPreset("custom");
            setTo(v);
          }}
          className="h-[34px]"
          aria-label="Test date to"
        />
      </div>
      <ParityTable<Row>
        rows={filtered}
        rowKey={(row) => String(row.id)}
        storageKey="safety-drug-alcohol"
        columns={columns}
        pageSize={pageSize}
        pageSizeOptions={[pageSize]}
        hidePager={hidePager}
      />
    </div>
  );
}
