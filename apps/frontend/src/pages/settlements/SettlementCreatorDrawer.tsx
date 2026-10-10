/**
 * R-186.2 — Settlement Creator half-page side panel.
 * ONE panel for BOTH Company + Driver AlwaysTrack settlements (USMCA only).
 * Live Post enabled (owner 2026-09-25). Preview still gates can_post on control totals.
 */
import { MoneyCell } from "../../components/shared/MoneyCell";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ParityDrawer } from "../../components/parity/ParityDrawer";
import { ReferenceSelect } from "../../components/parity/ReferenceSelect";
import { Combobox } from "../../components/Combobox";
import { Button } from "../../components/Button";
import { EntityPicker } from "../../components/EntityPicker";
import { DatePicker } from "../../components/forms/DatePicker";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { StateSelect } from "../../components/forms/StateSelect";
import { AddressGeocodeInput } from "../../components/dispatch/AddressGeocodeInput";
import { geocodeSearch, type GeocodeResult } from "../../api/geocoding";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useToast } from "../../components/Toast";
import { ConfirmModal } from "../../components/shared/ConfirmModal";
import { formatUsdCents, formatUsdCentsTable } from "../../lib/money";
import { formatAccountDisplayLabel } from "../../lib/show-account-numbers";
import { useShowAccountNumbers } from "../../lib/useShowAccountNumbers";
import { useAccountingItemsQuery } from "../../hooks/useAccountingItemsQuery";
import { useQueries, useQuery } from "@tanstack/react-query";
import { getReclassifyAccountTree } from "../../api/reclassify";
import { uploadSourceDocumentFromFile } from "../../api/docs";
import { WizardReclassifyPanel } from "./WizardReclassifyPanel";
import { FuelStopLocationPicker } from "../../components/locations/FuelStopLocationPicker";
import { formatFuelStopLocationLabel } from "../../lib/fuelStopLocationLabel";
import {
  peekNextLoadNumber,
  getLaneMileage,
  getChainDeadhead,
  getDriverPayCard,
  getRouteMileage,
} from "../../api/dispatch";
import {
  previewSettlementCreator,
  postSettlementCreator,
  peekNextSettlementNumber,
  isFactoredLoad,
  type SettlementCreatorDraft,
  type SettlementCreatorPreview,
  type SettlementCreatorFuelCard,
  type SettlementCreatorFactorOption,
} from "../../api/settlementCreator";
import type { ReactNode } from "react";

/**
 * SETL-F442/F443 — decimal-safe quantity box (miles / diesel gallons / DEF / any qty).
 * MoneyInput owns $-money with the same trailing-"." hold. Plain
 * `Number(e.target.value)` on controlled `<input value={n}>` wiped the trailing
 * decimal mid-keystroke. No leading $ — quantities are not money.
 */
function DecimalNumberInput({
  value,
  onChange,
  className,
  title,
  "data-testid": dataTestId,
  ariaLabel,
  allowZero = true,
}: {
  value: number | null | undefined;
  onChange: (n: number | null) => void;
  className?: string;
  title?: string;
  "data-testid"?: string;
  ariaLabel?: string;
  allowZero?: boolean;
}) {
  const display =
    value == null || Number.isNaN(value) || (!allowZero && value === 0) ? "" : String(value);
  const [text, setText] = useState(display);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(display);
  }, [display, focused]);
  return (
    <input
      className={className}
      inputMode="decimal"
      value={text}
      title={title}
      aria-label={ariaLabel}
      data-testid={dataTestId}
      onFocus={() => {
        setFocused(true);
        // Same W-3 pattern as MoneyInput: empty-on-zero so digits are not prepended to a leftover 0.
        setText(value != null && value !== 0 ? String(value) : allowZero && value === 0 ? "" : "");
      }}
      onBlur={() => {
        setFocused(false);
        setText(display);
      }}
      onChange={(e) => {
        const next = e.target.value;
        // Allow 45.123 gal / 12.5 mi — digits + one optional decimal point only.
        if (next !== "" && !/^\d*\.?\d*$/.test(next)) return;
        setText(next);
        if (next === "" || next === ".") {
          onChange(null);
          return;
        }
        // Keep "12." / "0." as typed text; only emit a finite number when complete.
        if (next.endsWith(".")) return;
        const n = Number(next);
        if (Number.isFinite(n)) onChange(n);
      }}
    />
  );
}

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

type LoadDraft = SettlementCreatorDraft["loads"][number];
/** location_id / vendor_id are picker state only — stripped before API. item_id / account_id / load_id are SENT (363-CC2-D). */
type FuelDraft = SettlementCreatorDraft["fuel_purchases"][number] & {
  location_id?: string | null;
  vendor_id?: string | null;
};
type ExpDraft = SettlementCreatorDraft["expenses"][number] & {
  location?: string | null;
  location_id?: string | null;
  item_id?: string | null;
};
type MoneyDraft = {
  description: string;
  amount_cents: number;
  load_number?: string | null;
  /** escrow: hold = +, release|forfeit = − */
  escrow_type?: "hold" | "release" | "forfeit";
  /** additional pay category */
  pay_kind?: "detention" | "layover" | "bonus" | "stop_pay" | "other";
  /** Product/service catalog id (deductions + additional pay). */
  item_id?: string | null;
  quantity?: number | null;
};

function emptyLoad(loadNumber = ""): LoadDraft {
  return {
    load_number: loadNumber,
    customer_name: "",
    pickup_date: "",
    pickup_address: "",
    pickup_city: "",
    pickup_state: "",
    pickup_zip: "",
    pickup_lat: null,
    pickup_lng: null,
    delivery_date: "",
    delivery_address: "",
    delivery_city: "",
    delivery_state: "",
    delivery_zip: "",
    delivery_lat: null,
    delivery_lng: null,
    line_haul_miles: null,
    line_haul_rate_cents: null,
    line_haul_amount_cents: null,
    factoring: "faro_usmca",
    invoice_number: "",
    date_sent_to_factoring: "",
    loaded_miles: null,
    /** Driver pay miles (short) — company loaded_miles are practical / different. */
    miles_shortest: null,
    empty_miles: null,
    empty_rate_cents: null,
    accessorials: [],
    picks: null,
    drops: null,
    trip_type: "NB",
    join_outbound_load_number: "",
    not_yet_delivered: true,
  };
}

/**
 * Apply a Google Places / geocode pick onto one stop side — same fields Book Load writes.
 *
 * SETL-F440: AddressGeocodeInput calls onResolve THEN onChange(formatted). The Creator used to
 * rebuild the load from a stale closure in onChange and wipe city/state that onResolve just set,
 * leaving the whole pick in the address box. Callers MUST use functional setLoads so onChange only
 * patches the address line and city/state/zip/lat survive.
 *
 * Address is OPTIONAL for hand-seeded Creator loads (city + state are the required stop identity).
 * Street line prefers address_line1; formatted is only a fallback for the one-line address field.
 */
function applyGeocodeToLoad(
  load: LoadDraft,
  side: "pickup" | "delivery",
  r: GeocodeResult,
): LoadDraft {
  // Book Load parity (stopGeocodePatches): only emit non-empty parts. Do NOT dump
  // `formatted` into address — that left city+state in one box. Street line alone;
  // city/state/zip/lat come from structured Place Details fields.
  const street = (r.address_line1 || "").trim() || undefined;
  const city = (r.city || "").trim();
  const state = (r.state || "").trim().toUpperCase();
  const zip = (r.zip || "").trim();
  const lat = typeof r.lat === "number" && Number.isFinite(r.lat) && r.lat !== 0 ? r.lat : null;
  const lng = typeof r.lon === "number" && Number.isFinite(r.lon) && r.lon !== 0 ? r.lon : null;
  if (side === "pickup") {
    return {
      ...load,
      // Prefer street line; if Places only returned city/state, leave address as-is
      // (onChange may still write formatted — city/state stay on their own fields).
      ...(street ? { pickup_address: street } : {}),
      ...(city ? { pickup_city: city } : {}),
      ...(state ? { pickup_state: state } : {}),
      ...(zip ? { pickup_zip: zip } : {}),
      ...(lat != null ? { pickup_lat: lat } : {}),
      ...(lng != null ? { pickup_lng: lng } : {}),
      // New place → allow lane/route engines to refill miles (operator can still type over).
      loaded_miles: null,
      line_haul_miles: null,
      empty_miles: null,
    };
  }
  return {
    ...load,
    ...(street ? { delivery_address: street } : {}),
    ...(city ? { delivery_city: city } : {}),
    ...(state ? { delivery_state: state } : {}),
    ...(zip ? { delivery_zip: zip } : {}),
    ...(lat != null ? { delivery_lat: lat } : {}),
    ...(lng != null ? { delivery_lng: lng } : {}),
    loaded_miles: null,
    line_haul_miles: null,
  };
}

