import { useEffect, useMemo, useState } from "react";
import { userFacingApiError } from "../../lib/api-error-message";
import { Link, NavLink, useLocation, useSearchParams } from "react-router-dom";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deactivateFactoring,
  getFactoringChargebacksFees,
  getFactoringRecoursePipeline,
  getFactoringStatementsSettings,
  getFactoringSummary,
  listFactors,
  updateFactor,
  type FactoringMonthlyFeeSummary,
  type FactoringSettingsRow,
} from "../../api/factoring";
import { EntityPicker } from "../../components/parity/EntityPicker";
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
import { ChargebacksTable } from "./ChargebacksTable";
import { RecoursePipelineTable } from "./RecoursePipelineTable";
import { ReserveTracker } from "./ReserveTracker";
import { FaroCSVUploadWidget } from "../../components/factoring/FaroCSVUploadWidget";
import { DriverAutocomplete } from "../../components/factoring/DriverAutocomplete";
import { VendorMergeDiffPreview } from "../../components/factoring/VendorMergeDiffPreview";
import { DeactivateFactorConfirmModal } from "../../components/factoring/DeactivateFactorConfirmModal";
import { DuplicateVendorsBanner } from "../../components/factoring/DuplicateVendorsBanner";
import { apiRequest } from "../../api/client";
import { FACTORING_TAB_PATH, factoringTabFromPath } from "../../router/route-manifest";

const SUBNAV = [
  { id: "reserve_tracker", label: "Reserve Tracker" },
  { id: "recourse_pipeline", label: "Recourse Pipeline" },
  { id: "chargebacks_fees", label: "Chargebacks & Fees" },
  { id: "statements_settings", label: "Statements & Settings" },
  { id: "faro_imports", label: "Faro Daily Imports" },
  { id: "equipment_loans", label: "Equipment Loans (CCG)" },
  { id: "vendor_merges", label: "Driver Vendor Merges" },
] as const;

type FactoringTabId = (typeof SUBNAV)[number]["id"];

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
    render: (row) => <EntityLink kind="driver" id={row.driver_id} label={entityLabel(null, row.driver_id, "Driver")} />,
  },
  { key: "from_qbo_vendor_id", label: "From", sortable: true },
  { key: "to_qbo_vendor_id", label: "To", sortable: true },
  { key: "merge_reason", label: "Reason", sortable: true },
  { key: "merged_at", label: "Merged At", sortable: true, render: (row) => fmtDate(row.merged_at) },
];

