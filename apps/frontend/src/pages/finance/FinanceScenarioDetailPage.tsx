import { useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { FinanceModuleTabs } from "./FinanceModuleTabs";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import { activateScenario, getScenarioDetail } from "../../api/financeScenarios";
import { ScenarioLinesTable } from "./components/ScenarioLinesTable";
import { ListErrorState } from "../../components/ListErrorState";

export function FinanceScenarioDetailPage() {
  const { scenarioId = "" } = useParams<{ scenarioId: string }>();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const queryKey = ["finance", "scenario-detail", companyId, scenarioId];
  const detailQuery = useQuery({
    queryKey,
    queryFn: () => getScenarioDetail(scenarioId, companyId),
    enabled: Boolean(companyId && scenarioId),
  });

  const activateMutation = useMutation({
    mutationFn: () => activateScenario(scenarioId, companyId),
    onSuccess: () => {
      pushToast("Scenario activated.", "success");
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ["finance", "scenarios", companyId] });
    },
    onError: (error) => pushToast(userFacingApiError(error, "Failed to activate scenario"), "error"),
  });

  return (
    <div className="p-6">
      <FinanceModuleTabs />
      <PageHeader title="Scenario" />
      <Link to="/finance/scenarios" className="text-xs font-medium text-slate-600 underline">
        ← All scenarios
      </Link>

      {detailQuery.isLoading ? (
        <p className="mt-4 text-sm text-slate-500">Loading…</p>
      ) : detailQuery.isError ? (
        // GO-0028: "Scenario not found." on a genuine fetch failure is factually wrong -- the
        // scenario may exist and the fetch simply failed. Both branches render red text, so this
        // was easy to miss, but only isError means the scenario doesn't exist -- a real 404.
        <div className="mt-4">
          <ListErrorState
            title="Couldn't load this scenario"
            status={0}
            message={userFacingApiError(detailQuery.error, "Failed to load scenario")}
            onRetry={() => void detailQuery.refetch()}
          />
        </div>
      ) : !detailQuery.data ? (
        <p className="mt-4 text-sm text-red-600">Scenario not found.</p>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="rounded-sm border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-800">{detailQuery.data.scenario.name}</h2>
                <p className="text-xs text-slate-500">
                  {detailQuery.data.scenario.period_basis} · {detailQuery.data.scenario.period_count} periods · starts{" "}
                  {detailQuery.data.scenario.period_start}
                </p>
                {detailQuery.data.scenario.notes && (
                  <p className="mt-1 text-xs text-slate-500">{detailQuery.data.scenario.notes}</p>
                )}
              </div>
              <div className="text-right">
                <span className="rounded-sm bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                  {detailQuery.data.scenario.status}
                </span>
                {detailQuery.data.scenario.status === "draft" && (
                  <button
                    onClick={() => activateMutation.mutate()}
                    disabled={activateMutation.isPending}
                    className="mt-2 block rounded-sm border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Activate
                  </button>
                )}
                {detailQuery.data.scenario.superseded_by_scenario_id && (
                  <Link
                    to={`/finance/scenarios/${detailQuery.data.scenario.superseded_by_scenario_id}`}
                    className="mt-2 block text-xs font-medium text-slate-600 underline"
                  >
                    View replacement →
                  </Link>
                )}
              </div>
            </div>
          </div>

          <ScenarioLinesTable
            lines={detailQuery.data.lines}
            operatingCompanyId={companyId}
            editable
            invalidateKey={queryKey}
          />
        </div>
      )}
    </div>
  );
}
