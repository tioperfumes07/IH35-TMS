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
 * LST-PICKER-01 — CONFIG-DRIVEN. Create kinds used to be a hardcoded union of six dispatched by a
 * hardcoded `INLINE_KINDS` Set, so ~68 of 75 catalogs could not have inline create without someone
 * authoring a new form component. The kind list and its backend now come from
 * ./catalogPickerRegistry — adding a catalog is a config entry, not a component.
 *
 * Three inline-create backends, chosen by `config.backend` (never by a Set in this file):
 *   - "inline-drawer"      vendor / customer / account / service → InlineCreateDrawer (account gated)
 *   - "quick-create-modal" item / category / part / class → QuickCreateEntityModal (ParityDrawer)
 *   - "catalog"            every config-driven catalog → CatalogQuickCreateDrawer (generic, no new
 *                          component per catalog; the config supplies fields + the create call)
 */
import { useState, type ReactNode } from "react";
import { Combobox, type ComboboxOption } from "../Combobox";
import { QuickCreateEntityModal, type QuickCreateKind } from "../forms/shared/QuickCreateEntityModal";
import { InlineCreateDrawer, type InlineCreateKind } from "./InlineCreateDrawer";
import { CatalogQuickCreateDrawer } from "./CatalogQuickCreateDrawer";
import {
  catalogAddNewLabel,
  getCatalogPickerConfig,
  type CatalogCreateResult,
  type CatalogPickerKey,
} from "./catalogPickerRegistry";

export type ReferenceOption = {
  value: string;
  label: string;
  /** Shown after the name, QBO-style "Name + Type" (e.g. "BOA-CHECKING-1135 Bank"). */
  type?: string;
};

/**
 * Every create kind the registry knows. Derived from the config — adding a catalog widens this type
 * automatically, so a new catalog needs no edit here. `QuickCreateKind` is kept in the union purely
 * so the original six keep type-checking identically at their ~42 existing call sites.
 */
export type ReferenceCreateKind = CatalogPickerKey | QuickCreateKind | "service" | "account";

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
  /** SAF-F31 — server-side type-ahead pass-through (see components/Combobox.tsx). */
  onSearch?: (query: string) => void;
  /**
   * Which field of the created record becomes the selected value. Defaults to "id".
   *
   * QB-STD-5 (selection survives reload): a picker whose options are keyed by the catalog `code`
   * (e.g. the accessorial editor) must select the new row by its CODE, otherwise the id selected at
   * create time matches no option after the list refetches and the selection silently empties.
   */
  createdValueField?: "id" | "code";
};

export function ReferenceSelect({
  value,
  onChange,
  options,
  createKind,
  operatingCompanyId,
  placeholder,
  onSearch,
  disabled,
  loading,
  addNewLabel,
  onOptionCreated,
  lockControl,
  createdValueField = "id",
}: ReferenceSelectProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [created, setCreated] = useState<ReferenceOption[]>([]);

  // The single dispatch decision, read from config instead of a hardcoded Set in this file.
  const config = getCatalogPickerConfig(createKind as CatalogPickerKey);

  const comboOptions: ComboboxOption[] = [...options, ...created].map((o) => ({
    value: o.value,
    label: o.label,
    sublabel: o.type,
  }));

  const addLabel = addNewLabel ?? catalogAddNewLabel(createKind as CatalogPickerKey);

  function handleCreated(rec: CatalogCreateResult) {
    // QB-STD-5: select by whichever field the caller's options are keyed on, so the selection still
    // resolves after the parent refetches the canonical list.
    const selected = createdValueField === "code" && rec.code ? rec.code : rec.id;
    const opt: ReferenceOption = { value: selected, label: rec.label };
    setCreated((prev) => [...prev, opt]);
    onOptionCreated?.(opt);
    onChange(selected); // return to parent with the new value selected
    setCreateOpen(false);
  }

  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        {/* QB-STD-1/2: the "+" row lives inside the Combobox dropdown as its permanent first row.
        No external button — the Combobox allowAddNew now always-shows the row on open. */}
        <Combobox
          options={comboOptions}
          onSearch={onSearch}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          loading={loading}
          allowAddNew={{ label: addLabel, onAdd: () => setCreateOpen(true) }}
        />
      </div>
      {lockControl}
      {config.backend === "inline-drawer" ? (
        <InlineCreateDrawer
          open={createOpen}
          kind={createKind as InlineCreateKind}
          operatingCompanyId={operatingCompanyId}
          onClose={() => setCreateOpen(false)}
          onCreated={handleCreated}
        />
      ) : config.backend === "quick-create-modal" ? (
        <QuickCreateEntityModal
          open={createOpen}
          operatingCompanyId={operatingCompanyId}
          kind={createKind as QuickCreateKind}
          onClose={() => setCreateOpen(false)}
          onCreated={handleCreated}
        />
      ) : createOpen ? (
        // Mounted only while open. The generic drawer consumes the Toast context, and a picker must
        // not require a ToastProvider ancestor merely to render its closed create surface. The two
        // legacy backends above keep their always-mounted `open={createOpen}` form untouched.
        <CatalogQuickCreateDrawer
          open
          config={config}
          operatingCompanyId={operatingCompanyId}
          onClose={() => setCreateOpen(false)}
          onCreated={handleCreated}
        />
      ) : null}
    </div>
  );
}
