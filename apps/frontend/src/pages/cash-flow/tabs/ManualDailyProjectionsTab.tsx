import { companyToday } from "../../../lib/businessDate";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listForecastEntries,
  createForecastEntry,
  updateForecastEntry,
  deleteForecastEntry,
  getForecastOpeningBalance,
  putForecastOpeningBalance,
  type ForecastEntry,
  type ForecastRefKind,
} from "../../../api/forecast";
import { DatePicker } from "../../../components/forms/DatePicker";
import { MoneyInput } from "../../../components/forms/MoneyInput";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { toCents, computeProjectionTotals } from "./manualProjectionMath";
import { formatUsd, formatUsdCents } from "../../../lib/money";
import { DriverPickerWithCreate } from "../../../components/drivers/DriverPickerWithCreate";
import { EntityLinkOrTombstone } from "../../../components/shared/EntityLinkOrTombstone";
import { AmountLink } from "../../../components/shared/AmountLink";
import { SelectCombobox } from "../../../components/Combobox";
import { EntityPicker } from "../../../components/EntityPicker";
import { Link, useSearchParams } from "react-router-dom";
import { getCashFlowOpeningCash, pullManualTransactions } from "../../../api/cashFlow";
import { V3, V3_EXPENSE_GROUPS, V3_TABLE } from "../../../design/v3-tokens";
import { V3KpiTile } from "../../../components/v3/V3KpiTile";
import { V3Panel } from "../../../components/v3/V3Panel";

// ROUND 443.250 — Manual Daily Projections V3 board: same forecast engine + MDP field
// contracts; chrome via v3-tokens / V3KpiTile / V3Panel; expenses by V3_EXPENSE_GROUPS.

function fmtCents(c: number) {
  return formatUsdCents(c);
}

const REF_KINDS: ForecastRefKind[] = ["account", "unit", "driver", "truck", "trailer"];

type Direction = "income" | "expense";

type RowForm = {
  id: string | null;
  entry_date: string;
  amount_cents: number | null;
  party_name: string;
  invoice_no: string;
  category: string;
  memo: string;
  ref_kind: "" | ForecastRefKind;
  ref_label: string;
  ref_external_id: string;
  party_ref_kind: "" | "customer" | "driver" | "vendor";
  party_ref_id: string;
  party_ref_label: string;
};

const emptyRow = (): RowForm => ({
  id: null,
  entry_date: "",
  amount_cents: null,
  party_name: "",
  invoice_no: "",
  category: "",
  memo: "",
  ref_kind: "",
  ref_label: "",
  ref_external_id: "",
  party_ref_kind: "",
  party_ref_id: "",
  party_ref_label: "",
});

// MDP-FIX-2 (Phase 7) — each projection line is ONE horizontal row with per-direction columns
// (Jorge-confirmed field order):
//   income  → Unit no. (ref_label) · Invoice (invoice_no) · Customer (party_name) · Total
//   expense → Bill/Exp No. (invoice_no) · Vendor/Driver (party_name) · Expense (category) · Total
// DEFECT 4: income "Invoice" and "Customer" are now SEPARATE columns (were one merged field).
// DEFECT 5: expense leads with "Bill/Exp No." (invoice_no), then Vendor/Driver, then Expense.
// DEFECT 1: each panel shows a summed Total footer (in addition to the header) that recomputes live.
// Remaining legacy fields (category for income, link for expense, memo) stay behind "+ more"
// (ADDITIVE-ONLY). entry_date comes from the tab's single Projection date.
type MdpColKey = "ref_label" | "invoice_no" | "party_name" | "category";
type MdpCol = { key: MdpColKey; label: string; w: string };
const MDP_COLUMNS: Record<Direction, MdpCol[]> = {
  income: [
    { key: "ref_label", label: "Unit no.", w: "w-24" },
    { key: "invoice_no", label: "Invoice", w: "w-28" },
    { key: "party_name", label: "Customer", w: "flex-1 min-w-0" },
  ],
  expense: [
    { key: "invoice_no", label: "Bill/Exp No.", w: "w-28" },
    { key: "party_name", label: "Vendor/Driver", w: "w-32" },
    { key: "category", label: "Expense", w: "flex-1 min-w-0" },
  ],
};
/** LV-CASH-FLOW-MANUAL-PROJECTION-PICKER-CLIPPING — create fields wrap; never a single non-wrapping shrink-0 strip. */
const MDP_CREATE_FIELD = "min-w-[11rem] max-w-full basis-[11rem] grow";

