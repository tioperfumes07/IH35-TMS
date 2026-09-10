import { useEffect, useMemo, useState } from "react";
import { userFacingApiError } from "../../lib/api-error-message";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { EntityLink } from "../../components/shared/EntityLink";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { entityLabel } from "../../lib/entity-label";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deactivateFactoring,
  getFactoringChargebacksFees,
  getFactoringFundsDue,
  getFactoringRecoursePipeline,
  getFactoringStatementsSettings,
  getFactoringSummary,
  getReserveBalanceHistory,
  listFactors,
  listSubmissionQueue,
  updateFactor,
  type FactoringMonthlyFeeSummary,
  type FactoringReserveBalanceHistoryEntry,
  type FactoringSettingsRow,
  type SubmissionQueueItem,
} from "../../api/factoring";
import { EntityPicker } from "../../components/EntityPicker";
import { useStagedListFilters } from "../../components/table";
import {
  createDriverVendorMerge,
  createEquipmentLoan,
  createEquipmentLoanAttribution,
  createEquipmentLoanPayment,
  getEquipmentLoanLedger,
  listDriverVendorMerges,
  listEquipmentLoans,
  listFaroDailyImports,
  upsertFaroDailyImport,
  type DriverVendorMergeRow,
  type FaroDailyImportRow,
} from "../../api/data-infra";
import { Button } from "../../components/Button";
import { ListErrorState } from "../../components/ListErrorState";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { CappedListNotice } from "../../components/CappedListNotice";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { formatQueryErrorDetail } from "../../lib/tableError";
import { formatDateUS } from "../../lib/formatDate";
import { Modal } from "../../components/Modal";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { DatePicker } from "../../components/forms/DatePicker";
import { PageHeader } from "../../components/layout/PageHeader";
import { useToast } from "../../components/Toast";
import { useAuth } from "../../auth/useAuth";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { factorToProfileForm, profileFormToFactorPatch, resolveActiveFactorFromSummary, type FactorProfileForm } from "../../lib/factorProfile";
import { FactoringProfilePanel } from "./FactoringProfilePanel";
import { ChargebacksTable, type ChargebackFeeRow } from "./ChargebacksTable";
import { RecoursePipelineTable } from "./RecoursePipelineTable";
import { ReserveTracker } from "./ReserveTracker";
import { FaroCSVUploadWidget } from "../../components/factoring/FaroCSVUploadWidget";
import { DriverAutocomplete } from "../../components/factoring/DriverAutocomplete";
import { VendorMergeDiffPreview } from "../../components/factoring/VendorMergeDiffPreview";
import { DeactivateFactorConfirmModal } from "../../components/factoring/DeactivateFactorConfirmModal";
import { DuplicateVendorsBanner } from "../../components/factoring/DuplicateVendorsBanner";
import { apiRequest } from "../../api/client";
import { FACTORING_TAB_PATH, factoringTabFromPath } from "../../router/route-manifest";
import { NavyPageSubNav } from "../../components/layout/NavyPageSubNav";
import { DrillKpiCard } from "../../components/layout/DrillKpiCard";
import { CollapsedListFilters } from "../../components/table/CollapsedListFilters";

// FAC-09a (owner 2026-09-08, "CORRECTED FROM REAL SCREENSHOTS"): the real Faro debtor portal's
// own left-nav, in its own real order — rebuilt here to match exactly. Messages & Support is a
// contact/inbox action (envelope), not a data report, styled distinctly per the source doc.
const SUBNAV = [
  { id: "submit_invoice", label: "Submit Invoice" },
  { id: "request_debtor_credit_check", label: "Request Debtor / Credit Check" },
  { id: "funds_due", label: "Funds Due" },
  { id: "payments_to_you", label: "Payments to You" },
  { id: "debtor_receipts", label: "Debtor Receipts" },
  { id: "purchase_report", label: "Purchase Report" },
  { id: "account_summary", label: "Account Summary" },
  { id: "fees_paid", label: "Fees Paid" },
  { id: "aging", label: "Aging" },
  { id: "reserve", label: "Reserve" },
  { id: "chargebacks_overpayments", label: "Chargebacks & Overpayments" },
  { id: "loan_save", label: "Loan / Save" },
  { id: "unapplied_cash", label: "Unapplied Cash" },
  { id: "invoice_status_report", label: "Invoice Status Report (BETA)" },
  { id: "messages_support", label: "✉ Messages & Support" },
] as const;

// Pre-existing internal-ops tabs — kept fully reachable (Rule 07, never delete) under an
// "Internal Tools" dropdown rather than folded into the 15-item list above, since they are a
// different kind of tool (internal ops actions: CSV imports, QBO vendor-merge cleanup, CCG
// equipment financing, the pre-9a operational reserve/statement views) than the debtor-facing
// report list the owner's screenshots describe.
const INTERNAL_TOOLS_SUBNAV = [
  { id: "reserve_tracker", label: "Reserve Tracker" },
  { id: "recourse_pipeline", label: "Recourse Pipeline" },
  { id: "chargebacks_fees", label: "Chargebacks & Fees" },
  { id: "statements_settings", label: "Statements & Settings" },
  { id: "faro_imports", label: "Faro Daily Imports" },
  { id: "equipment_loans", label: "Equipment Loans (CCG)" },
  { id: "vendor_merges", label: "Driver Vendor Merges" },
] as const;

type FactoringTabId = (typeof SUBNAV)[number]["id"] | (typeof INTERNAL_TOOLS_SUBNAV)[number]["id"];

type FactoringHomeProps = {
  initialTab?: FactoringTabId;
};

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

function fmtCurrency(value: unknown) {
  return currency.format(Number(value ?? 0));
}

function fmtDate(value: unknown) {
  if (!value) return "—";
  return formatDateUS(value);
}

// ParityTable migration (display-only): column order, labels, and cell formatting
// preserved 1:1 from the former hand-rolled table markup for each tab.
const MONTHLY_FEE_COLUMNS: Array<ParityColumn<FactoringMonthlyFeeSummary>> = [
  { key: "statement_month", label: "Month", sortable: true, render: (row) => fmtDate(row.statement_month) },
  { key: "chargeback_total", label: "Chargebacks", sortable: true, render: (row) => fmtCurrency(row.chargeback_total) },
  { key: "factor_fee_total", label: "Fees", sortable: true, render: (row) => fmtCurrency(row.factor_fee_total) },
];

const STATEMENT_HISTORY_COLUMNS: Array<ParityColumn<FactoringSettingsRow>> = [
  { key: "statement_month", label: "Month", sortable: true, render: (row) => fmtDate(row.statement_month ?? null) },
  {
    key: "month_chargebacks_total",
    label: "Chargebacks",
    sortable: true,
    render: (row) => fmtCurrency(row.month_chargebacks_total ?? 0),
  },
  {
    key: "month_factor_fees_total",
    label: "Fees",
    sortable: true,
    render: (row) => fmtCurrency(row.month_factor_fees_total ?? 0),
  },
];

const FARO_IMPORT_COLUMNS: Array<ParityColumn<FaroDailyImportRow>> = [
  { key: "statement_date", label: "Statement Date", sortable: true, render: (row) => fmtDate(row.statement_date) },
  { key: "statement_reference", label: "Reference", sortable: true },
  {
    key: "gross_total_cents",
    label: "Gross",
    sortable: true,
    render: (row) => fmtCurrency(Number(row.gross_total_cents ?? 0) / 100),
  },
  {
    key: "advance_total_cents",
    label: "Advance",
    sortable: true,
    render: (row) => fmtCurrency(Number(row.advance_total_cents ?? 0) / 100),
  },
  {
    key: "reserve_total_cents",
    label: "Reserve",
    sortable: true,
    render: (row) => fmtCurrency(Number(row.reserve_total_cents ?? 0) / 100),
  },
  {
    key: "fee_total_cents",
    label: "Fee",
    sortable: true,
    render: (row) => fmtCurrency(Number(row.fee_total_cents ?? 0) / 100),
  },
];

const VENDOR_MERGE_COLUMNS: Array<ParityColumn<DriverVendorMergeRow>> = [
  {
    key: "driver_id",
    label: "Driver",
    sortable: true,
    render: (row) => <EntityLinkOrTombstone kind="driver" id={row.driver_id} name={row.driver_name} noun="Driver" />,
  },
  {
    key: "from_qbo_vendor_id",
    label: "From",
    sortable: true,
    // ACCT-F5983: the backend already resolves from_qbo_vendor_id -> mdata.vendors via
    // mdata.vendors.qbo_vendor_id (data-infra.service.ts LINK-F5171/LINK-F5183) and returns
    // from_vendor_id/from_vendor_name -- this column rendered the raw QBO id as plain text and
    // never used the already-resolved fields. Real EntityLink when an internal vendor matches;
    // honest raw-QBO-id fallback (not a bare "-") when it doesn't, since the id itself is real data.
    render: (row) =>
      row.from_vendor_id ? (
        <EntityLinkOrTombstone kind="vendor" id={row.from_vendor_id} name={row.from_vendor_name} noun="Vendor" />
      ) : (
        row.from_qbo_vendor_id
      ),
  },
  {
    key: "to_qbo_vendor_id",
    label: "To",
    sortable: true,
    render: (row) =>
      row.to_vendor_id ? (
        <EntityLinkOrTombstone kind="vendor" id={row.to_vendor_id} name={row.to_vendor_name} noun="Vendor" />
      ) : (
        row.to_qbo_vendor_id
      ),
  },
  { key: "merge_reason", label: "Reason", sortable: true },
  { key: "merged_at", label: "Merged At", sortable: true, render: (row) => fmtDate(row.merged_at) },
];

// FAC-09a Aging Report (owner 2026-09-08, exact columns read off the real screenshots): "ID,
// Memos (icon), Invoice, Debtor, PO, Other Ref, Inv Date, Due Date, Age, 0-30, 31-60, 61-90,
// 90+, Balance, Purchase (Y/N)." Built on the SAME already-fetched recourse-pipeline data
// (views.factoring_recourse_at_risk, no new backend query) -- live-verified this session: 51
// rows, sum(invoice_amount) = $151,740.00 exactly, matching the doc's own required proof point.
// PO / Other Ref / Memos have no real backing field in this data model -- shown as an honest "—"
// rather than fabricated, same convention as every other honest-empty-state column in this file.
// GLB-25156 (owner 2026-09-09): the old "ID" column was a redundant EntityLink duplicating the
// Invoice column — removed, replaced with a real "Settlement" column linking to the load's
// actual driver_finance.driver_settlements row (resolved via settlement_lines.load_id LATERAL
// in the recourse-pipeline route). Honest "—" when a load has no settlement line yet.
type AgingBucket = "0-30" | "31-60" | "61-90" | "90+";

