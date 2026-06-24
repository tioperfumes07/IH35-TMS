import { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { deactivateFactoring, getFactoringChargebacksFees, getFactoringRecoursePipeline, getFactoringStatementsSettings, getFactoringSummary } from "../../api/factoring";
import { listVendors, updateVendor } from "../../api/mdata";
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
} from "../../api/data-infra";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { PageHeader } from "../../components/layout/PageHeader";
import { useToast } from "../../components/Toast";
import { useAuth } from "../../auth/useAuth";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { parseVendorNotes, serializeVendorNotes } from "../../lib/vendorProfileMeta";
import { FactoringProfilePanel } from "./FactoringProfilePanel";
import { ChargebacksTable } from "./ChargebacksTable";
import { RecoursePipelineTable } from "./RecoursePipelineTable";
import { ReserveTracker } from "./ReserveTracker";
import { FaroCSVUploadWidget } from "../../components/factoring/FaroCSVUploadWidget";
import { DriverAutocomplete } from "../../components/factoring/DriverAutocomplete";
import { VendorMergeDiffPreview } from "../../components/factoring/VendorMergeDiffPreview";
import { DeactivateFactorConfirmModal } from "../../components/factoring/DeactivateFactorConfirmModal";
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
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString();
}

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

  const summaryQuery = useQuery({
    queryKey: ["factoring", "summary", companyId],
    queryFn: () => getFactoringSummary(companyId),
    enabled: Boolean(companyId),
  });
  const vendorsQuery = useQuery({
    queryKey: ["factoring", "vendors", companyId],
    queryFn: () => listVendors({ operating_company_id: companyId, status: "active" }).then((res) => res.vendors),
    enabled: Boolean(companyId),
  });
  const recourseQuery = useQuery({
    queryKey: ["factoring", "recourse", companyId],
    queryFn: () => getFactoringRecoursePipeline(companyId),
    enabled: Boolean(companyId),
  });
  const feesQuery = useQuery({
    queryKey: ["factoring", "chargebacks-fees", companyId],
    queryFn: () => getFactoringChargebacksFees(companyId),
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
  const equipmentLoansQuery = useQuery({
    queryKey: ["data-infra", "equipment-loans", companyId],
    queryFn: () => listEquipmentLoans(companyId),
    enabled: Boolean(companyId),
  });
  const vendorMergesQuery = useQuery({
    queryKey: ["data-infra", "vendor-merges", companyId],
    queryFn: () => listDriverVendorMerges(companyId),
    enabled: Boolean(companyId),
  });
  const selectedLoanLedgerQuery = useQuery({
    queryKey: ["data-infra", "equipment-loan-ledger", selectedLoanId, companyId],
    queryFn: () => getEquipmentLoanLedger(selectedLoanId, companyId),
    enabled: Boolean(companyId && selectedLoanId),
  });

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
  const activeFactorVendor = useMemo(() => {
    const vendors = vendorsQuery.data ?? [];
    if (summary?.active_factor_id) {
      const byId = vendors.find((vendor) => vendor.id === summary.active_factor_id);
      if (byId) return byId;
    }
    return vendors.find((vendor) => String(vendor.name ?? "").toLowerCase().includes("factoring")) ?? vendors[0] ?? null;
  }, [summary?.active_factor_id, vendorsQuery.data]);
  const factorParsed = useMemo(() => parseVendorNotes(activeFactorVendor?.notes), [activeFactorVendor?.notes]);
  const canDeactivate = user?.role === "Owner";

  return (
    <div className="space-y-3">
      <PageHeader
        title={`Factoring (${summary?.active_factor_name || activeFactorVendor?.name || "No active factor"})`}
        subtitle="Deep-dive workspace for recourse pipeline, chargebacks, fees, and settings"
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => void queryClient.invalidateQueries({ queryKey: ["factoring"] })}>
              Refresh
            </Button>
          </div>
        }
      />

      <div className="grid gap-2 md:grid-cols-4">
        <div className="rounded border border-gray-200 bg-white p-3 text-sm">
          <div className="text-xs uppercase tracking-wide text-gray-500">Active Factor</div>
          <div className="mt-1 font-semibold text-gray-900">{summary?.active_factor_name ?? activeFactorVendor?.name ?? "Not configured"}</div>
        </div>
        <div className="rounded border border-gray-200 bg-white p-3 text-sm">
          <div className="text-xs uppercase tracking-wide text-gray-500">Reserve Balance</div>
          <div className="mt-1 font-semibold text-gray-900">{fmtCurrency(summary?.reserve_balance)}</div>
        </div>
        <div className="rounded border border-gray-200 bg-white p-3 text-sm">
          <div className="text-xs uppercase tracking-wide text-gray-500">Chargeback Balance</div>
          <div className="mt-1 font-semibold text-gray-900">{fmtCurrency(summary?.chargeback_balance)}</div>
        </div>
        <div className="rounded border border-gray-200 bg-white p-3 text-sm">
          <div className="text-xs uppercase tracking-wide text-gray-500">Recourse Days</div>
          <div className="mt-1 font-semibold text-gray-900">{Number(summary?.recourse_days ?? 90)}</div>
        </div>
      </div>
      {activeFactorVendor ? (
        <FactoringProfilePanel
          meta={factorParsed.meta}
          saving={savingFactorProfile}
          onSave={async () => {
            const nextTelephone = window.prompt("Telephone", factorParsed.meta.telephone) ?? factorParsed.meta.telephone;
            const nextAddress = window.prompt("Address", factorParsed.meta.address) ?? factorParsed.meta.address;
            const nextGeneralEmail = window.prompt("General email", factorParsed.meta.generalEmail) ?? factorParsed.meta.generalEmail;
            const nextPrimaryContact = window.prompt("Primary contact", factorParsed.meta.primaryContactName) ?? factorParsed.meta.primaryContactName;
            const nextPrimaryEmail = window.prompt("Primary contact email", factorParsed.meta.primaryContactEmail) ?? factorParsed.meta.primaryContactEmail;
            const nextFactoringReserves = window.prompt("Factoring reserves %", factorParsed.meta.factoring.factoringReservesPct) ?? factorParsed.meta.factoring.factoringReservesPct;
            const nextEscrowReserves = window.prompt("Escrow reserves %", factorParsed.meta.factoring.escrowReservesPct) ?? factorParsed.meta.factoring.escrowReservesPct;
            const nextLateFees = window.prompt("Late fees %", factorParsed.meta.factoring.lateFeesPct) ?? factorParsed.meta.factoring.lateFeesPct;
            const nextChargebacks = window.prompt("Chargebacks %", factorParsed.meta.factoring.chargebacksPct) ?? factorParsed.meta.factoring.chargebacksPct;
            const nextRate31 = window.prompt("31-60 advance rate %", factorParsed.meta.factoring.advanceRate31To60Pct) ?? factorParsed.meta.factoring.advanceRate31To60Pct;
            const nextFee31 = window.prompt("31-60 fee %", factorParsed.meta.factoring.advanceFee31To60Pct) ?? factorParsed.meta.factoring.advanceFee31To60Pct;
            const nextRate61 = window.prompt("61-90 advance rate %", factorParsed.meta.factoring.advanceRate61To90Pct) ?? factorParsed.meta.factoring.advanceRate61To90Pct;
            const nextFee61 = window.prompt("61-90 fee %", factorParsed.meta.factoring.advanceFee61To90Pct) ?? factorParsed.meta.factoring.advanceFee61To90Pct;
            const mergedMeta = {
              ...factorParsed.meta,
              telephone: nextTelephone,
              address: nextAddress,
              generalEmail: nextGeneralEmail,
              primaryContactName: nextPrimaryContact,
              primaryContactEmail: nextPrimaryEmail,
              factoring: {
                ...factorParsed.meta.factoring,
                factoringReservesPct: nextFactoringReserves,
                escrowReservesPct: nextEscrowReserves,
                lateFeesPct: nextLateFees,
                chargebacksPct: nextChargebacks,
                advanceRate31To60Pct: nextRate31,
                advanceFee31To60Pct: nextFee31,
                advanceRate61To90Pct: nextRate61,
                advanceFee61To90Pct: nextFee61,
              },
            };
            try {
              setSavingFactorProfile(true);
              await updateVendor(activeFactorVendor.id, {
                phone: mergedMeta.telephone || null,
                address: mergedMeta.address || null,
                email: mergedMeta.generalEmail || null,
                notes: serializeVendorNotes(mergedMeta, factorParsed.publicNotes),
              });
              pushToast("Factoring profile saved", "success");
              await queryClient.invalidateQueries({ queryKey: ["factoring"] });
              await queryClient.invalidateQueries({ queryKey: ["factoring", "vendors", companyId] });
            } catch (error) {
              pushToast(String((error as Error).message || "Failed to save profile"), "error");
            } finally {
              setSavingFactorProfile(false);
            }
          }}
        />
      ) : null}

      <div className="overflow-x-auto rounded bg-[#1A1F36] px-2 py-1 text-[11px] text-white">
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
        <div className="rounded border border-gray-200 bg-white p-3">
          <ReserveTracker />
        </div>
      ) : null}

      {tab === "recourse_pipeline" ? (
        <div className="space-y-2 rounded border border-gray-200 bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-medium text-gray-900">Invoices inside recourse window (sorted by days until expiry)</span>
            <span className="text-gray-600">
              Advance {fmtCurrency(recourseTotals.advance)} · Reserve {fmtCurrency(recourseTotals.reserve)}
            </span>
          </div>
          <div className="overflow-x-auto">
            <RecoursePipelineTable rows={invoices} fmtCurrency={fmtCurrency} fmtDate={fmtDate} />
          </div>
        </div>
      ) : null}

      {tab === "chargebacks_fees" ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded border border-gray-200 bg-white p-3">
            <div className="mb-2 text-sm font-medium text-gray-900">Chargebacks + fee history</div>
            <div className="overflow-x-auto">
              <ChargebacksTable rows={feesQuery.data?.history ?? []} fmtCurrency={fmtCurrency} fmtDate={fmtDate} />
            </div>
          </div>
          <div className="rounded border border-gray-200 bg-white p-3">
            <div className="mb-2 text-sm font-medium text-gray-900">Monthly fee summaries</div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-xs">
                <thead className="bg-gray-50 text-left uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-2 py-2">Month</th>
                    <th className="px-2 py-2">Chargebacks</th>
                    <th className="px-2 py-2">Fees</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(feesQuery.data?.monthly_summary ?? []).map((row) => (
                    <tr key={String(row.statement_month)}>
                      <td className="px-2 py-2">{fmtDate(row.statement_month)}</td>
                      <td className="px-2 py-2">{fmtCurrency(row.chargeback_total)}</td>
                      <td className="px-2 py-2">{fmtCurrency(row.factor_fee_total)}</td>
                    </tr>
                  ))}
                  {(feesQuery.data?.monthly_summary ?? []).length === 0 ? (
                    <tr>
                      <td className="px-2 py-4 text-gray-500" colSpan={3}>
                        No monthly fee summaries available.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {tab === "statements_settings" ? (
        <div className="space-y-3">
          <div className="rounded border border-gray-200 bg-white p-3 text-sm">
            <div className="font-medium text-gray-900">Single-factor invariant status</div>
            <div className="mt-1 text-gray-700">
              Active factors: {Number(settingsQuery.data?.current?.active_factor_count ?? 0)} · Status:{" "}
              <span className={settingsQuery.data?.current?.single_factor_invariant_ok ? "text-green-700" : "text-red-700"}>
                {settingsQuery.data?.current?.single_factor_invariant_ok ? "Compliant" : "Violation"}
              </span>
            </div>
            <div className="mt-1 text-gray-700">Configured recourse period: {Number(settingsQuery.data?.current?.recourse_days ?? 90)} days</div>
          </div>

          <div className="rounded border border-gray-200 bg-white p-3">
            <div className="mb-2 text-sm font-medium text-gray-900">Statement history</div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-xs">
                <thead className="bg-gray-50 text-left uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-2 py-2">Month</th>
                    <th className="px-2 py-2">Chargebacks</th>
                    <th className="px-2 py-2">Fees</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(settingsQuery.data?.statements ?? []).map((row) => (
                    <tr key={String(row.statement_month)}>
                      <td className="px-2 py-2">{fmtDate(row.statement_month ?? null)}</td>
                      <td className="px-2 py-2">{fmtCurrency(row.month_chargebacks_total ?? 0)}</td>
                      <td className="px-2 py-2">{fmtCurrency(row.month_factor_fees_total ?? 0)}</td>
                    </tr>
                  ))}
                  {(settingsQuery.data?.statements ?? []).length === 0 ? (
                    <tr>
                      <td className="px-2 py-4 text-gray-500" colSpan={3}>
                        No statement history rows available.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded border border-gray-200 bg-white p-3 text-sm">
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
            {!canDeactivate ? <div className="mt-2 text-xs text-amber-700">Only Owner role can deactivate an active factor.</div> : null}
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
                  pushToast(String((error as Error).message || "Failed to deactivate factor"), "error");
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
          <div className="rounded border border-gray-200 bg-white p-3">
            <div className="mb-2 text-sm font-medium text-gray-900">Upsert Faro daily import batch</div>
            <div className="grid gap-2 md:grid-cols-3 mb-3">
              <input
                type="date"
                className="rounded border border-gray-300 px-2 py-1 text-sm"
                value={faroStatementDate}
                onChange={(event) => setFaroStatementDate(event.target.value)}
              />
              <input
                className="rounded border border-gray-300 px-2 py-1 text-sm"
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
                  pushToast(String((error as Error).message || "Faro import failed"), "error");
                } finally {
                  setCreatingFaro(false);
                }
              }}
            />
          </div>
          <div className="rounded border border-gray-200 bg-white p-3">
            <div className="mb-2 text-sm font-medium text-gray-900">Recent Faro imports</div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-xs">
                <thead className="bg-gray-50 text-left uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-2 py-2">Statement Date</th>
                    <th className="px-2 py-2">Reference</th>
                    <th className="px-2 py-2">Gross</th>
                    <th className="px-2 py-2">Advance</th>
                    <th className="px-2 py-2">Reserve</th>
                    <th className="px-2 py-2">Fee</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(faroImportsQuery.data?.rows ?? []).map((row) => (
                    <tr key={row.id}>
                      <td className="px-2 py-2">{fmtDate(row.statement_date)}</td>
                      <td className="px-2 py-2">{row.statement_reference}</td>
                      <td className="px-2 py-2">{fmtCurrency(Number(row.gross_total_cents ?? 0) / 100)}</td>
                      <td className="px-2 py-2">{fmtCurrency(Number(row.advance_total_cents ?? 0) / 100)}</td>
                      <td className="px-2 py-2">{fmtCurrency(Number(row.reserve_total_cents ?? 0) / 100)}</td>
                      <td className="px-2 py-2">{fmtCurrency(Number(row.fee_total_cents ?? 0) / 100)}</td>
                    </tr>
                  ))}
                  {(faroImportsQuery.data?.rows ?? []).length === 0 ? (
                    <tr>
                      <td className="px-2 py-4 text-gray-500" colSpan={6}>
                        No Faro imports recorded yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {tab === "equipment_loans" ? (
        <div className="space-y-3">
          <div className="rounded border border-gray-200 bg-white p-3">
            <div className="mb-2 text-sm font-medium text-gray-900">Create equipment loan</div>
            <div className="grid gap-2 md:grid-cols-5">
              <input
                className="rounded border border-gray-300 px-2 py-1 text-xs"
                value={loanEquipmentId}
                onChange={(event) => setLoanEquipmentId(event.target.value)}
                placeholder="equipment uuid"
              />
              <input
                className="rounded border border-gray-300 px-2 py-1 text-xs"
                value={loanLenderVendorId}
                onChange={(event) => setLoanLenderVendorId(event.target.value)}
                placeholder="lender vendor uuid"
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
                className="rounded border border-gray-300 px-2 py-1 text-xs"
                value={loanAprPercent}
                onChange={(event) => setLoanAprPercent(event.target.value)}
                placeholder="apr percent"
              />
              <input type="date" className="rounded border border-gray-300 px-2 py-1 text-xs" value={loanStartedOn} onChange={(event) => setLoanStartedOn(event.target.value)} />
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
                    pushToast(String((error as Error).message || "Loan create failed"), "error");
                  } finally {
                    setCreatingLoan(false);
                  }
                }}
              >
                {creatingLoan ? "Saving..." : "Create Loan"}
              </Button>
            </div>
          </div>
          <div className="rounded border border-gray-200 bg-white p-3">
            <div className="mb-2 text-sm font-medium text-gray-900">Loans + ledger actions</div>
            <div className="space-y-2">
              {(equipmentLoansQuery.data?.rows ?? []).map((row) => (
                <div key={row.id} className="rounded border border-gray-200 p-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-semibold">{row.equipment_number || row.equipment_id}</span> · {row.lender_vendor_name || row.lender_vendor_id} ·{" "}
                      {fmtCurrency(Number(row.principal_cents ?? 0) / 100)}
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
            <div className="rounded border border-gray-200 bg-white p-3 text-xs">
              <div className="mb-2 font-medium text-gray-900">Selected loan ledger: {selectedLoanId}</div>
              <p>Attributions: {(selectedLoanLedgerQuery.data?.attributions ?? []).length}</p>
              <p>Payments: {(selectedLoanLedgerQuery.data?.payments ?? []).length}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "vendor_merges" ? (
        <div className="space-y-3">
          <div className="rounded border border-gray-200 bg-white p-3">
            <div className="mb-2 text-sm font-medium text-gray-900">Merge duplicate QBO vendors for a driver</div>
            <div className="grid gap-2 md:grid-cols-2">
              <DriverAutocomplete
                companyId={companyId}
                value={mergeDriverId}
                onChange={(driverId, driverName) => {
                  setMergeDriverId(driverId);
                  setMergeDriverName(driverName);
                }}
              />
              <input
                className="rounded border border-gray-300 px-2 py-1 text-xs"
                value={mergeReason}
                onChange={(event) => setMergeReason(event.target.value)}
                placeholder="reason"
              />
              <input
                className="rounded border border-gray-300 px-2 py-1 text-xs"
                value={mergeFromVendor}
                onChange={(event) => setMergeFromVendor(event.target.value)}
                placeholder="from qbo vendor id"
              />
              <input
                className="rounded border border-gray-300 px-2 py-1 text-xs"
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
                    pushToast(String((error as Error).message || "Vendor merge failed"), "error");
                  } finally {
                    setCreatingMerge(false);
                  }
                }}
              >
                {creatingMerge ? "Saving..." : "Merge Vendors"}
              </Button>
            </div>
          </div>
          <div className="rounded border border-gray-200 bg-white p-3">
            <div className="mb-2 text-sm font-medium text-gray-900">Recent merge history</div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-xs">
                <thead className="bg-gray-50 text-left uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-2 py-2">Driver</th>
                    <th className="px-2 py-2">From</th>
                    <th className="px-2 py-2">To</th>
                    <th className="px-2 py-2">Reason</th>
                    <th className="px-2 py-2">Merged At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(vendorMergesQuery.data?.rows ?? []).map((row) => (
                    <tr key={row.id}>
                      <td className="px-2 py-2">{row.driver_id}</td>
                      <td className="px-2 py-2">{row.from_qbo_vendor_id}</td>
                      <td className="px-2 py-2">{row.to_qbo_vendor_id}</td>
                      <td className="px-2 py-2">{row.merge_reason}</td>
                      <td className="px-2 py-2">{fmtDate(row.merged_at)}</td>
                    </tr>
                  ))}
                  {(vendorMergesQuery.data?.rows ?? []).length === 0 ? (
                    <tr>
                      <td className="px-2 py-4 text-gray-500" colSpan={5}>
                        No merge history yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
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
            <label className="block">
              Load UUID
              <input
                className="mt-1 h-9 w-full rounded border border-gray-300 px-2"
                value={loanActionLoadId}
                onChange={(e) => setLoanActionLoadId(e.target.value)}
                placeholder="Load UUID for attribution"
              />
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
                  pushToast(String((error as Error).message || "Failed to record"), "error");
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
