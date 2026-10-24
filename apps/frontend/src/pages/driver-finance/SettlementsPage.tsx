import { settlementLabel } from "../../lib/settlementNumber";
import { useMemo, useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { NavyPageSubNav } from "../../components/layout/NavyPageSubNav";
import { listSettlements, getOpenDriverBills, listSettlementDeductions, type OpenDriverBill, type SettlementListRow, type SettlementReference } from "../../api/driverFinance";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { SettlementDetailPage } from "./SettlementDetailPage";
import { SettlementStatementWorkflowPage } from "./SettlementStatementWorkflowPage";
import { SettlementDisputesTab } from "./components/SettlementDisputesTab";
import { PresettlementSuggestionsTab } from "./components/PresettlementSuggestionsTab";
import { SettlementsTable } from "./components/SettlementsTable";
import { SettlementsToursRegister } from "./SettlementsToursRegister";
import { SettlementsCompanyDriverTab, CompanySettlementsRegisterTab } from "./SettlementsCompanyDriverTab";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { DataPanel } from "../../components/layout/DataPanel";
import { formatUsdCents } from "../../lib/money";
import { EntityLink } from "../../components/shared/EntityLink";
import { SettlementReferenceCell } from "../../components/settlements/SettlementReferenceCell";
import { useSettlementReferences } from "../../hooks/useSettlementReferences";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { V3 } from "../../design/v3-tokens";
import { V3KpiTile } from "../../components/v3/V3KpiTile";
import { V3Panel } from "../../components/v3/V3Panel";
import { V3Segmented } from "../../components/v3/V3Segmented";
import { EntityPicker } from "../../components/EntityPicker";
import { entityLabel, visibleDocumentLabel } from "../../lib/entity-label";
import { MoneyListToolbar } from "../../components/table/MoneyListToolbar";
import { MultiSelectDropdown } from "../../components/forms/MultiSelectDropdown";
import { useEntityBulkAction } from "../../components/bulk/useEntityBulkAction";
import { BulkProgressDialog } from "../../components/bulk/BulkProgressDialog";
import { VoidReasonModal } from "../../components/accounting/VoidReasonModal";
import { useToast } from "../../components/Toast";
import { bulkRowLabelsFromRows } from "../../components/bulk/bulkRowLabels";
import { SettlementCreatorDrawer } from "../settlements/SettlementCreatorDrawer";
import { listSourceChangedSettlements, type SettlementCreatorDraft, type SourceChangedSettlement } from "../../api/settlementCreator";
import { SETTLEMENTS_SUBNAV } from "./settlementsSubnav";

/** ROUND 443.250 — week buckets for Settlements home "Net driver pay by week" (Sunday start, matches This Period KPI). */
type SettlementsWeekBucket = { weekStartMs: number; label: string; net: number; gross: number; deductions: number };

function startOfWeekSunday(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - x.getDay());
  x.setHours(0, 0, 0, 0);
  return x;
}

