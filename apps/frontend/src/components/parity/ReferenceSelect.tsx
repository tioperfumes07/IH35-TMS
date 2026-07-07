/**
 * ReferenceSelect (A2) — the software-wide inline "+ Add new" keystone.
 *
 * Composes the Combobox (QB-STD-1/2: "+ Add new" is the permanent FIRST row of the open
 * dropdown, visible before any keystroke — no external button, no typed-query gate) with an
 * inline create panel. On Save the record is created and returned already selected — no
 * navigation away, no losing entered data (QB-STD-3/4). Created records write to the SAME
 * canonical table the list reads from, so they survive reload (QB-STD-5).
 *
 * Every reference dropdown across the TMS should use this instead of wiring Combobox +
 * create-modal ad-hoc. Account/category selects keep their existing lock-account control
 * alongside via the `lockControl` slot.
 *
 * Two inline-create backends, by kind:
 *   - vendor / customer / item / category / part → QuickCreateEntityModal (canonical tables)
 *   - service → InlineCreateDrawer's richer BK7 two-sided (sell+buy) form (NewServiceDrawerForm)
 */
import { useState, type ReactNode } from "react";
import { Combobox, type ComboboxOption } from "../Combobox";
import {
  QuickCreateEntityModal,
  type QuickCreateKind,
} from "../forms/shared/QuickCreateEntityModal";
import { InlineCreateDrawer } from "./InlineCreateDrawer";

export type ReferenceOption = {
  value: string;
  label: string;
  /** Shown after the name, QBO-style "Name + Type" (e.g. "BOA-CHECKING-1135 Bank"). */
  type?: string;
};

export type ReferenceCreateKind = QuickCreateKind | "service";

export type ReferenceSelectProps = {
  value: string | null;
  onChange: (value: string | null) => void;
  options: ReferenceOption[];
  /** Entity kind for the inline "+ Add new" create panel. */
  createKind: ReferenceCreateKind;
  operatingCompanyId: string;
  placeholder?: string;
  disabled?: boolean;
  /** Override the "+ Add new ___" label shown as the first dropdown row. */
  addNewLabel?: string;
  /** Notified when a record is created inline (so a parent can refetch). */
  onOptionCreated?: (opt: ReferenceOption) => void;
  /** Slot to keep an existing control (e.g. account lock toggle) beside the select. */
  lockControl?: ReactNode;
};

export function ReferenceSelect({
  value,
  onChange,
  options,
  createKind,
  operatingCompanyId,
  placeholder,
  disabled,
  addNewLabel,
  onOptionCreated,
  lockControl,
}: ReferenceSelectProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [created, setCreated] = useState<ReferenceOption[]>([]);

  const comboOptions: ComboboxOption[] = [...options, ...created].map((o) => ({
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

  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        {/* QB-STD-1/2: the "+" row lives inside the Combobox dropdown as its permanent first row.
        No external button — the Combobox allowAddNew now always-shows the row on open. */}
        <Combobox
          options={comboOptions}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          allowAddNew={{ label: addLabel, onAdd: () => setCreateOpen(true) }}
        />
      </div>
      {lockControl}
      {createKind === "service" ? (
        <InlineCreateDrawer
          open={createOpen}
          kind="service"
          operatingCompanyId={operatingCompanyId}
          onClose={() => setCreateOpen(false)}
          onCreated={handleCreated}
        />
      ) : (
        <QuickCreateEntityModal
          open={createOpen}
          operatingCompanyId={operatingCompanyId}
          kind={createKind}
          onClose={() => setCreateOpen(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