/** Next free numeric load # after every number already on the form (and the peeked base). */
function nextSequentialLoadNumber(existing: LoadDraft[], peekBase: string): string {
  const nums = existing
    .map((l) => Number.parseInt(String(l.load_number).trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  const base = Number.parseInt(String(peekBase).trim(), 10);
  const floor = Number.isFinite(base) && base > 0 ? base - 1 : 0;
  const max = nums.length ? Math.max(...nums, floor) : floor;
  return String(max + 1);
}


function emptyFuel(): FuelDraft {
  return {
    date: new Date().toISOString().slice(0, 10),
    gallons: 0,
    cpg_cents: 0,
    card: "relay",
    vendor_name: "",
    vendor_id: null,
    location: "",
    location_id: null,
    invoice: "",
    load_number: "",
  };
}

function emptyCompExp(): ExpDraft {
  return {
    date: new Date().toISOString().slice(0, 10),
    item_name: "",
    item_id: null,
    amount_cents: 0,
    load_number: "",
    is_company_expense: true,
    is_reimbursable: false,
    card: "relay",
    location: "",
    location_id: null,
  };
}

function emptyDrvReimb(): ExpDraft {
  return {
    date: new Date().toISOString().slice(0, 10),
    item_name: "",
    item_id: null,
    amount_cents: 0,
    load_number: "",
    is_company_expense: false,
    is_reimbursable: true,
    card: null,
    location: "",
    location_id: null,
  };
}

function emptyMoney(): MoneyDraft {
  return { description: "", amount_cents: 0, load_number: "" };
}

const DEFAULT_ESCROW_HOLD_CENTS = 2_500;

function defaultEscrowLine(): MoneyDraft {
  return { description: "Driver escrow", amount_cents: DEFAULT_ESCROW_HOLD_CENTS, load_number: "", escrow_type: "hold" };
}

/**
 * Owner 2026-10-07: "+ Add" is NEVER in the section title row. It sits under / beside the
 * last item so the next row stacks under the previous one. Title is title-only.
 */
function Section({
  title,
  subtotalCents,
  pdfCents,
  children,
}: {
  title: string;
  subtotalCents?: number | null;
  pdfCents?: number | null;
  children: ReactNode;
}) {
  const tied =
    pdfCents == null || subtotalCents == null
      ? null
      : Math.round(subtotalCents) === Math.round(pdfCents);
  return (
    <section className="space-y-2 rounded-sm border border-[#E5E7EB] bg-white p-2">
      <div className="flex items-center justify-center gap-2">
        <h3 className="text-center text-section-header font-bold uppercase tracking-wide text-[#4B5563]">{title}</h3>
      </div>
      {children}
      {subtotalCents != null ? (
        // QBO presentation: a subtotal sits on a ruled line, right-aligned, in lining figures, with
        // the label left and the amount in a fixed 120px money column so every section's amount
        // stacks on the same decimal point down the drawer. Centred grey text did not read as a
        // total and could not be scanned against the AlwaysTrack statement.
        <div
          className="mt-1 flex items-baseline justify-between gap-2 border-t border-[#E5E7EB] pt-1"
          data-testid={`sc-section-subtotal-${title.replace(/\s+/g, "-").toLowerCase()}`}
        >
          <span className="text-section-header font-semibold uppercase tracking-wide text-[#4B5563]">
            Subtotal
          </span>
          <span className="flex items-baseline gap-2">
            {pdfCents != null ? (
              <span className="text-xs text-[#6B7280]">
                PDF{" "}
                <span className="inline-block w-[120px]">
                  <MoneyCell cents={pdfCents} drill={{ none: "Total printed on the uploaded settlement PDF — a preview, not yet a record" }} />
                </span>
              </span>
            ) : null}
            <span
              className={`inline-block w-[120px] text-xs font-bold ${
                tied === null ? "text-[#0F1219]" : tied ? "text-[#16A34A]" : "text-red-600"
              }`}
            >
              <MoneyCell cents={subtotalCents} drill={{ none: "Subtotal of the lines being built in this settlement — a preview until it is posted" }} />
            </span>
          </span>
        </div>
      ) : null}
    </section>
  );
}

/**
 * One line of the bottom summary. QBO shape: label left, amount right in a fixed 120px column with
 * tabular (lining) figures so decimals stack; `strong` for a carried total, `double` for the closing
 * net. `tied` colours a figure green when it agrees with the AlwaysTrack PDF and red when it does
 * not — never a bare number the owner has to compare by eye. A null amount renders an em dash,
 * never a fabricated $0.00 (C-37).
 */
function TotalRow({
  label,
  cents,
  strong = false,
  double = false,
  tied,
}: {
  label: string;
  cents: number | null | undefined;
  strong?: boolean;
  double?: boolean;
  tied?: boolean;
}) {
  const colour = tied === undefined ? "text-[#0F1219]" : tied ? "text-[#16A34A]" : "text-red-600";
  return (
    <div
      className={`flex items-baseline justify-between gap-2 py-0.5 ${
        double ? "mt-1 border-t-2 border-double border-[#0F1219] pt-1" : strong ? "mt-1 border-t border-[#E5E7EB] pt-1" : ""
      }`}
      data-testid={`sc-total-${label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}
    >
      <span className={`text-xs ${strong ? "font-bold uppercase tracking-wide text-[#0F1219]" : "text-[#4B5563]"}`}>
        {label}
      </span>
      <span className={`inline-block w-[120px] text-xs ${strong ? "font-bold" : ""} ${colour}`}>
        <MoneyCell cents={cents} format={formatUsdCentsTable} drill={{ none: "Settlement preview figure — computed from the lines being built, no record until posted" }} />
      </span>
    </div>
  );
}

const SPAN_CLASS: Record<number, string> = {
  1: "col-span-1", 2: "col-span-2", 3: "col-span-3", 4: "col-span-4", 5: "col-span-5",
};

/**
 * SETL-F443 — the owner's layout unit is FIVE CELLS PER SIDE, not five equal fields.
 * Every field was pinned to one cell, so Customer truncated to "Select custome" and the pickup
 * address had nowhere to render. A field now declares how many of the five it occupies.
 */
function Field({ label, span = 1, children }: { label: string; span?: number; children: ReactNode }) {
  return (
    <label className={`${SPAN_CLASS[span] ?? "col-span-1"} flex min-w-0 flex-col gap-1 text-section-header font-semibold uppercase text-[var(--text-muted,#4B5563)]`}>
      {/* SETL-F437 (owner 2026-10-06): "THE HEADERS ARENT ALIGNED, THE BOXES ARENT ALIGNED, IN
          HEIGHT NOT THE SAME." A centred label over a centred box shares no left edge, and a label
          that wrapped to two lines pushed its own box down. QuickBooks reads LEFT, and a FIXED label
          height keeps one-line and two-line labels on the same baseline. */}
      <span className="flex h-7 items-end truncate text-left leading-tight" title={label}>
        {label}
      </span>
      <div className="h-7 w-full min-w-0">{children}</div>
    </label>
  );
}

/**
 * Owner 2026-10-10: Add sits UNDER the last load / fuel / money row — never a side rail.
 * Side + and × stole column width from PU/DEL dates. Compact × is inline on the block footer.
 */
function AddUnderButton({
  onClick,
  testId,
  label = "+ Add",
}: {
  onClick: () => void;
  testId?: string;
  label?: string;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      onClick={onClick}
      className="h-7 shrink-0 px-2 text-xs font-bold"
      aria-label={label}
      title={label}
      data-testid={testId}
    >
      {label.startsWith("+") ? label : `+ ${label}`}
    </Button>
  );
}

function RemoveLineButton({
  onClick,
  testId,
  label,
}: {
  onClick: () => void;
  testId?: string;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-testid={testId}
      className="flex h-7 w-7 shrink-0 items-center justify-center text-xs font-bold text-[#6B7280] hover:text-[#B91C1C]"
      onClick={onClick}
    >
      ×
    </button>
  );
}

/** Footer under a line block: optional × + under-row Add on the last item only. */
function ItemUnderRail({
  onAdd,
  onRemove,
  addTestId,
  removeTestId,
  addLabel,
  removeLabel,
}: {
  onAdd?: () => void;
  onRemove?: () => void;
  addTestId?: string;
  removeTestId?: string;
  addLabel: string;
  removeLabel?: string;
}) {
  if (!onAdd && !onRemove) return null;
  return (
    <div
      className="mt-1 flex items-center justify-between gap-2 border-t border-dashed border-[#E5E7EB] pt-1"
      data-testid={addTestId ? `${addTestId}-under` : undefined}
    >
      {onRemove && removeLabel ? (
        <RemoveLineButton onClick={onRemove} testId={removeTestId} label={removeLabel} />
      ) : (
        <span aria-hidden />
      )}
      {onAdd ? <AddUnderButton onClick={onAdd} testId={addTestId} label={addLabel} /> : <span aria-hidden />}
    </div>
  );
}

/** Empty section: under-row + only — never a header Add on top, never a side rail. */
function EmptyUnderAdd({
  onClick,
  testId,
  label,
}: {
  onClick: () => void;
  testId?: string;
  label: string;
}) {
  return (
    <div className="flex items-center justify-start border-t border-dashed border-[#E5E7EB] pt-2" data-testid={testId ? `${testId}-empty` : undefined}>
      <AddUnderButton onClick={onClick} testId={testId} label={label} />
    </div>
  );
}

/**
 * Owner 2026-10-07: fuel/expense load # is auto from date vs load PU–DEL window.
 * Ask only when a load has PU and DEL on the SAME calendar day AND the expense is on that day
 * (same-day trip — which load / assign-to is ambiguous without an explicit pick).
 */
function fuelNeedsExplicitLoadNumber(expenseDate: string, allLoads: LoadDraft[]): boolean {
  const d = (expenseDate || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  return allLoads.some((l) => {
    const pu = (l.pickup_date || "").slice(0, 10);
    const del = (l.delivery_date || "").slice(0, 10);
    return Boolean(pu && del && pu === del && pu === d);
  });
}

/** Unique load whose PU–DEL window contains the expense date; else "". */
function autoLoadNumberForExpenseDate(expenseDate: string, allLoads: LoadDraft[]): string {
  const d = (expenseDate || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "";
  const matches = allLoads.filter((l) => {
    const num = String(l.load_number ?? "").trim();
    if (!num) return false;
    const pu = (l.pickup_date || "").slice(0, 10);
    const del = (l.delivery_date || "").slice(0, 10);
    if (!pu) return false;
    if (del) return d >= pu && d <= del;
    return d === pu;
  });
  if (matches.length === 1) return String(matches[0]!.load_number).trim();
  return "";
}

type LineCodingFields = { item_id?: string | null; account_id?: string | null; load_id?: string | null; load_number?: string | null };
type RefOption = { value: string; label: string };

/**
 * ROUND 363-CC2-D — the item, the account and the load of a wizard line, picked at creation (ids, never free text).
 * Blank account = the item's default account (fuel: the fuel-type item). The load is the load picker; the typed
 * load number stays only as the label of what was picked.
 */
function LineCoding({
  companyId,
  line,
  onPatch,
  accountOptions,
  accountsLoading,
  item,
  testIdPrefix,
  showLoad = true,
  itemSpan = 1,
}: {
  companyId: string;
  line: LineCodingFields;
  onPatch: (patch: LineCodingFields) => void;
  accountOptions: RefOption[];
  accountsLoading: boolean;
  item?: { options: RefOption[]; loading: boolean; onSearch: (q: string) => void; placeholder: string };
  testIdPrefix: string;
  /** false when load # is auto-from-date (fuel) or shown elsewhere. */
  showLoad?: boolean;
  /** Fuel: Item wider (span 2) so Account sits in the next cell without overlap. */
  itemSpan?: number;
}) {
  return (
    <>
      {item ? (
        <Field label="Item" span={itemSpan}>
          <ReferenceSelect
            value={line.item_id ?? null}
            onChange={(id) => onPatch({ item_id: id })}
            options={item.options}
            createKind="item"
            operatingCompanyId={companyId}
            placeholder={item.loading ? "Loading items…" : item.placeholder}
            loading={item.loading}
            addNewLabel="+ Add new item"
            onSearch={item.onSearch}
          />
        </Field>
      ) : null}
      <Field label="Account">
        <ReferenceSelect
          value={line.account_id ?? null}
          onChange={(id) => onPatch({ account_id: id })}
          options={accountOptions}
          createKind="account"
          operatingCompanyId={companyId}
          placeholder={accountsLoading ? "Loading accounts…" : "Blank = the item's account"}
          loading={accountsLoading}
          data-testid={`${testIdPrefix}-account`}
        />
      </Field>
      {showLoad ? (
        <Field label="Load">
          <EntityPicker
            kind="load"
            operatingCompanyId={companyId}
            value={line.load_id ?? null}
            onChange={(id, opt) => onPatch({ load_id: id, load_number: id ? (opt?.label ?? line.load_number ?? null) : null })}
            placeholder={line.load_number ? `Load ${line.load_number}` : "Pick the load"}
            size={pickerSize}
            data-testid={`${testIdPrefix}-load`}
          />
        </Field>
      ) : null}
    </>
  );
}

/** Locked baseline: 28px clickable boxes, 12px body, 2px radius, equal paired widths. */
const inputClass =
  "h-7 w-full min-w-0 rounded-sm border border-[var(--border-subtle,#E5E7EB)] bg-[var(--surface-input,#FFFFFF)] px-2 text-left text-xs text-[var(--text-strong,#0F1219)]";
/** MoneyInput owns h-7 + leading $ frame — never forward border/px (SYS-MONEY / SETL-F441). */
const moneyInputClass = "w-full";
/** SETL-F442 — owner mock: five equal columns on Company + Driver (not 2-col stacked pairs). */
const fieldGridClass = "grid grid-cols-5 gap-2";
/** Header has six facts (settlement / driver / truck / trailer / start / end) — one row. */
const headerGridClass = "grid grid-cols-6 gap-2";
const pickerSize = "sm" as const;

export type SettlementCreatorDrawerProps = {
  open: boolean;
  onClose: () => void;
  /** When true, Post is available; owner walk uses Preview only by default. */
  allowPost?: boolean;
};

export function SettlementCreatorDrawer({ open, onClose, allowPost = false }: SettlementCreatorDrawerProps) {
  const { pushToast } = useToast();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const [settlementNo, setSettlementNo] = useState("");
  const [peekLoadBase, setPeekLoadBase] = useState<string>("");
  const [seqError, setSeqError] = useState<string | null>(null);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [driverLabel, setDriverLabel] = useState("");
  const [unitId, setUnitId] = useState<string | null>(null);
  const [trailerId, setTrailerId] = useState<string | null>(null);
  const [trailerNumber, setTrailerNumber] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [loads, setLoads] = useState<LoadDraft[]>([emptyLoad()]);
  const [fuels, setFuels] = useState<FuelDraft[]>([]);
  const [companyExpenses, setCompanyExpenses] = useState<ExpDraft[]>([]);
  const [drvReimbursements, setDrvReimbursements] = useState<ExpDraft[]>([]);
  const [additionalPay, setAdditionalPay] = useState<MoneyDraft[]>([]);
  const [deductions, setDeductions] = useState<MoneyDraft[]>([]);
  const [advances, setAdvances] = useState<MoneyDraft[]>([]);
  // Queue item 6 (2026-10-02): every settlement starts with the $25 driver escrow hold (2100-00-0NN, owed to
  // the driver — never Faro / factoring / reserves). The X removes it; + Add puts another back.
  const [escrow, setEscrow] = useState<MoneyDraft[]>(() => [defaultEscrowLine()]);
  const [adminFeeCents, setAdminFeeCents] = useState(0);
  const [pdfCompanyExpenses, setPdfCompanyExpenses] = useState(0);
  const [pdfDriverNet, setPdfDriverNet] = useState(0);
  const [itemSearch, setItemSearch] = useState("");
  const [drvItemSearch, setDrvItemSearch] = useState("");

  const [preview, setPreview] = useState<SettlementCreatorPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attemptClose, setAttemptClose] = useState<(() => void) | null>(null);
  const [confirmRepostOpen, setConfirmRepostOpen] = useState(false);
  const [confirmRepostMessage, setConfirmRepostMessage] = useState<string>("");
  /** Operator typed miles/rate — do not overwrite with lane / pay-card autofill. */
  const milesTouchedRef = useRef<Record<number, boolean>>({});
  const ratesTouchedRef = useRef(false);
  // AddressGeocodeInput calls onResolve THEN onChange(formatted). Ignore that formatted
  // echo so city/state stay on their own fields and address keeps street-only (or blank).
  const ignoreGeocodeFormattedRef = useRef<Record<number, "pickup" | "delivery" | null>>({});

  const wrongEntity = Boolean(companyId && companyId !== USMCA);

  /** Company → driver carry: new money lines default to the first (or only) load number. */
  const defaultLoadNumber = useMemo(() => {
    const n = loads.find((l) => String(l.load_number ?? "").trim())?.load_number?.trim();
    return n || "";
  }, [loads]);

  const loadDateWindowKey = useMemo(
    () => loads.map((l) => `${l.load_number}|${l.pickup_date}|${l.delivery_date}`).join(";"),
    [loads],
  );
  const fuelDatesKey = useMemo(() => fuels.map((f) => f.date).join(";"), [fuels]);
  const compExpDatesKey = useMemo(() => companyExpenses.map((e) => e.date).join(";"), [companyExpenses]);

  // Fuel / Comp. Exp. load #: auto from expense date vs load PU–DEL; never ask unless same-day trip.
  useEffect(() => {
    setFuels((prev) => {
      let changed = false;
      const next = prev.map((f) => {
        if (fuelNeedsExplicitLoadNumber(f.date, loads)) return f;
        const auto = autoLoadNumberForExpenseDate(f.date, loads);
        if (auto && f.load_number !== auto) {
          changed = true;
          return { ...f, load_number: auto };
        }
        return f;
      });
      return changed ? next : prev;
    });
    setCompanyExpenses((prev) => {
      let changed = false;
      const next = prev.map((e) => {
        if (fuelNeedsExplicitLoadNumber(e.date, loads)) return e;
        const auto = autoLoadNumberForExpenseDate(e.date, loads);
        if (auto && e.load_number !== auto) {
          changed = true;
          return { ...e, load_number: auto };
        }
        return e;
      });
      return changed ? next : prev;
    });
    // loadDateWindowKey / fuelDatesKey / compExpDatesKey stand in for loads+dates (stable strings).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadDateWindowKey, fuelDatesKey, compExpDatesKey]);

  // Owner 2026-10-10: escrow auto for BOTH loads — one $25 hold per load number.
  useEffect(() => {
    const loadNums = loads
      .map((l) => String(l.load_number ?? "").trim())
      .filter((n) => Boolean(n));
    if (!loadNums.length) return;
    setEscrow((prev) => {
      const holds = prev.filter((e) => (e.escrow_type ?? "hold") === "hold");
      const nonHolds = prev.filter((e) => (e.escrow_type ?? "hold") !== "hold");
      const byLoad = new Map(holds.map((h) => [String(h.load_number ?? "").trim(), h]));
      const nextHolds: MoneyDraft[] = loadNums.map((num) => {
        const existing = byLoad.get(num);
        if (existing) return { ...existing, load_number: num, escrow_type: "hold" as const };
        return {
          ...defaultEscrowLine(),
          load_number: num,
          description: `Driver escrow · load ${num}`,
        };
      });
      const same =
        nextHolds.length === holds.length &&
        nextHolds.every(
          (h, i) =>
            h.load_number === holds[i]?.load_number &&
            h.amount_cents === holds[i]?.amount_cents &&
            h.description === holds[i]?.description,
        );
      if (same && nonHolds.length === prev.length - holds.length) return prev;
      return [...nextHolds, ...nonHolds];
    });
  }, [loads.map((l) => String(l.load_number ?? "").trim()).join("|")]);

  const registerAttemptClose = useCallback((next: () => void) => {
    setAttemptClose(() => next);
  }, []);

  // Owner 2026-09-26: auto next load # + next AlwaysTrack settlement # on open. Locked until Edit.
  useEffect(() => {
    if (!open || !companyId || wrongEntity) return;
    let cancelled = false;
    setSeqError(null);
    void (async () => {
      try {
        const [loadPeek, settPeek] = await Promise.all([
          peekNextLoadNumber(companyId),
          peekNextSettlementNumber(companyId),
        ]);
        if (cancelled) return;
        const nextLoad = loadPeek.next_number;
        setPeekLoadBase(nextLoad);
        setSettlementNo(settPeek.next_number);
        setLoads([emptyLoad(nextLoad)]);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Could not peek next load/settlement number";
        setSeqError(msg);
        setPeekLoadBase("");
        setSettlementNo("");
        setLoads([emptyLoad()]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, companyId, wrongEntity]);

  // SETL-F442 (owner mock): top Start → FIRST load pickup; top End → LAST load delivery.
  // One period entry feeds stop dates — no double-typing on every load row. Driver Settlement
  // shares this header (same Start/End / driver / unit) so company→driver is automatic.
  useEffect(() => {
    if (!periodStart && !periodEnd) return;
    setLoads((prev) => {
      if (!prev.length) return prev;
      let changed = false;
      const next = prev.map((l) => ({ ...l }));
      if (periodStart && /^\d{4}-\d{2}-\d{2}$/.test(periodStart) && next[0].pickup_date !== periodStart) {
        next[0] = { ...next[0], pickup_date: periodStart };
        changed = true;
      }
      if (periodEnd && /^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) {
        const last = next.length - 1;
        if (next[last].delivery_date !== periodEnd) {
          next[last] = { ...next[last], delivery_date: periodEnd, not_yet_delivered: false };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [periodStart, periodEnd]);

  // Bootstrap only: if operator typed load stop dates first and Start/End are still blank, fill them.
  useEffect(() => {
    const pickups = loads
      .map((l) => l.pickup_date)
      .filter((d): d is string => Boolean(d && /^\d{4}-\d{2}-\d{2}$/.test(d)));
    const deliveries = loads
      .map((l) => l.delivery_date)
      .filter((d): d is string => Boolean(d && /^\d{4}-\d{2}-\d{2}$/.test(d)));
    if (pickups.length && !periodStart) setPeriodStart(pickups.slice().sort()[0]!);
    if (!periodEnd) {
      if (deliveries.length) setPeriodEnd(deliveries.slice().sort().at(-1)!);
      else if (pickups.length) setPeriodEnd(pickups.slice().sort().at(-1)!);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loads.map((l) => `${l.pickup_date}|${l.delivery_date}`).join(";")]);

  // Driver pay card → Rate $/mi + Empty $/mi (same card Book Load shows).
  const driverPayCardQuery = useQuery({
    queryKey: ["sc-driver-pay-card", companyId, driverId],
    queryFn: () => getDriverPayCard({ operating_company_id: companyId, driver_id: driverId! }),
    enabled: open && Boolean(companyId) && Boolean(driverId) && !wrongEntity,
    staleTime: 60_000,
  });

  // Owner 2026-10-10: driver rate must appear automatically on Company + Driver sides.
  // Apply whenever the card has a per-mile rate (do not gate only on basis_type string).
  useEffect(() => {
    const card = driverPayCardQuery.data;
    if (!card?.has_rate || ratesTouchedRef.current) return;
    const loadedRate = card.rate_per_mile_cents != null && card.rate_per_mile_cents > 0 ? card.rate_per_mile_cents : null;
    const emptyRate =
      card.rate_empty_per_mile_cents != null && card.rate_empty_per_mile_cents > 0
        ? card.rate_empty_per_mile_cents
        : loadedRate;
    if (loadedRate == null) return;
    setLoads((prev) =>
      prev.map((l) => ({
        ...l,
        line_haul_rate_cents:
          l.line_haul_rate_cents != null && l.line_haul_rate_cents > 0 ? l.line_haul_rate_cents : loadedRate,
        empty_rate_cents:
          l.empty_rate_cents != null && l.empty_rate_cents > 0 ? l.empty_rate_cents : emptyRate,
      })),
    );
  }, [driverPayCardQuery.data, driverId]);

  // SETL-F440/F441 — lane history + chain deadhead + route-engine fallback, PER load row.
  // Hand-typed city/state (no Places pick) has no lat/lng — geocodeSearch fills coords so the
  // route engine can run. Google Routes API stays REFERENCE ONLY (DSP-48) and is never written.
  function hasFiniteCoord(n: number | null | undefined): n is number {
    return typeof n === "number" && Number.isFinite(n) && n !== 0;
  }

  const cityGeocodeQueries = useQueries({
    queries: loads.flatMap((load, idx) => {
      const sides: Array<{ side: "pickup" | "delivery"; city: string; state: string; has: boolean }> = [
        {
          side: "pickup",
          city: String(load.pickup_city ?? "").trim(),
          state: String(load.pickup_state ?? "").trim(),
          has: hasFiniteCoord(load.pickup_lat) && hasFiniteCoord(load.pickup_lng),
        },
        {
          side: "delivery",
          city: String(load.delivery_city ?? "").trim(),
          state: String(load.delivery_state ?? "").trim(),
          has: hasFiniteCoord(load.delivery_lat) && hasFiniteCoord(load.delivery_lng),
        },
      ];
      return sides.map(({ side, city, state, has }) => ({
        queryKey: ["sc-city-geocode", companyId, idx, side, city, state],
        queryFn: () => geocodeSearch(`${city}, ${state}`),
        enabled:
          open &&
          Boolean(companyId) &&
          !wrongEntity &&
          Boolean(city && state) &&
          !has,
        staleTime: 10 * 60 * 1000,
      }));
    }),
  });

  useEffect(() => {
    setLoads((prev) => {
      let changed = false;
      const next = prev.map((cur, idx) => {
        let row = cur;
        const pickupQ = cityGeocodeQueries[idx * 2]?.data;
        const deliveryQ = cityGeocodeQueries[idx * 2 + 1]?.data;
        const pickupHit = pickupQ?.results?.[0];
        const deliveryHit = deliveryQ?.results?.[0];
        if (
          pickupHit &&
          hasFiniteCoord(pickupHit.lat) &&
          hasFiniteCoord(pickupHit.lon) &&
          !(hasFiniteCoord(row.pickup_lat) && hasFiniteCoord(row.pickup_lng))
        ) {
          row = { ...row, pickup_lat: pickupHit.lat, pickup_lng: pickupHit.lon };
          changed = true;
        }
        if (
          deliveryHit &&
          hasFiniteCoord(deliveryHit.lat) &&
          hasFiniteCoord(deliveryHit.lon) &&
          !(hasFiniteCoord(row.delivery_lat) && hasFiniteCoord(row.delivery_lng))
        ) {
          row = { ...row, delivery_lat: deliveryHit.lat, delivery_lng: deliveryHit.lon };
          changed = true;
        }
        return row;
      });
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityGeocodeQueries.map((q) => q.dataUpdatedAt).join(",")]);

  const laneMileageQueries = useQueries({
    queries: loads.map((load, idx) => {
      const originCity = String(load.pickup_city ?? "").trim();
      const originState = String(load.pickup_state ?? "").trim();
      const destCity = String(load.delivery_city ?? "").trim();
      const destState = String(load.delivery_state ?? "").trim();
      return {
        queryKey: [
          "sc-lane-mileage",
          companyId,
          idx,
          originCity,
          originState,
          load.pickup_zip,
          destCity,
          destState,
          load.delivery_zip,
        ],
        queryFn: () =>
          getLaneMileage({
            operating_company_id: companyId,
            origin_city: originCity,
            origin_state: originState,
            origin_postal_code: load.pickup_zip || undefined,
            dest_city: destCity,
            dest_state: destState,
            dest_postal_code: load.delivery_zip || undefined,
          }),
        enabled:
          open &&
          Boolean(companyId) &&
          !wrongEntity &&
          Boolean(originCity && originState && destCity && destState),
        staleTime: 30_000,
      };
    }),
  });

  const routeMileageQueries = useQueries({
    queries: loads.map((load, idx) => {
      const oLat = load.pickup_lat;
      const oLng = load.pickup_lng;
      const dLat = load.delivery_lat;
      const dLng = load.delivery_lng;
      const hasCoords =
        hasFiniteCoord(oLat) && hasFiniteCoord(oLng) && hasFiniteCoord(dLat) && hasFiniteCoord(dLng);
      return {
        queryKey: ["sc-route-mileage", companyId, idx, oLat, oLng, dLat, dLng],
        queryFn: () =>
          getRouteMileage({
            operating_company_id: companyId,
            origin_lat: oLat as number,
            origin_lng: oLng as number,
            dest_lat: dLat as number,
            dest_lng: dLng as number,
          }),
        enabled: open && Boolean(companyId) && !wrongEntity && hasCoords,
        staleTime: 5 * 60 * 1000,
      };
    }),
  });

  const chainDeadheadQueries = useQueries({
    queries: loads.map((load, idx) => {
      const pickupCity = String(load.pickup_city ?? "").trim();
      const pickupState = String(load.pickup_state ?? "").trim();
      return {
        queryKey: ["sc-chain-deadhead", companyId, unitId, idx, pickupCity, pickupState],
        queryFn: () =>
          getChainDeadhead({
            operating_company_id: companyId,
            unit_uuid: unitId!,
            pickup_city: pickupCity,
            pickup_state: pickupState,
            pickup_latitude: load.pickup_lat ?? undefined,
            pickup_longitude: load.pickup_lng ?? undefined,
          }),
        enabled:
          open &&
          Boolean(companyId) &&
          Boolean(unitId) &&
          !wrongEntity &&
          Boolean(pickupCity && pickupState),
        staleTime: 30_000,
      };
    }),
  });

  useEffect(() => {
    setLoads((prev) => {
      let changed = false;
      const next = prev.map((cur, idx) => {
        if (milesTouchedRef.current[idx]) return cur;
        let row = cur;
        const lane = laneMileageQueries[idx]?.data;
        const route = routeMileageQueries[idx]?.data;
        // Prefer lane DB (fills covers Thin/ZIP/reverse). Route-engine practical is coords fallback.
        const laneMiles =
          lane &&
          lane.fills &&
          lane.practical_miles != null &&
          Number(lane.practical_miles) > 0
            ? Number(lane.practical_miles)
            : lane && lane.practical_miles != null && Number(lane.practical_miles) > 0
              ? Number(lane.practical_miles)
              : null;
        const routeMiles =
          route && "practical_miles" in route && route.practical_miles != null && Number(route.practical_miles) > 0
            ? Number(route.practical_miles)
            : null;
        const loaded = laneMiles ?? routeMiles;
        if (loaded != null && !(row.loaded_miles != null && row.loaded_miles > 0)) {
          row = { ...row, loaded_miles: loaded, line_haul_miles: loaded };
          changed = true;
        }
        // Driver pay miles = short (company practical stays on loaded_miles).
        const laneShort =
          lane &&
          lane.short_miles != null &&
          Number(lane.short_miles) > 0 &&
          !lane.short_miles_untrustworthy
            ? Number(lane.short_miles)
            : null;
        const routeShort =
          route && "shortest_miles" in route && route.shortest_miles != null && Number(route.shortest_miles) > 0
            ? Number(route.shortest_miles)
            : null;
        const short = laneShort ?? routeShort;
        if (short != null && !(row.miles_shortest != null && row.miles_shortest > 0)) {
          row = { ...row, miles_shortest: short };
          changed = true;
        }
        const dh = chainDeadheadQueries[idx]?.data;
        if (
          dh &&
          dh.source === "chain" &&
          dh.deadhead_miles != null &&
          !(row.empty_miles != null && row.empty_miles > 0)
        ) {
          row = { ...row, empty_miles: dh.deadhead_miles };
          changed = true;
        }
        return row;
      });
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- data refs change per query result
  }, [
    laneMileageQueries.map((q) => `${q.dataUpdatedAt}:${q.status}`).join(","),
    routeMileageQueries.map((q) => `${q.dataUpdatedAt}:${q.status}`).join(","),
    chainDeadheadQueries.map((q) => `${q.dataUpdatedAt}:${q.status}`).join(","),
    loads.map((l) => `${l.pickup_city}|${l.pickup_state}|${l.delivery_city}|${l.delivery_state}|${l.pickup_lat}|${l.delivery_lat}`).join(";"),
  ]);

  const laneMileageFetching = laneMileageQueries.some((q) => q.isFetching);
  const routeMileageFetching = routeMileageQueries.some((q) => q.isFetching);
  const chainDeadheadFetching = chainDeadheadQueries.some((q) => q.isFetching);
  const cityGeocodeFetching = cityGeocodeQueries.some((q) => q.isFetching);

  function addLoadRow() {
    const nextNum = nextSequentialLoadNumber(loads, peekLoadBase || "0");
    setLoads([...loads, emptyLoad(nextNum)]);
  }

  const itemsQuery = useAccountingItemsQuery({
    operatingCompanyId: companyId,
    kind: "all",
    search: itemSearch,
    enabled: open && Boolean(companyId) && !wrongEntity,
  });
  const drvItemsQuery = useAccountingItemsQuery({
    operatingCompanyId: companyId,
    kind: "all",
    search: drvItemSearch,
    enabled: open && Boolean(companyId) && !wrongEntity,
  });
  const itemOptions = useMemo(
    () => (itemsQuery.data ?? []).map((row) => ({ value: row.id, label: row.name })),
    [itemsQuery.data],
  );
  // ROUND 363-CC2-D — the account picker on every line reads the Reclassify account tree (363-CC2-A rules: the whole
  // chart, both sides, zero balances included), so a line can post to an account nothing has posted to yet.
  const today = new Date().toISOString().slice(0, 10);
  const [showAccountNumbers] = useShowAccountNumbers();
  const accountTreeQuery = useQuery({
    queryKey: ["settlement-creator-account-tree", companyId],
    queryFn: () => getReclassifyAccountTree(companyId, today, today),
    enabled: open && Boolean(companyId) && !wrongEntity,
    staleTime: 60_000,
  });
  const accountOptions = useMemo(
    () =>
      (accountTreeQuery.data?.accounts ?? [])
        .filter((a) => a.is_active && a.is_postable)
        .map((a) => ({ value: a.account_id, label: formatAccountDisplayLabel(a, { showNumber: showAccountNumbers }) })),
    [accountTreeQuery.data, showAccountNumbers],
  );
  const drvItemOptions = useMemo(
    () => (drvItemsQuery.data ?? []).map((row) => ({ value: row.id, label: row.name })),
    [drvItemsQuery.data],
  );

  const expensesMerged: ExpDraft[] = useMemo(
    () => [...companyExpenses, ...drvReimbursements],
    [companyExpenses, drvReimbursements],
  );

  /** Additional pay → BE additional_pay (extra_pay / detention_pay), never reimbursements. */
  const additionalPayForApi = useMemo(
    () =>
      additionalPay
        .filter((a) => a.amount_cents > 0)
        .map((a) => ({
          description: a.description || `${a.pay_kind ?? "other"} pay`,
          amount_cents: a.amount_cents,
          load_number: a.load_number,
          pay_kind: a.pay_kind ?? "other",
          item_id: a.item_id ?? null,
          quantity: a.quantity ?? null,
        })),
    [additionalPay],
  );

  const escrowForApi = useMemo(
    () =>
      escrow.map((e) => ({
        description: e.description,
        amount_cents:
          e.escrow_type === "release" || e.escrow_type === "forfeit"
            ? -Math.abs(e.amount_cents)
            : Math.abs(e.amount_cents),
        load_number: e.load_number,
      })),
    [escrow],
  );

  const draft: SettlementCreatorDraft | null = useMemo(() => {
    if (!companyId || !driverId) return null;
    return {
      operating_company_id: companyId,
      settlement_no: settlementNo.trim(),
      driver_id: driverId,
      unit_id: unitId,
      trailer_id: trailerId,
      trailer_equipment_number: trailerNumber.trim() || null,
      period_start: periodStart,
      period_end: periodEnd,
      loads: loads.map((l) => ({
        ...l,
        load_number: l.load_number.trim(),
        pickup_date: l.pickup_date || null,
        delivery_date: l.delivery_date || null,
        date_sent_to_factoring: l.date_sent_to_factoring || null,
        invoice_number: (l.invoice_number ?? "").trim() || null,
        join_outbound_load_number: l.join_outbound_load_number || null,
      })),
      fuel_purchases: fuels.map(({ location_id: _lid, vendor_id: _vid, ...fuel }) => fuel),
      expenses: expensesMerged.map(({ location, location_id: _lid, ...exp }) => ({
        ...exp,
        description: [location?.trim(), exp.description?.trim()].filter(Boolean).join(" · ") || exp.description,
      })),
      deductions: deductions.map((d) => ({
        description: d.description || "Deduction",
        amount_cents: d.amount_cents,
        load_number: d.load_number,
        item_id: d.item_id ?? null,
        quantity: d.quantity ?? null,
      })),
      reimbursements: [],
      additional_pay: additionalPayForApi,
      escrow: escrowForApi,
      advances: advances.map((a) => ({
        description: a.description || "Cash advance",
        amount_cents: a.amount_cents,
        load_number: a.load_number,
      })),
      admin_fee_cents: adminFeeCents > 0 ? adminFeeCents : null,
      seed_dispatched_loads: true,
      pdf_company_expenses_cents: pdfCompanyExpenses,
      pdf_driver_net_cents: pdfDriverNet,
    };
  }, [
    companyId,
    driverId,
    unitId,
    trailerId,
    trailerNumber,
    settlementNo,
    periodStart,
    periodEnd,
    loads,
    fuels,
    expensesMerged,
    deductions,
    additionalPayForApi,
    escrowForApi,
    advances,
    adminFeeCents,
    pdfCompanyExpenses,
    pdfDriverNet,
  ]);

  // RELAY-F442 — receipt/gallons×cpg is fuel net; fees_cents is the card fee (own GL line). Subtotal = both.
  const fuelSubtotal = fuels.reduce((s, f) => {
    const fee = Math.max(0, Math.round(Number(f.fees_cents || 0)));
    const net =
      f.receipt_cents != null
        ? Math.round(Number(f.receipt_cents))
        : Math.round(Number(f.gallons || 0) * Number(f.cpg_cents || 0)) -
          Math.round(Number(f.discount_cents || 0));
    const a = net + fee;
    return s + (a > 0 ? a : 0);
  }, 0);
  /**
   * OWNER DEFECT, 2026-10-02, measured live in Chrome on the Settlement Creator:
   * "I AM NOT GETTING THE TOTALS FOR EACH, FOR INVOICE TOTALS, DRIVER PAYMENT TOTALS, EXPENSES,
   *  FUEL, ETC ... SO I CAN MATCH TOTALS HERE TO TOTALS IN THE ALWAYS SETTLEMENT BEFORE I POST."
   *
   * The Loads section was the only money section rendered with NO subtotalCents at all, so the
   * invoice/line-haul total — the first number he checks against the AlwaysTrack settlement — was
   * never shown anywhere in the Creator. Every other section had one; this one was simply missed.
   */
  const loadsSubtotal = loads.reduce((s, l) => {
    const revenue = Math.max(0, Number(l.line_haul_amount_cents ?? 0));
    const accessorial = (l.accessorials ?? []).reduce((a, row) => a + Math.max(0, Number(row.amount_cents ?? 0)), 0);
    return s + revenue + accessorial;
  }, 0);
  /** Company-side driver salary (mileage pay) — short miles × rate + empty × empty rate. */
  const driverSalaryCents = loads.reduce((s, l) => {
    const payMiles = Number(l.miles_shortest ?? l.loaded_miles ?? 0);
    const rate = Number(l.line_haul_rate_cents ?? 0);
    const loadedPay = Math.round(payMiles * rate);
    const emptyMi = Number(l.empty_miles ?? 0);
    const emptyRate = Number(
      l.empty_rate_cents != null && l.empty_rate_cents > 0 ? l.empty_rate_cents : l.line_haul_rate_cents ?? 0,
    );
    const emptyPay = Math.round(emptyMi * emptyRate);
    return s + loadedPay + emptyPay;
  }, 0);
  /** ROUND 443.2 (owner 2026-10-10): "there is no quickpay that should render if confirmed those are factored."
   *  A factored load (faro_usmca / faro_transportation) never carries quick pay, and no percentage is assumed for a
   *  direct load: where a direct customer's charged quick pay comes from is an OPEN OWNER QUESTION, so nothing is
   *  computed. The field only renders while the settlement has a direct load to hold that answer. */
  const quickPayApplies = loads.some((l) => !isFactoredLoad(l.factoring));
  const compExpSubtotal = companyExpenses.reduce((s, e) => s + (e.amount_cents > 0 ? e.amount_cents : 0), 0);
  const companySubtotal = fuelSubtotal + compExpSubtotal;
  const drvReimbSubtotal = drvReimbursements.reduce((s, e) => s + (e.amount_cents > 0 ? e.amount_cents : 0), 0);
  const addPaySubtotal = additionalPay.reduce((s, e) => s + (e.amount_cents > 0 ? e.amount_cents : 0), 0);
  const dedSubtotal = deductions.reduce((s, e) => s + (e.amount_cents > 0 ? e.amount_cents : 0), 0);
  const advSubtotal = advances.reduce((s, e) => s + (e.amount_cents > 0 ? e.amount_cents : 0), 0);
  const escrowNet = escrow.reduce((s, e) => {
    const a = Math.abs(e.amount_cents);
    return s + (e.escrow_type === "release" || e.escrow_type === "forfeit" ? -a : a);
  }, 0);
  /** Live driver net — appears automatically without waiting on Preview. */
  const liveDriverNetCents =
    driverSalaryCents + addPaySubtotal + drvReimbSubtotal - dedSubtotal - adminFeeCents - advSubtotal - escrowNet;

  async function onPreview() {
    if (!draft) {
      setError("Select a driver and complete the header.");
      return;
    }
    if (!periodStart || !periodEnd) {
      setError("Start and end dates are required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await previewSettlementCreator(draft);
      setPreview(res.preview);
    } catch (e) {
      setError(String((e as Error).message || "Preview failed"));
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  const [posted, setPosted] = useState<{ label: string; documentIds: string[] } | null>(null);

  async function onPost() {
    if (!allowPost || !draft || !preview?.can_post) return;
    setBusy(true);
    setError(null);
    try {
      const res = await postSettlementCreator(draft);
      pushToast(`Settlement ${res.source_document_ref || res.display_id} posted`, "success");
      // ROUND 363-CC2-D — stay open on the posted lines so a wrong account is reclassified here, not after a hunt.
      setPosted({ label: `Settlement ${res.source_document_ref || res.display_id} posted`, documentIds: [...(res.expense_ids ?? [])] });
    } catch (e) {
      const apiErr = e as { status?: number; data?: { error?: string; message?: string }; message?: string };
      if (apiErr?.status === 409 && apiErr?.data?.error === "settlement_exists") {
        setConfirmRepostMessage(`${apiErr.data.message ?? "Settlement already exists."}\n\nEdit = void the prior settlement and all Creator companion docs, then repost. Continue?`);
        setConfirmRepostOpen(true);
        return;
      }
      setError(String((e as Error).message || "Post failed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmRepost() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const res = await postSettlementCreator({ ...draft, edit_void_repost: true });
      pushToast(
        `Settlement ${res.source_document_ref || res.display_id} voided prior + reposted`,
        "success",
      );
      setPosted({ label: `Settlement ${res.source_document_ref || res.display_id} voided prior + reposted`, documentIds: [...(res.expense_ids ?? [])] });
    } catch (retryErr) {
      setError(String((retryErr as Error).message || "Void and repost failed"));
      throw retryErr;
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <ParityDrawer
        open={open}
      onClose={onClose}
      size="xwide"
      title="Settlement Creator"
      subtitle="Company + Driver · AlwaysTrack · USMCA · Preview first"
      confirmDiscardOnClose
      isDirty={Boolean(settlementNo || driverId || loads.some((l) => l.load_number || l.pickup_city || l.customer_id))}
      onRegisterAttemptClose={registerAttemptClose}
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={() => (attemptClose ? attemptClose() : onClose())}>
            Cancel
          </Button>
          <Button type="button" size="sm" variant="secondary" disabled={busy || wrongEntity || !draft} onClick={() => void onPreview()} data-testid="sc-preview">
            Preview JE
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!allowPost || busy || wrongEntity || !preview?.can_post}
            onClick={() => void onPost()}
            data-testid="sc-post"
            title={allowPost ? undefined : "Owner posts live — use Preview until then"}
          >
            Post
          </Button>
        </div>
      }
    >
      <div className="space-y-3 text-xs" data-testid="settlement-creator-drawer">
        {posted ? (
          <WizardReclassifyPanel
            companyId={companyId}
            documentIds={posted.documentIds}
            postedLabel={posted.label}
            accountOptions={accountOptions}
            onDone={() => {
              setPosted(null);
              onClose();
            }}
          />
        ) : null}
        {wrongEntity ? (
          <p className="text-xs text-red-600" data-testid="settlement-creator-usmca-only">
            Settlement Creator is USMCA only.
          </p>
        ) : null}
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
        {seqError ? (
          <p className="text-xs text-red-600" data-testid="sc-seq-error">
            {seqError}
          </p>
        ) : null}

        {/* Shared header — one row for Company + Driver (no second name under the picker). */}
        <Section title="Header">
          <div className={headerGridClass} data-testid="sc-header-grid">
            <Field label="Settlement No.">
              <div className="flex items-center gap-1">
                <input
                  className={inputClass}
                  value={settlementNo}
                  onChange={(e) => setSettlementNo(e.target.value)}
                  placeholder="Next AlwaysTrack #"
                  title="Prefilled with the next free AlwaysTrack number. Type over it to override. (SETL-F437: no Edit button.)"
                  data-testid="sc-settlement-no"
                />
              </div>
            </Field>
            <Field label="Driver">
              <EntityPicker
                kind="driver"
                operatingCompanyId={companyId}
                value={driverId}
                selectedOption={driverId && driverLabel ? { value: driverId, label: driverLabel } : null}
                onChange={(id, opt) => {
                  setDriverId(id);
                  setDriverLabel(opt?.label ?? "");
                  ratesTouchedRef.current = false;
                }}
                allowCreate={false}
                size={pickerSize}
                className="mt-0"
                dataTestId="sc-driver"
              />
            </Field>
            <Field label="Truck">
              <EntityPicker
                kind="unit"
                operatingCompanyId={companyId}
                value={unitId}
                onChange={setUnitId}
                allowCreate={false}
                size={pickerSize}
                className="mt-0"
                dataTestId="sc-unit"
              />
            </Field>
            <Field label="Trailer">
              <EntityPicker
                kind="trailer"
                operatingCompanyId={companyId}
                value={trailerId}
                onChange={(id, opt) => {
                  setTrailerId(id);
                  setTrailerNumber(opt?.label ?? "");
                }}
                allowCreate={false}
                size={pickerSize}
                className="mt-0"
                dataTestId="sc-trailer"
              />
            </Field>
            <Field label="Start date">
              <DatePicker value={periodStart} onChange={setPeriodStart} className={inputClass} data-testid="sc-start" />
            </Field>
            <Field label="End date">
              <DatePicker value={periodEnd} onChange={setPeriodEnd} className={inputClass} data-testid="sc-end" />
            </Field>
          </div>
        </Section>

        {/* Dual columns: Company | Driver */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2" data-testid="sc-dual-columns">
          {/* COMPANY SETTLEMENT */}
          <div className="space-y-2 rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] p-2" data-testid="sc-company-column">
            <h2 className="text-center text-section-header font-bold uppercase tracking-wide text-[#4B5563]">
              Company Settlement
            </h2>

            <Section title="Loads" subtotalCents={loadsSubtotal}>
              {loads.map((load, idx) => (
                <div
                  key={idx}
                  className="border-b-2 border-[#D1D5DB] pb-3 pt-1"
                  data-testid={`sc-load-block-${idx}`}
                >
                  <div className="min-w-0 space-y-2">
                  {/* Row 1 — Load # / Customer / Trip type (owner 2026-10-07) */}
                  <div className={fieldGridClass} data-testid={`sc-load-row1-${idx}`}>
                    <Field label="Load No.">
                        <input
                          className={inputClass}
                          value={load.load_number}
                          onChange={(e) => {
                            const next = [...loads];
                            next[idx] = { ...load, load_number: e.target.value };
                            setLoads(next);
                          }}
                          title="Prefilled with the next free load number. Type over it to override — it must be a NEW number. (SETL-F437: no Edit button.)"
                          data-testid={`sc-load-number-${idx}`}
                        />
                    </Field>
                    <Field label="Customer" span={3}>
                      <EntityPicker
                        kind="customer"
                        operatingCompanyId={companyId}
                        value={load.customer_id ?? null}
                        selectedOption={
                          load.customer_id && load.customer_name
                            ? { value: load.customer_id, label: load.customer_name }
                            : null
                        }
                        onChange={(id, opt) => {
                          const next = [...loads];
                          next[idx] = {
                            ...load,
                            customer_id: id,
                            customer_name: opt?.label ?? (id ? load.customer_name : ""),
                          };
                          setLoads(next);
                        }}
                        allowCreate={false}
                        size={pickerSize}
                        className="mt-0"
                        dataTestId={`sc-load-customer-${idx}`}
                      />
                    </Field>
                    <Field label="Trip type">
                      <Combobox
                        options={[
                          { value: "NB", label: "NB" },
                          { value: "TR", label: "TR" },
                          { value: "SB", label: "SB" },
                          { value: "LOCAL", label: "LOCAL" },
                        ]}
                        value={load.trip_type ?? "NB"}
                        onChange={(v) => {
                          const next = [...loads];
                          next[idx] = { ...load, trip_type: (v ?? "") as LoadDraft["trip_type"] };
                          setLoads(next);
                        }}
                        size="sm"
                        searchIsValue
                        data-testid={`sc-load-trip-type-${idx}`}
                      />
                    </Field>
                  </div>

                  {/* Row 2 — PU/DEL dates wider (last digit visible); Customer PO smaller */}
                  <div className={fieldGridClass} data-testid={`sc-load-row2-dates-${idx}`}>
                    <Field label="Pickup date" span={2}>
                      <DatePicker
                        className={inputClass}
                        value={load.pickup_date ?? ""}
                        onChange={(v) => {
                          const next = [...loads];
                          next[idx] = { ...load, pickup_date: v };
                          setLoads(next);
                        }}
                      />
                    </Field>
                    <Field label="Delivery date" span={2}>
                      <DatePicker
                        className={inputClass}
                        value={load.delivery_date ?? ""}
                        onChange={(v) => {
                          const next = [...loads];
                          next[idx] = { ...load, delivery_date: v, not_yet_delivered: !v };
                          setLoads(next);
                        }}
                      />
                    </Field>
                    <label className="col-span-1 flex h-7 items-center justify-center gap-2 self-end rounded-sm border border-[var(--border-subtle,#E5E7EB)] bg-[var(--surface-unselected,#F8FAFC)] px-2 text-xs text-[var(--text-strong,#0F1219)]">
                      <input
                        type="checkbox"
                        checked={load.not_yet_delivered !== false && !load.delivery_date}
                        onChange={(e) => {
                          const next = [...loads];
                          next[idx] = {
                            ...load,
                            not_yet_delivered: e.target.checked,
                            delivery_date: e.target.checked ? "" : load.delivery_date,
                          };
                          setLoads(next);
                        }}
                        data-testid={`sc-not-delivered-${idx}`}
                      />
                      Not delivered
                    </label>
                  </div>
                  <div className={fieldGridClass} data-testid={`sc-load-row2b-po-${idx}`}>
                    <Field label="Customer PO #">
                      <input
                        className={inputClass}
                        value={load.customer_po_number ?? ""}
                        onChange={(e) => {
                          const next = [...loads];
                          next[idx] = { ...load, customer_po_number: e.target.value };
                          setLoads(next);
                        }}
                        title="REQUIRED — bookLoad refuses a load with no PO or W/O, and Faro matches the invoice on it"
                        data-testid={`sc-load-po-${idx}`}
                      />
                    </Field>
                    {/* ROUND 443.3 — law doc §5: empty, editable; typed wins verbatim; blank = the load number. */}
                    <Field label="Invoice no.">
                      <input
                        className={inputClass}
                        inputMode="numeric"
                        value={load.invoice_number ?? ""}
                        onChange={(e) => {
                          const next = [...loads];
                          next[idx] = { ...load, invoice_number: e.target.value.replace(/[^0-9]/g, "").slice(0, 12) };
                          setLoads(next);
                        }}
                        placeholder={load.load_number.trim() || "Load #"}
                        title="The invoice number presented to Faro / QuickBooks. Blank = the load number."
                        aria-label="Invoice number"
                        data-testid={`sc-load-invoice-no-${idx}`}
                      />
                    </Field>
                  </div>

                  {/* Stop identity — address / city / state / ZIP */}
                  <div className={fieldGridClass}>
                    <Field label="Pickup address (optional)" span={2}>
                      <AddressGeocodeInput
                        value={load.pickup_address ?? ""}
                        onChange={(v) => {
                          if (ignoreGeocodeFormattedRef.current[idx] === "pickup") {
                            ignoreGeocodeFormattedRef.current[idx] = null;
                            return;
                          }
                          setLoads((prev) => {
                            const cur = prev[idx];
                            if (!cur) return prev;
                            const next = [...prev];
                            next[idx] = { ...cur, pickup_address: v };
                            return next;
                          });
                        }}
                        onResolve={(r) => {
                          milesTouchedRef.current[idx] = false;
                          ignoreGeocodeFormattedRef.current[idx] = "pickup";
                          setLoads((prev) => {
                            const cur = prev[idx];
                            if (!cur) return prev;
                            const next = [...prev];
                            next[idx] = applyGeocodeToLoad(cur, "pickup", r);
                            return next;
                          });
                        }}
                        placeholder="Optional — pick a place to fill city/state"
                        className={inputClass}
                        dataAttrs={{ "data-testid": `sc-load-pickup-address-${idx}` }}
                      />
                    </Field>
                    <Field label="Pickup city">
                      <input
                        className={inputClass}
                        value={load.pickup_city ?? ""}
                        onChange={(e) => {
                          milesTouchedRef.current[idx] = false;
                          setLoads((prev) => {
                            const cur = prev[idx];
                            if (!cur) return prev;
                            const next = [...prev];
                            next[idx] = {
                              ...cur,
                              pickup_city: e.target.value,
                              loaded_miles: null,
                              line_haul_miles: null,
                              empty_miles: null,
                            };
                            return next;
                          });
                        }}
                        data-testid={`sc-load-pickup-city-${idx}`}
                      />
                    </Field>
                    <Field label="Pickup state">
                      <StateSelect
                        value={load.pickup_state ?? ""}
                        onChange={(code) => {
                          milesTouchedRef.current[idx] = false;
                          setLoads((prev) => {
                            const cur = prev[idx];
                            if (!cur) return prev;
                            const next = [...prev];
                            next[idx] = {
                              ...cur,
                              pickup_state: code,
                              loaded_miles: null,
                              line_haul_miles: null,
                              empty_miles: null,
                            };
                            return next;
                          });
                        }}
                        placeholder="State"
                      />
                      <span className="sr-only" data-testid={`sc-load-pickup-state-${idx}`}>
                        {load.pickup_state}
                      </span>
                    </Field>
                    <Field label="Pickup ZIP">
                      <input
                        className={inputClass}
                        value={load.pickup_zip ?? ""}
                        onChange={(e) => {
                          setLoads((prev) => {
                            const cur = prev[idx];
                            if (!cur) return prev;
                            const next = [...prev];
                            next[idx] = { ...cur, pickup_zip: e.target.value };
                            return next;
                          });
                        }}
                        data-testid={`sc-load-pickup-zip-${idx}`}
                      />
                    </Field>
                    <span />
                  </div>
                  <div className={fieldGridClass}>
                    <Field label="Delivery address (optional)" span={2}>
                      <AddressGeocodeInput
                        value={load.delivery_address ?? ""}
                        onChange={(v) => {
                          if (ignoreGeocodeFormattedRef.current[idx] === "delivery") {
                            ignoreGeocodeFormattedRef.current[idx] = null;
                            return;
                          }
                          setLoads((prev) => {
                            const cur = prev[idx];
                            if (!cur) return prev;
                            const next = [...prev];
                            next[idx] = { ...cur, delivery_address: v };
                            return next;
                          });
                        }}
                        onResolve={(r) => {
                          milesTouchedRef.current[idx] = false;
                          ignoreGeocodeFormattedRef.current[idx] = "delivery";
                          setLoads((prev) => {
                            const cur = prev[idx];
                            if (!cur) return prev;
                            const next = [...prev];
                            next[idx] = applyGeocodeToLoad(cur, "delivery", r);
                            return next;
                          });
                        }}
                        placeholder="Optional — pick a place to fill city/state"
                        className={inputClass}
                        dataAttrs={{ "data-testid": `sc-load-delivery-address-${idx}` }}
                      />
                    </Field>
                    <Field label="Delivery city">
                      <input
                        className={inputClass}
                        value={load.delivery_city ?? ""}
                        onChange={(e) => {
                          milesTouchedRef.current[idx] = false;
                          setLoads((prev) => {
                            const cur = prev[idx];
                            if (!cur) return prev;
                            const next = [...prev];
                            next[idx] = {
                              ...cur,
                              delivery_city: e.target.value,
                              loaded_miles: null,
                              line_haul_miles: null,
                            };
                            return next;
                          });
                        }}
                        data-testid={`sc-load-delivery-city-${idx}`}
                      />
                    </Field>
                    <Field label="Delivery state">
                      <StateSelect
                        value={load.delivery_state ?? ""}
                        onChange={(code) => {
                          milesTouchedRef.current[idx] = false;
                          setLoads((prev) => {
                            const cur = prev[idx];
                            if (!cur) return prev;
                            const next = [...prev];
                            next[idx] = {
                              ...cur,
                              delivery_state: code,
                              loaded_miles: null,
                              line_haul_miles: null,
                            };
                            return next;
                          });
                        }}
                        placeholder="State"
                      />
                      <span className="sr-only" data-testid={`sc-load-delivery-state-${idx}`}>
                        {load.delivery_state}
                      </span>
                    </Field>
                    <Field label="Delivery ZIP">
                      <input
                        className={inputClass}
                        value={load.delivery_zip ?? ""}
                        onChange={(e) => {
                          setLoads((prev) => {
                            const cur = prev[idx];
                            if (!cur) return prev;
                            const next = [...prev];
                            next[idx] = { ...cur, delivery_zip: e.target.value };
                            return next;
                          });
                        }}
                        data-testid={`sc-load-delivery-zip-${idx}`}
                      />
                    </Field>
                    <span />
                  </div>

                  {/* Company miles = practical; Short mi = driver pay (different). Rate autofills from driver card. */}
                  <div className={fieldGridClass} data-testid={`sc-load-miles-money-${idx}`}>
                    <Field label="Loaded mi (co)">
                      <DecimalNumberInput
                        className={inputClass}
                        value={load.loaded_miles}
                        onChange={(n) => {
                          milesTouchedRef.current[idx] = true;
                          setLoads((prev) => {
                            const cur = prev[idx];
                            if (!cur) return prev;
                            const next = [...prev];
                            next[idx] = { ...cur, loaded_miles: n };
                            return next;
                          });
                        }}
                        title={
                          laneMileageFetching || routeMileageFetching || cityGeocodeFetching
                            ? "Looking up loaded miles…"
                            : !load.pickup_city || !load.pickup_state || !load.delivery_city || !load.delivery_state
                              ? "Set pickup + delivery city and state — miles fill from lane DB, else route engine"
                              : "Company practical miles — different from driver short pay miles"
                        }
                        data-testid={`sc-load-loaded-miles-${idx}`}
                        ariaLabel="Company loaded miles"
                      />
                    </Field>
                    <Field label="Short mi (pay)">
                      <DecimalNumberInput
                        className={inputClass}
                        value={load.miles_shortest}
                        onChange={(n) => {
                          milesTouchedRef.current[idx] = true;
                          setLoads((prev) => {
                            const cur = prev[idx];
                            if (!cur) return prev;
                            const next = [...prev];
                            next[idx] = { ...cur, miles_shortest: n };
                            return next;
                          });
                        }}
                        title="Driver pay miles (short) — company practical miles stay on Loaded mi"
                        data-testid={`sc-load-short-miles-${idx}`}
                        ariaLabel="Driver short miles"
                      />
                    </Field>
                    <Field label="Empty mi">
                      <DecimalNumberInput
                        className={inputClass}
                        value={load.empty_miles}
                        onChange={(n) => {
                          milesTouchedRef.current[idx] = true;
                          setLoads((prev) => {
                            const cur = prev[idx];
                            if (!cur) return prev;
                            const next = [...prev];
                            next[idx] = { ...cur, empty_miles: n };
                            return next;
                          });
                        }}
                        title={
                          !unitId
                            ? "Pick a unit — empty miles fill from that truck's last delivery → this pickup"
                            : !load.pickup_city || !load.pickup_state
                              ? "Set pickup city + state — empty miles use this truck's last delivery → pickup"
                              : chainDeadheadFetching
                                ? "Looking up this unit's last delivery…"
                                : "Filled from this truck's last delivery → this pickup (chain deadhead)"
                        }
                        data-testid={`sc-load-empty-miles-${idx}`}
                        ariaLabel="Empty miles"
                      />
                    </Field>
                    <Field label="Pay $/mi">
                      <MoneyInput
                        className={moneyInputClass}
                        valueCents={load.line_haul_rate_cents}
                        onChangeCents={(cents) => {
                          ratesTouchedRef.current = true;
                          const next = [...loads];
                          next[idx] = { ...load, line_haul_rate_cents: cents };
                          setLoads(next);
                        }}
                        ariaLabel="Driver pay rate per mile"
                      />
                    </Field>
                    <Field label="Invoice Amt">
                      <MoneyInput
                        className={moneyInputClass}
                        valueCents={load.line_haul_amount_cents}
                        onChangeCents={(cents) => {
                          const next = [...loads];
                          next[idx] = { ...load, line_haul_amount_cents: cents };
                          setLoads(next);
                        }}
                        ariaLabel="Invoice amount"
                      />
                    </Field>
                  </div>
                  <div className={fieldGridClass} data-testid={`sc-load-empty-rate-${idx}`}>
                    <Field label="Empty $/mi">
                      <MoneyInput
                        className={moneyInputClass}
                        valueCents={load.empty_rate_cents}
                        onChangeCents={(cents) => {
                          ratesTouchedRef.current = true;
                          const next = [...loads];
                          next[idx] = { ...load, empty_rate_cents: cents };
                          setLoads(next);
                        }}
                        ariaLabel="Empty miles rate"
                      />
                    </Field>
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>

                  <div className={fieldGridClass}>
                    <Field label="Accessorial item" span={2}>
                      <input
                        className={inputClass}
                        value={load.accessorials?.[0]?.item_name ?? ""}
                        onChange={(e) => {
                          const next = [...loads];
                          const acc = [...(load.accessorials ?? [])];
                          const row = acc[0] ?? { item_name: "", amount_cents: 0, description: null };
                          acc[0] = { ...row, item_name: e.target.value };
                          next[idx] = { ...load, accessorials: acc.filter((a) => a.item_name || a.amount_cents > 0) };
                          setLoads(next);
                        }}
                        placeholder="Detention / layover…"
                        data-testid={`sc-accessorial-item-${idx}`}
                      />
                    </Field>
                    <Field label="Accessorial $">
                      <MoneyInput
                        className={moneyInputClass}
                        valueCents={load.accessorials?.[0]?.amount_cents || null}
                        onChangeCents={(cents) => {
                          const next = [...loads];
                          const acc = [...(load.accessorials ?? [])];
                          const row = acc[0] ?? { item_name: "Accessorial", amount_cents: 0, description: null };
                          acc[0] = { ...row, amount_cents: cents ?? 0, item_name: row.item_name || "Accessorial" };
                          next[idx] = { ...load, accessorials: (cents ?? 0) > 0 || row.item_name ? acc : [] };
                          setLoads(next);
                        }}
                        ariaLabel="Accessorial amount"
                      />
                    </Field>
                    <Field label="Factoring" span={2}>
                      <Combobox
                        options={[
                          { value: "faro_usmca", label: "Faro USMCA" },
                          { value: "direct", label: "None (direct)" },
                          { value: "faro_transportation", label: "Faro Transportation" },
                        ]}
                        value={load.factoring}
                        onChange={(v) => {
                          const next = [...loads];
                          next[idx] = { ...load, factoring: (v ?? "") as SettlementCreatorFactorOption };
                          setLoads(next);
                        }}
                        size="sm"
                        searchIsValue
                      />
                    </Field>
                  </div>
                  </div>
                  <ItemUnderRail
                    addLabel="+ Add load"
                    addTestId={idx === loads.length - 1 ? "sc-loads-add" : undefined}
                    onAdd={idx === loads.length - 1 ? addLoadRow : undefined}
                    removeLabel="Remove load"
                    removeTestId={`sc-load-remove-${idx}`}
                    onRemove={loads.length > 1 ? () => setLoads(loads.filter((_, i) => i !== idx)) : undefined}
                  />
                </div>
              ))}
            </Section>

            <Section title="Fuel purchases" subtotalCents={fuelSubtotal}>
              {fuels.map((fuel, idx) => {
                const needsLoad = fuelNeedsExplicitLoadNumber(fuel.date, loads);
                const addFuelAfter = () => {
                  const date = periodStart || emptyFuel().date;
                  const auto = fuelNeedsExplicitLoadNumber(date, loads)
                    ? ""
                    : autoLoadNumberForExpenseDate(date, loads) || defaultLoadNumber;
                  setFuels([
                    ...fuels,
                    {
                      ...emptyFuel(),
                      load_number: auto,
                      date,
                    },
                  ]);
                };
                return (
                  <div
                    key={idx}
                    className="border-b border-[#D1D5DB] pb-2 pt-2"
                    data-testid={`sc-fuel-block-${idx}`}
                  >
                    <div className={`${fieldGridClass} min-w-0`}>
                    <Field label="Date">
                        <DatePicker
                          className={inputClass}
                          value={fuel.date}
                          onChange={(v) => {
                            const next = [...fuels];
                            const auto = fuelNeedsExplicitLoadNumber(v, loads)
                              ? next[idx].load_number
                              : autoLoadNumberForExpenseDate(v, loads) || next[idx].load_number;
                            next[idx] = { ...fuel, date: v, load_number: auto ?? "" };
                            setFuels(next);
                          }}
                        />
                    </Field>
                    {needsLoad ? (
                      <Field label="Load No. / Assign to">
                        <input
                          className={inputClass}
                          value={fuel.load_number ?? ""}
                          onChange={(e) => {
                            const next = [...fuels];
                            next[idx] = { ...fuel, load_number: e.target.value };
                            setFuels(next);
                          }}
                          placeholder="Required — same-day PU & DEL"
                          title="Pickup and delivery are the same day as this fuel — pick which load"
                          data-testid={`sc-fuel-load-${idx}`}
                        />
                      </Field>
                    ) : (
                      <Field label="Load (auto by date)">
                        <input
                          className={`${inputClass} bg-[#F7F8FA] text-[#6B7280]`}
                          value={fuel.load_number ? String(fuel.load_number) : "— auto from date"}
                          readOnly
                          title="Assigned from fuel date vs load pickup–delivery window"
                          data-testid={`sc-fuel-load-auto-${idx}`}
                        />
                      </Field>
                    )}
                    <Field label="Fuel" span={2}>
                      <Combobox
                        options={[
                          { value: "diesel", label: "Truck diesel" },
                          { value: "reefer_diesel", label: "Reefer Diesel" },
                          { value: "def", label: "DEF" },
                        ]}
                        value={fuel.fuel_type ?? "diesel"}
                        onChange={(v) => {
                          const next = [...fuels];
                          next[idx] = { ...fuel, fuel_type: (v ?? "") as "diesel" | "def" | "reefer_diesel" };
                          setFuels(next);
                        }}
                        size="sm"
                        searchIsValue
                        data-testid={`sc-fuel-type-${idx}`}
                      />
                    </Field>
                    <Field label="Invoice #">
                      <input
                        className={inputClass}
                        value={fuel.invoice ?? ""}
                        onChange={(e) => {
                          const next = [...fuels];
                          next[idx] = { ...fuel, invoice: e.target.value };
                          setFuels(next);
                        }}
                        data-testid={`sc-fuel-invoice-${idx}`}
                      />
                    </Field>
                    <Field label="Vendor" span={2}>
                      <EntityPicker
                        kind="vendor"
                        operatingCompanyId={companyId}
                        value={fuel.vendor_id ?? null}
                        onChange={(id, opt) => {
                          const next = [...fuels];
                          next[idx] = {
                            ...fuel,
                            vendor_id: id,
                            vendor_name: opt?.label ?? fuel.vendor_name,
                          };
                          setFuels(next);
                        }}
                        allowCreate={false}
                        size={pickerSize}
                        className="mt-0"
                        dataTestId={`sc-fuel-vendor-${idx}`}
                        placeholder="Search vendor (LOVES)…"
                      />
                    </Field>
                    <Field label="Location" span={3}>
                      <FuelStopLocationPicker
                        operatingCompanyId={companyId}
                        value={fuel.location_id ?? null}
                        dataTestId={`sc-fuel-location-${idx}`}
                        onChange={(id, loc) => {
                          const next = [...fuels];
                          const label = loc ? formatFuelStopLocationLabel(loc) : "";
                          const lovesCode = loc?.location_code?.toUpperCase().startsWith("LOVES-");
                          next[idx] = {
                            ...fuel,
                            location_id: id,
                            location: label,
                            vendor_name:
                              lovesCode && !(fuel.vendor_name ?? "").trim() ? "LOVES" : fuel.vendor_name,
                          };
                          setFuels(next);
                        }}
                      />
                    </Field>
                    {/* U25 — reefer diesel is its own fuel (out of IFTA, counted for the federal reefer-fuel credit). */}
                    <Field label={fuel.fuel_type === "def" ? "DEF gal" : "Gallons"}>
                      <DecimalNumberInput
                        className={inputClass}
                        value={fuel.gallons > 0 ? fuel.gallons : null}
                        allowZero={false}
                        onChange={(n) => {
                          const next = [...fuels];
                          next[idx] = { ...fuel, gallons: n ?? 0 };
                          setFuels(next);
                        }}
                        ariaLabel="Gallons"
                        title="Diesel / reefer / DEF gallons — decimals allowed (e.g. 45.123)"
                        data-testid={`sc-fuel-gallons-${idx}`}
                      />
                    </Field>
                    <Field label={fuel.fuel_type === "def" ? "DEF $/gal" : "CPG"}>
                      <MoneyInput
                        className={moneyInputClass}
                        valueCents={fuel.cpg_cents > 0 ? fuel.cpg_cents : null}
                        onChangeCents={(c) => {
                          const next = [...fuels];
                          next[idx] = { ...fuel, cpg_cents: c ?? 0 };
                          setFuels(next);
                        }}
                        ariaLabel="Cents per gallon"
                      />
                    </Field>
                    <Field label="Card">
                      <Combobox
                        options={[
                          { value: "dreamline", label: "Dreamline" },
                          { value: "relay", label: "Relay" },
                        ]}
                        value={fuel.card}
                        onChange={(v) => {
                          const next = [...fuels];
                          next[idx] = { ...fuel, card: (v ?? "") as SettlementCreatorFuelCard };
                          setFuels(next);
                        }}
                        size="sm"
                        searchIsValue
                      />
                    </Field>
                    <Field label="Receipt file">
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        className="h-7 w-full min-w-0 text-xs text-[var(--text-strong,#0F1219)] file:mr-2 file:h-7 file:rounded-sm file:border file:border-[var(--border-subtle,#E5E7EB)] file:bg-[var(--surface-unselected,#F8FAFC)] file:px-2 file:text-xs"
                        title={fuel.source_doc_id ? "Receipt attached — choose another file to replace it" : "Attach the receipt image or PDF for this fill"}
                        onChange={async (e) => {
                          const file = e.target.files?.[0] ?? null;
                          if (!file || !companyId) return;
                          try {
                            const fileId = await uploadSourceDocumentFromFile(file, {
                              operating_company_id: companyId,
                              // Only parents that already exist may be linked here — never the
                              // fuel row, which Post has not created yet.
                              entity_links: [
                                ...(driverId ? [{ entity_type: "driver" as const, entity_id: driverId }] : []),
                                ...(unitId ? [{ entity_type: "unit" as const, entity_id: unitId }] : []),
                              ],
                            });
                            const next = [...fuels];
                            next[idx] = { ...next[idx], source_doc_id: fileId };
                            setFuels(next);
                          } catch (err) {
                            pushToast(`Receipt upload failed — ${(err as Error).message}. The fill is unchanged; try again.`, "error");
                            e.target.value = "";
                          }
                        }}
                        data-testid={`sc-fuel-receipt-file-${idx}`}
                      />
                    </Field>
                    <Field label="Receipt" span={1}>
                      <MoneyInput
                        className={moneyInputClass}
                        valueCents={fuel.receipt_cents ?? null}
                        onChangeCents={(c) => {
                          const next = [...fuels];
                          next[idx] = { ...fuel, receipt_cents: c };
                          setFuels(next);
                        }}
                        ariaLabel="Fuel receipt"
                      />
                    </Field>
                    {/* Load # only when same-day PU+DEL+expense — else auto by date */}
                    <LineCoding
                      companyId={companyId}
                      line={fuel}
                      testIdPrefix={`sc-fuel-${idx}`}
                      accountOptions={accountOptions}
                      accountsLoading={accountTreeQuery.isLoading}
                      showLoad={false}
                      itemSpan={2}
                      item={{
                        options: itemOptions,
                        loading: itemsQuery.isLoading,
                        onSearch: setItemSearch,
                        placeholder: "Fuel item (blank = by fuel type)",
                      }}
                      onPatch={(patch) => {
                        const next = [...fuels];
                        next[idx] = { ...fuel, ...patch };
                        setFuels(next);
                      }}
                    />
                    </div>
                    <ItemUnderRail
                      addLabel="+ Add fuel"
                      addTestId={idx === fuels.length - 1 ? "sc-fuels-add" : undefined}
                      onAdd={idx === fuels.length - 1 ? addFuelAfter : undefined}
                      removeLabel="Remove fuel"
                      removeTestId={`sc-fuel-remove-${idx}`}
                      onRemove={() => setFuels(fuels.filter((_, i) => i !== idx))}
                    />
                  </div>
                );
              })}
              {fuels.length === 0 ? (
                <EmptyUnderAdd
                  testId="sc-fuels-add"
                  label="+ Add fuel"
                  onClick={() => {
                    const date = periodStart || emptyFuel().date;
                    const auto = fuelNeedsExplicitLoadNumber(date, loads)
                      ? ""
                      : autoLoadNumberForExpenseDate(date, loads) || defaultLoadNumber;
                    setFuels([
                      {
                        ...emptyFuel(),
                        load_number: auto,
                        date,
                      },
                    ]);
                  }}
                />
              ) : null}
            </Section>

            <Section title="Company expenses" subtotalCents={compExpSubtotal}>
              <p className="text-center text-xs text-[#6B7280]">
                PDF &quot;Comp.&quot; — credits the fuel card rail (never A/P)
              </p>
              {companyExpenses.map((exp, idx) => {
                const addCompExp = () => {
                  const date = periodStart || emptyCompExp().date;
                  const auto = fuelNeedsExplicitLoadNumber(date, loads)
                    ? ""
                    : autoLoadNumberForExpenseDate(date, loads) || defaultLoadNumber;
                  setCompanyExpenses([
                    ...companyExpenses,
                    {
                      ...emptyCompExp(),
                      load_number: auto,
                      date,
                    },
                  ]);
                };
                return (
                <div key={idx} className="border-b border-[#D1D5DB] pb-2 pt-2" data-testid={`sc-comp-exp-block-${idx}`}>
                  <div className={`${fieldGridClass} min-w-0`}>
                  <Field label="Date">
                    <DatePicker
                      className={inputClass}
                      value={exp.date}
                      onChange={(v) => {
                        const next = [...companyExpenses];
                        next[idx] = { ...exp, date: v };
                        setCompanyExpenses(next);
                      }}
                    />
                  </Field>
                  <Field label="Item">
                    <ReferenceSelect
                      value={exp.item_id ?? null}
                      onChange={(id) => {
                        const opt = itemOptions.find((o) => o.value === id);
                        const next = [...companyExpenses];
                        next[idx] = {
                          ...exp,
                          item_id: id,
                          item_name: opt?.label ?? (id ? exp.item_name : ""),
                        };
                        setCompanyExpenses(next);
                      }}
                      options={itemOptions}
                      createKind="item"
                      operatingCompanyId={companyId}
                      placeholder={itemsQuery.isLoading ? "Loading items…" : "Search Comp. Exp. item…"}
                      loading={itemsQuery.isLoading}
                      addNewLabel="+ Add new item"
                      onSearch={(q) => setItemSearch(q)}
                      onOptionCreated={(opt) => {
                        const next = [...companyExpenses];
                        next[idx] = { ...exp, item_id: opt.value, item_name: opt.label };
                        setCompanyExpenses(next);
                        void itemsQuery.refetch();
                      }}
                    />
                  </Field>
                  <Field label="Amount">
                    <MoneyInput
                      className={moneyInputClass}
                      valueCents={exp.amount_cents || null}
                      onChangeCents={(c) => {
                        const next = [...companyExpenses];
                        next[idx] = { ...exp, amount_cents: c ?? 0 };
                        setCompanyExpenses(next);
                      }}
                      ariaLabel="Company expense amount"
                    />
                  </Field>
                  <Field label="Card">
                    <Combobox
                      options={[
                        { value: "dreamline", label: "Dreamline" },
                        { value: "relay", label: "Relay" },
                      ]}
                      value={exp.card ?? "relay"}
                      onChange={(v) => {
                        const next = [...companyExpenses];
                        next[idx] = { ...exp, card: (v ?? "") as SettlementCreatorFuelCard };
                        setCompanyExpenses(next);
                      }}
                      size="sm"
                      searchIsValue
                    />
                  </Field>
                  <LineCoding
                    companyId={companyId}
                    line={exp}
                    testIdPrefix={`sc-comp-exp-${idx}`}
                    accountOptions={accountOptions}
                    accountsLoading={accountTreeQuery.isLoading}
                    onPatch={(patch) => {
                      const next = [...companyExpenses];
                      next[idx] = { ...exp, ...patch };
                      setCompanyExpenses(next);
                    }}
                  />
                  <Field label="Location">
                    <FuelStopLocationPicker
                      operatingCompanyId={companyId}
                      value={exp.location_id ?? null}
                      dataTestId={`sc-comp-location-${idx}`}
                      onChange={(id, loc) => {
                        const next = [...companyExpenses];
                        next[idx] = {
                          ...exp,
                          location_id: id,
                          location: loc ? formatFuelStopLocationLabel(loc) : "",
                        };
                        setCompanyExpenses(next);
                      }}
                    />
                  </Field>
                  </div>
                  <ItemUnderRail
                    addLabel="+ Add expense"
                    addTestId={idx === companyExpenses.length - 1 ? "sc-comp-exp-add" : undefined}
                    onAdd={idx === companyExpenses.length - 1 ? addCompExp : undefined}
                    removeLabel="Remove expense"
                    removeTestId={`sc-comp-exp-remove-${idx}`}
                    onRemove={() => setCompanyExpenses(companyExpenses.filter((_, i) => i !== idx))}
                  />
                </div>
              );
              })}
              {companyExpenses.length === 0 ? (
                <EmptyUnderAdd
                  testId="sc-comp-exp-add"
                  label="+ Add expense"
                  onClick={() => {
                    const date = periodStart || emptyCompExp().date;
                    const auto = fuelNeedsExplicitLoadNumber(date, loads)
                      ? ""
                      : autoLoadNumberForExpenseDate(date, loads) || defaultLoadNumber;
                    setCompanyExpenses([
                      {
                        ...emptyCompExp(),
                        load_number: auto,
                        date,
                      },
                    ]);
                  }}
                />
              ) : null}
            </Section>

            <Section title="Control totals · Company" pdfCents={pdfCompanyExpenses} subtotalCents={companySubtotal}>
              <div className={fieldGridClass} data-testid="sc-company-pay-summary">
                <Field label="Driver salary" span={2}>
                  <div data-testid="sc-driver-salary">
                    <MoneyInput
                      className={moneyInputClass}
                      valueCents={driverSalaryCents || null}
                      onChangeCents={() => undefined}
                      ariaLabel="Driver salary (short miles × rate)"
                      disabled
                    />
                  </div>
                </Field>
                {quickPayApplies ? (
                  <Field label="QuickPay expense" span={2}>
                    <div data-testid="sc-quickpay-expense" title="Direct loads only — amount source pending the owner's ruling">
                      <MoneyInput
                        className={moneyInputClass}
                        valueCents={null}
                        onChangeCents={() => undefined}
                        ariaLabel="QuickPay expense (direct loads only)"
                        disabled
                      />
                    </div>
                  </Field>
                ) : (
                  <span />
                )}
                <span />
              </div>
              <Field label="PDF company EXPENSES total">
                <div data-testid="sc-pdf-company">
                  <MoneyInput
                    className={moneyInputClass}
                    valueCents={pdfCompanyExpenses || null}
                    onChangeCents={(c) => setPdfCompanyExpenses(c ?? 0)}
                    ariaLabel="PDF company expenses"
                  />
                </div>
              </Field>
            </Section>
          </div>

          {/* DRIVER SETTLEMENT */}
          <div className="space-y-2 rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] p-2" data-testid="sc-driver-column">
            <h2 className="text-center text-section-header font-bold uppercase tracking-wide text-[#4B5563]">
              Driver Settlement
            </h2>

            {/* Driver pay miles (short) + empty + rate — editable; company practical miles stay on Company side. */}
            <Section title="Loads carried from company" subtotalCents={driverSalaryCents}>
              <p className="text-center text-xs text-[#6B7280]">
                Short / empty miles + pay $/mi are editable here (driver short miles ≠ company practical)
              </p>
              {loads.map((load, idx) => (
                <div
                  key={idx}
                  className={`${fieldGridClass} border-b-2 border-[#D1D5DB] pb-2 pt-1`}
                  data-testid={`sc-drv-carry-load-${idx}`}
                >
                  <Field label="Load No.">
                    <input className={`${inputClass} bg-[#F7F8FA]`} value={load.load_number || "—"} readOnly />
                  </Field>
                  <Field label="Pickup date">
                    <input className={`${inputClass} bg-[#F7F8FA]`} value={load.pickup_date || "—"} readOnly />
                  </Field>
                  <Field label="Short mi (pay)">
                    <DecimalNumberInput
                      className={inputClass}
                      value={load.miles_shortest}
                      onChange={(n) => {
                        milesTouchedRef.current[idx] = true;
                        setLoads((prev) => {
                          const cur = prev[idx];
                          if (!cur) return prev;
                          const next = [...prev];
                          next[idx] = { ...cur, miles_shortest: n };
                          return next;
                        });
                      }}
                      title="Driver pay miles (short) — edit here; company Loaded mi stays on Company Settlement"
                      data-testid={`sc-drv-short-miles-${idx}`}
                      ariaLabel="Driver short miles"
                    />
                  </Field>
                  <Field label="Empty mi">
                    <DecimalNumberInput
                      className={inputClass}
                      value={load.empty_miles}
                      onChange={(n) => {
                        milesTouchedRef.current[idx] = true;
                        setLoads((prev) => {
                          const cur = prev[idx];
                          if (!cur) return prev;
                          const next = [...prev];
                          next[idx] = { ...cur, empty_miles: n };
                          return next;
                        });
                      }}
                      data-testid={`sc-drv-empty-miles-${idx}`}
                      ariaLabel="Driver empty miles"
                    />
                  </Field>
                  <Field label="Pay $/mi">
                    <div data-testid={`sc-drv-pay-rate-${idx}`}>
                      <MoneyInput
                        className={moneyInputClass}
                        valueCents={load.line_haul_rate_cents}
                        onChangeCents={(cents) => {
                          ratesTouchedRef.current = true;
                          setLoads((prev) => {
                            const cur = prev[idx];
                            if (!cur) return prev;
                            const next = [...prev];
                            next[idx] = { ...cur, line_haul_rate_cents: cents };
                            return next;
                          });
                        }}
                        ariaLabel="Driver pay rate"
                      />
                    </div>
                  </Field>
                </div>
              ))}
            </Section>

            <Section title="Driver-paid reimbursements" subtotalCents={drvReimbSubtotal}>
              <p className="text-center text-xs text-[#6B7280]">
                PDF &quot;Drv&quot; — Cr 2175 Driver Reimbursements Payable (never 6890/5310)
              </p>
              {drvReimbursements.map((exp, idx) => {
                const addDrvReimb = () =>
                  setDrvReimbursements([
                    ...drvReimbursements,
                    {
                      ...emptyDrvReimb(),
                      load_number: defaultLoadNumber,
                      date: periodStart || emptyDrvReimb().date,
                    },
                  ]);
                return (
                <div key={idx} className="border-b border-[#D1D5DB] pb-2 pt-2" data-testid={`sc-drv-reimb-block-${idx}`}>
                  <div className={`${fieldGridClass} min-w-0`}>
                  <Field label="Date">
                    <DatePicker
                      className={inputClass}
                      value={exp.date}
                      onChange={(v) => {
                        const next = [...drvReimbursements];
                        next[idx] = { ...exp, date: v };
                        setDrvReimbursements(next);
                      }}
                    />
                  </Field>
                  <Field label="Item">
                    <ReferenceSelect
                      value={exp.item_id ?? null}
                      onChange={(id) => {
                        const opt = drvItemOptions.find((o) => o.value === id);
                        const next = [...drvReimbursements];
                        next[idx] = {
                          ...exp,
                          item_id: id,
                          item_name: opt?.label ?? (id ? exp.item_name : ""),
                        };
                        setDrvReimbursements(next);
                      }}
                      options={drvItemOptions}
                      createKind="item"
                      operatingCompanyId={companyId}
                      placeholder={drvItemsQuery.isLoading ? "Loading items…" : "Search Drv item…"}
                      loading={drvItemsQuery.isLoading}
                      addNewLabel="+ Add new item"
                      onSearch={(q) => setDrvItemSearch(q)}
                      onOptionCreated={(opt) => {
                        const next = [...drvReimbursements];
                        next[idx] = { ...exp, item_id: opt.value, item_name: opt.label };
                        setDrvReimbursements(next);
                        void drvItemsQuery.refetch();
                      }}
                    />
                  </Field>
                  <Field label="Amount">
                    <MoneyInput
                      className={moneyInputClass}
                      valueCents={exp.amount_cents || null}
                      onChangeCents={(c) => {
                        const next = [...drvReimbursements];
                        next[idx] = { ...exp, amount_cents: c ?? 0 };
                        setDrvReimbursements(next);
                      }}
                      ariaLabel="Driver reimbursement"
                    />
                  </Field>
                  <LineCoding
                    companyId={companyId}
                    line={exp}
                    testIdPrefix={`sc-drv-reimb-${idx}`}
                    accountOptions={accountOptions}
                    accountsLoading={accountTreeQuery.isLoading}
                    onPatch={(patch) => {
                      const next = [...drvReimbursements];
                      next[idx] = { ...exp, ...patch };
                      setDrvReimbursements(next);
                    }}
                  />
                  <Field label="Location">
                    <FuelStopLocationPicker
                      operatingCompanyId={companyId}
                      value={exp.location_id ?? null}
                      dataTestId={`sc-drv-location-${idx}`}
                      onChange={(id, loc) => {
                        const next = [...drvReimbursements];
                        next[idx] = {
                          ...exp,
                          location_id: id,
                          location: loc ? formatFuelStopLocationLabel(loc) : "",
                        };
                        setDrvReimbursements(next);
                      }}
                    />
                  </Field>
                  </div>
                  <ItemUnderRail
                    addLabel="+ Add reimbursement"
                    addTestId={idx === drvReimbursements.length - 1 ? "sc-drv-reimb-add" : undefined}
                    onAdd={idx === drvReimbursements.length - 1 ? addDrvReimb : undefined}
                    removeLabel="Remove reimbursement"
                    removeTestId={`sc-drv-reimb-remove-${idx}`}
                    onRemove={() => setDrvReimbursements(drvReimbursements.filter((_, i) => i !== idx))}
                  />
                </div>
              );
              })}
              {drvReimbursements.length === 0 ? (
                <EmptyUnderAdd
                  testId="sc-drv-reimb-add"
                  label="+ Add reimbursement"
                  onClick={() =>
                    setDrvReimbursements([
                      {
                        ...emptyDrvReimb(),
                        load_number: defaultLoadNumber,
                        date: periodStart || emptyDrvReimb().date,
                      },
                    ])
                  }
                />
              ) : null}
            </Section>

            <Section title="Additional pay to driver" subtotalCents={addPaySubtotal}>
              <p className="text-center text-xs text-[#6B7280]">
                Item from the real product/service catalog (detention, layover, bonus, stop pay…)
              </p>
              {additionalPay.map((row, idx) => (
                <div key={idx} className="border-b border-[#D1D5DB] pb-2 pt-2" data-testid={`sc-add-pay-block-${idx}`}>
                  <div className={`${fieldGridClass} min-w-0`}>
                  <Field label="Item / product" span={2}>
                    <ReferenceSelect
                      value={row.item_id ?? null}
                      onChange={(id) => {
                        const opt = drvItemOptions.find((o) => o.value === id);
                        const next = [...additionalPay];
                        next[idx] = {
                          ...row,
                          item_id: id,
                          description: opt?.label ?? (id ? row.description : row.description),
                          pay_kind: row.pay_kind ?? "other",
                        };
                        setAdditionalPay(next);
                      }}
                      options={drvItemOptions}
                      createKind="item"
                      operatingCompanyId={companyId}
                      placeholder={drvItemsQuery.isLoading ? "Loading items…" : "Search additional pay item…"}
                      loading={drvItemsQuery.isLoading}
                      addNewLabel="+ Add new item"
                      onSearch={(q) => setDrvItemSearch(q)}
                      onOptionCreated={(opt) => {
                        const next = [...additionalPay];
                        next[idx] = { ...row, item_id: opt.value, description: opt.label, pay_kind: "other" };
                        setAdditionalPay(next);
                        void drvItemsQuery.refetch();
                      }}
                    />
                  </Field>
                  <Field label="Qty">
                    <DecimalNumberInput
                      className={inputClass}
                      value={row.quantity ?? null}
                      onChange={(n) => {
                        const next = [...additionalPay];
                        next[idx] = { ...row, quantity: n };
                        setAdditionalPay(next);
                      }}
                      ariaLabel="Additional pay quantity"
                      data-testid={`sc-add-pay-qty-${idx}`}
                    />
                  </Field>
                  <Field label="Amount">
                    <MoneyInput
                      className={moneyInputClass}
                      valueCents={row.amount_cents || null}
                      onChangeCents={(c) => {
                        const next = [...additionalPay];
                        next[idx] = { ...row, amount_cents: c ?? 0 };
                        setAdditionalPay(next);
                      }}
                      ariaLabel="Additional pay"
                    />
                  </Field>
                  <Field label="Load No.">
                    <input
                      className={inputClass}
                      value={row.load_number ?? ""}
                      onChange={(e) => {
                        const next = [...additionalPay];
                        next[idx] = { ...row, load_number: e.target.value };
                        setAdditionalPay(next);
                      }}
                    />
                  </Field>
                  </div>
                  <ItemUnderRail
                    addLabel="+ Add pay"
                    addTestId={idx === additionalPay.length - 1 ? "sc-add-pay-add" : undefined}
                    onAdd={
                      idx === additionalPay.length - 1
                        ? () =>
                            setAdditionalPay([
                              ...additionalPay,
                              { ...emptyMoney(), pay_kind: "other", load_number: defaultLoadNumber, quantity: 1 },
                            ])
                        : undefined
                    }
                    removeLabel="Remove pay"
                    removeTestId={`sc-add-pay-remove-${idx}`}
                    onRemove={() => setAdditionalPay(additionalPay.filter((_, i) => i !== idx))}
                  />
                </div>
              ))}
              {additionalPay.length === 0 ? (
                <EmptyUnderAdd
                  testId="sc-add-pay-add"
                  label="+ Add pay"
                  onClick={() =>
                    setAdditionalPay([
                      { ...emptyMoney(), pay_kind: "other", load_number: defaultLoadNumber, quantity: 1 },
                    ])
                  }
                />
              ) : null}
            </Section>

            <Section title="Deductions" subtotalCents={dedSubtotal + adminFeeCents}>
              <Field label="Admin fee (7200)">
                <div data-testid="sc-admin-fee">
                  <MoneyInput
                    className={moneyInputClass}
                    valueCents={adminFeeCents || null}
                    onChangeCents={(c) => setAdminFeeCents(c ?? 0)}
                    ariaLabel="Admin fee"
                  />
                </div>
              </Field>
              {deductions.map((row, idx) => (
                <div key={idx} className="border-b border-[#D1D5DB] pb-2 pt-2" data-testid={`sc-deduction-block-${idx}`}>
                  <div className={`${fieldGridClass} min-w-0`}>
                  <Field label="Item / product" span={2}>
                    <ReferenceSelect
                      value={row.item_id ?? null}
                      onChange={(id) => {
                        const opt = drvItemOptions.find((o) => o.value === id);
                        const next = [...deductions];
                        next[idx] = {
                          ...row,
                          item_id: id,
                          description: opt?.label ?? (id ? row.description : row.description),
                        };
                        setDeductions(next);
                      }}
                      options={drvItemOptions}
                      createKind="item"
                      operatingCompanyId={companyId}
                      placeholder={drvItemsQuery.isLoading ? "Loading items…" : "Search deduction item…"}
                      loading={drvItemsQuery.isLoading}
                      addNewLabel="+ Add new item"
                      onSearch={(q) => setDrvItemSearch(q)}
                      onOptionCreated={(opt) => {
                        const next = [...deductions];
                        next[idx] = { ...row, item_id: opt.value, description: opt.label };
                        setDeductions(next);
                        void drvItemsQuery.refetch();
                      }}
                    />
                  </Field>
                  <Field label="Qty">
                    <DecimalNumberInput
                      className={inputClass}
                      value={row.quantity ?? null}
                      onChange={(n) => {
                        const next = [...deductions];
                        next[idx] = { ...row, quantity: n };
                        setDeductions(next);
                      }}
                      ariaLabel="Deduction quantity"
                      data-testid={`sc-deduction-qty-${idx}`}
                    />
                  </Field>
                  <Field label="Amount">
                    <MoneyInput
                      className={moneyInputClass}
                      valueCents={row.amount_cents || null}
                      onChangeCents={(c) => {
                        const next = [...deductions];
                        next[idx] = { ...row, amount_cents: c ?? 0 };
                        setDeductions(next);
                      }}
                      ariaLabel="Deduction"
                    />
                  </Field>
                  <Field label="Load No.">
                    <input
                      className={inputClass}
                      value={row.load_number ?? ""}
                      onChange={(e) => {
                        const next = [...deductions];
                        next[idx] = { ...row, load_number: e.target.value };
                        setDeductions(next);
                      }}
                      data-testid={`sc-deduction-load-${idx}`}
                    />
                  </Field>
                  </div>
                  <ItemUnderRail
                    addLabel="+ Add deduction"
                    addTestId={idx === deductions.length - 1 ? "sc-deductions-add" : undefined}
                    onAdd={
                      idx === deductions.length - 1
                        ? () =>
                            setDeductions([
                              ...deductions,
                              { ...emptyMoney(), load_number: defaultLoadNumber, quantity: 1 },
                            ])
                        : undefined
                    }
                    removeLabel="Remove deduction"
                    removeTestId={`sc-deductions-remove-${idx}`}
                    onRemove={() => setDeductions(deductions.filter((_, i) => i !== idx))}
                  />
                </div>
              ))}
              {deductions.length === 0 ? (
                <EmptyUnderAdd
                  testId="sc-deductions-add"
                  label="+ Add deduction"
                  onClick={() =>
                    setDeductions([{ ...emptyMoney(), load_number: defaultLoadNumber, quantity: 1 }])
                  }
                />
              ) : null}
            </Section>

            <Section title="Cash advances" subtotalCents={advSubtotal}>
              <p className="text-center text-xs text-[#6B7280]">
                Creates a driver bill payment tied to the load (engine path — load # required)
              </p>
              {advances.map((row, idx) => (
                <div key={idx} className="border-b border-[#D1D5DB] pb-2 pt-2" data-testid={`sc-advance-block-${idx}`}>
                  <div className={`${fieldGridClass} min-w-0`}>
                  <Field label="Description" span={2}>
                    <input
                      className={inputClass}
                      value={row.description}
                      onChange={(e) => {
                        const next = [...advances];
                        next[idx] = { ...row, description: e.target.value };
                        setAdvances(next);
                      }}
                    />
                  </Field>
                  <Field label="Amount">
                    <MoneyInput
                      className={moneyInputClass}
                      valueCents={row.amount_cents || null}
                      onChangeCents={(c) => {
                        const next = [...advances];
                        next[idx] = { ...row, amount_cents: c ?? 0 };
                        setAdvances(next);
                      }}
                      ariaLabel="Cash advance"
                    />
                  </Field>
                  <Field label="Load No." span={2}>
                    <input
                      className={inputClass}
                      value={row.load_number ?? ""}
                      placeholder="Load for bill payment"
                      onChange={(e) => {
                        const next = [...advances];
                        next[idx] = { ...row, load_number: e.target.value };
                        setAdvances(next);
                      }}
                      data-testid={`sc-advance-load-${idx}`}
                    />
                  </Field>
                  </div>
                  <ItemUnderRail
                    addLabel="+ Add advance"
                    addTestId={idx === advances.length - 1 ? "sc-advances-add" : undefined}
                    onAdd={
                      idx === advances.length - 1
                        ? () => setAdvances([...advances, { ...emptyMoney(), load_number: defaultLoadNumber }])
                        : undefined
                    }
                    removeLabel="Remove advance"
                    removeTestId={`sc-advances-remove-${idx}`}
                    onRemove={() => setAdvances(advances.filter((_, i) => i !== idx))}
                  />
                </div>
              ))}
              {advances.length === 0 ? (
                <EmptyUnderAdd
                  testId="sc-advances-add"
                  label="+ Add advance"
                  onClick={() => setAdvances([{ ...emptyMoney(), load_number: defaultLoadNumber }])}
                />
              ) : null}
            </Section>

            <Section title="Escrow" subtotalCents={escrowNet}>
              <p className="text-center text-xs text-[#6B7280]">Driver escrow · 2100-00-0NN · hold +, release/forfeit −</p>
              {escrow.map((row, idx) => (
                <div key={idx} className="border-b border-[#D1D5DB] pb-2 pt-2">
                  <div className={`${fieldGridClass} min-w-0`}>
                  <Field label="Type">
                    <Combobox
                      options={[
                        { value: "hold", label: "Hold (+)" },
                        { value: "release", label: "Release (−)" },
                        { value: "forfeit", label: "Forfeit (−)" },
                      ]}
                      value={row.escrow_type ?? "hold"}
                      onChange={(v) => {
                        const next = [...escrow];
                        next[idx] = { ...row, escrow_type: (v ?? "") as MoneyDraft["escrow_type"] };
                        setEscrow(next);
                      }}
                      size="sm"
                      searchIsValue
                    />
                  </Field>
                  <Field label="Description">
                    <input
                      className={inputClass}
                      value={row.description}
                      onChange={(e) => {
                        const next = [...escrow];
                        next[idx] = { ...row, description: e.target.value };
                        setEscrow(next);
                      }}
                    />
                  </Field>
                  <Field label="Amount">
                    <MoneyInput
                      className={moneyInputClass}
                      valueCents={row.amount_cents || null}
                      onChangeCents={(c) => {
                        const next = [...escrow];
                        next[idx] = { ...row, amount_cents: c ?? 0 };
                        setEscrow(next);
                      }}
                      ariaLabel="Escrow amount"
                    />
                  </Field>
                  <Field label="Load No.">
                      <input
                        className={inputClass}
                        value={row.load_number ?? ""}
                        placeholder="First load"
                        onChange={(e) => {
                          const next = [...escrow];
                          next[idx] = { ...row, load_number: e.target.value };
                          setEscrow(next);
                        }}
                      />
                  </Field>
                  </div>
                  <ItemUnderRail
                    addLabel="+ Add escrow"
                    addTestId={idx === escrow.length - 1 ? "sc-escrow-add" : undefined}
                    onAdd={
                      idx === escrow.length - 1
                        ? () =>
                            setEscrow([
                              ...escrow,
                              { ...emptyMoney(), escrow_type: "hold", load_number: defaultLoadNumber },
                            ])
                        : undefined
                    }
                    removeLabel="Remove escrow line"
                    removeTestId={`sc-escrow-remove-${idx}`}
                    onRemove={escrow.length > 1 ? () => setEscrow(escrow.filter((_, i) => i !== idx)) : undefined}
                  />
                </div>
              ))}
              {escrow.length === 0 ? (
                <EmptyUnderAdd
                  testId="sc-escrow-add"
                  label="+ Add escrow"
                  onClick={() => setEscrow([{ ...defaultEscrowLine(), load_number: defaultLoadNumber }])}
                />
              ) : null}
            </Section>

            <Section
              title="Control totals · Driver"
              pdfCents={pdfDriverNet}
              subtotalCents={liveDriverNetCents}
            >
              <div className={fieldGridClass} data-testid="sc-driver-live-totals">
                <Field label="Driver salary" span={2}>
                  <div data-testid="sc-drv-salary-live">
                    <MoneyInput
                      className={moneyInputClass}
                      valueCents={driverSalaryCents || null}
                      onChangeCents={() => undefined}
                      ariaLabel="Live driver salary"
                      disabled
                    />
                  </div>
                </Field>
                <Field label="Driver net (live)" span={2}>
                  <div data-testid="sc-drv-net-live">
                    <MoneyInput
                      className={moneyInputClass}
                      valueCents={liveDriverNetCents || null}
                      onChangeCents={() => undefined}
                      ariaLabel="Live driver net"
                      disabled
                    />
                  </div>
                </Field>
                <span />
              </div>
              <Field label="PDF TOTAL DUE">
                <div data-testid="sc-pdf-driver">
                  <MoneyInput
                    className={moneyInputClass}
                    valueCents={pdfDriverNet || null}
                    onChangeCents={(c) => setPdfDriverNet(c ?? 0)}
                    ariaLabel="PDF driver total due"
                  />
                </div>
              </Field>
            </Section>
          </div>
        </div>

        {/*
          OWNER ORDER, 2026-10-02: "ALL TOTALS SHOULD BE SHOWN IN THE CREATOR AT THE BOTTOM SO I CAN
          VERIFY TOTALS WITH THE ALWAYS SETTLEMENT AND POST" / "I AM NOT GETTING THE TOTALS FOR EACH,
          FOR INVOICE TOTALS, DRIVER PAYMENT TOTALS, EXPENSES, FUEL, ETC."

          Before this, every total was a small grey line buried inside its own section box, scattered
          down two scrolling columns. Checking a settlement against the AlwaysTrack statement meant
          scrolling and reading nine different places. This is ONE QBO-style summary at the bottom:
          label left, amount in a fixed 120px right-aligned lining-figure column so every decimal
          point stacks, company side and driver side separated, and the driver net on a double rule
          the way QuickBooks closes a statement. It computes nothing new — every figure is the SAME
          value its section shows, so the summary can never disagree with the section above it.
        */}
        <section
          className="space-y-2 rounded-sm border border-[#E5E7EB] bg-white p-2"
          data-testid="sc-settlement-totals"
        >
          <h3 className="text-center text-section-header font-bold uppercase tracking-wide text-[#4B5563]">
            Settlement totals · check against AlwaysTrack before posting
          </h3>
          <div className="grid gap-x-6 gap-y-1 md:grid-cols-2">
            <div>
              <TotalRow label="Invoice / line haul" cents={loadsSubtotal} />
              <TotalRow label="Fuel purchases" cents={fuelSubtotal} />
              <TotalRow label="Company expenses" cents={compExpSubtotal} />
              <TotalRow label="Driver salary" cents={driverSalaryCents} />
              <TotalRow label="Company total" cents={companySubtotal} strong />
              {pdfCompanyExpenses != null ? (
                <TotalRow
                  label="AlwaysTrack PDF · company"
                  cents={pdfCompanyExpenses}
                  tied={Math.round(companySubtotal) === Math.round(pdfCompanyExpenses)}
                />
              ) : null}
            </div>
            <div>
              <TotalRow label="Driver salary (pay)" cents={driverSalaryCents} />
              <TotalRow label="Driver reimbursements" cents={drvReimbSubtotal} />
              <TotalRow label="Additional pay" cents={addPaySubtotal} />
              <TotalRow label="Deductions" cents={dedSubtotal + adminFeeCents} />
              <TotalRow label="Cash advances" cents={advSubtotal} />
              <TotalRow label="Escrow" cents={escrowNet} />
              <TotalRow
                label="Driver net pay"
                cents={preview?.driver_net_cents ?? liveDriverNetCents}
                strong
                double
                tied={
                  pdfDriverNet != null
                    ? Math.round(preview?.driver_net_cents ?? liveDriverNetCents) === Math.round(pdfDriverNet)
                    : undefined
                }
              />
              {pdfDriverNet != null ? (
                <TotalRow label="AlwaysTrack PDF · driver net" cents={pdfDriverNet} />
              ) : null}
            </div>
          </div>
          {/*
            ROUND 326 item 18 — the QuickBooks subtotal chain from the POSTING engine: the preview writes this
            settlement inside a rolled-back savepoint and asks the close engine (the one calculator Post uses) for
            its figures. Deductions, escrow and advances read as negatives. The NET here is the number Post writes;
            Post refuses when it differs from the AlwaysTrack TOTAL DUE.
          */}
          {preview?.close_totals ? (
            <div className="border-t border-[#E5E7EB] pt-2" data-testid="sc-posting-engine-totals">
              <h4 className="text-center text-section-header font-bold uppercase tracking-wide text-[#4B5563]">
                Posting engine · what Post writes
              </h4>
              <div className="mx-auto max-w-md">
                <TotalRow label="Gross pay" cents={preview.close_totals.gross_cents} />
                <TotalRow label="Additions" cents={preview.close_totals.additions_cents} />
                <TotalRow label="Deductions" cents={-preview.close_totals.deductions_cents} />
                <TotalRow label="Escrow" cents={-preview.close_totals.escrow_cents} />
                <TotalRow label="Advances" cents={-preview.close_totals.advances_cents} />
                {preview.close_totals.chargebacks_cents ? (
                  <TotalRow label="Chargebacks" cents={-preview.close_totals.chargebacks_cents} />
                ) : null}
                <TotalRow
                  label="Net pay"
                  cents={preview.close_totals.net_cents}
                  strong
                  double
                  tied={pdfDriverNet != null ? preview.close_totals.net_cents === Math.round(pdfDriverNet) : undefined}
                />
              </div>
            </div>
          ) : null}
          {preview?.driver_net_cents == null ? (
            <p className="text-center text-xs text-[#6B7280]">
              Driver net is computed by the engine — press Preview JE to fill it. Everything above is
              live as you type.
            </p>
          ) : null}
        </section>

        {/* JE preview */}
        {preview ? (
          <section className="space-y-2 rounded-sm border border-[#E5E7EB] bg-white p-2" data-testid="sc-je-preview">
            <h3 className="text-center text-section-header font-bold uppercase text-[#4B5563]">JE Preview</h3>
            <div className="grid grid-cols-2 gap-2 text-center text-xs">
              <div className={preview.company_expenses_matches_pdf ? "text-[#16A34A]" : "text-red-600"}>
                Company {formatUsdCents(preview.company_expenses_cents)}{" "}
                {preview.company_expenses_matches_pdf ? "✓" : "≠ PDF"}
              </div>
              <div className={preview.driver_net_matches_pdf ? "text-[#16A34A]" : "text-red-600"}>
                Driver net {formatUsdCents(preview.driver_net_cents)}{" "}
                {preview.driver_net_matches_pdf ? "✓" : "≠ PDF"}
              </div>
            </div>
            <div className="max-h-48 overflow-auto" data-testid="sc-je-lines">
              <div
                className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)] gap-x-2 text-center text-xs"
                role="table"
                aria-label="Journal entry preview lines"
              >
                <div role="row" className="contents text-section-header font-bold uppercase text-[#4B5563]">
                  <div role="columnheader" className="p-1">
                    Account
                  </div>
                  <div role="columnheader" className="p-1">
                    Dr
                  </div>
                  <div role="columnheader" className="p-1">
                    Cr
                  </div>
                  <div role="columnheader" className="p-1">
                    Memo
                  </div>
                </div>
                {preview.je_lines.map((line, i) => (
                  <div key={i} role="row" className="contents border-t border-[#E5E7EB]">
                    <div role="cell" className="border-t border-[#E5E7EB] p-1">
                      {formatAccountDisplayLabel({
                        account_number: line.account_number,
                        account_name: line.account_name,
                      })}
                    </div>
                    <div role="cell" className="border-t border-[#E5E7EB] p-1">
                      {line.debit_cents ? formatUsdCents(line.debit_cents) : ""}
                    </div>
                    <div role="cell" className="border-t border-[#E5E7EB] p-1">
                      {line.credit_cents ? formatUsdCents(line.credit_cents) : ""}
                    </div>
                    <div role="cell" className="border-t border-[#E5E7EB] p-1">
                      {line.memo}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {preview.blockers.length ? (
              <ul className="list-inside list-disc text-left text-xs text-red-600">
                {preview.blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}
      </div>
    </ParityDrawer>
    <ConfirmModal
      open={confirmRepostOpen}
      title="Settlement already exists"
      message={confirmRepostMessage}
      confirmLabel="Void prior and repost"
      danger
      onClose={() => setConfirmRepostOpen(false)}
      onConfirm={handleConfirmRepost}
    />
    </>
  );
}