/** Same payment-priority buckets as Projected / Rolling Ledger V3 (V3_EXPENSE_GROUPS). */
function expenseGroupKey(e: ForecastEntry): (typeof V3_EXPENSE_GROUPS)[number] {
  const t = `${e.category ?? ""} ${e.party_name ?? ""} ${e.party_ref_label ?? ""} ${e.memo ?? ""} ${e.ref_kind ?? ""} ${e.ref_label ?? ""}`.toLowerCase();
  if (/loan|lease|amort|note|rent|finance/.test(t)) return "finance & lease";
  if (/driver|settlement|driver_bill/.test(t) || e.party_ref_kind === "driver") return "driver bills";
  if (/diesel|fuel|relay|card fill/.test(t)) return "diesel";
  if (/maint|tire|parts|shop|work.?order|\bwo[- ]/.test(t)) return "maintenance";
  if (/insur/.test(t)) return "insurance";
  return "other";
}

function expenseGroupLabel(key: (typeof V3_EXPENSE_GROUPS)[number], index: number): string {
  const titles: Record<(typeof V3_EXPENSE_GROUPS)[number], string> = {
    "finance & lease": "Finance & lease payments",
    "driver bills": "Driver bills",
    diesel: "Diesel",
    maintenance: "Maintenance",
    insurance: "Insurance",
    other: "Other",
  };
  return `${index + 1} · ${titles[key]}`;
}

function groupExpenseEntries(entries: ForecastEntry[]): { key: (typeof V3_EXPENSE_GROUPS)[number]; label: string; rows: ForecastEntry[] }[] {
  const buckets = new Map<(typeof V3_EXPENSE_GROUPS)[number], ForecastEntry[]>();
  for (const key of V3_EXPENSE_GROUPS) buckets.set(key, []);
  for (const e of entries) {
    const key = expenseGroupKey(e);
    buckets.get(key)!.push(e);
  }
  return V3_EXPENSE_GROUPS.map((key, index) => ({
    key,
    label: expenseGroupLabel(key, index),
    rows: buckets.get(key) ?? [],
  })).filter((g) => g.rows.length > 0);
}

const thStyle: CSSProperties = {
  fontSize: V3_TABLE.headerPx,
  fontWeight: 600,
  color: V3.muted,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  fontFamily: V3.font,
};