export function FactoringHomePage({ initialTab = "recourse_pipeline" }: FactoringHomeProps = {}) {
  const location = useLocation();
  const { selectedCompanyId } = useCompanyContext();
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

  function setCustomerFilter(next: string) {
    staged.setDraft((d) => ({ ...d, customerId: next }));
  }
  function setLoadFilter(next: string) {
    staged.setDraft((d) => ({ ...d, loadId: next }));
  }
  function setVendorFilter(next: string) {
    staged.setDraft((d) => ({ ...d, vendorId: next }));
  }
  function setDriverFilter(next: string) {
    staged.setDraft((d) => ({ ...d, driverId: next }));
  }

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
  const settingsQuery = useQuery({
    queryKey: ["factoring", "statements-settings", companyId],
    queryFn: () => getFactoringStatementsSettings(companyId),
    enabled: Boolean(companyId),
  });
  const faroImportsQuery = useQuery({
    queryKey: ["data-infra", "faro-imports", companyId],
    queryFn: () => listFaroDailyImports(companyId),
    enabled: Boolean(companyId),
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
  const invoices = recourseQuery.data?.invoices ?? [];
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
    return (
      <div className="space-y-3">
        <PageHeader title="Factoring" subtitle="Deep-dive workspace for recourse pipeline, chargebacks, fees, and settings" />
        <div
          className="rounded-sm border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-700"
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

      <DuplicateVendorsBanner companyId={companyId} />

      <div className="grid gap-2 md:grid-cols-4" data-testid="factoring-home-kpi-row">
        <div className="rounded-sm border border-gray-200 bg-white p-3 text-sm">
          <div className="text-xs uppercase tracking-wide text-gray-500">Active Factor</div>
          <div className="mt-1 font-semibold text-gray-900">
            {summaryQuery.isError ? "—" : (summary?.active_factor_name ?? "Not configured")}
          </div>
        </div>
        <div className="rounded-sm border border-gray-200 bg-white p-3 text-sm">
          <div className="text-xs uppercase tracking-wide text-gray-500">Reserve Balance</div>
          <div className="mt-1 font-semibold text-gray-900">
            {summaryQuery.isError ? "—" : fmtCurrency(summary?.reserve_balance)}
          </div>
        </div>
        <div className="rounded-sm border border-gray-200 bg-white p-3 text-sm">
          <div className="text-xs uppercase tracking-wide text-gray-500">Chargeback Balance</div>
          <div className="mt-1 font-semibold text-gray-900">
            {summaryQuery.isError ? "—" : fmtCurrency(summary?.chargeback_balance)}
          </div>
        </div>
        <div className="rounded-sm border border-gray-200 bg-white p-3 text-sm">
          <div className="text-xs uppercase tracking-wide text-gray-500">Recourse Days</div>
          <div className="mt-1 font-semibold text-gray-900">
            {summaryQuery.isError ? "—" : Number(summary?.recourse_days ?? 95)}
          </div>
        </div>
      </div>
      {activeFactor ? (
        <>
          <FactoringProfilePanel
            factor={activeFactor}
            saving={savingFactorProfile}
            onSave={() => {
              setProfileEditForm(factorToProfileForm(activeFactor));
              setProfileEditOpen(true);
            }}
          />
          {profileEditForm && (
            <Modal open={profileEditOpen} onClose={() => { setProfileEditOpen(false); setProfileEditForm(null); }} title="Edit Factoring Profile">
              <div className="flex flex-col gap-3 text-sm" data-testid="factoring-profile-edit-modal">
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
                        className="mt-1 w-full rounded-sm border border-gray-300 px-2.5 py-1.5 text-sm"
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
                    <input className="mt-1 w-full rounded-sm border border-gray-300 px-2.5 py-1.5 text-sm" value={profileEditForm.telephone} onChange={(e) => setProfileEditForm((f) => (f ? { ...f, telephone: e.target.value } : f))} />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-700">General email</span>
                    <input type="email" className="mt-1 w-full rounded-sm border border-gray-300 px-2.5 py-1.5 text-sm" value={profileEditForm.generalEmail} onChange={(e) => setProfileEditForm((f) => (f ? { ...f, generalEmail: e.target.value } : f))} />
                  </label>
                </div>
                <label className="block">
                  <span className="text-xs font-medium text-gray-700">Address</span>
                  <input className="mt-1 w-full rounded-sm border border-gray-300 px-2.5 py-1.5 text-sm" value={profileEditForm.address} onChange={(e) => setProfileEditForm((f) => (f ? { ...f, address: e.target.value } : f))} />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs font-medium text-gray-700">Primary contact</span>
                    <input className="mt-1 w-full rounded-sm border border-gray-300 px-2.5 py-1.5 text-sm" value={profileEditForm.primaryContactName} onChange={(e) => setProfileEditForm((f) => (f ? { ...f, primaryContactName: e.target.value } : f))} />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-700">Primary contact email</span>
                    <input type="email" className="mt-1 w-full rounded-sm border border-gray-300 px-2.5 py-1.5 text-sm" value={profileEditForm.primaryContactEmail} onChange={(e) => setProfileEditForm((f) => (f ? { ...f, primaryContactEmail: e.target.value } : f))} />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-700">Accounting contact</span>
                    <input className="mt-1 w-full rounded-sm border border-gray-300 px-2.5 py-1.5 text-sm" value={profileEditForm.accountingContact} onChange={(e) => setProfileEditForm((f) => (f ? { ...f, accountingContact: e.target.value } : f))} />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-700">Disputes contact</span>
                    <input className="mt-1 w-full rounded-sm border border-gray-300 px-2.5 py-1.5 text-sm" value={profileEditForm.disputesContact} onChange={(e) => setProfileEditForm((f) => (f ? { ...f, disputesContact: e.target.value } : f))} />
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
                        className="mt-1 w-full rounded-sm border border-gray-300 px-2.5 py-1.5 text-sm"
                        value={profileEditForm[key]}
                        onChange={(e) => setProfileEditForm((f) => (f ? { ...f, [key]: e.target.value } : f))}
                      />
                    </label>
                  ))}
                </div>
                <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
                  <button type="button" onClick={() => { setProfileEditOpen(false); setProfileEditForm(null); }} className="rounded-sm border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
                  <button
                    type="button"
                    disabled={savingFactorProfile}
                    data-testid="factoring-profile-save"
                    className="rounded-sm bg-[#1f2a44] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-[#0f1729]"
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
        </>
      ) : (
        <div className="rounded-sm border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500" data-testid="factoring-profile-empty">
          {summary?.active_factor_profile_id || summary?.active_factor_name || summary?.active_factor_id
            ? "Active factor row is still loading…"
            : "No factor configured. Activate a factor to manage its profile."}
        </div>
      )}

      <div className="overflow-x-auto rounded-sm bg-[#1f2a44] px-2 py-1 text-[11px] text-white">
        <div className="flex min-w-max gap-4">
          {SUBNAV.map((item) => {
            const target = FACTORING_TAB_PATH[item.id];
            const active = tab === item.id;
            // Tabs without a registered route path (e.g. reserve_tracker — Lane A wires route later)
            // are rendered as buttons that set local state directly.
            if (!target) {
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id as FactoringTabId)}
                  className={active ? "border-b border-white pb-0.5 font-semibold" : "pb-0.5 hover:opacity-80"}
                >
                  {item.label}
                </button>
              );
            }
            return (
              <NavLink
                key={item.id}
                to={target}
                className={active ? "border-b border-white pb-0.5 font-semibold" : "pb-0.5"}
              >
                {item.label}
              </NavLink>
            );
          })}
        </div>
      </div>

      {tab === "reserve_tracker" ? (
        <div className="rounded-sm border border-gray-200 bg-white p-3">
          <ReserveTracker />
        </div>
      ) : null}

      {tab === "recourse_pipeline" ? (
        <div className="space-y-2 rounded-sm border border-gray-200 bg-white p-3">
          <div className="relative grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="factoring-home-recourse-filters">
            <label className="text-[11px] text-slate-600">
              Customer
              <EntityPicker
                kind="customer"
                operatingCompanyId={companyId}
                value={filterDraft.customerId || null}
                onChange={(next) => setCustomerFilter(next ?? "")}
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
                onChange={(next) => setLoadFilter(next ?? "")}
                allowCreate={false}
                placeholder="All loads"
                className="mt-1"
                dataTestId="factoring-home-filter-load"
              />
            </label>
            <div className="flex flex-wrap items-end gap-2">
              <Button type="button" size="sm" data-testid="factoring-home-filter-apply" onClick={staged.apply} disabled={!staged.dirty}>
                Apply
              </Button>
              <Button type="button" size="sm" variant="secondary" data-testid="factoring-home-filter-cancel" onClick={staged.cancel} disabled={!staged.dirty}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                data-testid="factoring-home-filter-reset"
                onClick={() => {
                  staged.cancel();
                  setApplied(EMPTY_FILTERS);
                  patchListSearchParam(EMPTY_FILTERS);
                }}
              >
                Reset
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-medium text-gray-900">Invoices inside recourse window (sorted by days until expiry)</span>
            <span className="text-gray-600">
              Advance {fmtCurrency(recourseTotals.advance)} · Reserve {fmtCurrency(recourseTotals.reserve)}
            </span>
          </div>
          <div className="overflow-x-auto">
            <RecoursePipelineTable rows={invoices} fmtCurrency={fmtCurrency} fmtDate={fmtDate} />
          </div>
          <CappedListNotice shown={invoices.length} limit={200} total={recourseQuery.data?.total} hint="Narrow the filters to see the remaining invoices." />
        </div>
      ) : null}

      {tab === "chargebacks_fees" ? (
        <div className="space-y-3">
          <div className="relative grid gap-2 sm:grid-cols-2 lg:grid-cols-3 rounded-sm border border-gray-200 bg-white p-3" data-testid="factoring-home-chargebacks-filters">
            <label className="text-[11px] text-slate-600">
              Customer
              <EntityPicker
                kind="customer"
                operatingCompanyId={companyId}
                value={filterDraft.customerId || null}
                onChange={(next) => setCustomerFilter(next ?? "")}
                allowCreate={false}
                placeholder="All customers"
                className="mt-1"
                dataTestId="factoring-home-chargebacks-filter-customer"
              />
            </label>
            <div className="flex flex-wrap items-end gap-2">
              <Button type="button" size="sm" data-testid="factoring-home-chargebacks-filter-apply" onClick={staged.apply} disabled={!staged.dirty}>
                Apply
              </Button>
              <Button type="button" size="sm" variant="secondary" data-testid="factoring-home-chargebacks-filter-cancel" onClick={staged.cancel} disabled={!staged.dirty}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                data-testid="factoring-home-chargebacks-filter-reset"
                onClick={() => {
                  staged.cancel();
                  setApplied(EMPTY_FILTERS);
                  patchListSearchParam(EMPTY_FILTERS);
                }}
              >
                Reset
              </Button>
            </div>
          </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-sm border border-gray-200 bg-white p-3">
            <div className="mb-2 text-sm font-medium text-gray-900">Chargebacks + fee history</div>
            <div className="overflow-x-auto">
              <ChargebacksTable rows={feesQuery.data?.history ?? []} fmtCurrency={fmtCurrency} fmtDate={fmtDate} />
            </div>
            <CappedListNotice
              shown={feesQuery.data?.history.length ?? 0}
              limit={500}
              total={feesQuery.data?.history_total}
              hint="Narrow the customer filter to see the remaining chargebacks and fees."
            />
          </div>
          <div className="rounded-sm border border-gray-200 bg-white p-3">
            <div className="mb-2 text-sm font-medium text-gray-900">Monthly fee summaries</div>
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
        </div>
        </div>
      ) : null}

      {tab === "statements_settings" ? (
        <div className="space-y-3">
          <div className="rounded-sm border border-gray-200 bg-white p-3 text-sm">
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
            <div className="mb-2 text-sm font-medium text-gray-900">Statement history</div>
            {settingsQuery.isError ? (
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
            )}
          </div>

          <div className="rounded-sm border border-gray-200 bg-white p-3 text-sm">
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
            <div className="mb-2 text-sm font-medium text-gray-900">Upsert Faro daily import batch</div>
            <div className="grid gap-2 md:grid-cols-3 mb-3">
              <DatePicker
                className=""
                value={faroStatementDate}
                onChange={setFaroStatementDate}
              />
              <input
                className="rounded-sm border border-gray-300 px-2 py-1 text-sm"
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
            <div className="mb-2 text-sm font-medium text-gray-900">Recent Faro imports</div>
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
            <div className="mb-2 text-sm font-medium text-gray-900">Create equipment loan</div>
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
          <div className="rounded-sm border border-gray-200 bg-white p-3">
            <div className="relative mb-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="factoring-home-equipment-loan-filters">
              <label className="text-[11px] text-slate-600">
                Lender vendor
                <EntityPicker
                  kind="vendor"
                  operatingCompanyId={companyId}
                  value={filterDraft.vendorId || null}
                  onChange={(next) => setVendorFilter(next ?? "")}
                  allowCreate={false}
                  placeholder="All lenders"
                  className="mt-1"
                  dataTestId="factoring-home-filter-vendor"
                />
              </label>
              <div className="flex flex-wrap items-end gap-2">
                <Button type="button" size="sm" data-testid="factoring-home-equipment-filter-apply" onClick={staged.apply} disabled={!staged.dirty}>
                  Apply
                </Button>
                <Button type="button" size="sm" variant="secondary" data-testid="factoring-home-equipment-filter-cancel" onClick={staged.cancel} disabled={!staged.dirty}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  data-testid="factoring-home-equipment-filter-reset"
                  onClick={() => {
                    staged.cancel();
                    setApplied(EMPTY_FILTERS);
                    patchListSearchParam(EMPTY_FILTERS);
                  }}
                >
                  Reset
                </Button>
              </div>
            </div>
            <div className="mb-2 text-sm font-medium text-gray-900">Loans + ledger actions</div>
            <div className="space-y-2">
              {(equipmentLoansQuery.data?.rows ?? []).map((row) => (
                <div key={row.id} className="rounded-sm border border-gray-200 p-2 text-xs">
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
              {(equipmentLoansQuery.data?.rows ?? []).length === 0 ? <p className="text-sm text-gray-500">No equipment loans yet.</p> : null}
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
            <div className="mb-2 text-sm font-medium text-gray-900">Merge duplicate QBO vendors for a driver</div>
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
                onChange={(event) => setMergeFromVendor(event.target.value)}
                placeholder="from qbo vendor id"
              />
              <input
                className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
                value={mergeToVendor}
                onChange={(event) => setMergeToVendor(event.target.value)}
                placeholder="to qbo vendor id"
              />
            </div>
            <VendorMergeDiffPreview
              driverName={mergeDriverName}
              fromVendorName={mergeFromVendor}
              fromVendorId={mergeFromVendor}
              toVendorName={mergeToVendor}
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
          <div className="rounded-sm border border-gray-200 bg-white p-3">
            <div className="relative mb-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="factoring-home-vendor-merges-filters">
              <label className="text-[11px] text-slate-600">
                Driver
                <EntityPicker
                  kind="driver"
                  operatingCompanyId={companyId}
                  value={filterDraft.driverId || null}
                  onChange={(next) => setDriverFilter(next ?? "")}
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
                  onChange={(next) => setVendorFilter(next ?? "")}
                  allowCreate={false}
                  placeholder="All vendors"
                  className="mt-1"
                  dataTestId="factoring-home-merges-filter-vendor"
                />
              </label>
              <div className="flex flex-wrap items-end gap-2">
                <Button type="button" size="sm" data-testid="factoring-home-merges-filter-apply" onClick={staged.apply} disabled={!staged.dirty}>
                  Apply
                </Button>
                <Button type="button" size="sm" variant="secondary" data-testid="factoring-home-merges-filter-cancel" onClick={staged.cancel} disabled={!staged.dirty}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  data-testid="factoring-home-merges-filter-reset"
                  onClick={() => {
                    staged.cancel();
                    setApplied(EMPTY_FILTERS);
                    patchListSearchParam(EMPTY_FILTERS);
                  }}
                >
                  Reset
                </Button>
              </div>
            </div>
            <div className="mb-2 text-sm font-medium text-gray-900">Recent merge history</div>
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
        <div className="space-y-3 text-sm">
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
