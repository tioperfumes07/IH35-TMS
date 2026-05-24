import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { getCashForecast, getCashForecastSettings, upsertCashForecastSettings, type CashForecastSettings } from "../../api/accounting";
import { useToast } from "../../components/Toast";
import { AccountingSubNav } from "./AccountingSubNav";

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
      pushToast(String((error as Error).message ?? "Failed to save settings"), "error");
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

  return (
    <div className="space-y-3">
      <AccountingSubNav />
      <PageHeader title="13-week cash forecast" subtitle="Rolling cash projection with AR/AP, factoring, and configurable recurring outflows." />

      {!companyId ? <p className="text-sm text-red-600">Select an operating company.</p> : null}

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded border border-gray-200 bg-white p-3">
          <h2 className="mb-2 text-sm font-semibold">Configuration</h2>
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
                <input
                  type="number"
                  min={0}
                  value={effectiveSettings[key]}
                  onChange={(event) => {
                    const value = Number(event.target.value || 0);
                    const next = { ...(settingsFromServer ?? draft), [key]: Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0 };
                    if (settingsFromServer) {
                      queryClient.setQueryData(["accounting", "cash-forecast-settings", companyId], { settings: next });
                    } else {
                      setDraft(next);
                    }
                  }}
                  className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm"
                />
              </label>
            ))}
          </div>
          <div className="mt-3">
            <Button
              size="sm"
              onClick={() => saveSettings.mutate(effectiveSettings)}
              disabled={!companyId || saveSettings.isPending}
            >
              Save settings
            </Button>
          </div>
        </div>

        <div className="rounded border border-gray-200 bg-white p-3 lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Projected balance</h2>
            <label className="text-xs text-gray-600">
              Weeks
              <select
                value={weeks}
                onChange={(event) => setWeeks(Number(event.target.value))}
                className="ml-2 h-8 rounded border border-gray-300 px-2 text-sm"
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
                <Tooltip formatter={(value: number) => money(value)} />
                <Line type="monotone" dataKey="projected_balance" stroke="#1d4ed8" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
            <tr>
              <th className="px-3 py-2">Week start</th>
              <th className="px-3 py-2">Invoices</th>
              <th className="px-3 py-2">Factoring inflow</th>
              <th className="px-3 py-2">Bills</th>
              <th className="px-3 py-2">Payroll</th>
              <th className="px-3 py-2">Fuel est.</th>
              <th className="px-3 py-2">Factoring fee</th>
              <th className="px-3 py-2">Projected balance</th>
            </tr>
          </thead>
          <tbody>
            {forecastQuery.data?.weeks.map((week) => (
              <tr key={week.week_start} className="border-t border-gray-100">
                <td className="px-3 py-2">{week.week_start}</td>
                <td className="px-3 py-2">{money(week.expected_inflows.invoices)}</td>
                <td className="px-3 py-2">{money(week.expected_inflows.factoring)}</td>
                <td className="px-3 py-2">{money(week.expected_outflows.bills)}</td>
                <td className="px-3 py-2">{money(week.expected_outflows.payroll)}</td>
                <td className="px-3 py-2">{money(week.expected_outflows.fuel_estimate)}</td>
                <td className="px-3 py-2">{money(week.expected_outflows.factoring_fee)}</td>
                <td className={`px-3 py-2 font-semibold ${week.projected_balance < 0 ? "text-red-700" : "text-emerald-700"}`}>{money(week.projected_balance)}</td>
              </tr>
            ))}
            {forecastQuery.isLoading ? (
              <tr>
                <td colSpan={8} className="px-3 py-4 text-gray-500">
                  Loading forecast...
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
