/**
 * R-186.2 — Settlement Creator half-page side panel.
 * ONE panel for BOTH Company + Driver AlwaysTrack settlements (USMCA only).
 * Live Post enabled (owner 2026-09-25). Preview still gates can_post on control totals.
 */
import { MoneyCell } from "../../components/shared/MoneyCell";
import { useEffect, useMemo, useState } from "react";
import { ParityDrawer } from "../../components/parity/ParityDrawer";
import { ReferenceSelect } from "../../components/parity/ReferenceSelect";
import { Combobox } from "../../components/Combobox";
import { Button } from "../../components/Button";
import { EntityPicker } from "../../components/EntityPicker";
import { entityLabel } from "../../lib/entity-label";
import { EntityLink } from "../../components/shared/EntityLink";
import { DatePicker } from "../../components/forms/DatePicker";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useToast } from "../../components/Toast";
import { formatUsdCents, formatUsdCentsTable } from "../../lib/money";
import { formatAccountDisplayLabel } from "../../lib/show-account-numbers";
import { useShowAccountNumbers } from "../../lib/useShowAccountNumbers";
import { useAccountingItemsQuery } from "../../hooks/useAccountingItemsQuery";
import { useQuery } from "@tanstack/react-query";
import { getReclassifyAccountTree } from "../../api/reclassify";
import { WizardReclassifyPanel } from "./WizardReclassifyPanel";
import { FuelStopLocationPicker } from "../../components/locations/FuelStopLocationPicker";
import { formatFuelStopLocationLabel } from "../../lib/fuelStopLocationLabel";
import { peekNextLoadNumber } from "../../api/dispatch";
import {
  previewSettlementCreator,
  postSettlementCreator,
  peekNextSettlementNumber,
  type SettlementCreatorDraft,
  type SettlementCreatorPreview,
  type SettlementCreatorFuelCard,
  type SettlementCreatorFactorOption,
} from "../../api/settlementCreator";
import type { ReactNode } from "react";

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
};

