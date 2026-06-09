/**
 * ReferenceSelect (A2) — the software-wide inline "+ Add new" keystone.
 *
 * Composes the existing office-standard Combobox (which supports `allowAddNew`
 * + `sublabel` = the "Type" in "Name + Type") with QuickCreateEntityModal (the
 * inline create form). Behavior mirrors QBO: "+ Add new" opens a NESTED create
 * panel on top of the current one; on Save the record is created and RETURNED
 * with the new value selected — no navigation away, no losing entered data.
 *
 * Every reference dropdown across the TMS should use this instead of wiring
 * Combobox + QuickCreate ad-hoc. Account/category selects keep their existing
 * lock-account control alongside via the `lockControl` slot. UI/read only —
 * the create call is the entity's existing non-financial create endpoint.
 */
import { useState, type ReactNode } from "react";
import { Combobox, type ComboboxOption } from "../Combobox";
import {
  QuickCreateEntityModal,
  type QuickCreateKind,
} from "../forms/shared/QuickCreateEntityModal";

export type ReferenceOption = {
  value: string;
  label: string;
  /** Shown after the name, QBO-style "Name + Type" (e.g. "BOA-CHECKING-1135 Bank"). */
  type?: string;
};

export type ReferenceSelectProps = {
  value: string | null;
  onChange: (value: string | null) => void;
  options: ReferenceOption[];
  /** Entity kind for the inline "+ Add new" create modal. */
  createKind: QuickCreateKind;
  operatingCompanyId: string;
  placeholder?: string;
  disabled?: boolean;
  /** Override the "+ Add new ___" label. */
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

  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <Combobox
          options={comboOptions}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          allowAddNew={{ label: addLabel, onAdd: () => setCreateOpen(true) }}
        />
      </div>
      {/* Always-visible "+ Add new" — the keystone is reachable without typing. */}
      <button
        type="button"
        disabled={disabled}
        aria-label={addLabel}
        onClick={() => setCreateOpen(true)}
        className="min-h-11 shrink-0 rounded border border-gray-300 px-2 text-[12px] font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-40 sm:min-h-0 sm:py-1"
      >
        {addLabel}
      </button>
      {lockControl}
      <QuickCreateEntityModal
        open={createOpen}
        operatingCompanyId={operatingCompanyId}
        kind={createKind}
        onClose={() => setCreateOpen(false)}
        onCreated={(rec) => {
          const opt: ReferenceOption = { value: rec.id, label: rec.label };
          setCreated((prev) => [...prev, opt]);
          onOptionCreated?.(opt);
          onChange(rec.id); // return to parent with the new value selected
          setCreateOpen(false);
        }}
      />
    </div>
  );
}