function agingBucketFor(days: number): AgingBucket {
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

function daysSince(dateIso: string): number {
  const then = new Date(dateIso).getTime();
  if (!Number.isFinite(then)) return 0;
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
}

export function FactoringHomePage({ initialTab = "account_summary" }: FactoringHomeProps = {}) {
  const location = useLocation();
  const { selectedCompanyId, isLoading: companyContextLoading } = useCompanyContext();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const companyId = selectedCompanyId ?? "";
  const [tab, setTab] = useState<FactoringTabId>(initialTab);
  useEffect(() => {
    setTab(factoringTabFromPath(location.pathname) as FactoringTabId);
  }, [location.pathname]);
  const [deactivating, setDeactivating] = useState(false);
  const [deactivateModalOpen, setDeactivateModalOpen] = useState(false);
  // NEW-25 (owner 2026-09-07): "Statements/Settings need a summary-totals vs. detailed-view
  // toggle." "Summary" is the existing one-row-per-month statement history; "Detail" reuses the
  // SAME already-fetched line-item chargeback/fee history (feesQuery.data.history) the
  // Chargebacks & Fees tab already renders through ChargebacksTable -- no new backend query, no
  // new data source, just a second, already-correct view of the same underlying transactions.
  const [statementsView, setStatementsView] = useState<"summary" | "detail">("summary");
  // FAC-09a Fees Paid — "View Closed Invoices" (open-invoices, per the doc's own confusing real
  // button label) / "View All Fees" toggle, per the real portal's screenshot.
  const [feesPaidView, setFeesPaidView] = useState<"open_invoices" | "all_fees">("all_fees");
  const [faroCsvText, setFaroCsvText] = useState("");
  const [faroFileName, setFaroFileName] = useState("");
  const [showFaroJsonFallback, setShowFaroJsonFallback] = useState(false);
  const [faroStatementDate, setFaroStatementDate] = useState("");
  const [faroStatementRef, setFaroStatementRef] = useState("daily");
  const [faroLinesJson, setFaroLinesJson] = useState(
    JSON.stringify(
      [
        {
          invoice_number: "INV-1001",
          customer_name: "Sample Customer",
          gross_amount_cents: 100000,
          advance_amount_cents: 90000,
          reserve_amount_cents: 10000,
          fee_amount_cents: 2500,
          chargeback_amount_cents: 0,
          net_amount_cents: 87500,
        },
      ],
      null,
      2
    )
  );
  const [creatingFaro, setCreatingFaro] = useState(false);
  const [loanEquipmentId, setLoanEquipmentId] = useState("");
  const [loanLenderVendorId, setLoanLenderVendorId] = useState("");
  const [loanPrincipalCents, setLoanPrincipalCents] = useState("");
  const [loanAprPercent, setLoanAprPercent] = useState("0");
  const [loanStartedOn, setLoanStartedOn] = useState("");
  const [selectedLoanId, setSelectedLoanId] = useState<string>("");
  const [creatingLoan, setCreatingLoan] = useState(false);
  // M-1: equipment-loan attribution/payment money entry — replaces window.prompt("…amount cents")
  // (raw-cents prompt was a UX bug; nobody types cents). Cents-mode MoneyInput: user types dollars,
  // amount_cents stored unchanged.
  const [loanAction, setLoanAction] = useState<{ loanId: string; kind: "attribution" | "payment" } | null>(null);
  const [loanActionLoadId, setLoanActionLoadId] = useState("");
  const [loanActionCents, setLoanActionCents] = useState<number | null>(null);
  const [loanActionSaving, setLoanActionSaving] = useState(false);
  const [mergeDriverId, setMergeDriverId] = useState("");
  const [mergeDriverName, setMergeDriverName] = useState("");
  const [mergeConfirm, setMergeConfirm] = useState("");
  const [mergeFromVendor, setMergeFromVendor] = useState("");
  const [mergeToVendor, setMergeToVendor] = useState("");
  const [mergeFromVendorName, setMergeFromVendorName] = useState("");
  const [mergeToVendorName, setMergeToVendorName] = useState("");
  const [mergeReason, setMergeReason] = useState("duplicate_vendor_cleanup");
  const [mergeApplyToDriver, setMergeApplyToDriver] = useState(true);
  const [creatingMerge, setCreatingMerge] = useState(false);
  const [savingFactorProfile, setSavingFactorProfile] = useState(false);
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [profileEditForm, setProfileEditForm] = useState<FactorProfileForm | null>(null);

  const summaryQuery = useQuery({
    queryKey: ["factoring", "summary", companyId],
    queryFn: () => getFactoringSummary(companyId),
    enabled: Boolean(companyId),
  });
  const factorsQuery = useQuery({
    queryKey: ["factoring", "factors", companyId],
    queryFn: () => listFactors(companyId).then((res) => res.factors),
    enabled: Boolean(companyId),
  });
  // LINK-F5171/LINK-F5180 — reverse_link: CustomerDetail (and, for recourse, the load's own
  // FactoringTab) link here as ?customer_id=/?load_id=; neither param was ever read, so a reverse
  // link landed on the unfiltered company-wide table. Server-side scoping (both routes now accept
  // these) rather than client-side, since recourse defaults limit=200 and chargebacks history is
  // capped at LIMIT 500.
  // LST-F5193 + LV-FACTORING-HOME-FILTER-SILENT-APPLY — stage until Apply; URL sync on Apply/Reset.
  const [searchParams, setSearchParams] = useSearchParams();
  const customerIdFromUrl = searchParams.get("customer_id")?.trim() ?? "";
  const loadIdFromUrl = searchParams.get("load_id")?.trim() ?? "";
  const vendorIdFromUrl = searchParams.get("vendor_id")?.trim() ?? "";
  const driverIdFromUrl = searchParams.get("driver_id")?.trim() ?? "";
  const loanIdFromUrl = searchParams.get("loan_id")?.trim() ?? "";

  // BANNER-MERGE-DEEPLINK-DROPS-CONTEXT — the Duplicate factoring vendors banner
  // (DuplicateVendorsBanner.tsx) resolves real from/to vendor ids+names via its own scan and used
  // to discard them on "Open Driver Vendor Merges" (a bare nav link), dumping the office user on
  // an empty form whose from/to fields are free text — they had no way to know the raw QBO vendor
  // uuid the scan already found. Consume the banner's deep-link params ONCE, prefill the merge
  // form, land on its tab, and clear the params so they don't re-fire the effect or linger in the
  // URL. Manual entry into the free-text fields is untouched (still works, still requires typing
  // MERGE to confirm) — this only removes the "go find the id yourself" dead end.
  //
  // MERGE-DEEPLINK-NEVER-FIRES-2026-09-08 (live-Chrome caught): this effect was mount-only
  // (`[]` deps), but every /factoring/<tab> route renders the SAME FactoringHomePage component
  // instance — clicking "Merge these" is a client-side route change, not a remount, so a
  // mount-only effect never saw the new query params. Live-reproduced twice (a real click AND a
  // full browser navigation to the exact deep-link URL both left "From vendor" / "To vendor"
  // showing "— (Unassigned)"). Fixed by depending on the two param VALUES (not the whole
  // searchParams object, which is a new reference every render) so the effect re-runs whenever
  // they actually change, remount or not.
  const mergeFromVendorIdParam = searchParams.get("merge_from_vendor_id");
  const mergeToVendorIdParam = searchParams.get("merge_to_vendor_id");
  useEffect(() => {
    const fromId = mergeFromVendorIdParam?.trim();
    const toId = mergeToVendorIdParam?.trim();
    if (!fromId || !toId) return;
    setMergeFromVendor(fromId);
    setMergeToVendor(toId);
    setMergeFromVendorName(searchParams.get("merge_from_vendor_name")?.trim() ?? "");
    setMergeToVendorName(searchParams.get("merge_to_vendor_name")?.trim() ?? "");
    setTab("vendor_merges");
    const next = new URLSearchParams(searchParams);
    next.delete("merge_from_vendor_id");
    next.delete("merge_from_vendor_name");
    next.delete("merge_to_vendor_id");
    next.delete("merge_to_vendor_name");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- searchParams/setSearchParams/state
    // setters are intentionally excluded: searchParams is a fresh object every render (would
    // fire every render if included) and the setters are referentially stable.
  }, [mergeFromVendorIdParam, mergeToVendorIdParam]);

  const EMPTY_FILTERS = {
    customerId: "",
    loadId: "",
    vendorId: "",
    driverId: "",
  };

  function patchListSearchParam(next: {
    customerId: string;
    loadId: string;
    vendorId: string;
    driverId: string;
  }) {
    const p = new URLSearchParams(searchParams);
    const pairs: Array<["customer_id" | "load_id" | "vendor_id" | "driver_id", string]> = [
      ["customer_id", next.customerId],
      ["load_id", next.loadId],
      ["vendor_id", next.vendorId],
      ["driver_id", next.driverId],
    ];
    for (const [key, value] of pairs) {
      if (value) p.set(key, value);
      else p.delete(key);
    }
    setSearchParams(p, { replace: true });
  }

  const [applied, setApplied] = useState(() => ({
    ...EMPTY_FILTERS,
    customerId: customerIdFromUrl,
    loadId: loadIdFromUrl,
    vendorId: vendorIdFromUrl,
    driverId: driverIdFromUrl,
  }));
  const staged = useStagedListFilters({
    applied,
    empty: EMPTY_FILTERS,
    onApply: (next) => {
      setApplied(next);
      patchListSearchParam(next);
    },
  });
  const filterDraft = staged.draft;

  useEffect(() => {
    setApplied((prev) => ({
      ...prev,
      customerId: customerIdFromUrl,
      loadId: loadIdFromUrl,
      vendorId: vendorIdFromUrl,
      driverId: driverIdFromUrl,
    }));
  }, [customerIdFromUrl, loadIdFromUrl, vendorIdFromUrl, driverIdFromUrl]);

  // Sibling guards (verify-factoring-recourse-chargebacks-reverse-section) pin deepLink* names.
  const deepLinkCustomerId = applied.customerId || null;
  const deepLinkLoadId = applied.loadId || null;
  const deepLinkVendorId = applied.vendorId || null;
  const deepLinkDriverId = applied.driverId || null;

  // NEW-20/NEW-26 (2026-09-07): setCustomerFilter/setLoadFilter/setVendorFilter/setDriverFilter
  // used to wrap staged.setDraft for each tab's own Customer/Load/Vendor/Driver pickers; every
  // call site now calls staged.setDraft(...) directly inline (matching the established
  // CollapsedListFilters convention every other consumer uses, e.g. ExpensesListPage.tsx) so
  // verify-collapsed-list-filters-apply.mjs's static scan — which whitelists only the literal
  // `setDraft` call name inside a CollapsedListFilters body — can see the mutation is
  // draft-only without needing to trace through a named wrapper function. All four wrapper
  // functions removed as dead code once their last call site moved to the inline form.

  const recourseQuery = useQuery({
    queryKey: ["factoring", "recourse", companyId, deepLinkCustomerId, deepLinkLoadId],
    queryFn: () =>
      getFactoringRecoursePipeline(companyId, 200, {
        customer_id: deepLinkCustomerId ?? undefined,
        load_id: deepLinkLoadId ?? undefined,
      }),
    enabled: Boolean(companyId),
  });
  const feesQuery = useQuery({
    queryKey: ["factoring", "chargebacks-fees", companyId, deepLinkCustomerId],
    queryFn: () => getFactoringChargebacksFees(companyId, deepLinkCustomerId ?? undefined),
    enabled: Boolean(companyId),
  });

  // FUNDS-DUE-01 (owner 2026-09-09): real query, own fetch (accounting.factoring_advances
  // submitted-not-yet-advanced rows -- structurally cannot come from the same recourse-pipeline
  // fetch every other tab reuses, since that view only carries already-advanced invoices).
  const fundsDueQuery = useQuery({
    queryKey: ["factoring", "funds-due", companyId],
    queryFn: () => getFactoringFundsDue(companyId),
    enabled: Boolean(companyId),
  });

  // FAC-09a Aging Report — built on the same recourseQuery rows (no new fetch). Age = days since
  // factored_at (the closest real "when this invoice entered the factoring register" field this
  // data model has); Balance = invoice_amount (live-verified: sums to $151,740.00 across all 51
  // rows, matching the owner's own doc). See agingBucketFor/daysSince above.
  const agingRows = useMemo(
    () =>
      (recourseQuery.data?.invoices ?? []).map((row) => {
        const age = daysSince(row.factored_at);
        return { ...row, age, bucket: agingBucketFor(age) };
      }),
    [recourseQuery.data?.invoices],
  );
  const agingTotals = useMemo(() => {
    const totals: Record<AgingBucket | "balance", number> = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0, balance: 0 };
    for (const row of agingRows) {
      totals[row.bucket] += Number(row.invoice_amount ?? 0);
      totals.balance += Number(row.invoice_amount ?? 0);
    }
    return totals;
  }, [agingRows]);

  // GLB-25157: Payments to You — same recourseQuery rows sorted by factored_at (advanced_at)
  // with a running total of advance_amount (the actual dollar Faro paid IH35 per advance).
  const paymentsToYouRows = useMemo(() => {
    let running = 0;
    return [...agingRows]
      .sort((a, b) => new Date(a.factored_at).getTime() - new Date(b.factored_at).getTime())
      .map((row) => {
        running += Number(row.advance_amount ?? 0);
        return { ...row, running_total: running };
      });
  }, [agingRows]);
  const paymentsToYouTotal = useMemo(
    () => paymentsToYouRows.reduce((sum, row) => sum + Number(row.advance_amount ?? 0), 0),
    [paymentsToYouRows],
  );

  // FAC-09a Fees Paid "Open Invoices" view — Accrued Fees per invoice, summed from the same
  // feesQuery.data.history (views.factoring_chargebacks_fees) rows the "All Fees" view and the
  // Chargebacks & Fees internal tool tab already render, keyed by the shared factoring_advance_id
  // FK (no new backend query).
  const accruedFeesByAdvance = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of feesQuery.data?.history ?? []) {
      totals.set(row.factoring_advance_id, (totals.get(row.factoring_advance_id) ?? 0) + Number(row.factor_fee_amount ?? 0));
    }
    return totals;
  }, [feesQuery.data?.history]);
  const feesPaidOpenInvoiceRows = useMemo(
    () =>
      agingRows.map((row) => ({
        ...row,
        accrued_fees: accruedFeesByAdvance.get(row.factoring_advance_id) ?? 0,
      })),
    [agingRows, accruedFeesByAdvance],
  );
  const feesPaidAllFeesTotal = useMemo(
    () => (feesQuery.data?.history ?? []).reduce((sum, row) => sum + Number(row.factor_fee_amount ?? 0), 0),
    [feesQuery.data?.history],
  );
  // FAC-09a Purchase Report — same per-advance fee-history join as Fees Paid's Open Invoices view,
  // plus chargeback_amount and statement_reference (both real, from the same already-fetched
  // feesQuery.data.history rows). No new backend query.
  const chargebacksByAdvance = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of feesQuery.data?.history ?? []) {
      totals.set(row.factoring_advance_id, (totals.get(row.factoring_advance_id) ?? 0) + Number(row.chargeback_amount ?? 0));
    }
    return totals;
  }, [feesQuery.data?.history]);
  const statementReferenceByAdvance = useMemo(() => {
    const refs = new Map<string, string>();
    for (const row of feesQuery.data?.history ?? []) {
      if (row.statement_reference && !refs.has(row.factoring_advance_id)) {
        refs.set(row.factoring_advance_id, row.statement_reference);
      }
    }
    return refs;
  }, [feesQuery.data?.history]);
  const purchaseReportRows = useMemo(
    () =>
      agingRows.map((row) => ({
        ...row,
        fees: accruedFeesByAdvance.get(row.factoring_advance_id) ?? 0,
        chargeback: chargebacksByAdvance.get(row.factoring_advance_id) ?? 0,
        other_ref: statementReferenceByAdvance.get(row.factoring_advance_id) ?? null,
      })),
    [agingRows, accruedFeesByAdvance, chargebacksByAdvance, statementReferenceByAdvance],
  );
  const settingsQuery = useQuery({
    queryKey: ["factoring", "statements-settings", companyId],
    queryFn: () => getFactoringStatementsSettings(companyId),
    enabled: Boolean(companyId),
  });
  // FAC-09a Reserve (owner mega-report 2026-09-09, real per the FAC09a-CORRECTED spec): the SAME
  // real reserve-movement ledger ReserveTracker.tsx's "Reserve movement history" already renders
  // (getReserveBalanceHistory), scoped to the page's own active factor instead of a picker -- no
  // new backend query, no new table. This system tracks ONE combined reserve_balance with no
  // Escrow/Cash type split (confirmed multiple times this session, e.g. Account Summary's own
  // footnote) -- the spec's "Escrow Reserve / Cash Reserve" split and "Show Cash"/"Show Escrow"
  // toggle are honestly not buildable without fabricating a split this schema doesn't have; Total
  // Reserve (real) renders, the two split figures render "—" with the same honest footnote
  // pattern already used elsewhere on this page.
  const reserveHistoryQuery = useQuery({
    queryKey: ["factoring", "reserves", "history", companyId, summaryQuery.data?.active_factor_id],
    queryFn: () => getReserveBalanceHistory(summaryQuery.data!.active_factor_id!, companyId, { limit: 100 }),
    enabled: Boolean(companyId && summaryQuery.data?.active_factor_id),
  });
  const faroImportsQuery = useQuery({
    queryKey: ["data-infra", "faro-imports", companyId],
    queryFn: () => listFaroDailyImports(companyId),
    enabled: Boolean(companyId),
  });
  // REG-014 (owner 2026-09-09, "the Funds Due is not wired"): reuses the exact same
  // submission-queue query Submit Factor already runs (no new backend route, no new money math --
  // a raw SUM over total_cents, the only aggregation the lane boundary allows for this item). No
  // funds-due/factoring_purchases endpoint exists yet (confirmed this pass), so this is honestly
  // scoped to "what's eligible to submit right now," not a funded/receivable ledger figure.
  const fundsDueQuery = useQuery({
    queryKey: ["factoring", "submission-queue", "funds-due", companyId],
    queryFn: () => listSubmissionQueue(companyId),
    enabled: Boolean(companyId) && tab === "funds_due",
  });
  // LINK-F5171/LINK-F5182 — reverse_link: factoring:home.equipment_loans (vendor side). The unit
  // side already reverse-links via UnitFinanceLinkageTab; VendorDetail links here as
  // ?vendor_id=<id>, now honored server-side.
  const equipmentLoansQuery = useQuery({
    queryKey: ["data-infra", "equipment-loans", companyId, deepLinkVendorId],
    queryFn: () => listEquipmentLoans(companyId, deepLinkVendorId ?? undefined),
    enabled: Boolean(companyId),
  });
  // LINK-F5171/LINK-F5183 — reverse_link: factoring:home.vendor_merges. DriverProfilePage links
  // here as ?driver_id=<id>, VendorDetail as ?vendor_id=<id>, both now honored server-side.
  const vendorMergesQuery = useQuery({
    queryKey: ["data-infra", "vendor-merges", companyId, deepLinkDriverId, deepLinkVendorId],
    queryFn: () =>
      listDriverVendorMerges(companyId, {
        driver_id: deepLinkDriverId ?? undefined,
        vendor_id: deepLinkVendorId ?? undefined,
      }),
    enabled: Boolean(companyId),
  });
  const selectedLoanLedgerQuery = useQuery({
    queryKey: ["data-infra", "equipment-loan-ledger", selectedLoanId, companyId],
    queryFn: () => getEquipmentLoanLedger(selectedLoanId, companyId),
    enabled: Boolean(companyId && selectedLoanId),
  });
  const selectedEquipmentLoan = (equipmentLoansQuery.data?.rows ?? []).find(
    (row) => String(row.id) === selectedLoanId
  );
  useEffect(() => {
    if (!loanIdFromUrl || selectedLoanId === loanIdFromUrl) return;
    const requestedLoan = (equipmentLoansQuery.data?.rows ?? []).find(
      (row) => String(row.id) === loanIdFromUrl
    );
    if (requestedLoan) setSelectedLoanId(String(requestedLoan.id));
  }, [equipmentLoansQuery.data?.rows, loanIdFromUrl, selectedLoanId]);
  const invoices = recourseQuery.data?.invoices ?? [];
  const fundsDueRows = fundsDueQuery.data?.invoices ?? [];
  const recourseTotals = useMemo(() => {
    return invoices.reduce(
      (acc, row) => {
        acc.advance += Number(row.advance_amount ?? 0);
        acc.reserve += Number(row.reserve_amount ?? 0);
        return acc;
      },
      { advance: 0, reserve: 0 }
    );
  }, [invoices]);

  const summary = summaryQuery.data;
  const activeFactor = useMemo(
    () => resolveActiveFactorFromSummary(summary, factorsQuery.data ?? []),
    [summary, factorsQuery.data]
  );
  const canDeactivate = user?.role === "Owner";

  if (!companyId) {
    // FACTORING-HARD-NAV-LOSES-COMPANY-CONTEXT (owner mega-report 2026-09-09): a cold/direct
    // navigation into this page (fresh tab, bookmark, hard refresh -- not an in-app click) races
    // CompanyContext's own async listMyCompanies() -- companyId is legitimately still resolving,
    // not genuinely absent, for the ~1 tick before that query settles. The old unconditional
    // "select a company" message rendered during that window on every single hard entry, which
    // read as the whole page (and by extension every factoring sub-tab) being "missing" rather
    // than mid-load. Distinguishing the two states here fixes it for every deep-linked factoring
    // route in one place, since they all render through this same component.
    if (companyContextLoading) {
      return (
        <div className="space-y-3">
          <PageHeader title="Factoring" subtitle="Deep-dive workspace for recourse pipeline, chargebacks, fees, and settings" />
          <div className="rounded-sm border border-gray-200 bg-white p-4 text-xs text-gray-600" data-testid="factoring-home-loading">
            Loading…
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        <PageHeader title="Factoring" subtitle="Deep-dive workspace for recourse pipeline, chargebacks, fees, and settings" />
        <div
          className="rounded-sm border border-dashed border-gray-300 bg-gray-50 p-4 text-xs text-gray-700"
          data-testid="factoring-home-need-company"
        >
          Select an operating company to view factoring KPIs and the active factor profile.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <PageHeader
        title={`Factoring (${summary?.active_factor_name || "No active factor"})`}
        subtitle="Deep-dive workspace for recourse pipeline, chargebacks, fees, and settings"
        actions={
          <div className="flex items-center gap-2">
            {/*
              FACT-PAR1: Submit-to-Factor is NOT an arch-design Factoring sub-tab
              (design lists Recourse Pipeline / Chargebacks & Fees / Statements & Settings).
              Reachable via deep-link button — does not change SUBNAV tab count (Rule 05).
            */}
            <Link
              to="/factoring/submit"
              className="inline-flex items-center rounded-sm border border-slate-300 bg-white px-2.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50"
              data-testid="factoring-submit-to-factor-link"
            >
              Submit to Factor
            </Link>
            <Link
              to="/dispatch/factoring-queue"
              className="inline-flex items-center rounded-sm border border-slate-300 bg-white px-2.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50"
              data-testid="factoring-hub-dispatch-queue-reverse-link"
            >
              Dispatch queue
            </Link>
            <Link
              to="/accounting/factoring"
              className="inline-flex items-center rounded-sm border border-slate-300 bg-white px-2.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50"
              data-testid="factoring-hub-accounting-advances-reverse-link"
            >
              Accounting advances
            </Link>
            <Link
              to="/banking/factoring"
              className="inline-flex items-center rounded-sm border border-slate-300 bg-white px-2.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50"
              data-testid="factoring-hub-banking-entry-reverse-link"
            >
              Banking entry
            </Link>
            <Button size="sm" variant="secondary" onClick={() => void queryClient.invalidateQueries({ queryKey: ["factoring"] })}>
              Refresh
            </Button>
          </div>
        }
      />

      {summaryQuery.isError ? (
        <ListErrorBanner onRetry={() => void summaryQuery.refetch()} />
      ) : null}

      {/* FAC-07 (owner 2026-09-06 22:3xZ): navy tab strip is FIRST — same shape as Banking Home —
          so the profile card can no longer push the tabs below the fold. */}
      <NavyPageSubNav
        items={[
          ...SUBNAV.map((item) => ({
            label: item.label,
            // "Submit Invoice" reuses the existing real SubmissionQueue page rather than a new
            // stub — that workflow already exists and works; no reason to reinvent it here.
            to: item.id === "submit_invoice" ? "/factoring/submit" : FACTORING_TAB_PATH[item.id],
          })),
          {
            label: "Internal Tools",
            to: "",
            children: INTERNAL_TOOLS_SUBNAV.map((item) => ({ label: item.label, to: FACTORING_TAB_PATH[item.id] })),
          },
        ]}
      />

      <DuplicateVendorsBanner companyId={companyId} />

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-12" data-testid="factoring-home-overview-row">
        <div className="lg:col-span-7" data-testid="factoring-home-kpi-col">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="factoring-home-kpi-row">
            <DrillKpiCard
              testId="factoring-kpi-active-factor"
              label="Active factor"
              value={summaryQuery.isError ? null : (summary?.active_factor_name ?? null)}
              to={FACTORING_TAB_PATH.statements_settings}
            />
            <DrillKpiCard
              testId="factoring-kpi-reserve-balance"
              label="Reserve balance"
              value={summaryQuery.isError ? "—" : fmtCurrency(summary?.reserve_balance)}
              to={FACTORING_TAB_PATH.reserve_tracker}
            />
            {/* FACTORING-CHARGEBACK-BALANCE-IS-ACTUALLY-OUTSTANDING-LIABILITY: this is Advance +
                Reserve still owed to the factor (outstanding_liability_signed_cents), not a real
                chargeback figure — honest label locked by verify-factoring-outstanding-liability-honest-label. */}
            <DrillKpiCard
              testId="factoring-kpi-outstanding-liability"
              label="Outstanding Liability Balance"
              value={summaryQuery.isError ? null : fmtCurrency(summary?.outstanding_liability_balance)}
              to={FACTORING_TAB_PATH.recourse_pipeline}
            />
            <DrillKpiCard
              testId="factoring-kpi-advanced-mtd"
              label="Advanced MTD"
              value={summaryQuery.isError ? null : fmtCurrency(summary?.mtd_advanced_total)}
              hint={summary ? `${summary.mtd_advances_count} advances` : undefined}
              to="/accounting/factoring"
            />
            <DrillKpiCard
              testId="factoring-kpi-recourse-days"
              label="Recourse days"
              value={summaryQuery.isError ? null : Number(summary?.recourse_days ?? 95)}
              to={FACTORING_TAB_PATH.recourse_pipeline}
            />
            <DrillKpiCard
              testId="factoring-kpi-chargebacks"
              label="Chargebacks & fees"
              value={null}
              hint="Open statements"
              to={FACTORING_TAB_PATH.chargebacks_fees}
            />
          </div>
        </div>
        <div className="lg:col-span-5" data-testid="factoring-home-profile-col">
          {activeFactor ? (
            <FactoringProfilePanel
              variant="compact"
              vendorId={summary?.active_factor_id ?? null}
              factor={activeFactor}
              saving={savingFactorProfile}
              onSave={() => {
                setProfileEditForm(factorToProfileForm(activeFactor));
                setProfileEditOpen(true);
              }}
            />
          ) : (
            <div className="rounded-sm border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-xs text-gray-500" data-testid="factoring-profile-empty">
              {summary?.active_factor_profile_id || summary?.active_factor_name || summary?.active_factor_id
                ? "Active factor row is still loading…"
                : "No factor configured. Activate a factor to manage its profile."}
            </div>
          )}
        </div>
      </div>

      {activeFactor && profileEditForm && (
            <Modal open={profileEditOpen} onClose={() => { setProfileEditOpen(false); setProfileEditForm(null); }} title="Edit Factoring Profile">
              <div className="flex flex-col gap-3 text-xs" data-testid="factoring-profile-edit-modal">
                <p className="text-xs text-gray-500">
                  Rates write to the factoring profile record (advance_rate / fee_rate / reserve_rate). Contacts → remittance_details. Not vendor notes.
                </p>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Canonical rates (%)</p>
                <div className="grid grid-cols-2 gap-3">
                  {(
                    [
                      ["advanceRatePct", "Advance rate %"],
                      ["feeRatePct", "Fee rate %"],
                      ["reserveRatePct", "Reserve rate %"],
                      ["recourseDays", "Recourse days"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="block">
                      <span className="text-xs font-medium text-gray-700">{label}</span>
                      <input
                        type="number"
                        min="0"
                        step={key === "recourseDays" ? "1" : "0.01"}
                        className="mt-1 w-full rounded-sm border border-gray-300 px-2.5 py-1.5 text-xs"
                        value={profileEditForm[key]}
                        onChange={(e) => setProfileEditForm((f) => (f ? { ...f, [key]: e.target.value } : f))}
                      />
                    </label>
                  ))}
                </div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mt-1">Remittance / contacts</p>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs font-medium text-gray-700">Telephone</span>
                    <input className="mt-1 w-full rounded-sm border border-gray-300 px-2.5 py-1.5 text-xs" value={profileEditForm.telephone} onChange={(e) => setProfileEditForm((f) => (f ? { ...f, telephone: e.target.value } : f))} />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-700">General email</span>
                    <input type="email" className="mt-1 w-full rounded-sm border border-gray-300 px-2.5 py-1.5 text-xs" value={profileEditForm.generalEmail} onChange={(e) => setProfileEditForm((f) => (f ? { ...f, generalEmail: e.target.value } : f))} />
                  </label>
                </div>
                <label className="block">
                  <span className="text-xs font-medium text-gray-700">Address</span>
                  <input className="mt-1 w-full rounded-sm border border-gray-300 px-2.5 py-1.5 text-xs" value={profileEditForm.address} onChange={(e) => setProfileEditForm((f) => (f ? { ...f, address: e.target.value } : f))} />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs font-medium text-gray-700">Primary contact</span>
                    <input className="mt-1 w-full rounded-sm border border-gray-300 px-2.5 py-1.5 text-xs" value={profileEditForm.primaryContactName} onChange={(e) => setProfileEditForm((f) => (f ? { ...f, primaryContactName: e.target.value } : f))} />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-700">Primary contact email</span>
                    <input type="email" className="mt-1 w-full rounded-sm border border-gray-300 px-2.5 py-1.5 text-xs" value={profileEditForm.primaryContactEmail} onChange={(e) => setProfileEditForm((f) => (f ? { ...f, primaryContactEmail: e.target.value } : f))} />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-700">Accounting contact</span>
                    <input className="mt-1 w-full rounded-sm border border-gray-300 px-2.5 py-1.5 text-xs" value={profileEditForm.accountingContact} onChange={(e) => setProfileEditForm((f) => (f ? { ...f, accountingContact: e.target.value } : f))} />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-700">Disputes contact</span>
                    <input className="mt-1 w-full rounded-sm border border-gray-300 px-2.5 py-1.5 text-xs" value={profileEditForm.disputesContact} onChange={(e) => setProfileEditForm((f) => (f ? { ...f, disputesContact: e.target.value } : f))} />
                  </label>
                </div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mt-1">Optional extras / aged fee tiers (%)</p>
                <div className="grid grid-cols-2 gap-3">
                  {(
                    [
                      ["escrowReservesPct", "Escrow reserves % (extra)"],
                      ["lateFeesPct", "Late fees % (extra)"],
                      ["chargebacksPct", "Chargebacks % (extra)"],
                      ["fee31To60Pct", "31–60d fee % (fee_schedule)"],
                      ["fee61To90Pct", "61–90d fee % (fee_schedule)"],
                      ["reserve31To60Pct", "31–60d reserve % (reserve_schedule)"],
                      ["reserve61To90Pct", "61–90d reserve % (reserve_schedule)"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="block">
                      <span className="text-xs font-medium text-gray-700">{label}</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        className="mt-1 w-full rounded-sm border border-gray-300 px-2.5 py-1.5 text-xs"
                        value={profileEditForm[key]}
                        onChange={(e) => setProfileEditForm((f) => (f ? { ...f, [key]: e.target.value } : f))}
                      />
                    </label>
                  ))}
                </div>
                <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
                  <button type="button" onClick={() => { setProfileEditOpen(false); setProfileEditForm(null); }} className="rounded-sm border border-gray-300 px-4 py-2 text-xs text-gray-700 hover:bg-gray-50">Cancel</button>
                  <button
                    type="button"
                    disabled={savingFactorProfile}
                    data-testid="factoring-profile-save"
                    className="rounded-sm bg-[#1f2a44] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50 hover:bg-[#0f1729]"
                    onClick={async () => {
                      if (!profileEditForm || !activeFactor) return;
                      try {
                        setSavingFactorProfile(true);
                        const patch = profileFormToFactorPatch(profileEditForm);
                        await updateFactor(activeFactor.id, companyId, {
                          advance_rate: patch.advance_rate,
                          fee_rate: patch.fee_rate,
                          reserve_rate: patch.reserve_rate,
                          recourse_days: patch.recourse_days,
                          remittance_details: patch.remittance_details as Record<string, unknown>,
                          ...(patch.fee_schedule ? { fee_schedule: patch.fee_schedule } : {}),
                          ...(patch.reserve_schedule ? { reserve_schedule: patch.reserve_schedule } : {}),
                        });
                        pushToast("Factoring profile saved", "success");
                        setProfileEditOpen(false);
                        setProfileEditForm(null);
                        await queryClient.invalidateQueries({ queryKey: ["factoring"] });
                        await queryClient.invalidateQueries({ queryKey: ["factoring", "factors", companyId] });
                      } catch (error) {
                        pushToast(userFacingApiError(error, "Failed to save profile"), "error");
                      } finally {
                        setSavingFactorProfile(false);
                      }
                    }}
                  >
                    {savingFactorProfile ? "Saving…" : "Save profile"}
                  </button>
                </div>
              </div>
            </Modal>
          )}

      {/* FUNDS-DUE-01 (owner 2026-09-09, live-verified): "Funds Due" is real this pass -- invoices
          submitted to the factor and not yet advanced (accounting.factoring_advances,
          submitted_at set / advanced_at null). PROD-VERIFIED 2026-09-09: 51/51 live rows are
          already 'advanced' -- zero rows currently match, which is an honest empty state (the
          real portal shows the same "nothing due" once everything submitted has funded), never
          fabricated. The moment a real submission is awaiting advance this table populates
          automatically -- no further wiring required. */}
      {tab === "funds_due" ? (
        <div className="rounded-sm border border-gray-200 bg-white p-3" data-testid="factoring-funds-due-report">
          <div className="mb-2 text-xs font-medium text-gray-900">Funds Due</div>
          {fundsDueQuery.isError ? (
            <ListErrorState
              title="Couldn't load funds due"
              {...formatQueryErrorDetail(fundsDueQuery.error)}
              onRetry={() => void fundsDueQuery.refetch()}
            />
          ) : (
            <div className="overflow-x-auto">
              <ParityTable
                columns={[
                  {
                    key: "customer_name",
                    label: "Debtor",
                    sortable: true,
                    render: (row: (typeof fundsDueRows)[number]) =>
                      row.customer_id ? <EntityLink kind="customer" id={row.customer_id} label={entityLabel(row.customer_name, row.customer_id, "Customer")} /> : (row.customer_name ?? "—"),
                  },
                  {
                    key: "display_id",
                    label: "Invoice No",
                    sortable: true,
                    render: (row: (typeof fundsDueRows)[number]) =>
                      row.invoice_id ? <EntityLink kind="invoice" id={row.invoice_id} label={row.display_id ?? row.invoice_id} /> : (row.display_id ?? "—"),
                  },
                  { key: "submitted_at", label: "Submitted", sortable: true, render: (row: (typeof fundsDueRows)[number]) => fmtDate(row.submitted_at) },
                  { key: "invoice_total_cents", label: "Invoice Amount", sortable: true, cellClass: "text-right", render: (row: (typeof fundsDueRows)[number]) => fmtCurrency(row.invoice_total_cents / 100) },
                  { key: "advance_amount_cents", label: "Expected Advance", sortable: true, cellClass: "text-right", render: (row: (typeof fundsDueRows)[number]) => fmtCurrency(row.advance_amount_cents / 100) },
                ]}
                rows={fundsDueRows}
                rowKey={(row) => row.factoring_advance_id}
                loading={fundsDueQuery.isLoading}
                emptyText="No invoices currently awaiting advance -- everything submitted has already been funded."
                storageKey="factoring-funds-due"
                footerCells={{
                  customer_name: `${fundsDueRows.length} invoice(s)`,
                  advance_amount_cents: fmtCurrency(fundsDueRows.reduce((sum, row) => sum + Number(row.advance_amount_cents ?? 0), 0) / 100),
                }}
              />
              <p className="mt-2 text-xs text-gray-500" data-testid="factoring-funds-due-footnote">
                Invoices submitted to the factor but not yet advanced. Distinct from the other
                tabs on this page, which only ever show invoices that have already been funded.
              </p>
            </div>
          )}
        </div>
      ) : null}

      {/* FAC-09a 15-item real debtor-portal nav (owner 2026-09-08, screenshot-corrected). Aging
          is fully real this pass (built on the same recourse-pipeline data, no new backend
          query). The rest are honest, named, clickable stubs for this pass — never silently
          shipped as done; each says plainly what it is. Real builds continue as fast-follow PRs. */}
      {tab === "request_debtor_credit_check" ||
      tab === "debtor_receipts" ||
      tab === "loan_save" ||
      tab === "unapplied_cash" ||
      tab === "invoice_status_report" ||
      tab === "messages_support" ? (
        <div className="rounded-sm border border-dashed border-gray-300 bg-gray-50 p-4 text-xs text-gray-700" data-testid={`factoring-stub-${tab}`}>
          <div className="font-medium text-gray-900">{SUBNAV.find((item) => item.id === tab)?.label}</div>
          <p className="mt-1">Not yet wired to real data — this tab exists and is reachable, but its content is a placeholder for this pass. See docs/audit/GUARD-WORKORDERS.md (FAC-09a) for what is real vs. stub.</p>
        </div>
      ) : null}

      {/* FAC-09a Reserve (real, this pass, owner mega-report 2026-09-09): Total Reserve is the
          same real summary.reserve_balance every other tab already uses; the movement history
          table below is the same real getReserveBalanceHistory ledger ReserveTracker.tsx already
          proves correct, scoped to this page's own active factor. Escrow/Cash split and the
          Show-Cash/Show-Escrow toggle are honestly not built -- this schema has no type split on
          reserve_balance (same constraint as Account Summary's own Escrow/Cash rows above). */}
      {tab === "reserve" ? (
        <div className="rounded-sm border border-gray-200 bg-white p-3" data-testid="factoring-reserve-report">
          <div className="mb-2 text-xs font-medium text-gray-900">Reserve</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="factoring-reserve-summary-strip">
            {/* verify-no-dead-kpi-cards: honest "—" values (no Escrow/Cash split, no distinct
                available-for-release figure exist in this schema) still get a real drill target
                rather than a dead click -- Reserve Tracker carries the combined balance and the
                real release forecast these three would otherwise have no destination for. */}
            <DrillKpiCard
              testId="factoring-reserve-escrow"
              label="Escrow Reserve"
              value="—"
              hint="No Escrow/Cash split in this schema"
              to={FACTORING_TAB_PATH.reserve_tracker}
            />
            <DrillKpiCard
              testId="factoring-reserve-cash"
              label="Cash Reserve"
              value="—"
              hint="No Escrow/Cash split in this schema"
              to={FACTORING_TAB_PATH.reserve_tracker}
            />
            <DrillKpiCard
              testId="factoring-reserve-total"
              label="Total Reserve"
              value={summaryQuery.isError ? null : fmtCurrency(summary?.reserve_balance)}
              to={FACTORING_TAB_PATH.reserve_tracker}
            />
            <DrillKpiCard
              testId="factoring-reserve-available"
              label="Available for Release"
              value="—"
              hint="See Reserve Tracker's release forecast"
              to={FACTORING_TAB_PATH.reserve_tracker}
            />
          </div>
          <div className="mt-3 text-xs font-medium text-gray-900">Reserve movement history</div>
          {reserveHistoryQuery.isError ? (
            <ListErrorState
              title="Couldn't load reserve movement history"
              {...formatQueryErrorDetail(reserveHistoryQuery.error)}
              onRetry={() => void reserveHistoryQuery.refetch()}
            />
          ) : !summary?.active_factor_id ? (
            <div className="mt-2 rounded-sm border border-dashed border-gray-300 bg-gray-50 p-4 text-xs text-gray-500">
              No active factor configured — reserve movement history has no factor to scope to.
            </div>
          ) : (
            <ParityTable
              columns={[
                { key: "created_at", label: "Date", sortable: true, render: (row: FactoringReserveBalanceHistoryEntry) => fmtDate(row.created_at) },
                { key: "reason", label: "Note", render: (row: FactoringReserveBalanceHistoryEntry) => row.reason },
                {
                  key: "signed_amount_cents",
                  label: "Amount",
                  sortable: true,
                  cellClass: "text-right",
                  render: (row: FactoringReserveBalanceHistoryEntry) => fmtCurrency(row.signed_amount_cents / 100),
                },
                {
                  key: "running_balance_cents",
                  label: "Balance",
                  sortable: true,
                  cellClass: "text-right",
                  render: (row: FactoringReserveBalanceHistoryEntry) => fmtCurrency(row.running_balance_cents / 100),
                },
              ]}
              rows={reserveHistoryQuery.data?.movements ?? []}
              rowKey={(row) => row.id}
              loading={reserveHistoryQuery.isLoading}
              emptyText="No reserve movements recorded yet."
              storageKey="factoring-reserve-report"
            />
          )}
          <p className="mt-2 text-xs text-gray-500" data-testid="factoring-reserve-footnote">
            "Escrow Reserve" / "Cash Reserve" are shown separately in the real Faro portal; this
            system tracks one combined reserve_balance with no type split, so both rows above are
            honestly "—" rather than duplicating the combined figure into each. "ID", "Inv", "PO
            Ref#", "Debtor", and "Pmt Ref" columns from the real portal's per-entry table have no
            backing field on this batch-level movement ledger — the real Date/Note/Amount/Balance
            columns above are never fabricated.
          </p>
        </div>
      ) : null}

      {/* REG-014 (owner 2026-09-09, "the Funds Due is not wired"): real, this pass. Reuses the SAME
          submission-queue query Submit Factor already runs (listSubmissionQueue) -- no new backend
          route. Funds Due here is scoped honestly to "eligible to submit right now" (is_submittable
          rows), a raw SUM(total_cents), the only aggregation the lane boundary allows -- not a
          funded/receivable ledger figure, which would need a real funds-due/factoring_purchases
          endpoint that does not exist yet (confirmed this pass, zero backend matches). */}
      {tab === "funds_due" ? (
        <div className="rounded-sm border border-gray-200 bg-white p-3" data-testid="factoring-funds-due-report">
          <div className="mb-2 text-xs font-medium text-gray-900">Funds Due</div>
          {fundsDueQuery.isError ? (
            <ListErrorState
              title="Couldn't load eligible invoices"
              {...formatQueryErrorDetail(fundsDueQuery.error)}
              onRetry={() => void fundsDueQuery.refetch()}
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="factoring-funds-due-summary-strip">
                <DrillKpiCard
                  testId="factoring-funds-due-total"
                  label="Funds due (eligible now)"
                  value={
                    fundsDueQuery.isLoading
                      ? null
                      : fmtCurrency(
                          (fundsDueQuery.data?.items ?? [])
                            .filter((item) => item.is_submittable)
                            .reduce((sum, item) => sum + Number(item.total_cents ?? 0), 0) / 100
                        )
                  }
                  hint="Sum of eligible-to-submit invoices, not a funded/receivable ledger"
                  to={FACTORING_TAB_PATH.submit}
                />
                <DrillKpiCard
                  testId="factoring-funds-due-count"
                  label="Eligible invoices"
                  value={
                    fundsDueQuery.isLoading
                      ? null
                      : String((fundsDueQuery.data?.items ?? []).filter((item) => item.is_submittable).length)
                  }
                  to={FACTORING_TAB_PATH.submit}
                />
              </div>
              <div className="mt-3 text-xs font-medium text-gray-900">Eligible invoices</div>
              <ParityTable
                columns={[
                  { key: "display_id", label: "Invoice", sortable: true, render: (row: SubmissionQueueItem) => row.display_id ?? "—" },
                  { key: "customer_name", label: "Customer", sortable: true, render: (row: SubmissionQueueItem) => row.customer_name ?? "—" },
                  { key: "due_date", label: "Due date", sortable: true, render: (row: SubmissionQueueItem) => (row.due_date ? fmtDate(row.due_date) : "—") },
                  {
                    key: "total_cents",
                    label: "Amount",
                    sortable: true,
                    cellClass: "text-right",
                    render: (row: SubmissionQueueItem) => fmtCurrency(row.total_cents / 100),
                  },
                ]}
                rows={(fundsDueQuery.data?.items ?? []).filter((item) => item.is_submittable)}
                rowKey={(row) => row.invoice_id}
                loading={fundsDueQuery.isLoading}
                emptyText="No invoices currently eligible for submission."
                storageKey="factoring-funds-due-report"
              />
              <p className="mt-2 text-xs text-gray-500" data-testid="factoring-funds-due-footnote">
                This is the same eligible-invoice set Submit Factor uses, summed — not a separate
                funded/receivable ledger. IH35-TMS has no funds-due/factoring_purchases backend
                surface yet; once submitted (Submit Factor), an invoice moves out of this list.
              </p>
            </>
          )}
        </div>
      ) : null}

      {/* GLB-25157 (owner 2026-09-09): Factoring "Payments to You" — real table sourced from
          the SAME recourseQuery rows already fetched for Aging (views.factoring_recourse_at_risk,
          which is built on accounting.factoring_advances). The view's factored_at IS
          COALESCE(fa.advanced_at, fa.created_at) and advance_amount IS
          fa.advance_amount_cents / 100 — so these are the real advanced_at / advance_amount_cents
          rows the owner asked for, no new backend query. Columns: Date, Advance/Invoice ref,
          Gross advance amount (invoice_amount), Net paid to IH35 (advance_amount), running total.
          No fabricated columns — every field has real backing from the advances table. */}
      {tab === "payments_to_you" ? (
        <div className="space-y-3">
          <div className="rounded-sm border border-gray-200 bg-white p-3">
            <div className="mb-2 text-xs font-medium text-gray-900">Payments to You</div>
            <div className="text-xs text-gray-500" data-testid="factoring-payments-to-you-note">
              Dollar amounts Faro advanced to IH35 per factored invoice, sourced from
              the factoring advance records (advance amount + advanced date).
            </div>
          </div>
          <div className="rounded-sm border border-gray-200 bg-white p-3">
            {recourseQuery.isError ? (
              <ListErrorState
                title="Couldn't load payments"
                {...formatQueryErrorDetail(recourseQuery.error)}
                onRetry={() => void recourseQuery.refetch()}
              />
            ) : (
              <div className="overflow-x-auto">
                <ParityTable
                  columns={[
                    { key: "factored_at", label: "Date", sortable: true, render: (row: (typeof agingRows)[number]) => fmtDate(row.factored_at) },
                    {
                      key: "invoice_reference",
                      label: "Advance/Invoice Ref",
                      sortable: true,
                      render: (row: (typeof agingRows)[number]) =>
                        row.invoice_id ? <EntityLink kind="invoice" id={row.invoice_id} label={row.invoice_reference} /> : row.invoice_reference,
                    },
                    { key: "customer_name", label: "Debtor", sortable: true, render: (row: (typeof agingRows)[number]) => row.customer_name },
                    { key: "invoice_amount", label: "Gross Advance Amount", sortable: true, cellClass: "text-right", render: (row: (typeof agingRows)[number]) => fmtCurrency(row.invoice_amount) },
                    { key: "advance_amount", label: "Net Paid to IH35", sortable: true, cellClass: "text-right font-semibold", render: (row: (typeof agingRows)[number]) => fmtCurrency(row.advance_amount) },
                    { key: "running_total", label: "Running Total", sortable: true, cellClass: "text-right", render: (row: (typeof paymentsToYouRows)[number]) => fmtCurrency(row.running_total) },
                  ]}
                  rows={paymentsToYouRows}
                  rowKey={(row) => row.factoring_advance_id}
                  loading={recourseQuery.isLoading}
                  emptyText="No advance payments recorded."
                  storageKey="factoring-payments-to-you"
                  tableTestId="factoring-payments-to-you-table"
                  footerCells={{
                    invoice_reference: `${paymentsToYouRows.length} records`,
                    advance_amount: fmtCurrency(paymentsToYouTotal),
                    running_total: fmtCurrency(paymentsToYouTotal),
                  }}
                />
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* FAC-09a Chargebacks & Overpayments (real, this pass): the real portal's own screenshot
          set (09-08-2026-Cursor-FAC09a-CORRECTED-FROM-REAL-SCREENSHOTS.md) specifies exact column
          layouts for Reserve/Fees Paid/Purchase Report/Payments to You/Aging/Account Summary but
          NOT for this specific debtor-facing tab -- rather than guess at a column spec that was
          never captured, this reuses the SAME real chargeback/fee history already proven correct
          on the "Chargebacks & Fees" internal-tools tab (same ChargebacksTable component, same
          feesQuery.data.history, no new backend query) with a summary strip up front (Total
          Records + Total Chargebacks/Overpayments, matching the Aging tab's own strip pattern) --
          honest reuse of real data, not a fabricated new layout. */}
      {tab === "chargebacks_overpayments" ? (
        <div className="space-y-3">
          <div className="rounded-sm border border-gray-200 bg-white p-3">
            <div className="mb-2 text-xs font-medium text-gray-900">Chargebacks &amp; Overpayments</div>
            {/* UI-01 (flat containers, no box-in-box): unlike the Aging tab's summary strip
                (individually-bordered tiles, already the file's one grandfathered instance of
                this shape), this strip's tiles stay borderless -- divided by a thin border
                between cells instead of a box each -- so this section doesn't add a SECOND
                nested-box instance to the same file. */}
            <div
              className="grid grid-cols-2 divide-x divide-gray-200 sm:grid-cols-3"
              data-testid="factoring-chargebacks-overpayments-summary-strip"
            >
              <div className="p-2 text-center">
                <div className="text-xs uppercase tracking-wide text-gray-500">Total Records</div>
                <div className="mt-1 font-semibold text-gray-900" data-testid="factoring-chargebacks-overpayments-total-records">
                  {(feesQuery.data?.history ?? []).length}
                </div>
              </div>
              <div className="p-2 text-center">
                <div className="text-xs uppercase tracking-wide text-gray-500">Total Chargebacks/Overpayments</div>
                <div className="mt-1 font-semibold text-gray-900" data-testid="factoring-chargebacks-overpayments-total-amount">
                  {fmtCurrency((feesQuery.data?.history ?? []).reduce((sum, row) => sum + Number(row.chargeback_amount ?? 0), 0))}
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-sm border border-gray-200 bg-white p-3">
            {feesQuery.isError ? (
              <ListErrorState
                title="Couldn't load chargebacks & overpayments"
                {...formatQueryErrorDetail(feesQuery.error)}
                onRetry={() => void feesQuery.refetch()}
              />
            ) : (
              <div className="overflow-x-auto">
                <ChargebacksTable rows={feesQuery.data?.history ?? []} fmtCurrency={fmtCurrency} fmtDate={fmtDate} />
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* FAC-09a Account Summary (real, this pass): a plain summary block per the real portal's
          own screenshots, NOT a register. Built entirely on already-fetched summaryQuery
          (views.factoring_summary) + feesQuery (views.factoring_chargebacks_fees monthly_summary)
          data — no new backend query. This schema has no period-close snapshot for factoring (no
          Beginning/Ending balance history) and no per-fee-type breakdown (Discount/Schedule/Wire
          are one combined factor_fee_amount) and no Loan/Savings/Funds-on-Hold/escrow-vs-cash
          reserve split — every line without a real backing field renders an honest "—" rather
          than a fabricated number, same standard as the Aging tab's PO/Other Ref/Memos columns. */}
      {tab === "account_summary" ? (
        (() => {
          const latestMonth = feesQuery.data?.monthly_summary?.[0] ?? null;
          return (
            <div className="space-y-3">
              {summaryQuery.isError ? (
                <ListErrorBanner onRetry={() => void summaryQuery.refetch()} />
              ) : (
                <div className="rounded-sm border border-gray-200 bg-white p-3" data-testid="factoring-account-summary">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-medium text-gray-900">Account Summary</div>
                    <div className="text-xs text-gray-500">
                      No date-range picker this pass — this schema has no historical period-close
                      snapshot for factoring balances, so a date range could not change any of the
                      point-in-time figures below without fabricating history.
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                    <div className="flex items-center justify-between border-b border-gray-100 py-1">
                      <span className="text-xs text-gray-600">Beginning Balance</span>
                      <span className="text-xs text-gray-400" data-testid="factoring-account-summary-beginning-balance">—</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-gray-100 py-1">
                      <span className="text-xs text-gray-600">Ending Balance (AR)</span>
                      <span className="text-xs font-medium text-gray-900" data-testid="factoring-account-summary-ending-balance">
                        {summaryQuery.isError ? "—" : fmtCurrency(summary?.outstanding_liability_balance)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-b border-gray-100 py-1">
                      <span className="text-xs text-gray-600">Payments to You *</span>
                      <span className="text-xs text-gray-400" data-testid="factoring-account-summary-payments-to-you">—</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-gray-100 py-1">
                      <span className="text-xs text-gray-600">Debtor Receipts</span>
                      <span className="text-xs text-gray-400" data-testid="factoring-account-summary-debtor-receipts">—</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-gray-100 py-1">
                      <span className="text-xs text-gray-600">Payments from You</span>
                      <span className="text-xs text-gray-400" data-testid="factoring-account-summary-payments-from-you">—</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-gray-100 py-1">
                      <span className="text-xs text-gray-600">Reserve Balance (combined)</span>
                      <span className="text-xs font-medium text-gray-900" data-testid="factoring-account-summary-reserve-balance">
                        {summaryQuery.isError ? "—" : fmtCurrency(summary?.reserve_balance)}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 border-t border-gray-200 pt-2">
                    <div className="text-xs font-medium text-gray-900">
                      Fees Paid{latestMonth ? ` — ${fmtDate(latestMonth.statement_month)} (most recent posted month)` : ""}
                    </div>
                    <div className="mt-1 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                      <div className="flex items-center justify-between border-b border-gray-100 py-1">
                        <span className="text-xs text-gray-600">Discount Fee</span>
                        <span className="text-xs text-gray-400" data-testid="factoring-account-summary-fee-discount">—</span>
                      </div>
                      <div className="flex items-center justify-between border-b border-gray-100 py-1">
                        <span className="text-xs text-gray-600">Schedule Fee</span>
                        <span className="text-xs text-gray-400" data-testid="factoring-account-summary-fee-schedule">—</span>
                      </div>
                      <div className="flex items-center justify-between border-b border-gray-100 py-1">
                        <span className="text-xs text-gray-600">Wire Fee</span>
                        <span className="text-xs text-gray-400" data-testid="factoring-account-summary-fee-wire">—</span>
                      </div>
                      <div className="flex items-center justify-between border-b border-gray-100 py-1">
                        <span className="text-xs text-gray-600">Total Fees (all types combined)</span>
                        <span className="text-xs font-medium text-gray-900" data-testid="factoring-account-summary-fees-total">
                          {feesQuery.isError ? "—" : fmtCurrency(latestMonth?.factor_fee_total)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 border-t border-gray-200 pt-2">
                    <div className="flex items-center justify-between border-b border-gray-100 py-1">
                      <span className="text-xs text-gray-600">Other Adjustments (Chargebacks/Overpayments, most recent posted month)</span>
                      <span className="text-xs font-medium text-gray-900" data-testid="factoring-account-summary-adjustments">
                        {feesQuery.isError ? "—" : fmtCurrency(latestMonth?.chargeback_total)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-b border-gray-100 py-1">
                      <span className="text-xs text-gray-600">Total Change in NFE</span>
                      <span className="text-xs text-gray-400" data-testid="factoring-account-summary-nfe-change">—</span>
                    </div>
                  </div>

                  <div className="mt-3 border-t border-gray-200 pt-2">
                    <div className="mb-1 text-xs font-medium text-gray-900">Beginning / Ending — Balance Sheet Items</div>
                    <div className="overflow-x-auto">
                      <ParityTable
                        columns={[
                          { key: "label", label: "Item" },
                          {
                            key: "beginning",
                            label: "Beginning",
                            render: (row: { label: string; testId: string }) => (
                              <span className="text-gray-400" data-testid={`factoring-account-summary-${row.testId}-beginning`}>—</span>
                            ),
                          },
                          {
                            key: "ending",
                            label: "Ending",
                            render: (row: { label: string; ending: unknown; testId: string }) =>
                              row.ending == null ? (
                                <span className="text-gray-400" data-testid={`factoring-account-summary-${row.testId}-ending`}>—</span>
                              ) : (
                                <span className="font-medium text-gray-900" data-testid={`factoring-account-summary-${row.testId}-ending`}>
                                  {fmtCurrency(row.ending)}
                                </span>
                              ),
                          },
                        ]}
                        rows={[
                          { label: "AR Balance", ending: summaryQuery.isError ? null : summary?.outstanding_liability_balance, testId: "ar-balance" },
                          { label: "Escrow Reserve", ending: null, testId: "escrow-reserve" },
                          { label: "Cash Reserve", ending: null, testId: "cash-reserve" },
                          { label: "Loan", ending: null, testId: "loan" },
                          { label: "Savings", ending: null, testId: "savings" },
                          { label: "Funds on Hold", ending: null, testId: "funds-on-hold" },
                          { label: "NFE", ending: null, testId: "nfe" },
                        ]}
                        rowKey={(row) => row.testId}
                      />
                    </div>
                    <p className="mt-2 text-xs text-gray-500" data-testid="factoring-account-summary-footnote">
                      * Payments to You includes all payments due on invoices purchased during the
                      selected date range (real portal definition). "Escrow Reserve" / "Cash
                      Reserve" are shown separately in the real Faro portal; this system tracks one
                      combined reserve_balance with no type split, so both rows above are honestly
                      "—" rather than duplicating the combined figure into each. Loan / Savings /
                      Funds on Hold / NFE and all Beginning-column figures have no backing field in
                      this schema yet (no factoring period-close snapshot exists) — never fabricated.
                    </p>
                  </div>
                </div>
              )}
            </div>
          );
        })()
      ) : null}

      {/* FAC-09a Purchase Report (real, this pass): built on the SAME agingRows (recourse-pipeline)
          + feesQuery history already fetched for Aging/Fees Paid -- no new backend query. Of the
          doc's 22 real-portal columns, 9 have a real backing field in this schema (Debtor, Date,
          Inv #, Other Ref, Purchase, Cash Rsv, Fees, Net Adv, ChgBack); the other 13 (PO, Escrow
          Rsv, Discount, Wire Fee, Rebate Income, Returned Item Fee, Schedule Fee, Shipping Fee,
          Cash Advance Fee, Processing Fee, Dispatch, Receipts, Sch Fee) have no backing field at
          all -- rendered an honest "—" in every row, never fabricated. "Display Fee Detail" /
          "Include Non-Purchased Invoices" checkboxes and "Filter by Debtor" are not wired this
          pass (noted in-page, not silently dropped). */}
      {tab === "purchase_report" ? (
        <div className="rounded-sm border border-gray-200 bg-white p-3" data-testid="factoring-purchase-report">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-medium text-gray-900">Purchase Report</div>
            <div className="text-xs text-gray-500">
              "Display Fee Detail" / "Include Non-Purchased Invoices" / "Filter by Debtor" are not
              wired this pass — every invoice in the register is shown.
            </div>
          </div>
          {recourseQuery.isError ? (
            <ListErrorState
              title="Couldn't load purchase report"
              {...formatQueryErrorDetail(recourseQuery.error)}
              onRetry={() => void recourseQuery.refetch()}
            />
          ) : (
            <div className="overflow-x-auto">
              <ParityTable
                columns={[
                  {
                    key: "customer_name",
                    label: "Debtor",
                    render: (row: (typeof purchaseReportRows)[number]) =>
                      row.customer_id ? <EntityLink kind="customer" id={row.customer_id} label={entityLabel(row.customer_name, row.customer_id, "Customer")} /> : row.customer_name,
                  },
                  { key: "factored_at", label: "Date", render: (row: (typeof purchaseReportRows)[number]) => fmtDate(row.factored_at) },
                  {
                    key: "invoice_reference",
                    label: "Inv #",
                    render: (row: (typeof purchaseReportRows)[number]) =>
                      row.invoice_id ? <EntityLink kind="invoice" id={row.invoice_id} label={row.invoice_reference} /> : row.invoice_reference,
                  },
                  { key: "po", label: "PO", render: () => "—" },
                  { key: "other_ref", label: "Other Ref", render: (row: (typeof purchaseReportRows)[number]) => row.other_ref ?? "—" },
                  // OWNER MEGA-REPORT 2026-09-09 ("settlement numbers are missing from Factoring
                  // entirely"): real field, already fetched (FactoringRecourseInvoice carries the
                  // same shared Load-Costs rollup lc_settlement_number RecoursePipelineTable
                  // already renders) — no new backend query, just never surfaced on this tab.
                  {
                    key: "settlement_number",
                    label: "Settlement #",
                    sortable: true,
                    render: (row: (typeof purchaseReportRows)[number]) => row.lc_settlement_number || "—",
                  },
                  // OWNER MEGA-REPORT 2026-09-09: "amount of the ORIGINAL invoice, then advance,
                  // then reserve, then fees — in that order, every tab." The 4 real dollar columns
                  // are grouped in that exact sequence here; every placeholder "—" column (no
                  // backing field, per the footnote below) keeps its original real-Faro-portal
                  // position around them, unchanged.
                  { key: "purchase", label: "Purchase", cellClass: "text-right", render: (row: (typeof purchaseReportRows)[number]) => fmtCurrency(row.invoice_amount) },
                  {
                    key: "advance_amount",
                    label: "Net Adv",
                    cellClass: "text-right",
                    render: (row: (typeof purchaseReportRows)[number]) => fmtCurrency(row.advance_amount),
                  },
                  { key: "escrow_rsv", label: "Escrow Rsv", render: () => "—" },
                  {
                    key: "cash_rsv",
                    label: "Cash Rsv",
                    cellClass: "text-right",
                    render: (row: (typeof purchaseReportRows)[number]) => fmtCurrency(row.reserve_amount),
                  },
                  { key: "discount", label: "Discount", render: () => "—" },
                  { key: "fees", label: "Fees", cellClass: "text-right", render: (row: (typeof purchaseReportRows)[number]) => fmtCurrency(row.fees) },
                  { key: "wire_fee", label: "Wire Fee", render: () => "—" },
                  { key: "rebate_income", label: "Rebate Income", render: () => "—" },
                  { key: "returned_item_fee", label: "Returned Item Fee", render: () => "—" },
                  { key: "schedule_fee", label: "Schedule Fee", render: () => "—" },
                  { key: "shipping_fee", label: "Shipping Fee", render: () => "—" },
                  { key: "cash_advance_fee", label: "Cash Advance Fee", render: () => "—" },
                  { key: "processing_fee", label: "Processing Fee", render: () => "—" },
                  { key: "dispatch", label: "Dispatch", render: () => "—" },
                  { key: "receipts", label: "Receipts", render: () => "—" },
                  { key: "sch_fee", label: "Sch Fee", render: () => "—" },
                  {
                    key: "chargeback",
                    label: "ChgBack (Refund)",
                    cellClass: "text-right",
                    render: (row: (typeof purchaseReportRows)[number]) => fmtCurrency(row.chargeback),
                  },
                ]}
                rows={purchaseReportRows}
                rowKey={(row) => row.factoring_advance_id}
                loading={recourseQuery.isLoading}
                emptyText="No purchased invoices."
                storageKey="factoring-purchase-report"
                footerCells={{
                  customer_name: `${purchaseReportRows.length} invoices`,
                  purchase: fmtCurrency(purchaseReportRows.reduce((sum, row) => sum + Number(row.invoice_amount ?? 0), 0)),
                  cash_rsv: fmtCurrency(purchaseReportRows.reduce((sum, row) => sum + Number(row.reserve_amount ?? 0), 0)),
                  fees: fmtCurrency(purchaseReportRows.reduce((sum, row) => sum + Number(row.fees ?? 0), 0)),
                  advance_amount: fmtCurrency(purchaseReportRows.reduce((sum, row) => sum + Number(row.advance_amount ?? 0), 0)),
                  chargeback: fmtCurrency(purchaseReportRows.reduce((sum, row) => sum + Number(row.chargeback ?? 0), 0)),
                }}
              />
              <p className="mt-2 text-xs text-gray-500" data-testid="factoring-purchase-report-footnote">
                "Cash Rsv" shows this schema's one combined per-invoice reserve_amount (no Escrow /
                Cash split field exists, so "Escrow Rsv" is honestly "—"). PO, Discount, Wire Fee,
                Rebate Income, Returned Item Fee, Schedule Fee, Shipping Fee, Cash Advance Fee,
                Processing Fee, Dispatch, Receipts, and Sch Fee have no backing field in this
                schema — never fabricated.
              </p>
            </div>
          )}
        </div>
      ) : null}

      {/* FAC-09a Fees Paid (real, this pass): two views per the real portal's own screenshot --
          "Open Invoices" (per-invoice Accrued Fees, built on the same agingRows + feesQuery
          history already fetched for Aging/Chargebacks & Fees) and "All Fees" (the full fee
          line-item history, built directly on feesQuery.data.history -- no new backend query
          either way). Fee Description is honestly "Factor Fee" for every row -- this schema has
          one combined factor_fee_amount, not a Discount/Schedule/Wire breakdown, same limitation
          noted on Account Summary. PO/Ref has no backing field -- rendered "—", never fabricated. */}
      {tab === "fees_paid" ? (
        <div className="rounded-sm border border-gray-200 bg-white p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-medium text-gray-900">Fees Paid</div>
            <div className="inline-flex overflow-hidden border border-gray-300" data-testid="factoring-fees-paid-view-toggle">
              <button
                type="button"
                data-testid="factoring-fees-paid-view-open-invoices"
                className={`px-2.5 py-1 text-xs font-semibold ${feesPaidView === "open_invoices" ? "bg-[#1F2A44] text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
                aria-pressed={feesPaidView === "open_invoices"}
                onClick={() => setFeesPaidView("open_invoices")}
              >
                View Closed Invoices
              </button>
              <button
                type="button"
                data-testid="factoring-fees-paid-view-all-fees"
                className={`border-l border-gray-300 px-2.5 py-1 text-xs font-semibold ${feesPaidView === "all_fees" ? "bg-[#1F2A44] text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
                aria-pressed={feesPaidView === "all_fees"}
                onClick={() => setFeesPaidView("all_fees")}
              >
                View All Fees
              </button>
            </div>
          </div>

          {feesPaidView === "open_invoices" ? (
            recourseQuery.isError ? (
              <ListErrorState
                title="Couldn't load open-invoice fees"
                {...formatQueryErrorDetail(recourseQuery.error)}
                onRetry={() => void recourseQuery.refetch()}
              />
            ) : (
              <div className="overflow-x-auto">
                <ParityTable
                  columns={[
                    {
                      key: "customer_name",
                      label: "Debtor",
                      render: (row: (typeof feesPaidOpenInvoiceRows)[number]) =>
                        row.customer_id ? <EntityLink kind="customer" id={row.customer_id} label={entityLabel(row.customer_name, row.customer_id, "Customer")} /> : row.customer_name,
                    },
                    {
                      key: "invoice_reference",
                      label: "Invoice No",
                      render: (row: (typeof feesPaidOpenInvoiceRows)[number]) =>
                        row.invoice_id ? <EntityLink kind="invoice" id={row.invoice_id} label={row.invoice_reference} /> : row.invoice_reference,
                    },
                    { key: "age", label: "Age", cellClass: "text-right", render: (row: (typeof feesPaidOpenInvoiceRows)[number]) => row.age },
                    { key: "amount", label: "Amount", cellClass: "text-right", render: (row: (typeof feesPaidOpenInvoiceRows)[number]) => fmtCurrency(row.invoice_amount) },
                    { key: "balance", label: "Balance", cellClass: "text-right", render: (row: (typeof feesPaidOpenInvoiceRows)[number]) => fmtCurrency(row.invoice_amount) },
                    {
                      key: "accrued_fees",
                      label: "Accrued Fees",
                      cellClass: "text-right font-semibold",
                      render: (row: (typeof feesPaidOpenInvoiceRows)[number]) => fmtCurrency(row.accrued_fees),
                    },
                  ]}
                  rows={feesPaidOpenInvoiceRows}
                  rowKey={(row) => row.factoring_advance_id}
                  loading={recourseQuery.isLoading}
                  emptyText="No open invoices."
                  storageKey="factoring-fees-paid-open-invoices"
                  footerCells={{
                    customer_name: `${feesPaidOpenInvoiceRows.length} invoices`,
                    accrued_fees: fmtCurrency(feesPaidOpenInvoiceRows.reduce((sum, row) => sum + Number(row.accrued_fees ?? 0), 0)),
                  }}
                />
                <p className="mt-2 text-xs text-gray-500" data-testid="factoring-fees-paid-open-invoices-footnote">
                  Amount and Balance are the same figure (invoice_amount) — this schema does not yet
                  track partial debtor payments separately from the original invoice amount.
                </p>
              </div>
            )
          ) : feesQuery.isError ? (
            <ListErrorState
              title="Couldn't load fee history"
              {...formatQueryErrorDetail(feesQuery.error)}
              onRetry={() => void feesQuery.refetch()}
            />
          ) : (
            <div className="overflow-x-auto">
              <ParityTable
                columns={[
                  {
                    key: "customer_name",
                    label: "Debtor",
                    render: (row: ChargebackFeeRow) =>
                      row.customer_id ? <EntityLink kind="customer" id={row.customer_id} label={entityLabel(row.customer_name, row.customer_id, "Customer")} /> : row.customer_name,
                  },
                  {
                    key: "invoice_display_id",
                    label: "Invoice No",
                    render: (row: ChargebackFeeRow) =>
                      row.invoice_id ? <EntityLink kind="invoice" id={row.invoice_id} label={row.invoice_display_id} /> : row.invoice_display_id,
                  },
                  { key: "po_ref", label: "PO/Ref", render: () => "—" },
                  { key: "statement_reference", label: "Other Ref", render: (row: ChargebackFeeRow) => row.statement_reference ?? "—" },
                  { key: "created_at", label: "Date", render: (row: ChargebackFeeRow) => fmtDate(row.created_at) },
                  { key: "factor_fee_amount", label: "Amount", cellClass: "text-right", render: (row: ChargebackFeeRow) => fmtCurrency(row.factor_fee_amount) },
                  { key: "fee_description", label: "Fee Description", render: () => "Factor Fee" },
                ]}
                rows={feesQuery.data?.history ?? []}
                rowKey={(row) => row.factoring_advance_id}
                loading={feesQuery.isLoading}
                emptyText="No fee history."
                storageKey="factoring-fees-paid-all-fees"
                footerCells={{
                  customer_name: `${(feesQuery.data?.history ?? []).length} fee record(s)`,
                  factor_fee_amount: fmtCurrency(feesPaidAllFeesTotal),
                }}
              />
              <p className="mt-2 text-xs text-gray-500" data-testid="factoring-fees-paid-all-fees-footnote">
                "Fee Description" is honestly "Factor Fee" for every row — this schema tracks one
                combined factor_fee_amount, not a Discount/Schedule/Wire-fee breakdown. "PO/Ref" has
                no backing field on this view — never fabricated.
              </p>
            </div>
          )}
        </div>
      ) : null}

      {tab === "aging" ? (
        <div className="space-y-3">
          <div className="rounded-sm border border-gray-200 bg-white p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-medium text-gray-900">Aging Report — as of {fmtDate(new Date().toISOString())}</div>
              <div className="text-xs text-gray-500" data-testid="factoring-aging-date-basis-note">
                Aged by factored date (the date each invoice entered the factoring register) —
                the real portal's "View by Invoice Date / Purchase Date / Fund Date" toggle is not
                wired this pass; this data model has one real date field to age against.
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" data-testid="factoring-aging-summary-strip">
              <div className="border border-gray-200 p-2 text-center">
                <div className="text-xs uppercase tracking-wide text-gray-500">Total Records</div>
                <div className="mt-1 font-semibold text-gray-900" data-testid="factoring-aging-total-records">{agingRows.length}</div>
              </div>
              {(["0-30", "31-60", "61-90", "90+"] as const).map((bucket) => (
                <div key={bucket} className="border border-gray-200 p-2 text-center">
                  <div className="text-xs uppercase tracking-wide text-gray-500">Total {bucket}</div>
                  <div className="mt-1 font-semibold text-gray-900" data-testid={`factoring-aging-total-${bucket}`}>
                    {fmtCurrency(agingTotals[bucket])}
                  </div>
                </div>
              ))}
              <div className="border border-gray-200 p-2 text-center">
                <div className="text-xs uppercase tracking-wide text-gray-500">Total Balance</div>
                <div className="mt-1 font-semibold text-gray-900" data-testid="factoring-aging-total-balance">
                  {fmtCurrency(agingTotals.balance)}
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-sm border border-gray-200 bg-white p-3">
            {recourseQuery.isError ? (
              <ListErrorState
                title="Couldn't load aging report"
                {...formatQueryErrorDetail(recourseQuery.error)}
                onRetry={() => void recourseQuery.refetch()}
              />
            ) : (
              <div className="overflow-x-auto">
                <ParityTable
                  columns={[
                    {
                      key: "factoring_advance_id",
                      label: "ID",
                      sortable: true,
                      render: (row: (typeof agingRows)[number]) => (
                        <EntityLink kind="factoring_advance" id={row.factoring_advance_id} label={entityLabel(row.invoice_reference, row.factoring_advance_id, "Advance")} />
                      ),
                    },
                    { key: "memos", label: "Memos", render: () => "—" },
                    {
                      key: "invoice_reference",
                      label: "Invoice",
                      sortable: true,
                      render: (row: (typeof agingRows)[number]) =>
                        row.invoice_id ? <EntityLink kind="invoice" id={row.invoice_id} label={row.invoice_reference} /> : row.invoice_reference,
                    },
                    {
                      key: "customer_name",
                      label: "Debtor",
                      sortable: true,
                      render: (row: (typeof agingRows)[number]) =>
                        row.customer_id ? <EntityLink kind="customer" id={row.customer_id} label={entityLabel(row.customer_name, row.customer_id, "Customer")} /> : row.customer_name,
                    },
                    { key: "po_ref", label: "PO", render: () => "—" },
                    { key: "other_ref", label: "Other Ref", render: () => "—" },
                    // OWNER MEGA-REPORT 2026-09-09 ("settlement numbers are missing from
                    // Factoring entirely"): a real settlement EntityLink where the advance has one
                    // (settlement_id/settlement_display_id), falling back to the same
                    // lc_settlement_number text Purchase Report's identical addition uses when the
                    // advance has no linked settlement row yet -- no new backend query either way.
                    {
                      key: "settlement_number",
                      label: "Settlement #",
                      sortable: true,
                      render: (row: (typeof agingRows)[number]) =>
                        row.settlement_id ? (
                          <EntityLink kind="settlement" id={row.settlement_id} label={row.settlement_display_id ?? row.lc_settlement_number ?? "—"} />
                        ) : (
                          row.lc_settlement_number || "—"
                        ),
                    },
                    { key: "factored_at", label: "Inv Date", sortable: true, render: (row: (typeof agingRows)[number]) => fmtDate(row.factored_at) },
                    { key: "recourse_expiry_date", label: "Due Date", sortable: true, render: (row: (typeof agingRows)[number]) => fmtDate(row.recourse_expiry_date) },
                    { key: "age", label: "Age", sortable: true, cellClass: "text-right", render: (row: (typeof agingRows)[number]) => row.age },
                    { key: "b0_30", label: "0-30", cellClass: "text-right", render: (row: (typeof agingRows)[number]) => (row.bucket === "0-30" ? fmtCurrency(row.invoice_amount) : "—") },
                    { key: "b31_60", label: "31-60", cellClass: "text-right", render: (row: (typeof agingRows)[number]) => (row.bucket === "31-60" ? fmtCurrency(row.invoice_amount) : "—") },
                    { key: "b61_90", label: "61-90", cellClass: "text-right", render: (row: (typeof agingRows)[number]) => (row.bucket === "61-90" ? fmtCurrency(row.invoice_amount) : "—") },
                    { key: "b90_plus", label: "90+", cellClass: "text-right", render: (row: (typeof agingRows)[number]) => (row.bucket === "90+" ? fmtCurrency(row.invoice_amount) : "—") },
                    { key: "balance", label: "Balance", sortable: true, cellClass: "text-right font-semibold", render: (row: (typeof agingRows)[number]) => fmtCurrency(row.invoice_amount) },
                    { key: "purchased", label: "Purchase", render: () => "Y" },
                  ]}
                  rows={agingRows}
                  rowKey={(row) => row.factoring_advance_id}
                  loading={recourseQuery.isLoading}
                  emptyText="No invoices inside the aging register."
                  storageKey="factoring-aging-report"
                  tableTestId="factoring-aging-table"
                  footerCells={{
                    settlement_display_id: `${agingRows.length} records`,
                    b0_30: fmtCurrency(agingTotals["0-30"]),
                    b31_60: fmtCurrency(agingTotals["31-60"]),
                    b61_90: fmtCurrency(agingTotals["61-90"]),
                    b90_plus: fmtCurrency(agingTotals["90+"]),
                    balance: fmtCurrency(agingTotals.balance),
                  }}
                />
              </div>
            )}
          </div>
        </div>
      ) : null}

      {tab === "reserve_tracker" ? (
        <div className="rounded-sm border border-gray-200 bg-white p-3">
          <ReserveTracker />
        </div>
      ) : null}

      {tab === "recourse_pipeline" ? (
        <div className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid="factoring-home-recourse-filters">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-medium text-gray-900">Invoices inside recourse window (sorted by days until expiry)</span>
            <span className="text-gray-600">
              Advance {fmtCurrency(recourseTotals.advance)} · Reserve {fmtCurrency(recourseTotals.reserve)}
            </span>
          </div>
          <div className="overflow-x-auto">
            <RecoursePipelineTable
              rows={invoices}
              fmtCurrency={fmtCurrency}
              fmtDate={fmtDate}
              feesByAdvance={accruedFeesByAdvance}
              filterBar={
                // NEW-20 (owner 2026-09-07): "customer/load boxes too large and misaligned;
                // filter/range box + gear should sit in the same row as the customer/load
                // boxes." CollapsedListFilters is the SAME shared chrome the Accounting module
                // already standardizes on (Expenses/Payments/Credit Memos/Bill Payments/Manual
                // JE) — a slim "Filters" toggle sits in the table's own filterBar row (next to
                // search/range/gear, in the one bordered shell) instead of two full-width
                // EntityPicker boxes floating in a separate outer div above it.
                <CollapsedListFilters
                  activeFilterCount={[applied.customerId, applied.loadId].filter(Boolean).length}
                  onApply={staged.apply}
                  onCancel={staged.cancel}
                  onReset={() => {
                    staged.cancel();
                    setApplied(EMPTY_FILTERS);
                    patchListSearchParam(EMPTY_FILTERS);
                  }}
                  applyDisabled={!staged.dirty}
                  testIdPrefix="factoring-home-recourse"
                  applyTestId="factoring-home-filter-apply"
                  cancelTestId="factoring-home-filter-cancel"
                  resetTestId="factoring-home-filter-reset"
                >
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="text-[11px] text-slate-600">
                      Customer
                      <EntityPicker
                        kind="customer"
                        operatingCompanyId={companyId}
                        value={filterDraft.customerId || null}
                        onChange={(next) => staged.setDraft((d) => ({ ...d, customerId: next ?? "" }))}
                        allowCreate={false}
                        placeholder="All customers"
                        className="mt-1"
                        dataTestId="factoring-home-filter-customer"
                      />
                    </label>
                    <label className="text-[11px] text-slate-600">
                      Load
                      <EntityPicker
                        kind="load"
                        operatingCompanyId={companyId}
                        value={filterDraft.loadId || null}
                        onChange={(next) => staged.setDraft((d) => ({ ...d, loadId: next ?? "" }))}
                        allowCreate={false}
                        placeholder="All loads"
                        className="mt-1"
                        dataTestId="factoring-home-filter-load"
                      />
                    </label>
                  </div>
                </CollapsedListFilters>
              }
            />
          </div>
          <CappedListNotice shown={invoices.length} limit={200} total={recourseQuery.data?.total} hint="Narrow the filters to see the remaining invoices." />
        </div>
      ) : null}

      {tab === "chargebacks_fees" ? (
        <div className="space-y-3" data-testid="factoring-home-chargebacks-filters">
          {/* NEW-24 (owner 2026-09-07): "Chargebacks & Fee History screen is split awkwardly
              with Monthly Fee Summaries mixed in — give each its own tab/window, or put Monthly
              Fee Summary above, not interleaved." Was a side-by-side lg:grid-cols-2 (two panels
              sharing one screen width, each squeezed) — now a vertical stack, summary ABOVE
              detail, each full-width and un-interleaved, per the owner's own second option. */}
          <div className="rounded-sm border border-gray-200 bg-white p-3">
            <div className="mb-2 text-xs font-medium text-gray-900">Monthly fee summaries</div>
            {feesQuery.isError ? (
              <ListErrorState
                title="Couldn't load monthly fee summaries"
                {...formatQueryErrorDetail(feesQuery.error)}
                onRetry={() => void feesQuery.refetch()}
              />
            ) : (
              <ParityTable
                columns={MONTHLY_FEE_COLUMNS}
                rows={feesQuery.data?.monthly_summary ?? []}
                rowKey={(row) => String(row.statement_month)}
                loading={feesQuery.isLoading}
                emptyText="No monthly fee summaries available."
                storageKey="factoring-home-monthly-fee-summaries"
              />
            )}
          </div>
          <div className="rounded-sm border border-gray-200 bg-white p-3">
            <div className="mb-2 text-xs font-medium text-gray-900">Chargebacks + fee history</div>
            <div className="overflow-x-auto">
              <ChargebacksTable
                rows={feesQuery.data?.history ?? []}
                fmtCurrency={fmtCurrency}
                fmtDate={fmtDate}
                filterBar={
                  // NEW-20 — see the identical Recourse Pipeline filterBar above for the full
                  // rationale (CollapsedListFilters, the shared Accounting-module chrome).
                  <CollapsedListFilters
                    activeFilterCount={applied.customerId ? 1 : 0}
                    onApply={staged.apply}
                    onCancel={staged.cancel}
                    onReset={() => {
                      staged.cancel();
                      setApplied(EMPTY_FILTERS);
                      patchListSearchParam(EMPTY_FILTERS);
                    }}
                    applyDisabled={!staged.dirty}
                    testIdPrefix="factoring-home-chargebacks"
                    applyTestId="factoring-home-chargebacks-filter-apply"
                    cancelTestId="factoring-home-chargebacks-filter-cancel"
                    resetTestId="factoring-home-chargebacks-filter-reset"
                  >
                    <label className="text-[11px] text-slate-600">
                      Customer
                      <EntityPicker
                        kind="customer"
                        operatingCompanyId={companyId}
                        value={filterDraft.customerId || null}
                        onChange={(next) => staged.setDraft((d) => ({ ...d, customerId: next ?? "" }))}
                        allowCreate={false}
                        placeholder="All customers"
                        className="mt-1"
                        dataTestId="factoring-home-chargebacks-filter-customer"
                      />
                    </label>
                  </CollapsedListFilters>
                }
              />
            </div>
            <CappedListNotice
              shown={feesQuery.data?.history?.length ?? 0}
              limit={500}
              total={feesQuery.data?.history_total}
              hint="Narrow the customer filter to see the remaining chargebacks and fees."
            />
          </div>
        </div>
      ) : null}

      {tab === "statements_settings" ? (
        <div className="space-y-3">
          <div className="rounded-sm border border-gray-200 bg-white p-3 text-xs">
            <div className="font-medium text-gray-900">Single-factor invariant status</div>
            <div className="mt-1 text-gray-700">
              Active factors: {Number(settingsQuery.data?.current?.active_factor_count ?? 0)} · Status:{" "}
              <span className={settingsQuery.data?.current?.single_factor_invariant_ok ? "text-slate-700" : "text-red-700"}>
                {settingsQuery.data?.current?.single_factor_invariant_ok ? "Compliant" : "Violation"}
              </span>
            </div>
            <div className="mt-1 text-gray-700">Configured recourse period: {Number(settingsQuery.data?.current?.recourse_days ?? 95)} days</div>
          </div>

          <div className="rounded-sm border border-gray-200 bg-white p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-medium text-gray-900">Statement history</div>
              {/* NEW-25: Summary (monthly totals, the historical default) vs Detail (the same
                  line-item chargeback/fee history the Chargebacks & Fees tab renders). */}
              <div className="inline-flex overflow-hidden border border-gray-300" data-testid="factoring-statements-view-toggle">
                <button
                  type="button"
                  data-testid="factoring-statements-view-summary"
                  className={`px-2.5 py-1 text-xs font-semibold ${statementsView === "summary" ? "bg-[#1F2A44] text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
                  aria-pressed={statementsView === "summary"}
                  onClick={() => setStatementsView("summary")}
                >
                  Summary
                </button>
                <button
                  type="button"
                  data-testid="factoring-statements-view-detail"
                  className={`border-l border-gray-300 px-2.5 py-1 text-xs font-semibold ${statementsView === "detail" ? "bg-[#1F2A44] text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
                  aria-pressed={statementsView === "detail"}
                  onClick={() => setStatementsView("detail")}
                >
                  Detail
                </button>
              </div>
            </div>
            {statementsView === "summary" ? (
              settingsQuery.isError ? (
                <ListErrorState
                  title="Couldn't load statement history"
                  {...formatQueryErrorDetail(settingsQuery.error)}
                  onRetry={() => void settingsQuery.refetch()}
                />
              ) : (
                <ParityTable
                  columns={STATEMENT_HISTORY_COLUMNS}
                  rows={settingsQuery.data?.statements ?? []}
                  rowKey={(row) => String(row.statement_month)}
                  loading={settingsQuery.isLoading}
                  emptyText="No statement history rows available."
                  storageKey="factoring-home-statement-history"
                />
              )
            ) : feesQuery.isError ? (
              <ListErrorState
                title="Couldn't load statement detail"
                {...formatQueryErrorDetail(feesQuery.error)}
                onRetry={() => void feesQuery.refetch()}
              />
            ) : (
              <div className="overflow-x-auto">
                <ChargebacksTable
                  rows={feesQuery.data?.history ?? []}
                  fmtCurrency={fmtCurrency}
                  fmtDate={fmtDate}
                />
              </div>
            )}
          </div>

          <div className="rounded-sm border border-gray-200 bg-white p-3 text-xs">
            <div className="font-medium text-gray-900">Faro deactivation (Owner-only)</div>
            <p className="mt-1 text-gray-600">Disables the active factor for this operating company. Intended for controlled migration windows only.</p>
            <div className="mt-2">
              <Button
                size="sm"
                variant="danger"
                disabled={!canDeactivate || deactivating || !companyId}
                onClick={() => setDeactivateModalOpen(true)}
              >
                Deactivate active factor
              </Button>
            </div>
            {!canDeactivate ? <div className="mt-2 text-xs text-slate-700">Only Owner role can deactivate an active factor.</div> : null}
          </div>
          <div data-deactivate-factor-confirm-modal="true">
            <DeactivateFactorConfirmModal
              open={deactivateModalOpen}
              loading={deactivating}
              onClose={() => setDeactivateModalOpen(false)}
              onConfirm={async () => {
                if (!canDeactivate || !companyId) return;
                setDeactivating(true);
                try {
                  await deactivateFactoring(companyId);
                  pushToast("Active factor deactivated", "success");
                  setDeactivateModalOpen(false);
                  await queryClient.invalidateQueries({ queryKey: ["factoring"] });
                  await queryClient.invalidateQueries({ queryKey: ["banking"] });
                } catch (error) {
                  pushToast(userFacingApiError(error, "Failed to deactivate factor"), "error");
                } finally {
                  setDeactivating(false);
                }
              }}
            />
          </div>
        </div>
      ) : null}

      {tab === "faro_imports" ? (
        <div className="space-y-3">
          <div className="rounded-sm border border-gray-200 bg-white p-3">
            <div className="mb-2 text-xs font-medium text-gray-900">Upsert Faro daily import batch</div>
            <div className="grid gap-2 md:grid-cols-3 mb-3">
              <DatePicker
                className=""
                value={faroStatementDate}
                onChange={setFaroStatementDate}
              />
              <input
                className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
                value={faroStatementRef}
                onChange={(event) => setFaroStatementRef(event.target.value)}
                placeholder="statement reference"
              />
            </div>
            <FaroCSVUploadWidget
              csvText={faroCsvText}
              fileName={faroFileName}
              onCsvTextChange={(text, name) => {
                setFaroCsvText(text);
                setFaroFileName(name);
              }}
              uploading={creatingFaro}
              jsonFallback={faroLinesJson}
              onJsonFallbackChange={setFaroLinesJson}
              showJsonFallback={showFaroJsonFallback}
              onToggleJsonFallback={() => setShowFaroJsonFallback((open) => !open)}
              onUpload={async () => {
                if (!companyId || !faroStatementDate) return;
                try {
                  setCreatingFaro(true);
                  if (faroCsvText.trim()) {
                    await apiRequest(`/api/v1/factoring/import/faro`, {
                      method: "POST",
                      body: {
                        operating_company_id: companyId,
                        csv_text: faroCsvText,
                        statement_date: faroStatementDate,
                        statement_reference: faroStatementRef || "daily",
                        source_filename: faroFileName || undefined,
                      },
                    });
                  } else {
                    const lines = JSON.parse(faroLinesJson) as Array<Record<string, unknown>>;
                    await upsertFaroDailyImport({
                      operating_company_id: companyId,
                      statement_date: faroStatementDate,
                      statement_reference: faroStatementRef || "daily",
                      lines: lines as Array<{
                        invoice_number: string;
                        customer_name?: string;
                        load_id?: string;
                        gross_amount_cents?: number;
                        advance_amount_cents?: number;
                        reserve_amount_cents?: number;
                        fee_amount_cents?: number;
                        chargeback_amount_cents?: number;
                        net_amount_cents?: number;
                        due_on?: string;
                      }>,
                    });
                  }
                  pushToast("Faro import batch upserted", "success");
                  setFaroCsvText("");
                  setFaroFileName("");
                  await queryClient.invalidateQueries({ queryKey: ["data-infra", "faro-imports", companyId] });
                } catch (error) {
                  pushToast(userFacingApiError(error, "Faro import failed"), "error");
                } finally {
                  setCreatingFaro(false);
                }
              }}
            />
          </div>
          <div className="rounded-sm border border-gray-200 bg-white p-3">
            <div className="mb-2 text-xs font-medium text-gray-900">Recent Faro imports</div>
            {faroImportsQuery.isError ? (
              <ListErrorState
                title="Couldn't load Faro imports"
                {...formatQueryErrorDetail(faroImportsQuery.error)}
                onRetry={() => void faroImportsQuery.refetch()}
              />
            ) : (
              <ParityTable
                columns={FARO_IMPORT_COLUMNS}
                rows={faroImportsQuery.data?.rows ?? []}
                rowKey={(row) => row.id}
                loading={faroImportsQuery.isLoading}
                emptyText="No Faro imports recorded yet."
                storageKey="factoring-home-faro-imports"
              />
            )}
          </div>
        </div>
      ) : null}

      {tab === "equipment_loans" ? (
        <div className="space-y-3">
          <div className="rounded-sm border border-gray-200 bg-white p-3">
            <div className="mb-2 text-xs font-medium text-gray-900">Create equipment loan</div>
            <div className="grid gap-2 md:grid-cols-5">
              <EntityPicker
                kind="unit"
                operatingCompanyId={companyId}
                value={loanEquipmentId || null}
                onChange={(v) => setLoanEquipmentId(v ?? "")}
                placeholder="Select equipment"
                enabled={Boolean(companyId) && tab === "equipment_loans"}
              />
              {/* CLS-SILENT-CAP: EntityPicker server-search — no uncapped listVendors page for lender. */}
              <EntityPicker
                kind="vendor"
                allowCreate
                operatingCompanyId={companyId}
                value={loanLenderVendorId || null}
                onChange={(v) => setLoanLenderVendorId(v ?? "")}
                placeholder="Select lender vendor"
                enabled={Boolean(companyId) && tab === "equipment_loans"}
                dataField="factoring-loan-lender-vendor"
                className="w-full"
              />
              {/* M-1 (GUARD FAIL #3): was a raw "principal cents" text input (350 = $3.50). cents-mode MoneyInput:
                  operator types dollars; principal_cents = Number(loanPrincipalCents) stored unchanged. */}
              <MoneyInput
                valueCents={loanPrincipalCents ? Number(loanPrincipalCents) : null}
                onChangeCents={(c) => setLoanPrincipalCents(c == null ? "" : String(c))}
                ariaLabel="Loan principal (USD)"
                placeholder="Principal"
              />
              <input
                className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
                value={loanAprPercent}
                onChange={(event) => setLoanAprPercent(event.target.value)}
                placeholder="apr percent"
              />
              <DatePicker className="" value={loanStartedOn} onChange={setLoanStartedOn} />
            </div>
            <div className="mt-2">
              <Button
                size="sm"
                disabled={!companyId || !loanEquipmentId || !loanLenderVendorId || !loanPrincipalCents || !loanStartedOn || creatingLoan}
                onClick={async () => {
                  try {
                    setCreatingLoan(true);
                    await createEquipmentLoan({
                      operating_company_id: companyId,
                      equipment_id: loanEquipmentId.trim(),
                      lender_vendor_id: loanLenderVendorId.trim(),
                      principal_cents: Number(loanPrincipalCents),
                      apr_percent: Number(loanAprPercent || 0),
                      started_on: loanStartedOn,
                    });
                    pushToast("Equipment loan created", "success");
                    await queryClient.invalidateQueries({ queryKey: ["data-infra", "equipment-loans", companyId] });
                    setLoanEquipmentId("");
                    setLoanLenderVendorId("");
                    setLoanPrincipalCents("");
                    setLoanStartedOn("");
                  } catch (error) {
                    pushToast(userFacingApiError(error, "Loan create failed"), "error");
                  } finally {
                    setCreatingLoan(false);
                  }
                }}
              >
                {creatingLoan ? "Saving..." : "Create Loan"}
              </Button>
            </div>
          </div>
          <div className="rounded-sm border border-gray-200 bg-white p-3" data-testid="factoring-home-equipment-loan-filters">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-xs font-medium text-gray-900">Loans + ledger actions</div>
              {/* NEW-26: this list is a raw card list, not a ParityTable, so there is no
                  search/range/gear row to fold into via filterBar — CollapsedListFilters is used
                  standalone here instead, still compacting the always-open filter grid into a
                  toggle. */}
              <CollapsedListFilters
                activeFilterCount={applied.vendorId ? 1 : 0}
                onApply={staged.apply}
                onCancel={staged.cancel}
                onReset={() => {
                  staged.cancel();
                  setApplied(EMPTY_FILTERS);
                  patchListSearchParam(EMPTY_FILTERS);
                }}
                applyDisabled={!staged.dirty}
                testIdPrefix="factoring-home-equipment"
                applyTestId="factoring-home-equipment-filter-apply"
                cancelTestId="factoring-home-equipment-filter-cancel"
                resetTestId="factoring-home-equipment-filter-reset"
              >
                <label className="text-[11px] text-slate-600">
                  Lender vendor
                  <EntityPicker
                    kind="vendor"
                    operatingCompanyId={companyId}
                    value={filterDraft.vendorId || null}
                    onChange={(next) => staged.setDraft((d) => ({ ...d, vendorId: next ?? "" }))}
                    allowCreate={false}
                    placeholder="All lenders"
                    className="mt-1"
                    dataTestId="factoring-home-filter-vendor"
                  />
                </label>
              </CollapsedListFilters>
            </div>
            <div className="space-y-2">
              {(equipmentLoansQuery.data?.rows ?? []).map((row) => (
                <div key={row.id} className="p-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <EntityLink kind="unit" id={row.equipment_id} label={entityLabel(row.equipment_number, row.equipment_id, "Equipment")} className="font-semibold" />{" "}
                      · <EntityLink kind="vendor" id={row.lender_vendor_id} label={entityLabel(row.lender_vendor_name, row.lender_vendor_id, "Vendor")} /> ·{" "}
                      Principal {fmtCurrency(Number(row.principal_cents ?? 0) / 100)}
                      {/* LIABILITY column-wave: outstanding_balance_cents = principal minus
                          payments actually applied to principal — the current loan liability,
                          distinct from the static origination principal shown above. */}
                      {" · "}Outstanding{" "}
                      <span className="font-semibold">
                        {fmtCurrency(Number(row.outstanding_balance_cents ?? row.principal_cents ?? 0) / 100)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="secondary" onClick={() => setSelectedLoanId(String(row.id))}>
                        View Ledger
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setLoanAction({ loanId: String(row.id), kind: "attribution" });
                          setLoanActionLoadId("");
                          setLoanActionCents(null);
                        }}
                      >
                        + Attribution
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setLoanAction({ loanId: String(row.id), kind: "payment" });
                          setLoanActionLoadId("");
                          setLoanActionCents(null);
                        }}
                      >
                        + Payment
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              {(equipmentLoansQuery.data?.rows ?? []).length === 0 ? <p className="text-xs text-gray-500">No equipment loans yet.</p> : null}
            </div>
          </div>
          {selectedLoanId ? (
            <div className="rounded-sm border border-gray-200 bg-white p-3 text-xs">
              <div className="mb-2 font-medium text-gray-900">
                Selected loan ledger:{" "}
                {entityLabel(
                  selectedEquipmentLoan?.equipment_number,
                  selectedEquipmentLoan?.equipment_id,
                  "Equipment"
                )}
              </div>
              <p>Attributions: {(selectedLoanLedgerQuery.data?.attributions ?? []).length}</p>
              <p>Payments: {(selectedLoanLedgerQuery.data?.payments ?? []).length}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "vendor_merges" ? (
        <div className="space-y-3">
          <div className="rounded-sm border border-gray-200 bg-white p-3">
            <div className="mb-2 text-xs font-medium text-gray-900">Merge duplicate QBO vendors for a driver</div>
            <div className="grid gap-2 md:grid-cols-2">
              <DriverAutocomplete
                companyId={companyId}
                limit={200}
                value={mergeDriverId}
                onChange={(driverId, driverName) => {
                  setMergeDriverId(driverId);
                  setMergeDriverName(driverName);
                }}
              />
              <input
                className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
                value={mergeReason}
                onChange={(event) => setMergeReason(event.target.value)}
                placeholder="reason"
              />
              <input
                className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
                value={mergeFromVendor}
                onChange={(event) => {
                  setMergeFromVendor(event.target.value);
                  setMergeFromVendorName(""); // manual edit invalidates a deep-linked name
                }}
                placeholder="from qbo vendor id"
              />
              <input
                className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
                value={mergeToVendor}
                onChange={(event) => {
                  setMergeToVendor(event.target.value);
                  setMergeToVendorName(""); // manual edit invalidates a deep-linked name
                }}
                placeholder="to qbo vendor id"
              />
            </div>
            <VendorMergeDiffPreview
              driverName={mergeDriverName}
              fromVendorName={mergeFromVendorName || mergeFromVendor}
              fromVendorId={mergeFromVendor}
              toVendorName={mergeToVendorName || mergeToVendor}
              toVendorId={mergeToVendor}
              mergeConfirm={mergeConfirm}
              onMergeConfirmChange={setMergeConfirm}
            />
            <label className="mt-2 flex items-center gap-2 text-xs text-gray-700">
              <input type="checkbox" checked={mergeApplyToDriver} onChange={(event) => setMergeApplyToDriver(event.target.checked)} />
              Apply target vendor to driver if currently linked to source vendor
            </label>
            <div className="mt-2">
              <Button
                size="sm"
                disabled={!companyId || !mergeDriverId || !mergeFromVendor || !mergeToVendor || creatingMerge || mergeConfirm.trim().toUpperCase() !== "MERGE"}
                onClick={async () => {
                  try {
                    setCreatingMerge(true);
                    await createDriverVendorMerge({
                      operating_company_id: companyId,
                      driver_id: mergeDriverId.trim(),
                      from_qbo_vendor_id: mergeFromVendor.trim(),
                      to_qbo_vendor_id: mergeToVendor.trim(),
                      reason: mergeReason.trim() || "duplicate_vendor_cleanup",
                      apply_to_driver: mergeApplyToDriver,
                    });
                    pushToast("Driver vendor merge recorded", "success");
                    await queryClient.invalidateQueries({ queryKey: ["data-infra", "vendor-merges", companyId] });
                  } catch (error) {
                    pushToast(userFacingApiError(error, "Vendor merge failed"), "error");
                  } finally {
                    setCreatingMerge(false);
                  }
                }}
              >
                {creatingMerge ? "Saving..." : "Merge Vendors"}
              </Button>
            </div>
          </div>
          <div className="rounded-sm border border-gray-200 bg-white p-3" data-testid="factoring-home-vendor-merges-filters">
            <div className="mb-2 text-xs font-medium text-gray-900">Recent merge history</div>
            {vendorMergesQuery.isError ? (
              <ListErrorState
                title="Couldn't load merge history"
                {...formatQueryErrorDetail(vendorMergesQuery.error)}
                onRetry={() => void vendorMergesQuery.refetch()}
              />
            ) : (
              <ParityTable
                columns={VENDOR_MERGE_COLUMNS}
                rows={vendorMergesQuery.data?.rows ?? []}
                rowKey={(row) => row.id}
                loading={vendorMergesQuery.isLoading}
                emptyText="No merge history yet."
                storageKey="factoring-home-vendor-merges"
                filterBar={
                  // NEW-26 (owner 2026-09-07): "QuickBooks-style filters (date range etc.)
                  // missing across ALL Factoring tabs." Same CollapsedListFilters chrome as
                  // NEW-20's Recourse Pipeline / Chargebacks & Fees fix, extended to this tab's
                  // own Driver/Vendor filter grid.
                  <CollapsedListFilters
                    activeFilterCount={[applied.driverId, applied.vendorId].filter(Boolean).length}
                    onApply={staged.apply}
                    onCancel={staged.cancel}
                    onReset={() => {
                      staged.cancel();
                      setApplied(EMPTY_FILTERS);
                      patchListSearchParam(EMPTY_FILTERS);
                    }}
                    applyDisabled={!staged.dirty}
                    testIdPrefix="factoring-home-merges"
                    applyTestId="factoring-home-merges-filter-apply"
                    cancelTestId="factoring-home-merges-filter-cancel"
                    resetTestId="factoring-home-merges-filter-reset"
                  >
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="text-[11px] text-slate-600">
                        Driver
                        <EntityPicker
                          kind="driver"
                          operatingCompanyId={companyId}
                          value={filterDraft.driverId || null}
                          onChange={(next) => staged.setDraft((d) => ({ ...d, driverId: next ?? "" }))}
                          allowCreate={false}
                          placeholder="All drivers"
                          className="mt-1"
                          dataTestId="factoring-home-filter-driver"
                        />
                      </label>
                      <label className="text-[11px] text-slate-600">
                        Vendor
                        <EntityPicker
                          kind="vendor"
                          operatingCompanyId={companyId}
                          value={filterDraft.vendorId || null}
                          onChange={(next) => staged.setDraft((d) => ({ ...d, vendorId: next ?? "" }))}
                          allowCreate={false}
                          placeholder="All vendors"
                          className="mt-1"
                          dataTestId="factoring-home-merges-filter-vendor"
                        />
                      </label>
                    </div>
                  </CollapsedListFilters>
                }
              />
            )}
          </div>
        </div>
      ) : null}

      {/* M-1: equipment-loan attribution / payment money entry (replaces the raw-cents window.prompt). */}
      <Modal
        open={loanAction != null}
        onClose={() => setLoanAction(null)}
        title={loanAction?.kind === "attribution" ? "Record loan attribution" : "Record loan payment"}
      >
        <div className="space-y-3 text-xs">
          {loanAction?.kind === "attribution" ? (
            <label className="block" data-testid="factoring-loan-attribution-load-picker">
              Load
              <div className="mt-1">
                <EntityPicker
                  kind="load"
                  operatingCompanyId={companyId}
                  value={loanActionLoadId || null}
                  onChange={(v) => setLoanActionLoadId(v ?? "")}
                  enabled={Boolean(companyId) && loanAction?.kind === "attribution"}
                  placeholder="Select load"
                  allowClear
                />
              </div>
            </label>
          ) : null}
          <label className="block">
            Amount (USD)
            {/* cents-mode: user types dollars, amount_cents stored unchanged. */}
            <MoneyInput valueCents={loanActionCents} onChangeCents={setLoanActionCents} className="mt-1 w-full" ariaLabel="Amount (USD)" />
          </label>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={() => setLoanAction(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              loading={loanActionSaving}
              disabled={
                loanActionCents == null ||
                loanActionCents <= 0 ||
                (loanAction?.kind === "attribution" && !loanActionLoadId.trim())
              }
              onClick={async () => {
                if (!loanAction || loanActionCents == null) return;
                setLoanActionSaving(true);
                try {
                  if (loanAction.kind === "attribution") {
                    await createEquipmentLoanAttribution(loanAction.loanId, {
                      operating_company_id: companyId,
                      load_id: loanActionLoadId.trim(),
                      attribution_date: new Date().toISOString().slice(0, 10),
                      amount_cents: loanActionCents,
                    });
                    pushToast("Attribution recorded", "success");
                  } else {
                    await createEquipmentLoanPayment(loanAction.loanId, {
                      operating_company_id: companyId,
                      paid_on: new Date().toISOString().slice(0, 10),
                      amount_cents: loanActionCents,
                      principal_cents: loanActionCents,
                      interest_cents: 0,
                      fee_cents: 0,
                    });
                    pushToast("Payment recorded", "success");
                  }
                  await queryClient.invalidateQueries({ queryKey: ["data-infra", "equipment-loan-ledger", loanAction.loanId, companyId] });
                  setLoanAction(null);
                } catch (error) {
                  pushToast(userFacingApiError(error, "Failed to record"), "error");
                } finally {
                  setLoanActionSaving(false);
                }
              }}
            >
              {loanAction?.kind === "attribution" ? "Record attribution" : "Record payment"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
