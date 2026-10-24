import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MultiSelectDropdown } from "./forms/MultiSelectDropdown";
import { entityPickerListLimit, getEntityPickerConfig, type EntityPickerKind, type EntityPickerOption } from "./parity/entityPickerRegistry";

export type EntityMultiSelectProps = {
  kind: EntityPickerKind;
  operatingCompanyId: string;
  /** Comma-separated canonical ids preserve existing staged state and one-id deep links. */
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  ariaLabel?: string;
  dataTestId?: string;
  className?: string;
  disabled?: boolean;
  driverRoster?: "active_only" | "active_or_probation";
};

export const entityFilterIds = (value: string | null | undefined): string[] => [...new Set((value ?? "").split(",").map(id => id.trim()).filter(Boolean))];

/** Read-only filter; uses the same scoped roster as EntityPicker and the one multi-select UI. */
export function EntityMultiSelect({ kind, operatingCompanyId, value, onChange, placeholder, ariaLabel, dataTestId, className, disabled, driverRoster = "active_only" }: EntityMultiSelectProps) {
  const config = getEntityPickerConfig(kind);
  const [search, setSearch] = useState("");
  const [held, setHeld] = useState<EntityPickerOption[]>([]);
  const [selectionError, setSelectionError] = useState<string>();
  const scope = `${operatingCompanyId}:${kind}`;
  const priorScope = useRef(scope);
  const sameScope = priorScope.current === scope;
  useEffect(() => {
    if (priorScope.current === scope) return;
    priorScope.current = scope;
    setHeld([]);
    setSearch("");
    setSelectionError(undefined);
    onChange(null);
  }, [scope, onChange]);
  const roster = useQuery({
    queryKey: ["entity-multi-select", operatingCompanyId, kind, search, driverRoster],
    queryFn: () => config.list(operatingCompanyId, { search: search || undefined, ...(kind === "driver" ? { driverRoster } : {}), ...(kind === "trailer" ? { equipmentKind: "trailer" as const } : {}) }),
    enabled: Boolean(operatingCompanyId) && !disabled,
  });
  const selected = sameScope ? entityFilterIds(value) : [];
  const options = useMemo(() => {
    const map = new Map((sameScope ? held : []).map(option => [option.value, option]));
    for (const option of roster.data ?? []) map.set(option.value, option);
    for (const id of selected) if (!map.has(id)) map.set(id, { value: id, label: `${config.label} — not in current results` });
    return [...map.values()].filter(option => selected.includes(option.value) || (roster.data ?? []).some(row => row.value === option.value));
  }, [held, sameScope, roster.data, value, config.label]);
  const limit = entityPickerListLimit(kind, { search, driverRoster });
  const notice = roster.isError ? `Couldn't load ${config.label} options. Retry by searching again.` : (roster.data?.length ?? 0) >= limit ? `Showing the first ${limit} results. Search to find another ${config.label}; Select shown selects only displayed options.` : undefined;
  return <div className={className}>
    <MultiSelectDropdown label={ariaLabel ?? config.label} allLabel={placeholder ?? `All ${config.label.toLowerCase()}s`} options={options} selected={selected}
      onChange={ids => {
        if (ids.length > 100) {
          setSelectionError("Select up to 100 records. Your previous selection has not changed.");
          return;
        }
        setSelectionError(undefined);
        setHeld(options.filter(option => ids.includes(option.value)));
        onChange(ids.length ? ids.join(",") : null);
      }} searchable selectedChips onSearch={setSearch} serverSearch={config.serverSearch} disabled={disabled || !operatingCompanyId} loading={roster.isFetching} listNotice={notice} data-testid={dataTestId} />
    {selectionError ? <p role="alert">{selectionError}</p> : null}
  </div>;
}
