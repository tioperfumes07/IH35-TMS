import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { deactivateFactoring, getFactoringChargebacksFees, getFactoringRecoursePipeline, getFactoringStatementsSettings, getFactoringSummary } from "../../api/factoring";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/layout/PageHeader";
import { useToast } from "../../components/Toast";
import { useAuth } from "../../auth/useAuth";
import { useCompanyContext } from "../../contexts/CompanyContext";

const SUBNAV = [
  { id: "recourse_pipeline", label: "Recourse Pipeline" },
  { id: "chargebacks_fees", label: "Chargebacks & Fees" },
  { id: "statements_settings", label: "Statements & Settings" },
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
    </div>
  );
}