function ProjectionPanel({
  direction,
  title,
  subtitle,
  entries,
  panelTotalCents,
  operatingCompanyId,
  projectionDate,
  onChanged,
}: {
  direction: Direction;
  title: string;
  subtitle?: string;
  entries: ForecastEntry[];
  /** Same cents total as KPI cards — from parent computeProjectionTotals. */
  panelTotalCents: number;
  operatingCompanyId: string;
  projectionDate: string;
  onChanged: () => void;
}) {
  const [form, setForm] = useState<RowForm>(emptyRow());
  const [showMore, setShowMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accentColor = direction === "income" ? V3.ink : V3.red;
  const columns = MDP_COLUMNS[direction];
  const expenseGroups = direction === "expense" ? groupExpenseEntries(entries) : null;
  // LEAD 443.264.4: the panel total drills to exactly this panel's rows for the projection date.
  const panelDrill = { target: "cash_flow_manual", date: projectionDate, direction } as const;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const entryDate = form.entry_date || projectionDate;
      if (!entryDate) throw new Error("Pick a Projection date first");
      const cents = form.amount_cents ?? 0;
      if (cents < 0) throw new Error("Total must be ≥ 0");
      // income: Unit no. -> ref_label (ref_kind 'unit'); Invoice -> invoice_no; Customer -> party_name.
      // expense: Bill/Exp No. -> invoice_no; Vendor/Driver -> party_name; Expense -> category.
      const refKind: "" | ForecastRefKind =
        direction === "income" && form.ref_label && !form.ref_kind ? "unit" : form.ref_kind;
      const payload = {
        operating_company_id: operatingCompanyId,
        entry_date: entryDate,
        direction,
        amount_cents: cents,
        party_name: form.party_name || null,
        invoice_no: form.invoice_no || null,
        category: form.category || null,
        memo: form.memo || null,
        ref_kind: refKind || null,
        ref_label: form.ref_label || null,
        ref_external_id: form.ref_external_id || null,
        party_ref_kind: direction === "income" && form.party_ref_id ? "customer" : form.party_ref_kind || null,
        party_ref_id: form.party_ref_id || null,
        party_ref_label: form.party_ref_label || null,
      };
      if (form.id) await updateForecastEntry(form.id, payload);
      else await createForecastEntry(payload);
    },
    onSuccess: () => {
      setForm(emptyRow());
      setShowMore(false);
      setError(null);
      onChanged();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Save failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteForecastEntry(id, operatingCompanyId),
    onSuccess: () => {
      setError(null);
      onChanged();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Delete failed"),
  });

  const editRow = (e: ForecastEntry) => {
    setForm({
      id: e.id,
      entry_date: e.entry_date,
      amount_cents: toCents(e.amount_cents),
      party_name: e.party_name ?? "",
      invoice_no: e.invoice_no ?? "",
      category: e.category ?? "",
      memo: e.memo ?? "",
      ref_kind: e.ref_kind ?? "",
      ref_label: e.ref_label ?? "",
      ref_external_id: e.ref_external_id ?? "",
      party_ref_kind: e.party_ref_kind === "driver" || e.party_ref_kind === "customer" || e.party_ref_kind === "vendor" ? e.party_ref_kind : "",
      party_ref_id: e.party_ref_id ?? "",
      party_ref_label: e.party_ref_label ?? "",
    });
    // Reveal "+ more" only for the legacy fields that aren't already primary columns.
    setShowMore(Boolean(e.memo || (direction === "income" ? e.category : e.ref_label)));
  };

  const cellValue = (e: ForecastEntry, key: MdpColKey) => (e[key] ?? "") || "—";

  const renderRow = (e: ForecastEntry) => (
    <div
      key={e.id}
      className="flex items-center gap-2 px-3 py-1.5 text-xs"
      style={{ borderBottom: `1px solid ${V3.borderSoft}`, color: V3.ink, fontFamily: V3.font, fontSize: V3_TABLE.fontPx }}
      data-mdp-row={direction}
    >
      {columns.map((c) => (
        <span key={c.key} className={`${c.w} shrink-0 truncate ${c.key === columns[0].key ? "font-medium" : ""}`} title={String(cellValue(e, c.key))}>
          {c.key === "ref_label" && e.ref_kind === "unit" && e.ref_external_id ? (
            <EntityLinkOrTombstone kind="unit" id={e.ref_external_id} name={e.ref_label} noun="Unit" />
          ) : c.key === "party_name" && (e.party_ref_kind === "driver" || e.party_ref_kind === "customer" || e.party_ref_kind === "vendor") && e.party_ref_id ? (
            <EntityLinkOrTombstone
              kind={e.party_ref_kind}
              id={e.party_ref_id}
              name={e.party_ref_label ?? e.party_name}
              noun={e.party_ref_kind === "driver" ? "Driver" : e.party_ref_kind === "vendor" ? "Vendor" : "Customer"}
            />
          ) : cellValue(e, c.key)}
        </span>
      ))}
      <span className="w-24 shrink-0 text-right font-semibold tabular-nums" style={{ color: accentColor }}><AmountLink filter={{ target: "cash_flow_manual", date: String(e.entry_date).slice(0, 10), direction: e.direction, entryId: e.id }}>{fmtCents(toCents(e.amount_cents))}</AmountLink></span>
      <span className="flex w-16 shrink-0 justify-end gap-2">
        <button type="button" className="hover:underline" style={{ color: V3.muted }} onClick={() => editRow(e)}>Edit</button>
        <button type="button" className="hover:underline" style={{ color: V3.red }} onClick={() => deleteMutation.mutate(e.id)}>Del</button>
      </span>
    </div>
  );

  const panelShell: CSSProperties = {
    background: V3.surface,
    border: `1px solid ${V3.border}`,
    borderRadius: 2,
    fontFamily: V3.font,
  };

  return (
    <div className="flex h-full min-h-[24rem] flex-col" style={panelShell} data-mdp-panel={direction} data-testid={`cash-flow-mdp-v3-${direction}-panel`}>
      <div
        className="flex shrink-0 items-center justify-between gap-2 px-3.5 py-2.5"
        style={{ borderBottom: `1px solid ${V3.borderSoft}` }}
      >
        <div className="flex min-w-0 items-baseline gap-2">
          <h3 className="truncate font-bold" style={{ color: V3.ink, fontSize: 13 }}>{title}</h3>
          {subtitle ? <span className="truncate" style={{ color: V3.muted, fontSize: V3_TABLE.headerPx }}>{subtitle}</span> : null}
        </div>
        <span className="shrink-0 text-xs font-semibold tabular-nums" style={{ color: accentColor }} data-mdp-header-total={direction}>{fmtCents(panelTotalCents)}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto" data-mdp-panel-list={direction}>
      {entries.length === 0 ? (
        <div className="px-3 py-4 text-center text-xs" style={{ color: V3.mutedSoft }}>No {direction} lines yet.</div>
      ) : (
        <div>
          {/* Column headers (per-direction). */}
          <div className="flex items-center gap-2 px-3 py-1.5" style={{ ...thStyle, background: V3.headerBg, borderBottom: `1px solid ${V3.border}` }}>
            {columns.map((c) => (
              <span key={c.key} className={`${c.w} shrink-0 truncate`}>{c.label}</span>
            ))}
            <span className="w-24 shrink-0 text-right">Total</span>
            <span className="w-16 shrink-0" />
          </div>
          {expenseGroups
            ? expenseGroups.map((group) => (
                <div key={group.key} data-mdp-expense-group={group.key}>
                  <div
                    className="flex items-center gap-2 px-3 py-1.5"
                    style={{ background: V3.band, borderBottom: `1px solid ${V3.borderSoft}` }}
                  >
                    <span className="flex-1 font-bold uppercase tracking-wide" style={{ color: V3.ink, fontSize: V3_TABLE.headerPx, letterSpacing: "0.04em" }}>
                      {group.label}
                    </span>
                    <span className="w-24 shrink-0 text-right text-xs font-bold tabular-nums" style={{ color: V3.ink }}>
                      <AmountLink filter={{ target: "cash_flow_manual", date: projectionDate, direction: "expense", group: group.key }}>
                        {fmtCents(group.rows.reduce((s, r) => s + toCents(r.amount_cents), 0))}
                      </AmountLink>
                    </span>
                    <span className="w-16 shrink-0" />
                  </div>
                  {group.rows.map(renderRow)}
                </div>
              ))
            : entries.map(renderRow)}
          {/* DEFECT 1 — explicit summed Total footer (recomputes live with the rows). */}
          <div
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold"
            style={{ borderTop: `1px solid ${V3.border}`, background: V3.headerBg }}
          >
            <span className="flex-1 text-right uppercase tracking-wide" style={{ color: V3.muted }}>
              {direction === "income" ? "Total income" : "Total expenses"}
            </span>
            <span className="w-24 shrink-0 text-right tabular-nums" style={{ color: accentColor }} data-mdp-footer-total={direction}><AmountLink filter={panelDrill}>{fmtCents(panelTotalCents)}</AmountLink></span>
            <span className="w-16 shrink-0" />
          </div>
        </div>
      )}
      </div>

      {/* Single horizontal add / edit row: the named columns, then optional "+ more". */}
      <div className="shrink-0 space-y-1.5 px-3 py-2 text-xs" style={{ borderTop: `1px solid ${V3.borderSoft}`, background: V3.headerBg }}>
        {form.id ? (
          <div className="rounded-sm px-2 py-1 text-xs font-semibold" style={{ background: V3.page, color: V3.muted }} data-mdp-editing={direction}>
            Editing existing {direction} line — change fields then press Save.
          </div>
        ) : null}
        <div
          className="flex flex-wrap items-end gap-1.5"
          data-mdp-create-row={direction}
          data-mdp-create-row-layout="wrap"
        >
          {columns.map((c) => c.key === "ref_label" && direction === "income" ? (
            <EntityPicker key={c.key} kind="unit" operatingCompanyId={operatingCompanyId} value={form.ref_external_id || null} onChange={(id) => setForm((f) => ({ ...f, ref_kind: "unit", ref_external_id: id ?? "", ref_label: "" }))} placeholder="Select unit" className={MDP_CREATE_FIELD} />
          ) : c.key === "party_name" && direction === "income" ? (
            <EntityPicker key={c.key} kind="customer" operatingCompanyId={operatingCompanyId} value={form.party_ref_id || null} onChange={(id) => setForm((f) => ({ ...f, party_ref_kind: "customer", party_ref_id: id ?? "", party_name: "" }))} placeholder="Select customer" className={MDP_CREATE_FIELD} />
          ) : c.key === "party_name" && direction === "expense" ? (
            <div key={c.key} className={`${MDP_CREATE_FIELD} flex gap-1`}>
              <SelectCombobox
                aria-label="Vendor or driver type"
                className="h-7 w-20 shrink-0 rounded-sm border px-1"
                style={{ borderColor: V3.border }}
                value={form.party_ref_kind}
                onChange={(ev) => setForm((f) => ({ ...f, party_ref_kind: ev.target.value as RowForm["party_ref_kind"], party_ref_id: "", party_ref_label: "", party_name: "" }))}
              >
                <option value="">Name</option>
                <option value="vendor">Vendor</option>
                <option value="driver">Driver</option>
              </SelectCombobox>
              {form.party_ref_kind === "driver" ? (
                <DriverPickerWithCreate
                  operatingCompanyId={operatingCompanyId}
                  value={form.party_ref_id || null}
                  onChange={(id) => setForm((f) => ({ ...f, party_ref_id: id ?? "" }))}
                  placeholder="Select driver"
                  className="min-w-0 flex-1"
                  driverRoster="active_or_probation"
                />
              ) : form.party_ref_kind === "vendor" ? (
                <EntityPicker kind="vendor" operatingCompanyId={operatingCompanyId} value={form.party_ref_id || null} onChange={(id) => setForm((f) => ({ ...f, party_ref_id: id ?? "" }))} placeholder="Select vendor" className="min-w-0 flex-1" allowCreate />
              ) : (
                <input aria-label={c.label} placeholder={c.label} className="h-7 min-w-0 flex-1 rounded-sm border px-2" style={{ borderColor: V3.border }} value={form.party_name} onChange={(ev) => setForm((f) => ({ ...f, party_name: ev.target.value }))} />
              )}
            </div>
          ) : (
            <input key={c.key} placeholder={c.label} aria-label={c.label} className={`h-7 ${MDP_CREATE_FIELD} rounded-sm border px-2`} style={{ borderColor: V3.border }} value={form[c.key]} onChange={(ev) => setForm((f) => ({ ...f, [c.key]: ev.target.value }))} />
          ))}
          <MoneyInput valueCents={form.amount_cents} onChangeCents={(c) => setForm((f) => ({ ...f, amount_cents: c }))} placeholder="Total" ariaLabel="Total" className="w-24 min-w-[6rem] grow-0" />
        </div>

        <button type="button" className="text-xs hover:underline" style={{ color: V3.muted }} onClick={() => setShowMore((v) => !v)}>
          {showMore ? "− less" : "+ more"}
        </button>

        {showMore ? (
          // Legacy fields preserved (ADDITIVE-ONLY), behind the expander. invoice_no is now a primary
          // column for BOTH directions, so "+ more" exposes only the remaining fields: income = Category;
          // expense = optional Link (kind + label); plus Memo for both.
          <div className="grid grid-cols-2 gap-1.5 pt-1.5" style={{ borderTop: `1px solid ${V3.borderSoft}` }}>
            {direction === "income" ? (
              <input placeholder="Category" className="h-7 rounded-sm border px-2" style={{ borderColor: V3.border }} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            ) : (
              <>
                <SelectCombobox className="h-7 rounded-sm border px-2" style={{ borderColor: V3.border }} value={form.ref_kind} onChange={(e) => setForm({ ...form, ref_kind: e.target.value as RowForm["ref_kind"] })}>
                  <option value="">Link (none)</option>
                  {REF_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                </SelectCombobox>
                <input placeholder="Link label" className="h-7 rounded-sm border px-2" style={{ borderColor: V3.border }} value={form.ref_label} onChange={(e) => setForm({ ...form, ref_label: e.target.value })} />
              </>
            )}
            <input placeholder="Memo" className="col-span-2 h-7 rounded-sm border px-2" style={{ borderColor: V3.border }} value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
          </div>
        ) : null}

        {error ? <p style={{ color: V3.red }} role="alert">{error}</p> : null}
        <div className="flex justify-end gap-2">
          {form.id ? (
            <button type="button" className="h-7 rounded-sm border px-2 hover:opacity-90" style={{ borderColor: V3.border, background: V3.surface, color: V3.ink }} onClick={() => { setForm(emptyRow()); setShowMore(false); }}>Cancel</button>
          ) : null}
          {/* PUNCHLIST #193: this is the panel's PRIMARY submit action (not a reference-dropdown mini-
              create), so it takes the locked "+ Create" vocab; "+ Add new ___" is reserved for the
              inline dropdown-create pattern elsewhere. */}
          <button
            type="button"
            className="h-7 rounded-sm px-3 font-semibold disabled:opacity-50"
            style={{ background: V3.shell, color: V3.onShell }}
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {form.id ? "Save" : `+ Create ${direction} line`}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ManualDailyProjectionsTab({ operatingCompanyId }: { operatingCompanyId: string }) {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const entryId = searchParams.get("entry_id") ?? undefined;
  const partyRefKindParam = searchParams.get("party_ref_kind");
  const partyRefKind: "customer" | "driver" | "vendor" | undefined =
    partyRefKindParam === "customer" || partyRefKindParam === "driver" || partyRefKindParam === "vendor"
      ? partyRefKindParam
      : undefined;
  const partyRefId = searchParams.get("party_ref_id") ?? undefined;
  const refKind = searchParams.get("ref_kind") === "unit" ? "unit" as const : undefined;
  const refExternalId = searchParams.get("ref_external_id") ?? undefined;
  const reverseFilter = {
    entry_id: entryId,
    party_ref_kind: partyRefKind,
    party_ref_id: partyRefId,
    ref_kind: refKind,
    ref_external_id: refExternalId,
  };
  // LEAD 443.264.4 — the money-cell drill (AmountLink target cash_flow_manual): ?date=, ?direction=, ?group= narrow the
  // tab to exactly the rows the clicked figure summed (the same date / direction / expense-group the totals use).
  const dateParam = searchParams.get("date");
  const drillDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : null;
  const directionParam = searchParams.get("direction");
  const drillDirection = directionParam === "income" || directionParam === "expense" ? directionParam : null;
  const groupParam = searchParams.get("group");
  const drillGroup = groupParam && (V3_EXPENSE_GROUPS as readonly string[]).includes(groupParam) ? groupParam : null;
  const hasReverseFilter = Object.values(reverseFilter).some(Boolean) || Boolean(drillDirection || drillGroup);
  // MDP-SINGLE-ROW: ONE projection date (daily projections — one day per entry), not a From/To
  // range. It is the default entry_date for new rows on both panels.
  const [projectionDate, setProjectionDate] = useState(() => drillDate ?? companyToday());
  useEffect(() => {
    if (drillDate) setProjectionDate(drillDate);
  }, [drillDate]);
  const [openingDraft, setOpeningDraft] = useState<number | null>(null);
  const [pullError, setPullError] = useState<string | null>(null);

  const entriesQuery = useQuery({
    queryKey: ["forecast", "entries", operatingCompanyId, reverseFilter],
    queryFn: () => listForecastEntries(operatingCompanyId, undefined, undefined, reverseFilter),
    enabled: Boolean(operatingCompanyId),
  });
  const openingQuery = useQuery({
    queryKey: ["forecast", "opening", operatingCompanyId],
    queryFn: () => getForecastOpeningBalance(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });
  // LEAD 443.283: the bank list is the authoritative operating cash (same source as Cash Flow Home's
  // opening cash), never every "real" banking tile — tiles include card payables and the Faro
  // factoring/escrow accounts, which are not cash (they summed to $102,867.17 vs Home $25,533.37).
  const banksQuery = useQuery({
    queryKey: ["cash-flow", "opening-cash", operatingCompanyId],
    queryFn: () => getCashFlowOpeningCash(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });

  const [openingError, setOpeningError] = useState<string | null>(null);
  const openingMutation = useMutation({
    mutationFn: (amountCents?: number) =>
      putForecastOpeningBalance({ operating_company_id: operatingCompanyId, amount_cents: amountCents ?? openingDraft ?? 0 }),
    onSuccess: () => {
      setOpeningError(null);
      setOpeningDraft(null);
      void qc.invalidateQueries({ queryKey: ["forecast", "opening", operatingCompanyId] });
    },
    onError: (e) => setOpeningError(e instanceof Error ? e.message : "Failed to save opening cash"),
  });

  const pullMutation = useMutation({
    mutationFn: async () => {
      if (!projectionDate) throw new Error("Pick a Projection date first");
      return pullManualTransactions(operatingCompanyId, projectionDate);
    },
    onSuccess: (result) => {
      setPullError(null);
      void qc.invalidateQueries({ queryKey: ["forecast", "entries", operatingCompanyId] });
      if (result.issues.length) setPullError(`${result.issues.length} prior snapshots preserved for review: ${[...new Set(result.issues.map(row => row.reason))].join("; ")}`);
      else if (result.created === 0) setPullError("No new software bills, expenses, payments, or invoices for this date (already pulled or empty).");
    },
    // The server pull is atomic and serializes same-company/date retries. Refresh
    // cached snapshots after errors as well, including an uncertain network response.
    onError: (e) => {
      setPullError(e instanceof Error ? e.message : "Pull from software failed");
      void qc.invalidateQueries({ queryKey: ["forecast", "entries", operatingCompanyId] });
    },
  });

  const onChanged = () => void qc.invalidateQueries({ queryKey: ["forecast", "entries", operatingCompanyId] });

  const allEntries = useMemo(() => entriesQuery.data?.entries ?? [], [entriesQuery.data?.entries]);
  const historyDates = useMemo(() => {
    const dates = new Set(allEntries.map((e) => String(e.entry_date).slice(0, 10)).filter(Boolean));
    return [...dates].sort().reverse();
  }, [allEntries]);
  const entries = useMemo(
    () =>
      (projectionDate ? allEntries.filter((e) => String(e.entry_date).slice(0, 10) === projectionDate) : allEntries)
        .filter((e) => !drillDirection || e.direction === drillDirection)
        .filter((e) => !drillGroup || (e.direction === "expense" && expenseGroupKey(e) === drillGroup)),
    [allEntries, projectionDate, drillDirection, drillGroup],
  );
  const realBanks = useMemo(() => banksQuery.data?.accounts ?? [], [banksQuery.data?.accounts]);
  // The total is the server's authoritative opening cash (ties to Cash Flow Home by construction).
  const bankTotalDollars = (banksQuery.data?.opening_cash_cents ?? 0) / 100;
  const income = useMemo(() => entries.filter((e) => e.direction === "income"), [entries]);
  const expense = useMemo(() => entries.filter((e) => e.direction === "expense"), [entries]);
  // Totals math is UNCHANGED (#1084 summing fix preserved).
  const { incomeCents: totalIncome, expenseCents: totalExpense, netCents: net } = computeProjectionTotals(entries);
  // LEAD 443.283: with no saved manual opening, the projection opens from the authoritative bank cash
  // (same figure as Cash Flow Home), never from $0.00.
  const hasSavedOpening = Boolean(openingQuery.data?.updated_at);
  const openingCents = hasSavedOpening ? toCents(openingQuery.data?.amount_cents) : Math.round(bankTotalDollars * 100);
  const projectedClosing = openingCents + net;
  const netPositive = net >= 0;
  const dateLabel = projectionDate || "—";

  return (
    <div className="space-y-3" style={{ fontFamily: V3.font }} data-testid="cash-flow-mdp-v3-tab">
      {hasReverseFilter ? (
        <Link className="text-xs font-semibold underline" style={{ color: V3.link }} to="/cash-flow?tab=manual_daily_projections">
          Clear projection filter
        </Link>
      ) : null}
      {(entriesQuery.isError || openingQuery.isError) && (
        <ListErrorBanner
          message={`Failed to load projections: ${((entriesQuery.error ?? openingQuery.error) as Error | undefined)?.message ?? "Request failed"}`}
          onRetry={() => {
            void entriesQuery.refetch();
            void openingQuery.refetch();
          }}
        />
      )}
      {(entriesQuery.isLoading || openingQuery.isLoading) && (
        <div className="rounded-sm p-4 text-xs" style={{ border: `1px solid ${V3.border}`, background: V3.surface, color: V3.muted }}>
          Loading projections…
        </div>
      )}

      {/* SINGLE projection date (board toolbar) — still one day, not From/To. */}
      <div
        className="flex flex-wrap items-center gap-2 rounded-sm px-3 py-2 text-xs"
        style={{ border: `1px solid ${V3.border}`, background: V3.surface }}
        data-mdp-single-date="true"
        data-testid="cash-flow-mdp-v3-toolbar"
      >
        <label className="font-semibold" style={{ color: V3.muted }}>Projection date</label>
        <DatePicker value={projectionDate} onChange={setProjectionDate} className="w-40" placeholder="Pick a day" />
        <label className="font-semibold" style={{ color: V3.muted }}>History</label>
        <SelectCombobox
          className="h-7 rounded-sm border px-2"
          value={historyDates.includes(projectionDate) ? projectionDate : ""}
          onChange={(e) => { if (e.target.value) setProjectionDate(e.target.value); }}
          aria-label="Saved projection dates"
        >
          <option value="">Saved days…</option>
          {historyDates.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </SelectCombobox>
        <span style={{ color: V3.mutedSoft }}>— one day per entry; lines save to that date.</span>
        <button
          type="button"
          className="ml-auto h-7 rounded-sm px-3 font-semibold disabled:opacity-50"
          style={{ background: V3.shell, color: V3.onShell }}
          // GO-0042: also gate on entriesQuery.isFetching -- after a failed pull, onError now
          // invalidates the cache, but the refetch is async. Without this, a user who retries
          // before that refetch lands would still hand pullMutation a stale existingKeys set via
          // the closure over `allEntries`, reopening the exact duplicate-creation window the
          // onError invalidation above is meant to close.
          disabled={pullMutation.isPending || entriesQuery.isFetching || !projectionDate}
          onClick={() => pullMutation.mutate()}
        >
          Pull bills / expenses / payments
        </button>
      </div>
      {pullError ? <p className="text-xs" style={{ color: V3.red }} role="alert">{pullError}</p> : null}

      {/* KPI cards — board order: Bank · Income · Expenses · Net; MDP markers + min-h preserved. */}
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}
        data-mdp-kpi-row="true"
        data-testid="cash-flow-mdp-v3-kpis"
      >
        <div className="flex min-h-[5.5rem] flex-col" data-mdp-kpi="bank">
          <V3KpiTile
            label="Bank balances (live TMS)"
            value={banksQuery.isError ? "—" : formatUsd(bankTotalDollars)}
            sub="opening cash"
            tone="ink"
            testId="cash-flow-mdp-v3-kpi-bank"
          />
        </div>
        <div className="flex min-h-[5.5rem] flex-col" data-mdp-kpi="income">
          <V3KpiTile
            label="Expected income"
            value={fmtCents(totalIncome)}
            sub="manual + automatic"
            tone="ink"
            testId="cash-flow-mdp-v3-kpi-income"
          />
          <span className="sr-only" data-mdp-kpi-total="income">{fmtCents(totalIncome)}</span>
        </div>
        <div className="flex min-h-[5.5rem] flex-col" data-mdp-kpi="expense">
          <V3KpiTile
            label="Expected expenses"
            value={fmtCents(totalExpense)}
            sub="manual + automatic"
            tone="ink"
            testId="cash-flow-mdp-v3-kpi-expense"
          />
          <span className="sr-only" data-mdp-kpi-total="expense">{fmtCents(totalExpense)}</span>
        </div>
        <div className="flex min-h-[5.5rem] flex-col" data-mdp-kpi="net">
          <V3KpiTile
            label="Predicted net"
            value={fmtCents(net)}
            tone={netPositive ? "green" : "red"}
            sub={`closing ${fmtCents(projectedClosing)}`}
            testId="cash-flow-mdp-v3-kpi-net"
          />
          <span className="sr-only" data-mdp-kpi-total="net">{fmtCents(net)}</span>
        </div>
      </div>

      {/* Opening editor + bank detail (V3Panel) — same APIs; projection only. */}
      <V3Panel
        title="Opening cash & banks"
        subtitle={`projected closing ${fmtCents(projectedClosing)}`}
        testId="mdp-bank-balances"
        headerRight={
          <span className="inline-flex items-center gap-1 text-xs">
            <MoneyInput valueCents={openingDraft} onChangeCents={setOpeningDraft} placeholder="Set opening" ariaLabel="Opening cash" className="w-32" />
            <button
              type="button"
              className="h-7 rounded-sm border px-2 font-semibold disabled:opacity-50"
              style={{ borderColor: V3.border, background: V3.surface, color: V3.ink }}
              disabled={openingMutation.isPending || openingDraft === null}
              onClick={() => { setOpeningError(null); openingMutation.mutate(openingDraft ?? 0); }}
            >
              Save
            </button>
          </span>
        }
      >
        <div className="space-y-2 px-3.5 py-3 text-xs" style={{ color: V3.ink }}>
          <p>
            Opening cash: <strong className="tabular-nums">{fmtCents(openingCents)}</strong>
            {" · "}
            Projected closing:{" "}
            <strong className="tabular-nums" style={{ color: projectedClosing < 0 ? V3.red : V3.ink }}>{fmtCents(projectedClosing)}</strong>
          </p>
          {openingError ? <span className="text-xs" style={{ color: V3.red }} data-testid="cash-flow-opening-error" role="alert">{openingError}</span> : null}
          {banksQuery.isError ? (
            <p style={{ color: V3.red }}>Could not load banks.</p>
          ) : realBanks.length === 0 ? (
            <p style={{ color: V3.muted }}>No real bank tiles for this company yet.</p>
          ) : (
            <ul className="space-y-1">
              {realBanks.map((bank) => (
                <li key={bank.id} className="flex justify-between gap-4">
                  <span>{bank.display_name}</span>
                  <span className="tabular-nums font-semibold">{formatUsdCents(bank.cents)}</span>
                </li>
              ))}
              {realBanks.length > 1 ? (
                <li className="flex justify-between gap-4 pt-1 font-semibold" style={{ borderTop: `1px solid ${V3.borderSoft}` }}>
                  <span>Total cash</span>
                  <span className="tabular-nums">{formatUsd(bankTotalDollars)}</span>
                </li>
              ) : null}
            </ul>
          )}
          <button
            type="button"
            className="h-7 rounded-sm border px-2 font-semibold disabled:opacity-50"
            style={{ borderColor: V3.border, background: V3.surface, color: V3.ink }}
            disabled={realBanks.length === 0 || openingMutation.isPending}
            onClick={() => {
              const cents = Math.round(bankTotalDollars * 100);
              setOpeningDraft(cents);
              setOpeningError(null);
              openingMutation.mutate(cents);
            }}
          >
            Use bank total as opening cash
          </button>
        </div>
      </V3Panel>

      {/* Income (left) / Expenses (right) — equal-height stretch panels. */}
      <div className="grid grid-cols-1 items-stretch gap-3 lg:grid-cols-2" data-mdp-panels="equal-height">
        <ProjectionPanel
          direction="income"
          title={`Income · ${dateLabel}`}
          subtitle="your lines"
          entries={income}
          panelTotalCents={totalIncome}
          operatingCompanyId={operatingCompanyId}
          projectionDate={projectionDate}
          onChanged={onChanged}
        />
        <ProjectionPanel
          direction="expense"
          title={`Expenses · ${dateLabel}`}
          subtitle="payment priority order"
          entries={expense}
          panelTotalCents={totalExpense}
          operatingCompanyId={operatingCompanyId}
          projectionDate={projectionDate}
          onChanged={onChanged}
        />
      </div>

      <div
        className="flex items-start gap-2 rounded-sm px-3 py-2 text-xs"
        style={{ background: V3.surface, border: `1px solid ${V3.border}`, borderLeft: `3px solid ${V3.amber}`, color: V3.ink }}
        data-testid="cash-flow-mdp-v3-measured"
      >
        <b style={{ color: V3.amber, whiteSpace: "nowrap" }}>Measured</b>
        <span>Each manual line is audited (who · when · reason) and links to its customer, vendor, driver, unit, invoice or bill. Projection only — nothing posts to the books.</span>
      </div>
    </div>
  );
}
