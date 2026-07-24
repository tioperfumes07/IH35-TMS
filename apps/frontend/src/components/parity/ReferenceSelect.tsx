/**
 * ReferenceSelect (A2) — the software-wide inline "+ Add new" keystone.
 *
 * Composes the Combobox (QB-STD-1/2: "+ Add new" is the permanent FIRST row of the open
 * dropdown, visible before any keystroke — no external button, no typed-query gate) with an
 * inline create panel. On Save the record is created and returned already selected — no
 * navigation away, no losing entered data (QB-STD-3/4). Created records write to the SAME
 * canonical table the list reads from, so they survive reload (QB-STD-5).
 *
 * CHROME-11: nested create uses ParityDrawer / InlineCreateDrawer — never a centered Modal
 * stacked on top of an already-open money drawer.
 *
 * Two inline-create backends, by kind:
 *   - vendor / customer / account / service → InlineCreateDrawer (rich BK7 forms; account gated)
 *   - item / category / part / class → QuickCreateEntityModal (ParityDrawer shell)
 */
import { useMemo, useState, type ReactNode } from "react";
import { Combobox, type ComboboxOption } from "../Combobox";
import {
  QuickCreateEntityModal,
  type QuickCreateKind,
} from "../forms/shared/QuickCreateEntityModal";
import { InlineCreateDrawer, type InlineCreateKind } from "./InlineCreateDrawer";

export type ReferenceOption = {
  value: string;
  label: string;
  /** Shown after the name, QBO-style "Name + Type" (e.g. "Checking · Bank"). Never an account number. */
  type?: string;
};

export type ReferenceCreateKind = QuickCreateKind | "service" | "account";

export type ReferenceSelectProps = {
  value: string | null;
  onChange: (value: string | null) => void;
  options: ReferenceOption[];
  /** Entity kind for the inline "+ Add new" create panel. */
  createKind: ReferenceCreateKind;
  operatingCompanyId: string;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  /** Override the "+ Add new ___" label shown as the first dropdown row. */
  addNewLabel?: string;
  /** Notified when a record is created inline (so a parent can refetch). */
  onOptionCreated?: (opt: ReferenceOption) => void;
  /** Slot to keep an existing control (e.g. account lock toggle) beside the select. */
  lockControl?: ReactNode;
};

const INLINE_KINDS = new Set<ReferenceCreateKind>(["vendor", "customer", "account", "service"]);

export function ReferenceSelect({
  value,
  onChange,
  options,
  createKind,
  operatingCompanyId,
  placeholder,
  disabled,
  loading,
  addNewLabel,
  onOptionCreated,
  lockControl,
}: ReferenceSelectProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [created, setCreated] = useState<ReferenceOption[]>([]);
  // Account pickers: QBO-style Account Type filter (not a flat name-only list).
  const [typeFilter, setTypeFilter] = useState<string>("");

  const typeChoices = useMemo(() => {
    if (createKind !== "account") return [] as string[];
    const set = new Set<string>();
    for (const o of [...options, ...created]) {
      if (o.type) set.add(o.type);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [createKind, options, created]);

  const visibleOptions = useMemo(() => {
    const all = [...options, ...created];
    if (createKind !== "account" || !typeFilter) return all;
    return all.filter((o) => o.type === typeFilter);
  }, [options, created, createKind, typeFilter]);

  const comboOptions: ComboboxOption[] = visibleOptions.map((o) => ({
    value: o.value,
    label: o.label,
    sublabel: o.type,
  }));

  const addLabel = addNewLabel ?? `+ Add new ${createKind}`;

  function handleCreated(rec: { id: string; label: string }) {
    const opt: ReferenceOption = { value: rec.id, label: rec.label };
    setCreated((prev) => [...prev, opt]);
    onOptionCreated?.(opt);
    onChange(rec.id); // return to parent with the new value selected
    setCreateOpen(false);
  }

  const useInline = INLINE_KINDS.has(createKind);

  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1 space-y-1">
        {createKind === "account" && typeChoices.length > 0 ? (
          <label className="flex items-center gap-2 text-[11px] text-gray-600">
            <span className="shrink-0 font-medium">Type</span>
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              disabled={disabled}
              data-testid="reference-select-account-type-filter"
              className="h-7 min-w-0 flex-1 rounded-sm border border-gray-300 bg-white px-1.5 text-[12px] text-gray-800 focus:border-slate-300 focus:outline-hidden focus:ring-1 focus:ring-slate-400 disabled:bg-gray-100"
              aria-label="Filter accounts by type"
            >
              <option value="">All account types</option>
              {typeChoices.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {/* QB-STD-1/2: the "+" row lives inside the Combobox dropdown as its permanent first row.
        No external button — the Combobox allowAddNew now always-shows the row on open. */}
        <Combobox
          options={comboOptions}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          loading={loading}
          allowAddNew={{ label: addLabel, onAdd: () => setCreateOpen(true) }}
        />
      </div>
      {lockControl}
      {useInline ? (
        <InlineCreateDrawer
          open={createOpen}
          kind={createKind as InlineCreateKind}
          operatingCompanyId={operatingCompanyId}
          onClose={() => setCreateOpen(false)}
          onCreated={handleCreated}
        />
      ) : (
        <QuickCreateEntityModal
          open={createOpen}
          operatingCompanyId={operatingCompanyId}
          kind={createKind as QuickCreateKind}
          onClose={() => setCreateOpen(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
