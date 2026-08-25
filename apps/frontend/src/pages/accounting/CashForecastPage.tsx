import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "../../components/Button";
import { ListErrorState } from "../../components/ListErrorState";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { getCashForecast, getCashForecastSettings, upsertCashForecastSettings, type CashForecastSettings, type CashForecastWeek } from "../../api/accounting";
import { useToast } from "../../components/Toast";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { userFacingApiError } from "../../lib/api-error-message";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

export function CashForecastPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [weeks, setWeeks] = useState(13);

  const forecastQuery = useQuery({
    queryKey: ["accounting", "cash-forecast", companyId, weeks],
    queryFn: () => getCashForecast(companyId, { weeks }),
    enabled: Boolean(companyId),
  });

  const settingsQuery = useQuery({
    queryKey: ["accounting", "cash-forecast-settings", companyId],
    queryFn: () => getCashForecastSettings(companyId),
    enabled: Boolean(companyId),
  });

  const [draft, setDraft] = useState<CashForecastSettings>({
    fuel_estimate_weekly_cents: 0,
    insurance_weekly_cents: 0,
    lease_weekly_cents: 0,
    payroll_weekly_cents: 0,
  });

  const settingsFromServer = settingsQuery.data?.settings;
  const effectiveSettings = settingsFromServer ?? draft;

  const saveSettings = useMutation({
    mutationFn: (payload: CashForecastSettings) => upsertCashForecastSettings(companyId, payload),
    onSuccess: async () => {
      pushToast("Cash forecast settings saved", "success");
      await queryClient.invalidateQueries({ queryKey: ["accounting", "cash-forecast-settings", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["accounting", "cash-forecast", companyId] });
    },
    onError: (error) => {
      pushToast(userFacingApiError(error, "Failed to save settings"), "error");
    },
  });

  const chartData = useMemo(
    () =>
      (forecastQuery.data?.weeks ?? []).map((week) => ({
        week_start: week.week_start,
        projected_balance: week.projected_balance,
      })),
    [forecastQuery.data]
  );

  const forecastColumns: Array<ParityColumn<CashForecastWeek>> = [
    { key: "week_start", label: "Week start", alwaysVisible: true },
    { key: "invoices", label: "Invoices", render: (week) => money(week.expected_inflows.invoices) },
    {
      key: "proforma",
      label: "Proforma / Pre-invoice",
      render: (week) => money(week.expected_inflows.other),
    },
    { key: "factoring", label: "Factoring inflow", render: (week) => money(week.expected_inflows.factoring) },
    { key: "bills", label: "Bills", render: (week) => money(week.expected_outflows.bills) },
    { key: "payroll", label: "Payroll", render: (week) => money(week.expected_outflows.payroll) },
    { key: "fuel_estimate", label: "Fuel est.", render: (week) => money(week.expected_outflows.fuel_estimate) },
    { key: "factoring_fee", label: "Factoring fee", render: (week) => money(week.expected_outflows.factoring_fee) },
    {
      key: "projected_balance",
      label: "Projected balance",
      render: (week) => (
        <span className={`font-semibold ${week.projected_balance < 0 ? "text-red-700" : "text-slate-700"}`}>
          {money(week.projected_balance)}
        </span>
      ),
    },
  ];

  return (
    <AccountingSubNavWrapper title="13-week cash forecast" subtitle="Rolling cash projection with AR/AP, factoring, and configurable recurring outflows.">

      {!companyId ? <p className="text-sm text-red-600">Select an operating company.</p> : null}

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-sm border border-gray-200 bg-white p-3">
          <h2 className="mb-2 text-sm font-semibold">Configuration</h2>
          {settingsQuery.isError ? (
            <div className="mb-2">
              <ListErrorBanner
                message={`Failed to load forecast settings: ${(settingsQuery.error as Error)?.message ?? "Request failed"}`}
                onRetry={() => void settingsQuery.refetch()}
              />
            </div>
          ) : null}
          <div className="space-y-2">
            {(
              [
                ["fuel_estimate_weekly_cents", "Fuel weekly estimate"],
                ["insurance_weekly_cents", "Insurance weekly estimate"],
                ["lease_weekly_cents", "Lease weekly estimate"],
                ["payroll_weekly_cents", "Payroll weekly estimate"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block text-xs text-gray-600">
                {label}
                {/* M-1: these settings are stored in CENTS but were edited as raw cents (operator had to
                    type "50000" for $500). cents-mode MoneyInput → operator types dollars, *_cents stored. */}
                <MoneyInput
                  valueCents={effectiveSettings[key]}
                  disabled={settingsQuery.isError}
                  onChangeCents={(cents) => {
                    const next = { ...(settingsFromServer ?? draft), [key]: Math.max(0, cents ?? 0) };
                    if (settingsFromServer) {
                      queryClient.setQueryData(["accounting", "cash-forecast-settings", companyId], { settings: next });
                    } else {
                      setDraft(next);
                    }
                  }}
                  ariaLabel={label}
                  className="mt-1 w-full"
                />
              </label>
            ))}
          </div>
          <div className="mt-3">
            <Button
              size="sm"
              onClick={() => saveSettings.mutate(effectiveSettings)}
              disabled={!companyId || settingsQuery.isError || saveSettings.isPending}
            >
              Save settings
            </Button>
          </div>
        </div>

        <div className="rounded-sm border border-gray-200 bg-white p-3 lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Projected balance</h2>
            <label className="text-xs text-gray-600">
              Weeks
              <select
                value={weeks}
                onChange={(event) => setWeeks(Number(event.target.value))}
                className="ml-2 h-8 rounded-sm border border-gray-300 px-2 text-sm"
              >
                <option value={13}>13</option>
                <option value={8}>8</option>
                <option value={26}>26</option>
              </select>
            </label>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="week_start" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(value) => money(Number(value))} width={88} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => money(Number(value))} />
                <Line type="monotone" dataKey="projected_balance" stroke="#1F2A44" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {forecastQuery.isError ? (
        <ListErrorState
          title="Couldn't load cash forecast"
          status={0}
          message={(forecastQuery.error as Error | undefined)?.message}
          onRetry={() => void forecastQuery.refetch()}
        />
      ) : (
        <ParityTable
          columns={forecastColumns}
          rows={forecastQuery.data?.weeks ?? []}
          rowKey={(week) => week.week_start}
          loading={forecastQuery.isLoading}
          storageKey="cash-forecast"
          emptyText="No forecast weeks available."
        />
      )}
    </AccountingSubNavWrapper>
  );
}
