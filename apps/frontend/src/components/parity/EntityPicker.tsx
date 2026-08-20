/**
 * C1 — EntityPicker: the software-wide replacement for a raw-UUID text box.
 *
 * A reference to an entity is ALWAYS a searchable picker over the canonical, company-scoped roster
 * for that kind — never an `<input>` an operator is expected to paste a UUID into. QuickBooks,
 * NetSuite, McLeod and Alvys have no raw-id control anywhere, and for good reason: nobody knows a
 * UUID, so the field ends up blank (dropping the FK every downstream linkage depends on) or pasted
 * unvalidated (pointing at a row in another company).
 *
 * COMPOSES, NEVER FORKS
 *   - the roster + dropdown is the EXISTING shared `Combobox`, so type-ahead, keyboard handling,
 *     clear, loading and the add-new row all behave identically to every other picker;
 *   - the per-kind facts (canonical read table, canonical write table, list call, whether inline
 *     create is offered) come from `./entityPickerRegistry`, mirroring how `ReferenceSelect` reads
 *     `./catalogPickerRegistry`. Catalog reference lists keep going through ReferenceSelect; this
 *     adds the ENTITY half beside it and replaces nothing.
 *
 * PICKER LAW, as implemented here
 *   1. inline "+ Create ___" is the permanent FIRST ROW INSIDE the open dropdown (Combobox
 *      `allowAddNew`), visible before any keystroke — never a button beside the field;
 *   2. it opens that entity's real create surface in the C7 drawer, not a second shell;
 *   3. the create WRITES the same canonical table this picker READS (declared + guarded in the
 *      registry), so the new row is in the list and SURVIVES RELOAD;
 *   4. the created row is auto-selected and returned to the parent — no navigation, no lost form;
 *   5. the roster is company-scoped on every read;
 *   6. the option value is the canonical id, written as a real FK by the parent — never a memo.
 *
 * FILTERS DO NOT GET "+ Create". A filter narrows rows that already exist; offering to create one
 * from a filter is nonsense, and no reference product does it. Filter call sites pass
 * `allowCreate={false}`.
 *
 * Guard: scripts/verify-picker-law-no-raw-uuid.mjs (verify-step 1551).
 */
import { useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { CappedListNotice } from "../CappedListNotice";
import { Combobox } from "../Combobox";
import { CreateDriverModal } from "../drivers/CreateDriverModal";
import { CreateTrailerModal } from "../fleet/CreateTrailerModal";
import { InlineCreateDrawer } from "./InlineCreateDrawer";
import { mergePickerOptionsByValue } from "./mergePickerOptionsByValue";
import { CreateUnitModal } from "../fleet/CreateUnitModal";
import { PolicyCreateModal } from "../insurance/PolicyCreateModal";
import { ClaimCreateModal } from "../insurance/ClaimCreateModal";
import { LawsuitCreateModal } from "../insurance/LawsuitCreateModal";
// Lazy: BookLoadModalV4 imports EntityPicker — avoid init-time circular module cycle.
const BookLoadModalV4 = lazy(() =>
  import("../../pages/dispatch/components/BookLoadModalV4").then((m) => ({ default: m.BookLoadModalV4 })),
);
import {
  entityAddNewLabel,
  entityPickerListLimit,
  getEntityPickerConfig,
  type EntityPickerKind,
  type EntityPickerOption,
} from "./entityPickerRegistry";

export type EntityPickerProps = {
  kind: EntityPickerKind;
  operatingCompanyId: string;
  value: string | null;
  /** Human label for a persisted selection that may be archived or outside the current roster page. */
  selectedOption?: EntityPickerOption | null;
  /** The selected canonical roster option accompanies its FK so inline consumers never rebuild a label from a UUID. */
  onChange: (value: string | null, option?: EntityPickerOption | null) => void;
  /** Reports the canonical roster option after async resolution, including persisted initial values. */
  onSelectedOptionResolved?: (option: EntityPickerOption | null) => void;
  /**
   * Offer the inline "+ Create ___" first row. Default true for kinds whose registry entry allows
   * it. FILTER call sites pass false — a filter narrows existing rows and must not create one.
   */
  allowCreate?: boolean;
  /**
   * CHROME-11: when this picker is rendered INSIDE an already-open money `ParityDrawer`, the nested
   * create must stack as a right drawer rather than a centered card over the money panel. Default
   * false → the create opens in the shared C7 480px right drawer.
   */
  nestedInDrawer?: boolean;
  /** Skip the roster fetch while the parent surface is closed. Default true. */
  enabled?: boolean;
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
  className?: string;
  /** Focus target for form validation (`[data-field="…"]`). */
  dataField?: string;
  /**
   * `data-testid` for the input. A migrated call site keeps the EXACT id its previous raw <input>
   * carried, so no existing test or e2e selector loses its handle when the control is swapped.
   */
  dataTestId?: string;
  /** Notified when a record is created inline, so a parent can refetch a dependent list. */
  onCreated?: (id: string) => void;
  /**
   * FAIL-CA1 — driver kinds only. Money surfaces include Probation (create default); dispatch stays
   * Active-only. Ignored for non-driver kinds.
   */
  driverRoster?: "active_only" | "active_or_probation";
  /** Restrict mdata.equipment to the transfer/assignment subtype selected by the parent. */
  equipmentKind?: "trailer" | "chassis";
};

export function EntityPicker({
  kind,
  operatingCompanyId,
  value,
  selectedOption,
  onChange,
  onSelectedOptionResolved,
  allowCreate = true,
  nestedInDrawer = false,
  enabled = true,
  placeholder,
  disabled = false,
  allowClear = true,
  className,
  dataField,
  dataTestId,
  onCreated,
  driverRoster = "active_only",
  equipmentKind,
}: EntityPickerProps) {
  const config = getEntityPickerConfig(kind);
  const [createOpen, setCreateOpen] = useState(false);
  const [created, setCreated] = useState<EntityPickerOption[]>([]);
  // SAF-B29: without server search, EntityPicker fetched a 200-row page once and Combobox only filtered
  // that page — drivers/units/loads past page 1 were unselectable on every Safety call site.
  const [rosterSearch, setRosterSearch] = useState("");
  const rosterScope = useRef({ kind, operatingCompanyId });
  const [invalidatedValue, setInvalidatedValue] = useState<string | null>(null);

  // Owner sessions can switch companies without remounting the surrounding form. Locally-created
  // options are not React Query data and therefore are not evicted by the company-scoped query key.
  // Clear every committed/local picker state when its canonical roster scope changes so an id from
  // company A can never remain selected or selectable while the UI is operating as company B.
  useEffect(() => {
    const previous = rosterScope.current;
    if (previous.kind === kind && previous.operatingCompanyId === operatingCompanyId) return;
    rosterScope.current = { kind, operatingCompanyId };
    setCreated([]);
    setRosterSearch("");
    setCreateOpen(false);
    if (value) {
      setInvalidatedValue(value);
      onChange(null);
    }
  }, [kind, onChange, operatingCompanyId, value]);

  const scopedValue = value === invalidatedValue ? null : value;

  const queryEnabled = enabled && Boolean(operatingCompanyId);
  const driverRosterKey = kind === "driver" ? driverRoster : "n/a";
  // `trailer` is the product entity, not an alias for every row in mdata.equipment. Chassis are
  // selectable only where a parent explicitly opts into that subtype (equipment transfer).
  const effectiveEquipmentKind = kind === "trailer" ? equipmentKind ?? "trailer" : undefined;

  const rosterQuery = useQuery({
    queryKey: [
      "entity-picker",
      kind,
      operatingCompanyId,
      config.serverSearch ? rosterSearch : "",
      driverRosterKey,
      effectiveEquipmentKind ?? "all-equipment",
    ],
    queryFn: () =>
      config.list(operatingCompanyId, {
        ...(config.serverSearch ? { search: rosterSearch || undefined } : {}),
        ...(kind === "driver" ? { driverRoster } : {}),
        ...(effectiveEquipmentKind ? { equipmentKind: effectiveEquipmentKind } : {}),
      }),
    enabled: queryEnabled,
  });

  const options = useMemo(() => {
    const rows = mergePickerOptionsByValue(
      rosterQuery.data ?? [],
      selectedOption ? [selectedOption, ...created] : created,
    );
    // A value that is not in the roster (an archived driver still referenced by an old record, a
    // load outside the 200-row page) must stay VISIBLE and selected rather than silently blanking
    // the field — a picker that drops the value it was handed is worse than the text box it replaced.
    if (scopedValue && !rows.some((r) => r.value === scopedValue)) {
      rows.unshift({ value: scopedValue, label: scopedValue, sublabel: "not in the current list" });
    }
    return rows;
  }, [rosterQuery.data, created, scopedValue, selectedOption]);

  // A kind may refuse inline create for a stated reason (transactions and money documents do).
  const createOffered = allowCreate && config.inlineCreate.available;
  const resolvedSelectedOption = scopedValue
    ? options.find((option) => option.value === scopedValue && option.label !== scopedValue) ?? null
    : null;
  useEffect(() => {
    onSelectedOptionResolved?.(resolvedSelectedOption);
  }, [onSelectedOptionResolved, resolvedSelectedOption]);
  const rosterShown = options.length;
  const rosterLimit = entityPickerListLimit(kind, {
    search: rosterSearch,
    driverRoster: kind === "driver" ? driverRoster : undefined,
  });

  function handleCreated(id: string, label?: string) {
    setInvalidatedValue(null);
    const option: EntityPickerOption = { value: id, label: label ?? id };
    setCreated((prev) => [...prev, option]);
    onChange(id, option); // return the canonical FK and human option to the parent
    onCreated?.(id);
    setCreateOpen(false);
    void rosterQuery.refetch();
  }

  return (
    <>
      <div className="space-y-1">
        {config.serverSearch ? (
          <CappedListNotice
            shown={rosterShown}
            limit={rosterLimit}
            hint={`Type to search for a ${config.label} that is not listed.`}
            className="text-[11px] text-slate-600"
          />
        ) : null}
        <Combobox
          className={className}
          dataField={dataField}
          dataTestId={dataTestId}
          options={options}
          value={scopedValue}
          onChange={(next) => {
            setInvalidatedValue(null);
            onChange(next, next ? options.find((option) => option.value === next) ?? null : null);
          }}
          onSearch={config.serverSearch ? setRosterSearch : undefined}
          placeholder={placeholder ?? `Select ${config.label}`}
          loading={rosterQuery.isLoading}
          error={rosterQuery.isError ? `Couldn't load ${config.label} list` : undefined}
          disabled={disabled || !operatingCompanyId}
          allowClear={allowClear}
          allowAddNew={createOffered ? { label: entityAddNewLabel(kind), onAdd: () => setCreateOpen(true) } : undefined}
        />
      </div>

      {/* The inline create opens the entity's REAL create surface — the same one the module's own
          "+ Create" button opens — so the row it writes is the canonical row, not a shadow record.
          nestedInDrawer routes CHROME-11's drawer-on-drawer case; the default is C7's 480px drawer. */}
      {createOffered && kind === "driver" ? (
        <CreateDriverModal
          open={createOpen}
          companyId={operatingCompanyId}
          shell={nestedInDrawer ? "drawer" : "modal"}
          onClose={() => setCreateOpen(false)}
          onCreated={(id, label) => handleCreated(id, label)}
        />
      ) : null}

      {createOffered && kind === "unit" ? (
        <CreateUnitModal
          open={createOpen}
          operatingCompanyId={operatingCompanyId}
          onClose={() => setCreateOpen(false)}
          onCreated={(id, label) => handleCreated(id, label)}
        />
      ) : null}

      {createOffered && kind === "trailer" ? (
        <CreateTrailerModal
          open={createOpen}
          operatingCompanyId={operatingCompanyId}
          equipmentKind={effectiveEquipmentKind}
          onClose={() => setCreateOpen(false)}
          onCreated={(id, label) => handleCreated(id, label)}
        />
      ) : null}

      {createOffered && kind === "insurance_policy" ? (
        <PolicyCreateModal
          open={createOpen}
          operatingCompanyId={operatingCompanyId}
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => (id ? handleCreated(id) : setCreateOpen(false))}
        />
      ) : null}

      {createOffered && kind === "insurance_claim" ? (
        <ClaimCreateModal
          open={createOpen}
          operatingCompanyId={operatingCompanyId}
          onClose={() => setCreateOpen(false)}
          onCreated={(id, label) => (id ? handleCreated(id, label) : setCreateOpen(false))}
        />
      ) : null}

      {createOffered && kind === "insurance_lawsuit" ? (
        <LawsuitCreateModal
          open={createOpen}
          operatingCompanyId={operatingCompanyId}
          onClose={() => setCreateOpen(false)}
          onCreated={(id, label) => (id ? handleCreated(id, label) : setCreateOpen(false))}
        />
      ) : null}

      {createOffered && kind === "load" ? (
        <Suspense fallback={null}>
          <BookLoadModalV4
            open={createOpen}
            operatingCompanyId={operatingCompanyId}
            onClose={() => setCreateOpen(false)}
            onCreated={(created) => {
              if (created?.id) handleCreated(created.id, created.label);
              else setCreateOpen(false);
            }}
          />
        </Suspense>
      ) : null}

      {createOffered && kind === "vendor" ? (
        <InlineCreateDrawer
          open={createOpen}
          kind="vendor"
          operatingCompanyId={operatingCompanyId}
          onClose={() => setCreateOpen(false)}
          onCreated={(record) => handleCreated(record.id, record.label)}
        />
      ) : null}

      {createOffered && kind === "customer" ? (
        <InlineCreateDrawer
          open={createOpen}
          kind="customer"
          operatingCompanyId={operatingCompanyId}
          onClose={() => setCreateOpen(false)}
          onCreated={(record) => handleCreated(record.id, record.label)}
        />
      ) : null}
    </>
  );
}
