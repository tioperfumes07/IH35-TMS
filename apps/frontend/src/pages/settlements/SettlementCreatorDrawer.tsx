/**
 * R-186.2 — Settlement Creator half-page side panel.
 * ONE panel for BOTH Company + Driver AlwaysTrack settlements (USMCA only).
 * Live Post enabled (owner 2026-09-25). Preview still gates can_post on control totals.
 */
import { useEffect, useMemo, useState } from "react";
import { ParityDrawer } from "../../components/parity/ParityDrawer";
import { ReferenceSelect } from "../../components/parity/ReferenceSelect";
import { Button } from "../../components/Button";
import { EntityPicker } from "../../components/EntityPicker";
import { DatePicker } from "../../components/forms/DatePicker";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useToast } from "../../components/Toast";
import { formatUsdCents } from "../../lib/money";
import { formatAccountDisplayLabel } from "../../lib/show-account-numbers";
import { useAccountingItemsQuery } from "../../hooks/useAccountingItemsQuery";
import { FuelStopLocationPicker } from "../../components/locations/FuelStopLocationPicker";
import { formatFuelStopLocationLabel } from "../../lib/fuelStopLocationLabel";
import { peekNextLoadNumber } from "../../api/dispatch";
import {
  previewSettlementCreator,
  postSettlementCreator,
  peekNextSettlementDisplayId,
  type SettlementCreatorDraft,
  type SettlementCreatorPreview,
  type SettlementCreatorFuelCard,
  type SettlementCreatorFactorOption,
} from "../../api/settlementCreator";
import type { ReactNode } from "react";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

type LoadDraft = SettlementCreatorDraft["loads"][number];
/** location_id / vendor_id / item_id are picker state only — stripped before API. */
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

const editBtnClass =
  "h-7 shrink-0 rounded-sm border border-[#E5E7EB] bg-white px-2 text-xs text-[#1F2A44] hover:bg-[#F7F8FA]";

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
        <div
          className={`text-center text-xs font-semibold ${
            tied === null ? "text-[#6B7280]" : tied ? "text-[#16A34A]" : "text-red-600"
          }`}
          data-testid={`sc-section-subtotal-${title.replace(/\s+/g, "-").toLowerCase()}`}
        >
          Subtotal {formatUsdCents(subtotalCents)}
          {pdfCents != null ? ` · PDF ${formatUsdCents(pdfCents)}` : ""}
        </div>
      ) : null}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-section-header font-semibold uppercase text-[#4B5563]">
      <span className="text-center leading-tight">{label}</span>
      <div className="min-h-7 w-full min-w-0">{children}</div>
    </label>
  );
}

