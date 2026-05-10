import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { deactivateFactoring, getFactoringChargebacksFees, getFactoringRecoursePipeline, getFactoringStatementsSettings, getFactoringSummary } from "../../api/factoring";
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
import { PageHeader } from "../../components/layout/PageHeader";
import { useToast } from "../../components/Toast";
import { useAuth } from "../../auth/useAuth";
import { useCompanyContext } from "../../contexts/CompanyContext";

const SUBNAV = [
  { id: "recourse_pipeline", label: "Recourse Pipeline" },
  { id: "chargebacks_fees", label: "Chargebacks & Fees" },
  { id: "statements_settings", label: "Statements & Settings" },
  { id: "faro_imports", label: "Faro Daily Imports" },
  { id: "equipment_loans", label: "Equipment Loans (CCG)" },
  { id: "vendor_merges", label: "Driver Vendor Merges" },
] as const;

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

export function FactoringHomePage() {
  const { selectedCompanyId } = useCompanyContext();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const companyId = selectedCompanyId ?? "";
  const [tab, setTab] = useState<(typeof SUBNAV)[number]["id"]>("recourse_pipeline");
  const [deactivating, setDeactivating] = useState(false);
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
  const [mergeDriverId, setMergeDriverId] = useState("");
  const [mergeFromVendor, setMergeFromVendor] = useState("");
  const [mergeToVendor, setMergeToVendor] = useState("");
  const [mergeReason, setMergeReason] = useState("duplicate_vendor_cleanup");
  const [mergeApplyToDriver, setMergeApplyToDriver] = useState(true);
  const [creatingMerge, setCreatingMerge] = useState(false);

  const summaryQuery = useQuery({
    queryKey: ["factoring", "summary", companyId],
    queryFn: () => getFactoringSummary(companyId),
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
  const canDeactivate = user?.role === "Owner";

  return (
    <div className="space-y-3">
      <PageHeader
        title="Factoring (Faro)"
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
          <div className="mt-1 font-semibold text-gray-900">{summary?.active_factor_name ?? "Faro Factoring"}</div>
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
          <div className="text-xs uppercase tracking-wide text-gray-500">Recourse Days (WF-051)</div>
          <div className="mt-1 font-semibold text-gray-900">{Number(summary?.recourse_days ?? 90)}</div>
        </div>
      </div>

      <div className="overflow-x-auto rounded bg-[#1A1F36] px-2 py-1 text-[11px] text-white">
        <div className="flex min-w-max gap-4">
          {SUBNAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={tab === item.id ? "border-b border-white pb-0.5 font-semibold" : ""}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "recourse_pipeline" ? (
        <div className="space-y-2 rounded border border-gray-200 bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-medium text-gray-900">Invoices inside recourse window (sorted by days until expiry)</span>
            <span className="text-gray-600">
              Advance {fmtCurrency(recourseTotals.advance)} · Reserve {fmtCurrency(recourseTotals.reserve)}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50 text-left uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-2 py-2">Invoice</th>
                  <th className="px-2 py-2">Customer</th>
                  <th className="px-2 py-2">Advance</th>
                  <th className="px-2 py-2">Reserve</th>
                  <th className="px-2 py-2">Recourse Expiry</th>
                  <th className="px-2 py-2">Days Left</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invoices.map((row) => (
                  <tr key={row.factoring_advance_id}>
                    <td className="px-2 py-2 font-medium text-gray-900">{row.invoice_reference}</td>
                    <td className="px-2 py-2">{row.customer_name}</td>
                    <td className="px-2 py-2">{fmtCurrency(row.advance_amount)}</td>
                    <td className="px-2 py-2">{fmtCurrency(row.reserve_amount)}</td>
                    <td className="px-2 py-2">{fmtDate(row.recourse_expiry_date)}</td>
                    <td className="px-2 py-2">{Number(row.days_until_recourse_expiry ?? 0)}</td>
                  </tr>
                ))}
                {invoices.length === 0 ? (
                  <tr>
                    <td className="px-2 py-4 text-gray-500" colSpan={6}>
                      No recourse pipeline rows available in this environment.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "chargebacks_fees" ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded border border-gray-200 bg-white p-3">
            <div className="mb-2 text-sm font-medium text-gray-900">WF-049 Chargebacks + fee history</div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-xs">
                <thead className="bg-gray-50 text-left uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-2 py-2">Date</th>
                    <th className="px-2 py-2">Statement Ref</th>
                    <th className="px-2 py-2">Chargeback</th>
                    <th className="px-2 py-2">Fee</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(feesQuery.data?.history ?? []).map((row) => (
                    <tr key={row.factoring_advance_id}>
                      <td className="px-2 py-2">{fmtDate(row.created_at)}</td>
                      <td className="px-2 py-2">{row.statement_reference || "—"}</td>
                      <td className="px-2 py-2">{fmtCurrency(row.chargeback_amount)}</td>
                      <td className="px-2 py-2">{fmtCurrency(row.factor_fee_amount)}</td>
                    </tr>
                  ))}
                  {(feesQuery.data?.history ?? []).length === 0 ? (
                    <tr>
                      <td className="px-2 py-4 text-gray-500" colSpan={4}>
                        No chargeback/fee rows available.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
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
            <div className="font-medium text-gray-900">WF-017 Single-factor invariant status</div>
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
                onClick={async () => {
                  if (!canDeactivate || !companyId) return;
                  setDeactivating(true);
                  try {
                    await deactivateFactoring(companyId);
                    pushToast("Active factor deactivated", "success");
                    await queryClient.invalidateQueries({ queryKey: ["factoring"] });
                    await queryClient.invalidateQueries({ queryKey: ["banking"] });
                  } catch (error) {
                    pushToast(String((error as Error).message || "Failed to deactivate factor"), "error");
                  } finally {
                    setDeactivating(false);
                  }
                }}
              >
                Deactivate Faro Factor
              </Button>
            </div>
            {!canDeactivate ? <div className="mt-2 text-xs text-amber-700">Only Owner role can deactivate an active factor.</div> : null}
          </div>
        </div>
      ) : null}

      {tab === "faro_imports" ? (
        <div className="space-y-3">
          <div className="rounded border border-gray-200 bg-white p-3">
            <div className="mb-2 text-sm font-medium text-gray-900">Upsert Faro daily import batch</div>
            <div className="grid gap-2 md:grid-cols-3">
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
              <Button
                size="sm"
                disabled={!companyId || !faroStatementDate || creatingFaro}
                onClick={async () => {
                  try {
                    setCreatingFaro(true);
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
                    pushToast("Faro import batch upserted", "success");
                    await queryClient.invalidateQueries({ queryKey: ["data-infra", "faro-imports", companyId] });
                  } catch (error) {
                    pushToast(String((error as Error).message || "Faro import failed"), "error");
                  } finally {
                    setCreatingFaro(false);
                  }
                }}
              >
                {creatingFaro ? "Saving..." : "Save Batch"}
              </Button>
            </div>
            <textarea
              className="mt-2 h-40 w-full rounded border border-gray-300 px-2 py-1 font-mono text-xs"
              value={faroLinesJson}
              onChange={(event) => setFaroLinesJson(event.target.value)}
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
              <input
                className="rounded border border-gray-300 px-2 py-1 text-xs"
                value={loanPrincipalCents}
                onChange={(event) => setLoanPrincipalCents(event.target.value)}
                placeholder="principal cents"
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
                        onClick={async () => {
                          const loadId = window.prompt("Load UUID for attribution");
                          const amount = window.prompt("Attribution amount cents");
                          if (!loadId || !amount) return;
                          try {
                            await createEquipmentLoanAttribution(String(row.id), {
                              operating_company_id: companyId,
                              load_id: loadId,
                              attribution_date: new Date().toISOString().slice(0, 10),
                              amount_cents: Number(amount),
                            });
                            pushToast("Attribution recorded", "success");
                            await queryClient.invalidateQueries({ queryKey: ["data-infra", "equipment-loan-ledger", String(row.id), companyId] });
                          } catch (error) {
                            pushToast(String((error as Error).message || "Attribution failed"), "error");
                          }
                        }}
                      >
                        + Attribution
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={async () => {
                          const amount = window.prompt("Payment amount cents");
                          if (!amount) return;
                          try {
                            await createEquipmentLoanPayment(String(row.id), {
                              operating_company_id: companyId,
                              paid_on: new Date().toISOString().slice(0, 10),
                              amount_cents: Number(amount),
                              principal_cents: Number(amount),
                              interest_cents: 0,
                              fee_cents: 0,
                            });
                            pushToast("Payment recorded", "success");
                            await queryClient.invalidateQueries({ queryKey: ["data-infra", "equipment-loan-ledger", String(row.id), companyId] });
                          } catch (error) {
                            pushToast(String((error as Error).message || "Payment failed"), "error");
                          }
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
              <input className="rounded border border-gray-300 px-2 py-1 text-xs" value={mergeDriverId} onChange={(event) => setMergeDriverId(event.target.value)} placeholder="driver uuid" />
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
            <label className="mt-2 flex items-center gap-2 text-xs text-gray-700">
              <input type="checkbox" checked={mergeApplyToDriver} onChange={(event) => setMergeApplyToDriver(event.target.checked)} />
              Apply target vendor to driver if currently linked to source vendor
            </label>
            <div className="mt-2">
              <Button
                size="sm"
                disabled={!companyId || !mergeDriverId || !mergeFromVendor || !mergeToVendor || creatingMerge}
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
    </div>
  );
}