function emptyLoad(loadNumber = ""): LoadDraft {
  return {
    load_number: loadNumber,
    customer_name: "",
    pickup_date: "",
    pickup_city: "",
    delivery_date: "",
    delivery_city: "",
    line_haul_miles: null,
    line_haul_rate_cents: null,
    line_haul_amount_cents: null,
    factoring: "faro_usmca",
    date_sent_to_factoring: "",
    loaded_miles: null,
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

function Section({
  title,
  subtotalCents,
  pdfCents,
  onAdd,
  children,
}: {
  title: string;
  subtotalCents?: number | null;
  pdfCents?: number | null;
  onAdd?: () => void;
  children: ReactNode;
}) {
  const tied =
    pdfCents == null || subtotalCents == null
      ? null
      : Math.round(subtotalCents) === Math.round(pdfCents);
  return (
    <section className="space-y-2 rounded-sm border border-[#E5E7EB] bg-white p-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-center text-section-header font-bold uppercase tracking-wide text-[#4B5563]">{title}</h3>
        {onAdd ? (
          <Button type="button" size="sm" variant="secondary" onClick={onAdd}>
            + Add
          </Button>
        ) : null}
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-section-header font-semibold uppercase text-[#4B5563]">
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
}: {
  companyId: string;
  line: LineCodingFields;
  onPatch: (patch: LineCodingFields) => void;
  accountOptions: RefOption[];
  accountsLoading: boolean;
  item?: { options: RefOption[]; loading: boolean; onSearch: (q: string) => void; placeholder: string };
  testIdPrefix: string;
}) {
  return (
    <>
      {item ? (
        <Field label="Item">
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
    </>
  );
}

/** Locked baseline: 28px clickable boxes, 12px body, 2px radius, equal paired widths. */
const inputClass =
  "h-7 w-full min-w-0 rounded-sm border border-[#E5E7EB] px-2 text-left text-xs text-[#0F1219]";
const fieldGridClass = "grid grid-cols-2 gap-2";
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

  const wrongEntity = Boolean(companyId && companyId !== USMCA);

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
        join_outbound_load_number: l.join_outbound_load_number || null,
      })),
      fuel_purchases: fuels.map(({ location_id: _lid, vendor_id: _vid, ...fuel }) => fuel),
      expenses: expensesMerged.map(({ location, location_id: _lid, ...exp }) => ({
        ...exp,
        description: [location?.trim(), exp.description?.trim()].filter(Boolean).join(" · ") || exp.description,
      })),
      deductions: deductions.map((d) => ({ ...d, description: d.description || "Deduction" })),
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

  const fuelSubtotal = fuels.reduce((s, f) => {
    const a =
      f.receipt_cents ??
      Math.round(Number(f.gallons || 0) * Number(f.cpg_cents || 0)) +
        Math.round(Number(f.fees_cents || 0)) -
        Math.round(Number(f.discount_cents || 0));
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
  const loadsSubtotal = loads.reduce(
    (s, l) => s + Math.max(0, Number(l.line_haul_rate_cents ?? 0)) + Math.max(0, Number(l.empty_rate_cents ?? 0)),
    0
  );
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
        const ok = window.confirm(
          `${apiErr.data.message ?? "Settlement already exists."}\n\nEdit = void the prior settlement and all Creator companion docs, then repost. Continue?`,
        );
        if (ok) {
          try {
            const res = await postSettlementCreator({ ...draft, edit_void_repost: true });
            pushToast(
              `Settlement ${res.source_document_ref || res.display_id} voided prior + reposted`,
              "success",
            );
            setPosted({ label: `Settlement ${res.source_document_ref || res.display_id} voided prior + reposted`, documentIds: [...(res.expense_ids ?? [])] });
            return;
          } catch (retryErr) {
            setError(String((retryErr as Error).message || "Void and repost failed"));
            return;
          }
        }
        setError(apiErr.data.message ?? "Post cancelled — settlement already exists.");
        return;
      }
      setError(String((e as Error).message || "Post failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ParityDrawer
      open={open}
      onClose={onClose}
      size="xwide"
      title="Settlement Creator"
      subtitle="Company + Driver · AlwaysTrack · USMCA · Preview first"
      confirmDiscardOnClose
      isDirty={Boolean(settlementNo || driverId || loads.some((l) => l.load_number))}
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={onClose}>
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

        {/* Shared header */}
        <Section title="Header">
          <div className={`${fieldGridClass} md:grid-cols-3`}>
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
                onChange={setDriverId}
                allowCreate={false}
                size={pickerSize}
                className="mt-0"
                dataTestId="sc-driver"
              />
              {driverId ? (
                <EntityLink
                  kind="driver"
                  id={driverId}
                  label={entityLabel(null, driverId, "Driver")}
                  className="mt-1 block text-xs font-semibold text-[#1F2A44] underline"
                />
              ) : null}
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

            <Section title="Loads" subtotalCents={loadsSubtotal} onAdd={addLoadRow}>
              {loads.map((load, idx) => (
                <div key={idx} className={`${fieldGridClass} border-t border-[#E5E7EB] pt-2`}>
                  <Field label="Load No.">
                    <div className="flex items-center gap-1">
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
                    </div>
                  </Field>
                  <Field label="Customer">
                    <EntityPicker
                      kind="customer"
                      operatingCompanyId={companyId}
                      value={load.customer_id ?? null}
                      onChange={(id, opt) => {
                        const next = [...loads];
                        next[idx] = {
                          ...load,
                          customer_id: id,
                          customer_name: opt?.label ?? load.customer_name,
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
                  <Field label="Join outbound (SB)">
                    <input
                      className={inputClass}
                      value={load.join_outbound_load_number ?? ""}
                      onChange={(e) => {
                        const next = [...loads];
                        next[idx] = { ...load, join_outbound_load_number: e.target.value };
                        setLoads(next);
                      }}
                      placeholder="Outbound load #"
                    />
                  </Field>
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
                  <Field label="Pickup date">
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
                  <Field label="Pickup city">
                    <input
                      className={inputClass}
                      value={load.pickup_city ?? ""}
                      onChange={(e) => {
                        const next = [...loads];
                        next[idx] = { ...load, pickup_city: e.target.value };
                        setLoads(next);
                      }}
                    />
                  </Field>
                  <Field label="Pickup state">
                    <input
                      className={inputClass}
                      value={load.pickup_state ?? ""}
                      onChange={(e) => {
                        const next = [...loads];
                        next[idx] = { ...load, pickup_state: e.target.value.toUpperCase() };
                        setLoads(next);
                      }}
                      maxLength={6}
                      title="REQUIRED — the state the load actually originated in. Nothing defaults to TX any more."
                      data-testid={`sc-load-pickup-state-${idx}`}
                    />
                  </Field>
                  <Field label="Delivery date">
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
                  <Field label="Delivery city">
                    <input
                      className={inputClass}
                      value={load.delivery_city ?? ""}
                      onChange={(e) => {
                        const next = [...loads];
                        next[idx] = { ...load, delivery_city: e.target.value };
                        setLoads(next);
                      }}
                    />
                  </Field>
                  <Field label="Delivery state">
                    <input
                      className={inputClass}
                      value={load.delivery_state ?? ""}
                      onChange={(e) => {
                        const next = [...loads];
                        next[idx] = { ...load, delivery_state: e.target.value.toUpperCase() };
                        setLoads(next);
                      }}
                      maxLength={6}
                      title="REQUIRED — the state the load actually delivered in. The seeder no longer writes Pending / TX."
                      data-testid={`sc-load-delivery-state-${idx}`}
                    />
                  </Field>
                  <Field label="Loaded miles">
                    <input
                      className={inputClass}
                      value={load.loaded_miles ?? ""}
                      onChange={(e) => {
                        const next = [...loads];
                        next[idx] = { ...load, loaded_miles: e.target.value === "" ? null : Number(e.target.value) };
                        setLoads(next);
                      }}
                    />
                  </Field>
                  <Field label="Empty miles">
                    <input
                      className={inputClass}
                      value={load.empty_miles ?? ""}
                      onChange={(e) => {
                        const next = [...loads];
                        next[idx] = { ...load, empty_miles: e.target.value === "" ? null : Number(e.target.value) };
                        setLoads(next);
                      }}
                    />
                  </Field>
                  <Field label="Empty $/mi">
                    <MoneyInput
                      className={inputClass}
                      valueCents={load.empty_rate_cents}
                      onChangeCents={(cents) => {
                        const next = [...loads];
                        next[idx] = { ...load, empty_rate_cents: cents };
                        setLoads(next);
                      }}
                      ariaLabel="Empty miles rate"
                    />
                  </Field>
                  <Field label="Rate $/mi">
                    <MoneyInput
                      className={inputClass}
                      valueCents={load.line_haul_rate_cents}
                      onChangeCents={(cents) => {
                        const next = [...loads];
                        next[idx] = { ...load, line_haul_rate_cents: cents };
                        setLoads(next);
                      }}
                      ariaLabel="Rate per mile"
                    />
                  </Field>
                  <Field label="Revenue">
                    <MoneyInput
                      className={inputClass}
                      valueCents={load.line_haul_amount_cents}
                      onChangeCents={(cents) => {
                        const next = [...loads];
                        next[idx] = { ...load, line_haul_amount_cents: cents };
                        setLoads(next);
                      }}
                      ariaLabel="Load revenue"
                    />
                  </Field>
                  <Field label="Accessorial item">
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
                      className={inputClass}
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
                  <Field label="Factoring">
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
                  {/* SETL-F437 — "Date sent to factoring" removed (owner, 2026-10-06): the invoices
                      that go to Faro are SELECTED IN FARO, so a date typed here could only ever
                      disagree with the factor's own record. It is not a settlement fact. */}
                  <label className="col-span-2 flex h-7 items-center justify-center gap-2 rounded-sm border border-[#E5E7EB] bg-white px-2 text-xs text-[#0F1219]">
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
              ))}
            </Section>

            <Section title="Fuel purchases" subtotalCents={fuelSubtotal} onAdd={() => setFuels([...fuels, emptyFuel()])}>
              {fuels.map((fuel, idx) => (
                <div key={idx} className={`${fieldGridClass} border-t border-[#E5E7EB] pt-2`}>
                  <Field label="Date">
                    <DatePicker
                      className={inputClass}
                      value={fuel.date}
                      onChange={(v) => {
                        const next = [...fuels];
                        next[idx] = { ...fuel, date: v };
                        setFuels(next);
                      }}
                    />
                  </Field>
                  <Field label="Vendor">
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
                  <Field label="Location">
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
                          // DB Love's stop → default vendor name LOVES when unset
                          vendor_name:
                            lovesCode && !(fuel.vendor_name ?? "").trim() ? "LOVES" : fuel.vendor_name,
                        };
                        setFuels(next);
                      }}
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
                  {/* U25 — reefer diesel is its own fuel (out of IFTA, counted for the federal reefer-fuel credit). */}
                  <Field label="Fuel">
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
                  <Field label="Gallons">
                    <input
                      className={inputClass}
                      value={fuel.gallons || ""}
                      onChange={(e) => {
                        const next = [...fuels];
                        next[idx] = { ...fuel, gallons: Number(e.target.value) || 0 };
                        setFuels(next);
                      }}
                    />
                  </Field>
                  <Field label="CPG">
                    <MoneyInput
                      className={inputClass}
                      valueCents={fuel.cpg_cents || null}
                      onChangeCents={(c) => {
                        const next = [...fuels];
                        next[idx] = { ...fuel, cpg_cents: c ?? 0 };
                        setFuels(next);
                      }}
                      ariaLabel="Cents per gallon"
                    />
                  </Field>
                  <Field label="Receipt">
                    <MoneyInput
                      className={inputClass}
                      valueCents={fuel.receipt_cents ?? null}
                      onChangeCents={(c) => {
                        const next = [...fuels];
                        next[idx] = { ...fuel, receipt_cents: c };
                        setFuels(next);
                      }}
                      ariaLabel="Fuel receipt"
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
                  <LineCoding
                    companyId={companyId}
                    line={fuel}
                    testIdPrefix={`sc-fuel-${idx}`}
                    accountOptions={accountOptions}
                    accountsLoading={accountTreeQuery.isLoading}
                    item={{ options: itemOptions, loading: itemsQuery.isLoading, onSearch: setItemSearch, placeholder: "Fuel item (blank = by fuel type)" }}
                    onPatch={(patch) => {
                      const next = [...fuels];
                      next[idx] = { ...fuel, ...patch };
                      setFuels(next);
                    }}
                  />
                </div>
              ))}
            </Section>

            <Section
              title="Company expenses"
              subtotalCents={compExpSubtotal}
              onAdd={() => setCompanyExpenses([...companyExpenses, emptyCompExp()])}
            >
              <p className="text-center text-xs text-[#6B7280]">
                PDF &quot;Comp.&quot; — credits the fuel card rail (never A/P)
              </p>
              {companyExpenses.map((exp, idx) => (
                <div key={idx} className={`${fieldGridClass} border-t border-[#E5E7EB] pt-2`}>
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
                      className={inputClass}
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
              ))}
            </Section>

            <Section title="Control totals · Company" pdfCents={pdfCompanyExpenses} subtotalCents={companySubtotal}>
              <Field label="PDF company EXPENSES total">
                <div data-testid="sc-pdf-company">
                  <MoneyInput
                    className={inputClass}
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

            <Section
              title="Driver-paid reimbursements"
              subtotalCents={drvReimbSubtotal}
              onAdd={() => setDrvReimbursements([...drvReimbursements, emptyDrvReimb()])}
            >
              <p className="text-center text-xs text-[#6B7280]">
                PDF &quot;Drv&quot; — Cr 2175 Driver Reimbursements Payable (never 6890/5310)
              </p>
              {drvReimbursements.map((exp, idx) => (
                <div key={idx} className={`${fieldGridClass} border-t border-[#E5E7EB] pt-2`}>
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
                      className={inputClass}
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
              ))}
            </Section>

            <Section
              title="Additional pay to driver"
              subtotalCents={addPaySubtotal}
              onAdd={() => setAdditionalPay([...additionalPay, { ...emptyMoney(), pay_kind: "detention" }])}
            >
              {additionalPay.map((row, idx) => (
                <div key={idx} className={`${fieldGridClass} border-t border-[#E5E7EB] pt-2`}>
                  <Field label="Type">
                    <Combobox
                      options={[
                        { value: "detention", label: "Detention" },
                        { value: "layover", label: "Layover" },
                        { value: "bonus", label: "Bonus" },
                        { value: "stop_pay", label: "Stop pay" },
                        { value: "other", label: "Other" },
                      ]}
                      value={row.pay_kind ?? "other"}
                      onChange={(v) => {
                        const next = [...additionalPay];
                        next[idx] = { ...row, pay_kind: (v ?? "") as MoneyDraft["pay_kind"] };
                        setAdditionalPay(next);
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
                        const next = [...additionalPay];
                        next[idx] = { ...row, description: e.target.value };
                        setAdditionalPay(next);
                      }}
                    />
                  </Field>
                  <Field label="Amount">
                    <MoneyInput
                      className={inputClass}
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
              ))}
            </Section>

            <Section title="Deductions" subtotalCents={dedSubtotal + adminFeeCents} onAdd={() => setDeductions([...deductions, emptyMoney()])}>
              <Field label="Admin fee (7200)">
                <div data-testid="sc-admin-fee">
                  <MoneyInput
                    className={inputClass}
                    valueCents={adminFeeCents || null}
                    onChangeCents={(c) => setAdminFeeCents(c ?? 0)}
                    ariaLabel="Admin fee"
                  />
                </div>
              </Field>
              {deductions.map((row, idx) => (
                <div key={idx} className={`${fieldGridClass} border-t border-[#E5E7EB] pt-2`}>
                  <Field label="Description">
                    <input
                      className={inputClass}
                      value={row.description}
                      onChange={(e) => {
                        const next = [...deductions];
                        next[idx] = { ...row, description: e.target.value };
                        setDeductions(next);
                      }}
                    />
                  </Field>
                  <Field label="Amount">
                    <MoneyInput
                      className={inputClass}
                      valueCents={row.amount_cents || null}
                      onChangeCents={(c) => {
                        const next = [...deductions];
                        next[idx] = { ...row, amount_cents: c ?? 0 };
                        setDeductions(next);
                      }}
                      ariaLabel="Deduction"
                    />
                  </Field>
                </div>
              ))}
            </Section>

            <Section title="Cash advances" subtotalCents={advSubtotal} onAdd={() => setAdvances([...advances, emptyMoney()])}>
              {advances.map((row, idx) => (
                <div key={idx} className={`${fieldGridClass} border-t border-[#E5E7EB] pt-2`}>
                  <Field label="Description">
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
                      className={inputClass}
                      valueCents={row.amount_cents || null}
                      onChangeCents={(c) => {
                        const next = [...advances];
                        next[idx] = { ...row, amount_cents: c ?? 0 };
                        setAdvances(next);
                      }}
                      ariaLabel="Cash advance"
                    />
                  </Field>
                </div>
              ))}
            </Section>

            <Section
              title="Escrow"
              subtotalCents={escrowNet}
              onAdd={() => setEscrow([...escrow, escrow.length ? { ...emptyMoney(), escrow_type: "hold" } : defaultEscrowLine()])}
            >
              <p className="text-center text-xs text-[#6B7280]">Driver escrow · 2100-00-0NN · hold +, release/forfeit −</p>
              {escrow.map((row, idx) => (
                <div key={idx} className={`${fieldGridClass} border-t border-[#E5E7EB] pt-2`}>
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
                      className={inputClass}
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
                    <div className="flex items-center gap-1">
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
                      <button
                        type="button"
                        aria-label="Remove escrow line"
                        data-testid={`sc-escrow-remove-${idx}`}
                        className="px-1 text-xs font-bold text-[#6B7280] hover:text-[#B91C1C]"
                        onClick={() => setEscrow(escrow.filter((_, i) => i !== idx))}
                      >
                        ×
                      </button>
                    </div>
                  </Field>
                </div>
              ))}
            </Section>

            <Section title="Control totals · Driver" pdfCents={pdfDriverNet} subtotalCents={preview?.driver_net_cents ?? null}>
              <Field label="PDF TOTAL DUE">
                <div data-testid="sc-pdf-driver">
                  <MoneyInput
                    className={inputClass}
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
              <TotalRow label="Driver reimbursements" cents={drvReimbSubtotal} />
              <TotalRow label="Additional pay" cents={addPaySubtotal} />
              <TotalRow label="Deductions" cents={dedSubtotal + adminFeeCents} />
              <TotalRow label="Cash advances" cents={advSubtotal} />
              <TotalRow label="Escrow" cents={escrowNet} />
              <TotalRow
                label="Driver net pay"
                cents={preview?.driver_net_cents ?? null}
                strong
                double
                tied={
                  pdfDriverNet != null && preview?.driver_net_cents != null
                    ? Math.round(preview.driver_net_cents) === Math.round(pdfDriverNet)
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
  );
}