function weekBucketLabel(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${m}-${day}`;
}

function buildSettlementsWeekBuckets(rows: SettlementListRow[], weekCount: number, now: Date): SettlementsWeekBucket[] {
  const thisWeek = startOfWeekSunday(now);
  const buckets: SettlementsWeekBucket[] = [];
  for (let i = weekCount - 1; i >= 0; i--) {
    const start = new Date(thisWeek);
    start.setDate(start.getDate() - i * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    let net = 0;
    let gross = 0;
    let deductions = 0;
    for (const s of rows) {
      if (s.status === "cancelled") continue;
      const pe = new Date(s.period_end);
      if (Number.isNaN(pe.getTime())) continue;
      if (pe.getTime() >= start.getTime() && pe.getTime() < end.getTime()) {
        net += Number(s.net_pay ?? 0);
        gross += Number(s.gross_pay ?? 0);
        deductions += Number(s.deductions_total ?? 0);
      }
    }
    buckets.push({ weekStartMs: start.getTime(), label: weekBucketLabel(start), net, gross, deductions });
  }
  return buckets;
}

function formatSettlementsUsd(dollars: number): string {
  return `$${dollars.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** ROUND 443.267 — board Settlements.dc.html deduction split buckets (Escrow / Advances / Fines). */
function settlementsDeductionBucket(type: string): "escrow" | "advances" | "fines" | "other" {
  const t = (type || "").toLowerCase();
  if (t.includes("escrow") || t.includes("bond") || t.includes("abandon")) return "escrow";
  if (t.includes("advance") || t.includes("zelle") || t.includes("cash_adv") || t.includes("wire") || t.includes("ach_fee")) return "advances";
  if (t.includes("fine") || t.includes("citation") || t.includes("violation") || t.includes("toll") || t === "damage" || t.includes("penalty")) return "fines";
  return "other";
}

function settlementsWeekLoadsLabel(s: SettlementListRow): string {
  const links = s.load_links ?? [];
  if (links.length) {
    const labels = links.map((l) => l.label).filter(Boolean);
    if (labels.length === 1) return labels[0]!;
    if (labels.length >= 2) return `${labels[0]} – ${labels[labels.length - 1]}`;
  }
  if (s.load_count > 0) return `${s.load_count} load${s.load_count === 1 ? "" : "s"}`;
  return "—";
}

/** Reimb = net − (gross − deductions) when list row has no reimbursements_total. */
function settlementsDerivedReimb(s: SettlementListRow): number {
  const gross = Number(s.gross_pay ?? 0);
  const ded = Number(s.deductions_total ?? 0);
  const net = Number(s.net_pay ?? 0);
  const reimb = net - (gross - ded);
  return Math.abs(reimb) < 0.005 ? 0 : reimb;
}

// 443.292-C — Settlement status (Open / Closed / Void) and Payment status (Unpaid / Paid) as two separate columns.
function settlementStatusLabel(s: SettlementListRow): "Open" | "Closed" | "Void" {
  // driver_settlements_status_check: a voided settlement is status "cancelled" (voided_at set) — there is no "void" value.
  if (s.status === "cancelled") return "Void";
  if (s.status === "closed" || s.status === "paid" || s.status === "approved" || s.status === "final") return "Closed";
  return "Open";
}
function settlementPaymentLabel(s: SettlementListRow): "Paid" | "Unpaid" | "Held" {
  if (s.status === "held") return "Held";
  if (s.status === "paid" || s.payment_state === "cleared" || s.payment_state === "manual_paid") return "Paid";
  return "Unpaid";
}

function formatWeekOfTitle(weekStart: Date): string {
  return weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}


/** LEAD 443.215 — one line per change of a settlement's printed source (same wording as the backend refusal). */
function describeSourceDiffLines(d: SourceChangedSettlement["diff"]): string[] {
  const money = (c: number) => (c / 100).toFixed(2);
  return [
    ...d.changed.map((c) => (c.field.endsWith("_cents") ? `${c.field.replace("_cents", "").replace("_", " ")}: ${money(Number(c.before))} → ${money(Number(c.after))}` : `${c.field}: ${String(c.before)} → ${String(c.after)}`)),
    ...d.added.map((l) => `+ ${l.kind.replace("_", " ")}${l.load ? ` load ${l.load}` : ""}${l.text ? ` "${l.text}"` : ""} ${money(l.amount_cents)}`),
    ...d.removed.map((l) => `− ${l.kind.replace("_", " ")}${l.load ? ` load ${l.load}` : ""}${l.text ? ` "${l.text}"` : ""} ${money(l.amount_cents)}`),
  ];
}

type FocusFilter = "debt" | "pending_acks" | "held" | null;
type PaymentStateValue =
  | "unpaid"
  | "queued"
  | "sent_to_bank"
  | "cleared"
  | "bounced"
  | "manual_paid";

const PAYMENT_STATE_OPTIONS: Array<{ value: PaymentStateValue; label: string }> = [
  { value: "unpaid", label: "Unpaid" },
  { value: "queued", label: "Queued" },
  { value: "sent_to_bank", label: "Sent" },
  { value: "cleared", label: "Cleared" },
  { value: "bounced", label: "Bounced" },
  { value: "manual_paid", label: "Manual Paid" },
];

function parsePaymentStates(params: URLSearchParams): PaymentStateValue[] {
  const allowed = new Set(PAYMENT_STATE_OPTIONS.map((o) => o.value));
  const raw = params.getAll("payment_state");
  return raw.filter((s): s is PaymentStateValue => allowed.has(s as PaymentStateValue));
}

function parseFocus(raw: string | null): FocusFilter {
  if (raw === "debt" || raw === "pending_acks" || raw === "held") return raw;
  return null;
}

export function SettlementsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
  const bulk = useEntityBulkAction();
  const [reverseOpen, setReverseOpen] = useState(false);
  const [pendingReverseIds, setPendingReverseIds] = useState<string[]>([]);
  const [pendingReverseLabels, setPendingReverseLabels] = useState<Record<string, string>>({});
  /** ROUND 443.250 — Net | Gross grain on the home week chart (board Settlements.dc.html). */
  const [weekChartGrain, setWeekChartGrain] = useState<"net" | "gross" | "deductions">("net");
  /** ROUND 443.267 — Week-of panel Open/Closed filter (board Settlements.dc.html). */
  const [weekOfPill, setWeekOfPill] = useState<"open" | "closed">("open");
  // ROUND 16.3 + 443.280-A — Company & Driver / Disputes / Needs Review / Open / Closed / Payments
  // are own SETTLEMENTS_SUBNAV tabs (not a Button row under the home board).
  const tabParam = searchParams.get("tab");
  const activeTab =
    tabParam === "disputes"
      ? "disputes"
      : tabParam === "company_driver"
        ? "company_driver"
        : tabParam === "company_settlements"
          ? "company_settlements"
          : tabParam === "needs_review"
            ? "needs_review"
            : tabParam === "open"
              ? "open"
              : tabParam === "closed"
                ? "closed"
                : tabParam === "payments" || searchParams.get("view") === "payments"
                  ? "payments"
                  : "settlements";
  // Drill target from the Company settlements register → the side-by-side (resolves to a driver settlement).
  const companySettlementParam = searchParams.get("company_settlement_id");
  // 443.280-A — Payments is its own tab (?tab=payments or legacy ?view=payments). Home is board-only.
  // Capability kept: payment pipeline + bulk void still mount on the Payments tab (never deleted).
  const selectedSettlementId = searchParams.get("settlement_id");
  // R-186.2 — half-page Settlement Creator panel (Company + Driver). Opened from Settlements
  // and Topbar Create via ?creator=1 — never a full page.
  const creatorOpen = searchParams.get("creator") === "1";
  // LEAD 443.215 — the new source the "source changed" Edit opens the Creator with.
  const [repostDraft, setRepostDraft] = useState<SettlementCreatorDraft | null>(null);
  const closeCreator = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("creator");
    setSearchParams(next, { replace: true });
  };
  const openCreator = () => {
    const next = new URLSearchParams(searchParams);
    next.set("creator", "1");
    setSearchParams(next, { replace: true });
  };
  // Driver profile "Full settlements" → /settlements?driver_id= (PreserveSearchNavigate keeps param).
  // BANK-F5165 — visible EntityPicker (URL-only client filter is not reverse chrome).
  const filterDriverId = searchParams.get("driver_id") || "";
  // 432-CUR #1 — payment_state is multi-select (?payment_state=a&payment_state=b).
  const paymentStates = parsePaymentStates(searchParams);
  // HIDE-VOIDED-01 — cancelled/reversed settlements clog the list after bulk reverse; default HIDE.
  // URL `include_cancelled=1` shows them (same pattern as safety "Show voided").
  const hideCancelled = searchParams.get("include_cancelled") !== "1";
  // B-A3: KPI focus filter — same predicates as the KPI counts (not a guess-route).
  const focusFilter = parseFocus(searchParams.get("focus"));
  const [search, setSearch] = useState("");

  const setPaymentStates = (next: string[]) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.delete("payment_state");
        for (const s of next) params.append("payment_state", s);
        return params;
      },
      { replace: true },
    );
  };
  const setDriverFilter = (next: string | null) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next) params.set("driver_id", next);
        else params.delete("driver_id");
        return params;
      },
      { replace: true },
    );
  };
  const setHideCancelled = (next: boolean) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next) params.delete("include_cancelled");
        else params.set("include_cancelled", "1");
        return params;
      },
      { replace: true },
    );
  };

  const sourceChangedQuery = useQuery({
    queryKey: ["settlements", "source-changed", companyId],
    queryFn: () => listSourceChangedSettlements(companyId),
    enabled: Boolean(companyId),
  });
  const listQuery = useQuery({
    queryKey: ["driver-finance", "settlements", companyId, paymentStates.slice().sort().join(",")],
    queryFn: () =>
      listSettlements(companyId, {
        payment_state: paymentStates.length ? paymentStates : undefined,
      }),
    enabled: Boolean(companyId),
  });
  // FAIL-SETL-KPI-PERIOD — KPI tiles must count the full entity-scoped list, not the payment_state-filtered
  // slice. Filtering the table must not shrink YTD / This Period / debt counts.
  // 443.218 F2: pass driver_id so KPI is scoped to selected driver; include in query key.
  const kpiBaseQuery = useQuery({
    queryKey: ["driver-finance", "settlements-kpi-base", companyId, filterDriverId],
    queryFn: () => listSettlements(companyId),
    enabled: Boolean(companyId),
  });
  const openBillsQuery = useQuery({
    queryKey: ["driver-finance", "open-driver-bills", companyId],
    queryFn: () => getOpenDriverBills(companyId),
    enabled: Boolean(companyId),
  });
  // ROUND 443.267 — deduction-type split for home panel (Escrow / Advances / Fines) from the same
  // listSettlementDeductions engine as /drivers/deductions — not a second money path.
  const deductionsListQuery = useQuery({
    queryKey: ["driver-finance", "settlements-home-deductions", companyId],
    queryFn: () => listSettlementDeductions(companyId, { limit: 500 }),
    enabled: Boolean(companyId),
  });

  const settlements = (listQuery.data?.settlements ?? []).filter((s) => {
    if (filterDriverId && s.driver_id !== filterDriverId) return false;
    if (hideCancelled && s.status === "cancelled") return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const hay = [
        settlementLabel(s),
        s.driver_full_name,
        s.payment_state,
        s.status,
        String(s.net_pay ?? ""),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  // R-102-B item 5 — owner: "a list that silently hides is the same class of defect as a badge
  // that never renders." hideCancelled is client-side over the already-fetched full list (no
  // server round-trip needed), so the hidden count is derived from the same source, minus the
  // one predicate that hides rows.
  const cancelledHiddenCount = hideCancelled
    ? (listQuery.data?.settlements ?? []).filter(
        (s) => (!filterDriverId || s.driver_id === filterDriverId) && s.status === "cancelled",
      ).length
    : 0;
  const kpiSettlements = (kpiBaseQuery.data?.settlements ?? []).filter((s) =>
    filterDriverId ? s.driver_id === filterDriverId : true,
  );
  const openBillsSummary = openBillsQuery.data?.open_driver_bills ?? { total_count: 0, total_gross_cents: 0, items: [] as OpenDriverBill[] };
  const now = new Date();
  const ytdYear = now.getFullYear();
  const periodStartOfWeek = (() => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    d.setDate(d.getDate() - d.getDay()); // Sunday start — matches Tasks planner This Week
    d.setHours(0, 0, 0, 0);
    return d;
  })();
  const isInThisPeriod = (s: (typeof kpiSettlements)[number]) => {
    const end = new Date(s.period_end);
    if (Number.isNaN(end.getTime())) return false;
    return end.getTime() >= periodStartOfWeek.getTime();
  };
  const isYtd = (s: (typeof kpiSettlements)[number]) => {
    const end = new Date(s.period_end);
    return !Number.isNaN(end.getTime()) && end.getFullYear() === ytdYear;
  };
  // CLS-MONEY-KPI-FAKE-ZERO-ON-FAILURE: kpiSettlements defaults to [] the moment kpiBaseQuery
  // errors, so every count below silently computed to a real-looking 0 instead of surfacing the
  // failure the ListErrorBanner (below) already knows about. Same for open_driver_bills against
  // openBillsQuery. "—" makes the failure visible on the tile itself, not just in a banner it sits
  // next to.
  // 443.218 F2: read KPIs from server-side aggregates (full set, not capped page).
  const serverKpi = kpiBaseQuery.data?.kpi;
  const kpis: Record<string, number | string> = {
    total_unpaid: kpiBaseQuery.isError ? "—" : (serverKpi?.total_unpaid ?? kpiSettlements.filter((s) => s.status !== "paid").length),
    this_period: kpiBaseQuery.isError ? "—" : (serverKpi?.this_period ?? kpiSettlements.filter(isInThisPeriod).length),
    drivers_with_debt: kpiBaseQuery.isError
      ? "—"
      : (serverKpi?.drivers_with_debt ?? kpiSettlements.filter((s) => typeof s.live_debt_flag === "number" && s.live_debt_flag > 0).length),
    pending_acks: kpiBaseQuery.isError ? "—" : (serverKpi?.pending_acks ?? kpiSettlements.filter((s) => s.has_pending_acks).length),
    held_deductions: kpiBaseQuery.isError ? "—" : (serverKpi?.held_deductions ?? kpiSettlements.filter((s) => s.status === "held").length),
    ytd_settlements: kpiBaseQuery.isError ? "—" : (serverKpi?.ytd_settlements ?? kpiSettlements.filter(isYtd).length),
    open_driver_bills: openBillsQuery.isError ? "—" : openBillsSummary.total_count,
  };
  // REG-005 — home KPI strip $ tile. net_pay is dollars (SettlementsTable renders $${net_pay.toFixed(2)}).
  // 443.218 F2: use server-side driver_pay_this_period (full set) when available.
  const driverPayThisPeriod: string = kpiBaseQuery.isError
    ? "—"
    : serverKpi != null
      ? `$${serverKpi.driver_pay_this_period.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : `$${kpiSettlements
          .filter((s) => isInThisPeriod(s) && s.status !== "cancelled")
          .reduce((sum, s) => sum + Number(s.net_pay ?? 0), 0)
          .toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // ROUND 443.250 — home week chart + deductions panel from the SAME kpiSettlements rows (no second engine).
  const weekBuckets = useMemo(
    () => (kpiBaseQuery.isError ? [] : buildSettlementsWeekBuckets(kpiSettlements, 11, now)),
    // now is calendar-day stable for the render; kpiSettlements identity tracks the query.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- periodStartOfWeek / now rebuilt each render from Date
    [kpiBaseQuery.isError, kpiSettlements],
  );
  const thisWeekBucket = weekBuckets.length ? weekBuckets[weekBuckets.length - 1] : null;
  const lastWeekBucket = weekBuckets.length > 1 ? weekBuckets[weekBuckets.length - 2] : null;
  const driverPayVsLastWeek = (() => {
    if (!thisWeekBucket || !lastWeekBucket) return null;
    const delta = thisWeekBucket.net - lastWeekBucket.net;
    if (delta === 0) return { label: "flat vs last wk", tone: "muted" as const };
    if (delta > 0) return { label: `▲ vs last wk`, tone: "green" as const };
    return { label: `▼ vs last wk`, tone: "red" as const };
  })();
  const deductionsThisWeek = thisWeekBucket?.deductions ?? 0;
  const weekChartMax = Math.max(
    1,
    ...weekBuckets.map((w) =>
      weekChartGrain === "net" ? w.net : weekChartGrain === "gross" ? w.gross : w.deductions,
    ),
  );

  const thisWeekSettlements = useMemo(() => {
    if (kpiBaseQuery.isError || !thisWeekBucket) return [] as SettlementListRow[];
    const start = thisWeekBucket.weekStartMs;
    const end = start + 7 * 24 * 60 * 60 * 1000;
    return kpiSettlements.filter((s) => {
      if (s.status === "cancelled") return false;
      const pe = new Date(s.period_end);
      if (Number.isNaN(pe.getTime())) return false;
      return pe.getTime() >= start && pe.getTime() < end;
    });
  }, [kpiBaseQuery.isError, thisWeekBucket, kpiSettlements]);

  // 443.292-C: bucket by settlement status (not payment status) so closed+unpaid rows land in "closed" pill.
  // Filter out empty tours ($0 gross + $0 net with status closed) from the closed view — duplicate empty rows.
  const weekOfOpenCount = thisWeekSettlements.filter((s) => settlementStatusLabel(s) === "Open").length;
  const weekOfClosedCount = thisWeekSettlements.filter((s) => settlementStatusLabel(s) === "Closed").length;
  const weekOfRows = thisWeekSettlements.filter((s) => {
    const stl = settlementStatusLabel(s);
    if (weekOfPill === "open") return stl === "Open";
    // Exclude empty closed settlements (no lines, $0 gross, $0 net) — they appear as duplicate blank driver rows.
    if (Number(s.gross_pay ?? 0) === 0 && Number(s.net_pay ?? 0) === 0 && stl === "Closed") return false;
    return stl === "Closed";
  });
  const weekOfTotals = weekOfRows.reduce(
    (acc, s) => {
      acc.gross += Number(s.gross_pay ?? 0);
      acc.ded += Number(s.deductions_total ?? 0);
      acc.reimb += settlementsDerivedReimb(s);
      acc.net += Number(s.net_pay ?? 0);
      return acc;
    },
    { gross: 0, ded: 0, reimb: 0, net: 0 },
  );

  const deductionSplitThisWeek = useMemo(() => {
    const empty = { escrow: { drivers: new Set<string>(), amount: 0 }, advances: { drivers: new Set<string>(), amount: 0 }, fines: { drivers: new Set<string>(), amount: 0 } };
    if (deductionsListQuery.isError || !thisWeekBucket) return empty;
    const start = thisWeekBucket.weekStartMs;
    const end = start + 7 * 24 * 60 * 60 * 1000;
    const rows = deductionsListQuery.data?.deductions ?? [];
    for (const d of rows) {
      if (String(d.status || "").toLowerCase() === "voided" || String(d.status || "").toLowerCase() === "cancelled") continue;
      const created = new Date(d.created_at);
      // Prefer applied settlement's period when we can match; else created_at in this week.
      let inWeek = !Number.isNaN(created.getTime()) && created.getTime() >= start && created.getTime() < end;
      if (d.applied_to_settlement_id) {
        const match = kpiSettlements.find((s) => s.id === d.applied_to_settlement_id);
        if (match) {
          const pe = new Date(match.period_end);
          inWeek = !Number.isNaN(pe.getTime()) && pe.getTime() >= start && pe.getTime() < end;
        }
      }
      if (!inWeek) continue;
      const bucket = settlementsDeductionBucket(d.deduction_type);
      if (bucket === "other") continue;
      empty[bucket].drivers.add(d.driver_id);
      empty[bucket].amount += Number(d.amount_cents ?? 0) / 100;
    }
    return empty;
  }, [deductionsListQuery.isError, deductionsListQuery.data, thisWeekBucket, kpiSettlements]);

  const focusedSettlements = useMemo(() => {
    if (focusFilter === "debt") {
      return settlements.filter((s) => typeof s.live_debt_flag === "number" && s.live_debt_flag > 0);
    }
    if (focusFilter === "pending_acks") {
      return settlements.filter((s) => s.has_pending_acks);
    }
    if (focusFilter === "held") {
      return settlements.filter((s) => s.status === "held");
    }
    return settlements;
  }, [settlements, focusFilter]);

  const setFocus = (next: FocusFilter) => {
    const params = new URLSearchParams(searchParams);
    if (next) params.set("focus", next);
    else params.delete("focus");
    setSearchParams(params);
  };
  // 443.218 F2: use server pipeline counts (full set) when available.
  const paymentPipeline = {
    unpaid: serverKpi?.pipeline.unpaid ?? kpiSettlements.filter((s) => (s.payment_state ?? "unpaid") === "unpaid").length,
    queued: serverKpi?.pipeline.queued ?? kpiSettlements.filter((s) => s.payment_state === "queued").length,
    sent_to_bank: serverKpi?.pipeline.sent_to_bank ?? kpiSettlements.filter((s) => s.payment_state === "sent_to_bank").length,
    cleared: serverKpi?.pipeline.cleared ?? kpiSettlements.filter((s) => s.payment_state === "cleared").length,
    bounced: serverKpi?.pipeline.bounced ?? kpiSettlements.filter((s) => s.payment_state === "bounced").length,
    manual_paid: serverKpi?.pipeline.manual_paid ?? kpiSettlements.filter((s) => s.payment_state === "manual_paid").length,
  };

  // 443.280-A — board Statement replaces the body (no Detail View chrome bar).
  // Finalize / payment / deductions / fuel fills live on ?workflow=1 (own route surface).
  if (selectedSettlementId && activeTab === "settlements") {
    if (searchParams.get("workflow") === "1") {
      return <SettlementStatementWorkflowPage />;
    }
    return <SettlementDetailPage />;
  }

  return (
    <div className="space-y-3">
      <PageHeader
        title="Driver Settlements"
        subtitle="List + detail settlement workflow"
        actions={
          <Button
            size="sm"
            variant="primary"
            data-testid="settlements-open-creator"
            onClick={openCreator}
          >
            + Settlement Creator
          </Button>
        }
      />

      <SettlementCreatorDrawer open={creatorOpen} onClose={() => { setRepostDraft(null); closeCreator(); }} allowPost={true} initialDraft={repostDraft} />

      {/* LEAD 443.215 — a settlement whose printed source changed after it was posted: the exact diff + Edit pre-filled. */}
      {(sourceChangedQuery.data?.settlements ?? []).length > 0 ? (
        <div className="rounded-[4px] border border-[#E5E7EB] bg-white" data-testid="settlements-source-changed">
          <div className="border-b border-[#E5E7EB] px-3 py-2 text-xs font-bold uppercase text-[#4B5563]">
            Source changed — repost needed ({sourceChangedQuery.data!.settlements.length})
          </div>
          {sourceChangedQuery.data!.settlements.map((row) => (
            <div key={row.settlement_id} className="flex items-start justify-between gap-3 border-b border-[#E5E7EB] px-3 py-2 text-[12px] last:border-b-0">
              <div className="space-y-0.5">
                <div className="font-semibold">
                  Settlement{" "}
                  <EntityLink kind="settlement" id={row.settlement_id} label={entityLabel(row.settlement_no ? `${row.settlement_no} (${row.display_id})` : row.display_id, row.settlement_id, "Settlement")} />
                  {" "}— posted {Number(row.net_pay).toFixed(2)}
                  {row.new_total_due_cents != null ? `, new TOTAL DUE ${(row.new_total_due_cents / 100).toFixed(2)}` : ""}
                </div>
                {describeSourceDiffLines(row.diff).map((line) => (
                  <div key={line} className="text-[#4B5563]">{line}</div>
                ))}
              </div>
              <Button
                size="sm"
                variant="primary"
                data-testid={`settlements-source-changed-edit-${row.settlement_id}`}
                disabled={!row.new_draft}
                onClick={() => { setRepostDraft(row.new_draft); openCreator(); }}
              >
                Edit = void and repost
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      {/* ROUND 443.254 N1 — every tab stays under /driver-finance/… */}
      {/* VERIFY-4 (acct-surf-09): Escrow leaf is SETTLEMENTS_SUBNAV → /driver-finance/escrow; Accounting mirror remains /accounting/escrow. */}
      {/* 443.280-A — Open / Closed / Payments / Company & Driver / Disputes / Needs Review live on SETTLEMENTS_SUBNAV (no Button row under the home board). */}
      <NavyPageSubNav items={[...SETTLEMENTS_SUBNAV]} />

      {activeTab === "company_driver" ? (
        <SettlementsCompanyDriverTab
          companyId={companyId}
          settlementId={selectedSettlementId}
          companySettlementId={companySettlementParam}
          onSelectSettlement={(id) => {
            const next = new URLSearchParams(searchParams);
            next.set("tab", "company_driver");
            next.delete("company_settlement_id");
            if (id) next.set("settlement_id", id);
            else next.delete("settlement_id");
            setSearchParams(next);
          }}
        />
      ) : null}

      {activeTab === "company_settlements" ? (
        <CompanySettlementsRegisterTab
          companyId={companyId}
          onOpen={(csId) => {
            const next = new URLSearchParams(searchParams);
            next.set("tab", "company_driver");
            next.delete("settlement_id");
            next.set("company_settlement_id", csId);
            setSearchParams(next);
          }}
        />
      ) : null}

      {activeTab === "settlements" ? (
        <>
      {/* REG-005 + ROUND 443.250 V3 board (Settlements.dc.html) — same live KPI math (kpiBaseQuery +
          openBills); chrome via V3KpiTile. Click-through preserved. "—" on load failure. */}
      <div
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 8 }}
        data-testid="settlements-home-kpi-strip"
        data-settlements-v3-kpis="1"
      >
        <V3KpiTile
          label="Total unpaid"
          value={String(kpis.total_unpaid)}
          sub="settlements not yet paid"
          testId="settlements-kpi-total-unpaid"
          onClick={() => navigate("/driver-finance/settlements?tab=payments&payment_state=unpaid")}
        />
        <V3KpiTile
          label="This period"
          value={String(kpis.this_period)}
          sub="period end ≥ this week"
          testId="settlements-kpi-this-period"
          onClick={() => navigate("/driver-finance/settlements")}
        />
        <V3KpiTile
          label="Driver pay (period)"
          value={driverPayThisPeriod}
          sub={
            driverPayVsLastWeek ? (
              <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontWeight: 600, color: driverPayVsLastWeek.tone === "green" ? V3.green : driverPayVsLastWeek.tone === "red" ? V3.red : V3.muted }}>
                  {driverPayVsLastWeek.label}
                </span>
              </span>
            ) : (
              "sum of net pay this period"
            )
          }
          testId="settlements-kpi-driver-pay"
          onClick={() => navigate("/driver-finance/settlements?tab=payments")}
        />
        <V3KpiTile
          label="Drivers w/ debt"
          value={String(kpis.drivers_with_debt)}
          sub={focusFilter === "debt" ? "filter on" : "live debt balance"}
          tone={typeof kpis.drivers_with_debt === "number" && kpis.drivers_with_debt > 0 ? "red" : "ink"}
          testId="settlements-kpi-debt"
          onClick={() => navigate("/driver-finance/settlements?tab=payments&focus=debt")}
        />
        <V3KpiTile
          label="YTD settlements"
          value={String(kpis.ytd_settlements)}
          sub={`${ytdYear} calendar year`}
          testId="settlements-kpi-ytd"
          onClick={() => navigate("/driver-finance/settlements")}
        />
        <V3KpiTile
          label="Open driver bills"
          value={String(kpis.open_driver_bills)}
          sub="unsettled driver pay"
          testId="settlements-kpi-open-bills"
          onClick={() => navigate("/driver-finance/settlements?tab=payments")}
        />
      </div>

      {weekBuckets.length > 0 ? (
        <div
          style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)", gap: 8 }}
          data-testid="settlements-home-v3-panels"
        >
          <V3Panel
            title="Net driver pay by week"
            subtitle={`${weekBuckets.length} weeks · not cancelled · not sample`}
            onViewAll={() => navigate("/driver-finance/settlements?tab=payments")}
            headerRight={
              <V3Segmented
                value={weekChartGrain}
                onChange={setWeekChartGrain}
                options={[
                  { id: "net", label: "Net" },
                  { id: "gross", label: "Gross" },
                  { id: "deductions", label: "Deductions" },
                ]}
                testId="settlements-home-week-grain"
              />
            }
            testId="settlements-home-week-chart-panel"
          >
            <div style={{ padding: "12px 14px 8px" }}>
              <svg
                width="100%"
                height={160}
                viewBox={`0 0 ${weekBuckets.length * 48} 160`}
                preserveAspectRatio="none"
                role="img"
                aria-label="Net driver pay by week"
                data-testid="settlements-home-week-chart"
              >
                {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                  const y = 12 + (1 - t) * 110;
                  return (
                    <line key={t} x1={0} x2={weekBuckets.length * 48} y1={y} y2={y} stroke={V3.chartGrid} strokeWidth={1} />
                  );
                })}
                {weekBuckets.map((w, i) => {
                  const value =
                    weekChartGrain === "net" ? w.net : weekChartGrain === "gross" ? w.gross : w.deductions;
                  const h = Math.max(2, (Math.abs(value) / weekChartMax) * 110);
                  const x = i * 48 + 12;
                  const y = 122 - h;
                  return (
                    <g key={w.weekStartMs}>
                      <rect
                        className="setl-v3-grow"
                        x={x}
                        y={y}
                        width={24}
                        height={h}
                        rx={1}
                        fill={value < 0 ? V3.red : V3.data}
                        style={{ transformOrigin: `${x + 12}px 122px` } as CSSProperties}
                      />
                      <text x={x + 12} y={148} textAnchor="middle" style={{ fontSize: 10, fill: V3.muted, fontFamily: V3.font }}>
                        {w.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
              <style>{`
                @keyframes setl-v3-grow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
                .setl-v3-grow { transform-box: fill-box; transform-origin: bottom; animation: setl-v3-grow .9s cubic-bezier(.2,.8,.2,1) both; }
              `}</style>
              <div style={{ fontSize: 11, color: V3.muted, marginTop: 4 }}>
                Bar → that week&apos;s settlements (period end in week). Max {formatSettlementsUsd(weekChartMax)}.
              </div>
            </div>
          </V3Panel>

          <V3Panel
            title={`Deductions this week · ${formatSettlementsUsd(deductionsThisWeek)}`}
            subtitle="Split by type from settlement deduction lines"
            onViewAll={() => navigate("/driver-finance/deductions")}
            testId="settlements-home-deductions-panel"
          >
            <div style={{ padding: "10px 14px" }} data-testid="settlements-home-deductions-body">
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto auto",
                  gap: 8,
                  fontSize: 12,
                  color: V3.ink,
                  fontFamily: V3.font,
                  padding: "6px 0",
                  borderBottom: `1px solid ${V3.borderSoft}`,
                }}
              >
                <span style={{ color: V3.muted, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>Type</span>
                <span style={{ color: V3.muted, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", textAlign: "center" }}>Drivers</span>
                <span style={{ color: V3.muted, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", textAlign: "right" }}>Amount</span>
              </div>
              {(
                [
                  { id: "escrow" as const, label: "Escrow" },
                  { id: "advances" as const, label: "Advances (Zelle)" },
                  { id: "fines" as const, label: "Fines" },
                ] as const
              ).map((row) => {
                const bucket = deductionSplitThisWeek[row.id];
                const has = bucket.amount > 0 || bucket.drivers.size > 0;
                return (
                  <div
                    key={row.id}
                    data-testid={`settlements-home-deduction-${row.id}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto auto",
                      gap: 8,
                      fontSize: 12,
                      color: V3.ink,
                      fontFamily: V3.font,
                      padding: "8px 0",
                      borderBottom: `1px solid ${V3.borderSoft}`,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    <span>{row.label}</span>
                    <span style={{ textAlign: "center", color: has ? V3.ink : V3.muted }}>{has ? bucket.drivers.size : "—"}</span>
                    <span style={{ textAlign: "right", color: has ? V3.ink : V3.muted }}>
                      {has ? formatSettlementsUsd(bucket.amount) : "—"}
                    </span>
                  </div>
                );
              })}
              <div style={{ fontSize: 11, color: V3.muted, marginTop: 8 }}>
                Split by type comes from settlement deduction lines.
                {deductionsListQuery.isError ? " Deduction list failed to load — amounts show as —." : ""}
              </div>
            </div>
          </V3Panel>
        </div>
      ) : null}

      {/* ROUND 443.267 — Week-of compact table (board Settlements.dc.html). Same kpiSettlements rows. */}
      {!kpiBaseQuery.isError && thisWeekBucket ? (
        <V3Panel
          title={`Week of ${formatWeekOfTitle(new Date(thisWeekBucket.weekStartMs))}`}
          subtitle={`This week · ${thisWeekSettlements.length} with pay`}
          onViewAll={() => navigate(`/driver-finance/settlements?tab=${weekOfPill === "closed" ? "closed" : "open"}`)}
          headerRight={
            <V3Segmented
              value={weekOfPill}
              onChange={setWeekOfPill}
              options={[
                { id: "open", label: `Pre-Settlement (Open) ${weekOfOpenCount}` },
                { id: "closed", label: `Settlement (Closed) ${weekOfClosedCount}` },
              ]}
              testId="settlements-home-week-of-pill"
            />
          }
          testId="settlements-home-week-of-panel"
        >
          <div style={{ padding: "0 0 8px" }} data-testid="settlements-home-week-of-body">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.4fr 1.2fr 0.9fr 0.9fr 0.8fr 0.9fr 0.6fr 0.6fr",
                gap: 8,
                padding: "8px 14px",
                borderBottom: `1px solid ${V3.borderSoft}`,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: V3.muted,
                fontFamily: V3.font,
                textAlign: "center",
              }}
            >
              <span style={{ textAlign: "left" }}>Driver</span>
              <span>Loads</span>
              <span>Gross</span>
              <span>Deductions</span>
              <span>Reimb.</span>
              <span>Net</span>
              <span>Settlement</span>
              <span>Payment</span>
            </div>
            {weekOfRows.length === 0 ? (
              <div style={{ padding: "14px", fontSize: 12, color: V3.muted, fontFamily: V3.font }}>
                No {weekOfPill === "open" ? "open" : "closed"} settlements this week.
              </div>
            ) : (
              weekOfRows.map((s) => {
                return (
                  <div
                    key={s.id}
                    data-testid={`settlements-home-week-of-row-${s.id}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1.4fr 1.2fr 0.9fr 0.9fr 0.8fr 0.9fr 0.6fr 0.6fr",
                      gap: 8,
                      padding: "8px 14px",
                      borderBottom: `1px solid ${V3.borderSoft}`,
                      fontSize: 12,
                      color: V3.ink,
                      fontFamily: V3.font,
                      fontVariantNumeric: "tabular-nums",
                      textAlign: "center",
                      alignItems: "center",
                    }}
                  >
                    <span style={{ textAlign: "left" }}>
                      <EntityLink kind="driver" id={s.driver_id} label={entityLabel(s.driver_full_name || "Driver", s.driver_id, "Driver")} />
                    </span>
                    <span>{settlementsWeekLoadsLabel(s)}</span>
                    <span>{Number(s.gross_pay ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <span>{Number(s.deductions_total ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <span>{settlementsDerivedReimb(s).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <span>{Number(s.net_pay ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    {/* 443.292-C: two status columns */}
                    <span style={{ color: settlementStatusLabel(s) === "Void" ? V3.red : settlementStatusLabel(s) === "Closed" ? V3.green : V3.ink }}>{settlementStatusLabel(s)}</span>
                    <span style={{ color: settlementPaymentLabel(s) === "Paid" ? V3.green : settlementPaymentLabel(s) === "Held" ? V3.red : V3.ink }}>{settlementPaymentLabel(s)}</span>
                  </div>
                );
              })
            )}
            <div
              data-testid="settlements-home-week-of-totals"
              style={{
                display: "grid",
                gridTemplateColumns: "1.4fr 1.2fr 0.9fr 0.9fr 0.8fr 0.9fr 0.6fr 0.6fr",
                gap: 8,
                padding: "10px 14px 4px",
                fontSize: 12,
                fontWeight: 700,
                color: V3.ink,
                fontFamily: V3.font,
                fontVariantNumeric: "tabular-nums",
                textAlign: "center",
              }}
            >
              <span style={{ textAlign: "left" }}>This week · {weekOfRows.length} with pay</span>
              <span />
              <span>{weekOfTotals.gross.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span>{weekOfTotals.ded.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span>{weekOfTotals.reimb.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span>{weekOfTotals.net.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span />
              <span />
            </div>
          </div>
        </V3Panel>
      ) : null}
        </>
      ) : activeTab === "open" || activeTab === "closed" ? (
        <SettlementsToursRegister companyId={companyId} />
      ) : activeTab === "payments" ? (
        <>
      <MoneyListToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search # · driver · payment state · status · net…"
        searchTestId="settlements-search-input"
        onClearAll={() => {
          setSearch("");
          setPaymentStates([]);
          setDriverFilter(null);
          setHideCancelled(true);
        }}
        activeFilterCount={
          paymentStates.length + (filterDriverId ? 1 : 0) + (hideCancelled ? 0 : 1)
        }
        testIdPrefix="settlements"
      >
        <label className="text-xs text-[#4B5563]">
          Driver
          <EntityPicker
            kind="driver"
            operatingCompanyId={companyId}
            value={filterDriverId || null}
            onChange={(next) => setDriverFilter(next)}
            allowCreate={false}
            placeholder="All drivers"
            className="mt-1"
            dataTestId="settlements-filter-driver"
          />
        </label>
        <MultiSelectDropdown
          label="Payment state"
          options={PAYMENT_STATE_OPTIONS}
          selected={paymentStates}
          onChange={setPaymentStates}
          allLabel="All payment states"
          data-testid="settlements-payment-state-filter"
        />
        <label className="flex items-center gap-2 self-end pb-1 text-xs font-semibold text-gray-600">
          <input
            type="checkbox"
            checked={hideCancelled}
            onChange={(event) => setHideCancelled(event.target.checked)}
            data-testid="settlements-hide-cancelled"
            aria-label="Hide cancelled settlements"
          />
          Hide cancelled
        </label>
      </MoneyListToolbar>
      {/* B-A3: Pending Acks / Held Deductions focus filters live on the Payments view alongside the
          payment pipeline (the top-of-page REG-005 KPI strip carries the summary tiles for both
          views). These two set ?focus= predicates matching the KPI counts on this same list. */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <KpiCard
          label="Pending Acks"
          value={kpis.pending_acks}
          active={focusFilter === "pending_acks"}
          onClick={() => setFocus(focusFilter === "pending_acks" ? null : "pending_acks")}
        />
        <KpiCard
          label="Held Deductions"
          value={kpis.held_deductions}
          active={focusFilter === "held"}
          onClick={() => setFocus(focusFilter === "held" ? null : "held")}
        />
      </div>
      <div className="rounded-sm border border-gray-200 bg-white p-2">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Payment Pipeline</p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={paymentStates.length === 0 ? "primary" : "secondary"}
            onClick={() => setPaymentStates([])}
          >
            All
          </Button>
          <Button
            size="sm"
            variant={paymentStates.length === 1 && paymentStates[0] === "unpaid" ? "primary" : "secondary"}
            onClick={() => setPaymentStates(["unpaid"])}
          >
            Unpaid ({paymentPipeline.unpaid})
          </Button>
          <Button
            size="sm"
            variant={paymentStates.length === 1 && paymentStates[0] === "queued" ? "primary" : "secondary"}
            onClick={() => setPaymentStates(["queued"])}
          >
            Queued ({paymentPipeline.queued})
          </Button>
          <Button
            size="sm"
            variant={paymentStates.length === 1 && paymentStates[0] === "sent_to_bank" ? "primary" : "secondary"}
            onClick={() => setPaymentStates(["sent_to_bank"])}
          >
            Sent ({paymentPipeline.sent_to_bank})
          </Button>
          <Button
            size="sm"
            variant={paymentStates.length === 1 && paymentStates[0] === "cleared" ? "primary" : "secondary"}
            onClick={() => setPaymentStates(["cleared"])}
          >
            Cleared ({paymentPipeline.cleared})
          </Button>
          <Button
            size="sm"
            variant={paymentStates.length === 1 && paymentStates[0] === "bounced" ? "primary" : "secondary"}
            onClick={() => setPaymentStates(["bounced"])}
          >
            Bounced ({paymentPipeline.bounced})
          </Button>
          <Button
            size="sm"
            variant={paymentStates.length === 1 && paymentStates[0] === "manual_paid" ? "primary" : "secondary"}
            onClick={() => setPaymentStates(["manual_paid"])}
          >
            Manual Paid ({paymentPipeline.manual_paid})
          </Button>
        </div>
      </div>

      {listQuery.isError || kpiBaseQuery.isError || openBillsQuery.isError ? (
        <ListErrorBanner
          message={`Failed to load settlement data: ${[
            listQuery.isError ? "list" : "",
            kpiBaseQuery.isError ? "KPI" : "",
            openBillsQuery.isError ? "open driver bills" : "",
          ].filter(Boolean).join(", ")}.`}
          onRetry={() => {
            if (listQuery.isError) void listQuery.refetch();
            if (kpiBaseQuery.isError) void kpiBaseQuery.refetch();
            if (openBillsQuery.isError) void openBillsQuery.refetch();
          }}
        />
      ) : null}

      <OpenDriverBillsPanel
        companyId={companyId}
        loading={openBillsQuery.isPending}
        totalCount={openBillsSummary.total_count}
        totalGrossCents={openBillsSummary.total_gross_cents}
        unknownAmountCount={openBillsQuery.data?.open_driver_bills?.unknown_amount_count ?? 0}
        items={openBillsSummary.items}
      />

      {cancelledHiddenCount > 0 ? (
        <p className="text-xs text-gray-500" data-testid="settlements-cancelled-count">
          {settlements.length} live, {cancelledHiddenCount} cancelled (hidden)
        </p>
      ) : null}

      <SettlementsTable
        rows={focusedSettlements}
        loading={listQuery.isPending || (listQuery.isFetching && focusedSettlements.length === 0)}
        selectable
        maxSelectable={200}
        suppressToolbarSearch
        onSelectionCapExceeded={() => pushToast("You can select up to 200 settlements at once.", "error")}
        batchActions={(selected) => (
          <Button
            size="sm"
            variant="danger"
            type="button"
            onClick={() => {
              setPendingReverseIds(selected.map((row) => row.id));
              setPendingReverseLabels(
                bulkRowLabelsFromRows(selected, (row: SettlementListRow) =>
                  settlementLabel(row)
                )
              );
              setReverseOpen(true);
            }}
          >
            {`Void ${selected.length} selected`}
          </Button>
        )}
        onOpen={(id) => {
          const next = new URLSearchParams(searchParams);
          next.set("settlement_id", id);
          setSearchParams(next);
        }}
      />

      <VoidReasonModal
        open={reverseOpen}
        title="Void settlements"
        entityRef={`${pendingReverseIds.length} selected`}
        minLength={10}
        onClose={() => setReverseOpen(false)}
        onSubmit={async (reason) => {
          if (!companyId) return;
          setReverseOpen(false);
          await bulk.runBulk(
            {
              domain: "driver-finance",
              resource: "settlements",
              ids: pendingReverseIds,
              action: "reverse",
              reason,
              operatingCompanyId: companyId,
              invalidateKeys: [
                ["driver-finance", "settlements", companyId],
                ["driver-finance", "settlements-kpi-base", companyId],
              ],
              rowLabels: pendingReverseLabels,
            },
            () => {
              setPendingReverseIds([]);
              setPendingReverseLabels({});
            }
          );
        }}
      />

      <BulkProgressDialog
        open={bulk.progressOpen}
        loading={bulk.progressLoading}
        requested={bulk.progress.requested}
        succeeded={bulk.progress.succeeded}
        failed={bulk.progress.failed}
        bulk_call_id={bulk.progress.bulk_call_id}
        onClose={() => bulk.setProgressOpen(false)}
        resolveRowHref={(id) => `/driver-finance/settlements?settlement_id=${encodeURIComponent(id)}`}
      />
        </>
      ) : activeTab === "needs_review" ? (
        <PresettlementSuggestionsTab companyId={companyId} />
      ) : activeTab === "disputes" ? (
        <SettlementDisputesTab companyId={companyId} />
      ) : null}
    </div>
  );
}

// GO-UI-CONSISTENCY-WHOLE-APP-2026-08-31: Open Driver Bills uses shared table columns (ParityTable since LEAD 443.181)
// (DRIVER · LOAD NUMBER · BILL NUMBER · AMOUNT) instead of the old column-jam flex
// layout (Driver · Load · Bill in one cell).
// Q22 (CC-2, ROUND 27 — ACCT-F20260911 ALL-SEATS ROLLOUT): builds columns per-render so the
// Settlement / Presettlement cell can read a live useSettlementReferences() Map — a bare module-level
// array can't call a hook.
function buildOpenDriverBillColumns(settlementReferences: Map<string, SettlementReference>): ParityColumn<OpenDriverBill>[] {
  return [
  {
    key: "driver",
    label: "Driver",
    sortable: true,
    sortValue: (bill) => bill.driver_name,
    render: (bill) => (
      <EntityLink
        kind="driver"
        id={bill.driver_id}
        label={entityLabel(bill.driver_name, bill.driver_id, "Driver")}
      />
    ),
  },
  {
    key: "load_number",
    label: "Load Number",
    sortable: true,
    sortValue: (bill) => bill.load_number,
    render: (bill) => (
      <EntityLink
        kind="load"
        id={bill.load_id ?? ""}
        label={entityLabel(bill.load_number, bill.load_id, "Load")}
      />
    ),
  },
  {
    key: "settlement_reference",
    label: "Settlement / Presettlement",
    sortable: false,
    render: (bill) => <SettlementReferenceCell reference={bill.load_id ? settlementReferences.get(bill.load_id) : null} />,
  },
  {
    key: "bill_number",
    label: "Bill Number",
    sortable: true,
    sortValue: (bill) => bill.bill_number,
    render: (bill) => (
      // ACCT-F5444: driver_finance.driver_bills is NOT accounting.bills — kind="bill"
      // drills to /accounting/bills/:id and live-404s for a driver_finance.driver_bills
      // row. "Open" bills here are not yet settled, so plain honest text.
      <span
        className="text-xs text-gray-400"
        data-testid="settlements-open-driver-bill-number"
      >
        {visibleDocumentLabel(bill.bill_number, bill.id, "Driver bill")}
      </span>
    ),
  },
  {
    key: "amount",
    label: "Amount",
    sortable: true,
    sortValue: (bill) => bill.gross_amount_cents,
    className: "text-right",
    render: (bill) => (
      <span className="font-semibold">{bill.amount_known === false ? "Awaiting short miles" : formatUsdCents(bill.gross_amount_cents)}</span>
    ),
  },
  ];
}

function OpenDriverBillsPanel({
  companyId,
  loading,
  totalCount,
  totalGrossCents,
  unknownAmountCount,
  items,
}: {
  companyId: string;
  loading: boolean;
  totalCount: number;
  totalGrossCents: number;
  unknownAmountCount: number;
  items: OpenDriverBill[];
}) {
  // Called unconditionally, before the loading early-return (rules of hooks).
  const settlementReferences = useSettlementReferences(companyId, items.map((bill) => bill.load_id));
  const columns = useMemo(() => buildOpenDriverBillColumns(settlementReferences), [settlementReferences]);

  if (loading) {
    return (
      <DataPanel title={`Open Driver Bills · loading…`} accentColor="#4B5563">
        <p className="text-xs text-gray-500">Loading open driver bills…</p>
      </DataPanel>
    );
  }
  return (
    <DataPanel title={`Open Driver Bills · ${totalCount} · ${formatUsdCents(totalGrossCents)}${unknownAmountCount ? ` known · ${unknownAmountCount} awaiting short miles` : ""}`} accentColor="#4B5563">
      {items.length === 0 ? (
        <p className="text-xs text-gray-500">No open driver bills — all driver pay is either settled or not yet booked.</p>
      ) : (
        <ParityTable
          storageKey="settlements-open-driver-bills"
          columns={columns}
          rows={items}
          rowKey={(bill) => bill.id}
          hidePager
          pageSize={Math.max(1, items.length)}
        />
      )}
    </DataPanel>
  );
}

function KpiCard({
  label,
  value,
  to,
  onClick,
  active,
  disabled,
  disabledReason,
}: {
  label: string;
  value: number | string;
  to?: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const content = (
    <>
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="font-semibold">{value}</div>
    </>
  );
  const base = `rounded-sm border px-2 py-1 text-xs ${
    active ? "border-[#4B5563] bg-[#F7F8FA]" : "border-gray-200 bg-[var(--surface-unselected)]"
  }`;
  if (disabled) {
    return (
      <div className={`${base} cursor-not-allowed opacity-70`} aria-disabled="true" title={disabledReason} data-kpi-disabled="true">
        {content}
      </div>
    );
  }
  if (to) {
    return (
      <Link to={to} className={`block ${base} transition hover:shadow-xs`}>
        {content}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-pressed={Boolean(active)} className={`${base} w-full text-left transition hover:shadow-xs`}>
        {content}
      </button>
    );
  }
  return <div className={base}>{content}</div>;
}
