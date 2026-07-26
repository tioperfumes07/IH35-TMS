/**
 * C1 — shared entity picker primitive.
 *
 * Composes the existing Combobox with allowAddNew "+ Create …" and opens create in a drawer
 * shell (C7 / CHROME-11). Roster is always operatingCompanyId-scoped via the kind registry.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { Combobox, type ComboboxOption } from "../Combobox";
import { ParityDrawer } from "./ParityDrawer";
import {
  getEntityPickerConfig,
  type EntityPickerKind,
} from "./entityPickerRegistry";

export type EntityPickerProps = {
  kind: EntityPickerKind;
  operatingCompanyId: string;
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
  allowCreate?: boolean;
  className?: string;
  dataField?: string;
};

type ListRow = { id: string; label?: string; name?: string; display_id?: string; code?: string };

function rowLabel(row: ListRow): string {
  return (
    row.label ||
    row.name ||
    row.display_id ||
    row.code ||
    row.id
  );
}


function EntityQuickCreate({
  shell,
  label,
  operatingCompanyId,
}: {
  shell: "drawer";
  label: string;
  operatingCompanyId: string;
}) {
  void shell;
  return (
    <p className="p-4 text-sm text-muted-foreground">
      Inline create for {label} (company {operatingCompanyId}). Prefer the module create flow when
      more than a quick name is required.
    </p>
  );
}

export function EntityPicker({
  kind,
  operatingCompanyId,
  value,
  onChange,
  placeholder,
  disabled = false,
  allowClear = true,
  allowCreate = true,
  className,
  dataField,
}: EntityPickerProps) {
  const config = getEntityPickerConfig(kind);
  const [createOpen, setCreateOpen] = useState(false);

  const listQuery = useQuery({
    queryKey: ["entity-picker", kind, operatingCompanyId],
    queryFn: async () => {
      const data = await apiRequest<unknown>(
        `${config.listPath}?operating_company_id=${encodeURIComponent(operatingCompanyId)}&limit=200`
      );
      // Normalize common list envelopes.
      const rows: ListRow[] = Array.isArray(data)
        ? (data as ListRow[])
        : Array.isArray((data as { items?: ListRow[] })?.items)
          ? ((data as { items: ListRow[] }).items)
          : Array.isArray((data as { drivers?: ListRow[] })?.drivers)
            ? ((data as { drivers: ListRow[] }).drivers)
            : Array.isArray((data as { units?: ListRow[] })?.units)
              ? ((data as { units: ListRow[] }).units)
              : Array.isArray((data as { loads?: ListRow[] })?.loads)
                ? ((data as { loads: ListRow[] }).loads)
                : Array.isArray((data as { vendors?: ListRow[] })?.vendors)
                  ? ((data as { vendors: ListRow[] }).vendors)
                  : Array.isArray((data as { customers?: ListRow[] })?.customers)
                    ? ((data as { customers: ListRow[] }).customers)
                    : [];
      return rows;
    },
    enabled: Boolean(operatingCompanyId),
  });

  const options: ComboboxOption[] = useMemo(
    () => (listQuery.data ?? []).map((row) => ({ value: row.id, label: rowLabel(row) })),
    [listQuery.data]
  );

  return (
    <>
      <Combobox
        dataField={dataField}
        className={className}
        options={options}
        value={value}
        onChange={onChange}
        placeholder={placeholder ?? `Select ${config.label}`}
        loading={listQuery.isLoading}
        disabled={disabled || !operatingCompanyId}
        allowClear={allowClear}
        allowAddNew={
          allowCreate
            ? {
                label: `+ Create ${config.label}`,
                onAdd: () => setCreateOpen(true),
              }
            : undefined
        }
      />
      <ParityDrawer open={createOpen} onClose={() => setCreateOpen(false)} title={`+ Create ${config.label}`}>
        {/* C1→C7: create surface must declare shell="drawer". */}
        <EntityQuickCreate shell="drawer" label={config.label} operatingCompanyId={operatingCompanyId} />
      </ParityDrawer>
    </>
  );
}