/** Locked baseline: 28px clickable boxes, 12px body, 2px radius, equal paired widths. */
const inputClass =
  "h-7 w-full min-w-0 rounded-sm border border-[#E5E7EB] px-2 text-center text-xs text-[#0F1219]";
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
  const [settlementNoEditing, setSettlementNoEditing] = useState(false);
  const [peekLoadBase, setPeekLoadBase] = useState<string>("");
  const [loadNumberEditing, setLoadNumberEditing] = useState<boolean[]>([false]);
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
  const [escrow, setEscrow] = useState<MoneyDraft[]>([]);
  const [pdfCompanyExpenses, setPdfCompanyExpenses] = useState(0);
  const [pdfDriverNet, setPdfDriverNet] = useState(0);
  const [itemSearch, setItemSearch] = useState("");
  const [drvItemSearch, setDrvItemSearch] = useState("");

  const [preview, setPreview] = useState<SettlementCreatorPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wrongEntity = Boolean(companyId && companyId !== USMCA);

  // Owner 2026-09-26: auto next load # + next P-settlement on open. Locked until Edit.
  useEffect(() => {
    if (!open || !companyId || wrongEntity) return;
    let cancelled = false;
    setSeqError(null);
    setSettlementNoEditing(false);
    setLoadNumberEditing([false]);
    void (async () => {
      try {
        const [loadPeek, settPeek] = await Promise.all([
          peekNextLoadNumber(companyId),
          peekNextSettlementDisplayId(companyId),
        ]);
        if (cancelled) return;
        const nextLoad = loadPeek.next_number;
        setPeekLoadBase(nextLoad);
        setSettlementNo(settPeek.next_display_id);
        setLoads([emptyLoad(nextLoad)]);
        setLoadNumberEditing([false]);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Could not peek next load/settlement number";
        setSeqError(msg);
        setPeekLoadBase("");
        setSettlementNo("");
        setLoads([emptyLoad()]);
        setLoadNumberEditing([false]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, companyId, wrongEntity]);

  function addLoadRow() {
    const nextNum = nextSequentialLoadNumber(loads, peekLoadBase || "0");
    setLoads([...loads, emptyLoad(nextNum)]);
    setLoadNumberEditing([...loadNumberEditing, false]);
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
  const drvItemOptions = useMemo(
    () => (drvItemsQuery.data ?? []).map((row) => ({ value: row.id, label: row.name })),
    [drvItemsQuery.data],
  );

  const expensesMerged: ExpDraft[] = useMemo(
    () => [...companyExpenses, ...drvReimbursements],
    [companyExpenses, drvReimbursements],
  );

  /** Additional pay only — goes to settlement_lines / driver net, never Cr 2175. */
  const additionalPayForApi = useMemo(
    () =>
      additionalPay.map((a) => ({
        description: `${a.pay_kind ?? "other"}: ${a.description || "Additional pay"}`,
        amount_cents: a.amount_cents,
        load_number: a.load_number,
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
      expenses: expensesMerged.map(({ location, location_id: _lid, item_id: _iid, ...exp }) => ({
        ...exp,
        description: [location?.trim(), exp.description?.trim()].filter(Boolean).join(" · ") || exp.description,
      })),
      deductions: deductions.map((d) => ({ ...d, description: d.description || "Deduction" })),
      reimbursements: additionalPayForApi,
      escrow: escrowForApi,
      advances: advances.map((a) => ({
        description: a.description || "Cash advance",
        amount_cents: a.amount_cents,
        load_number: a.load_number,
      })),
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

  async function onPost() {
    if (!allowPost || !draft || !preview?.can_post) return;
    setBusy(true);
    setError(null);
    try {
      const res = await postSettlementCreator(draft);
      pushToast(`Settlement ${res.display_id || res.source_document_ref} posted`, "success");
      onClose();
    } catch (e) {
      setError(String((e as Error).message || "Post failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ParityDrawer
      open={open}
      onClose={onClose}
      size="half"
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
                  readOnly={!settlementNoEditing}
                  onChange={(e) => setSettlementNo(e.target.value)}
                  placeholder="Next P-NNNN"
                  title={
                    settlementNoEditing
                      ? "Override — must be a free P-NNNN or new AlwaysTrack digits"
                      : "Next free settlement number (auto). Edit to change."
                  }
                  data-testid="sc-settlement-no"
                />
                {!settlementNoEditing ? (
                  <button
                    type="button"
                    className={editBtnClass}
                    onClick={() => setSettlementNoEditing(true)}
                    data-testid="sc-settlement-no-edit"
                    title="Edit settlement number"
                  >
                    Edit
                  </button>
                ) : null}
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

            <Section title="Loads" onAdd={addLoadRow}>
              {loads.map((load, idx) => (
                <div key={idx} className={`${fieldGridClass} border-t border-[#E5E7EB] pt-2`}>
                  <Field label="Load No.">
                    <div className="flex items-center gap-1">
                      <input
                        className={inputClass}
                        value={load.load_number}
                        readOnly={!loadNumberEditing[idx]}
                        onChange={(e) => {
                          const next = [...loads];
                          next[idx] = { ...load, load_number: e.target.value };
                          setLoads(next);
                        }}
                        title={
                          loadNumberEditing[idx]
                            ? "Override — must be a NEW free load number (not an existing load)"
                            : "Next free load number (auto). Edit to change."
                        }
                        data-testid={`sc-load-number-${idx}`}
                      />
                      {!loadNumberEditing[idx] ? (
                        <button
                          type="button"
                          className={editBtnClass}
                          onClick={() => {
                            const next = [...loadNumberEditing];
                            next[idx] = true;
                            setLoadNumberEditing(next);
                          }}
                          data-testid={`sc-load-number-edit-${idx}`}
                          title="Edit load number"
                        >
                          Edit
                        </button>
                      ) : null}
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
                    <select
                      className={inputClass}
                      value={load.trip_type ?? "NB"}
                      onChange={(e) => {
                        const next = [...loads];
                        next[idx] = { ...load, trip_type: e.target.value as LoadDraft["trip_type"] };
                        setLoads(next);
                      }}
                      data-testid={`sc-load-trip-type-${idx}`}
                    >
                      <option value="NB">NB</option>
                      <option value="TR">TR</option>
                      <option value="SB">SB</option>
                      <option value="LOCAL">LOCAL</option>
                    </select>
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
                  <Field label="Factoring">
                    <select
                      className={inputClass}
                      value={load.factoring}
                      onChange={(e) => {
                        const next = [...loads];
                        next[idx] = { ...load, factoring: e.target.value as SettlementCreatorFactorOption };
                        setLoads(next);
                      }}
                    >
                      <option value="faro_usmca">Faro USMCA</option>
                      <option value="direct">None (direct)</option>
                      <option value="faro_transportation">Faro Transportation</option>
                    </select>
                  </Field>
                  <Field label="Date sent to factoring">
                    <DatePicker
                      className={inputClass}
                      value={load.date_sent_to_factoring ?? ""}
                      onChange={(v) => {
                        const next = [...loads];
                        next[idx] = { ...load, date_sent_to_factoring: v };
                        setLoads(next);
                      }}
                    />
                  </Field>
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
                    <select
                      className={inputClass}
                      value={fuel.card}
                      onChange={(e) => {
                        const next = [...fuels];
                        next[idx] = { ...fuel, card: e.target.value as SettlementCreatorFuelCard };
                        setFuels(next);
                      }}
                    >
                      <option value="dreamline">Dreamline</option>
                      <option value="relay">Relay</option>
                    </select>
                  </Field>
                  <Field label="Load No.">
                    <input
                      className={inputClass}
                      value={fuel.load_number ?? ""}
                      onChange={(e) => {
                        const next = [...fuels];
                        next[idx] = { ...fuel, load_number: e.target.value };
                        setFuels(next);
                      }}
                    />
                  </Field>
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
                    <select
                      className={inputClass}
                      value={exp.card ?? "relay"}
                      onChange={(e) => {
                        const next = [...companyExpenses];
                        next[idx] = { ...exp, card: e.target.value as SettlementCreatorFuelCard };
                        setCompanyExpenses(next);
                      }}
                    >
                      <option value="dreamline">Dreamline</option>
                      <option value="relay">Relay</option>
                    </select>
                  </Field>
                  <Field label="Load No.">
                    <input
                      className={inputClass}
                      value={exp.load_number ?? ""}
                      onChange={(e) => {
                        const next = [...companyExpenses];
                        next[idx] = { ...exp, load_number: e.target.value };
                        setCompanyExpenses(next);
                      }}
                    />
                  </Field>
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
                  <Field label="Load No.">
                    <input
                      className={inputClass}
                      value={exp.load_number ?? ""}
                      onChange={(e) => {
                        const next = [...drvReimbursements];
                        next[idx] = { ...exp, load_number: e.target.value };
                        setDrvReimbursements(next);
                      }}
                    />
                  </Field>
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
                    <select
                      className={inputClass}
                      value={row.pay_kind ?? "other"}
                      onChange={(e) => {
                        const next = [...additionalPay];
                        next[idx] = { ...row, pay_kind: e.target.value as MoneyDraft["pay_kind"] };
                        setAdditionalPay(next);
                      }}
                    >
                      <option value="detention">Detention</option>
                      <option value="layover">Layover</option>
                      <option value="bonus">Bonus</option>
                      <option value="stop_pay">Stop pay</option>
                      <option value="other">Other</option>
                    </select>
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

            <Section title="Deductions" subtotalCents={dedSubtotal} onAdd={() => setDeductions([...deductions, emptyMoney()])}>
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
              onAdd={() => setEscrow([...escrow, { ...emptyMoney(), escrow_type: "hold" }])}
            >
              <p className="text-center text-xs text-[#6B7280]">Hold +, release/forfeit − · existing escrow engine</p>
              {escrow.map((row, idx) => (
                <div key={idx} className={`${fieldGridClass} border-t border-[#E5E7EB] pt-2`}>
                  <Field label="Type">
                    <select
                      className={inputClass}
                      value={row.escrow_type ?? "hold"}
                      onChange={(e) => {
                        const next = [...escrow];
                        next[idx] = { ...row, escrow_type: e.target.value as MoneyDraft["escrow_type"] };
                        setEscrow(next);
                      }}
                    >
                      <option value="hold">Hold (+)</option>
                      <option value="release">Release (−)</option>
                      <option value="forfeit">Forfeit (−)</option>
                    </select>
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
                    <input
                      className={inputClass}
                      value={row.load_number ?? ""}
                      onChange={(e) => {
                        const next = [...escrow];
                        next[idx] = { ...row, load_number: e.target.value };
                        setEscrow(next);
                      }}
                    />
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
