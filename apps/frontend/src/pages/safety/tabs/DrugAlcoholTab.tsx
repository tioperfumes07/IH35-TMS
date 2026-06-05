import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listDrivers } from "../../../api/mdata";
import {
  advanceRtdCase,
  createDrugProgramTest,
  createRtdCase,
  getDriverDispatchEligibility,
  getDriverDrugProgramStatus,
  getDriverRtdCase,
  listClearinghouseQueries,
  listDrugProgramTests,
  listRandomPoolEntries,
  type RtdCase,
} from "../../../api/safety";
import { DrugAlcoholTable } from "../components/DrugAlcoholTable";
import { DrugAlcoholDashboard } from "../DrugAlcoholDashboard";
import { RandomTestingPool } from "../RandomTestingPool";
import { ReturnToDuty } from "../ReturnToDuty";
import { useCompanyContext } from "../../../contexts/CompanyContext";

const TEST_TYPES = [
  "pre_employment",
  "random",
  "post_accident",
  "reasonable_suspicion",
  "return_to_duty",
  "follow_up",
] as const;

const TEST_RESULTS = ["negative", "positive", "refusal", "adulterated", "substituted", "cancelled"] as const;

const RTD_STAGES = [
  "removed",
  "sap_evaluation",
  "education_treatment",
  "rtd_test_scheduled",
  "rtd_test_negative",
  "follow_up_testing",
  "complete",
] as const;

function stageLabel(stage: string) {
  return stage.replaceAll("_", " ");
}

function eligibilityBadgeClass(eligible: boolean) {
  return eligible ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800";
}

export function DrugAlcoholTab() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
  const [driverId, setDriverId] = useState("");
  const [testType, setTestType] = useState<(typeof TEST_TYPES)[number]>("random");
  const [testResult, setTestResult] = useState<(typeof TEST_RESULTS)[number]>("negative");
  const [testDate, setTestDate] = useState(() => new Date().toISOString().slice(0, 10));

  const driversQ = useQuery({
    queryKey: ["drivers", "drug-ui", companyId],
    enabled: Boolean(companyId),
    queryFn: () => listDrivers({ operating_company_id: companyId, status: "active" }).then((r) => r.drivers),
  });

  const testsQ = useQuery({
    queryKey: ["safety", "drug-program", "tests", companyId],
    enabled: Boolean(companyId),
    queryFn: () => listDrugProgramTests(companyId).then((r) => r.tests),
  });

  const poolQ = useQuery({
    queryKey: ["safety", "drug-program", "pool", companyId],
    enabled: Boolean(companyId),
    queryFn: () => listRandomPoolEntries(companyId).then((r) => r.entries),
  });

  const clearinghouseQ = useQuery({
    queryKey: ["safety", "drug-program", "clearinghouse", companyId],
    enabled: Boolean(companyId),
    queryFn: () => listClearinghouseQueries(companyId).then((r) => r.queries),
  });

  const drugStatusQ = useQuery({
    queryKey: ["safety", "drug-status", companyId, driverId],
    enabled: Boolean(companyId && driverId),
    queryFn: () => getDriverDrugProgramStatus(driverId, companyId),
  });

  const rtdCaseQ = useQuery({
    queryKey: ["safety", "rtd-case", companyId, driverId],
    enabled: Boolean(companyId && driverId),
    queryFn: () => getDriverRtdCase(driverId, companyId).then((r) => r.case),
  });

  const eligibilityQ = useQuery({
    queryKey: ["dispatch", "eligibility", companyId, driverId],
    enabled: Boolean(companyId && driverId),
    queryFn: () => getDriverDispatchEligibility(driverId, companyId),
  });

  const selectedDriver = useMemo(
    () => (driversQ.data ?? []).find((driver) => driver.id === driverId) ?? null,
    [driversQ.data, driverId]
  );

  const createTestMutation = useMutation({
    mutationFn: () =>
      createDrugProgramTest(companyId, {
        driver_id: driverId,
        test_type: testType,
        result: testResult,
        test_date: testDate,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["safety", "drug-program", "tests", companyId] });
      if (driverId) {
        await queryClient.invalidateQueries({ queryKey: ["safety", "drug-status", companyId, driverId] });
        await queryClient.invalidateQueries({ queryKey: ["dispatch", "eligibility", companyId, driverId] });
      }
    },
  });

  const openRtdMutation = useMutation({
    mutationFn: () => createRtdCase(companyId, { driver_id: driverId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["safety", "rtd-case", companyId, driverId] });
      await queryClient.invalidateQueries({ queryKey: ["dispatch", "eligibility", companyId, driverId] });
    },
  });

  const advanceRtdMutation = useMutation({
    mutationFn: (targetStage: (typeof RTD_STAGES)[number]) => {
      const rtdCase = rtdCaseQ.data as RtdCase | null;
      if (!rtdCase?.id) throw new Error("missing_rtd_case");
      return advanceRtdCase(rtdCase.id, companyId, {
        target_stage: targetStage,
        clearinghouse_updated: targetStage === "complete" ? true : undefined,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["safety", "rtd-case", companyId, driverId] });
      await queryClient.invalidateQueries({ queryKey: ["dispatch", "eligibility", companyId, driverId] });
    },
  });

  const filteredTests = useMemo(() => {
    const rows = testsQ.data ?? [];
    if (!driverId) return rows;
    return rows.filter((row) => String(row.driver_id) === driverId);
  }, [testsQ.data, driverId]);

  if (!companyId) {
    return <div className="rounded border border-gray-200 bg-white p-4 text-xs text-slate-600">Select an operating company.</div>;
  }

  const rtdCase = rtdCaseQ.data as RtdCase | null;
  const nextStage = rtdCase?.next_stage ?? null;

  return (
    <div className="space-y-4">
      <DrugAlcoholDashboard />
      <RandomTestingPool />
      <ReturnToDuty />

      <div className="rounded border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block text-xs text-slate-600">
            Driver
            <select
              className="mt-1 block min-w-[240px] rounded border border-gray-300 px-2 py-1 text-sm"
              value={driverId}
              onChange={(event) => setDriverId(event.target.value)}
            >
              <option value="">Select driver…</option>
              {(driversQ.data ?? []).map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {[driver.first_name, driver.last_name].filter(Boolean).join(" ") || driver.id}
                </option>
              ))}
            </select>
          </label>
          {selectedDriver ? (
            <div className="text-xs text-slate-600">
              Selected:{" "}
              <span className="font-medium text-slate-900">
                {[selectedDriver.first_name, selectedDriver.last_name].filter(Boolean).join(" ")}
              </span>
            </div>
          ) : null}
        </div>

        {driverId ? (
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <div className="rounded border border-gray-100 p-3 text-xs">
              <div className="font-medium text-slate-800">Drug status</div>
              <div className="mt-1">
                {drugStatusQ.data?.is_blocked ? (
                  <span className="rounded bg-red-50 px-2 py-0.5 text-red-800">Blocked ({drugStatusQ.data.block_reason})</span>
                ) : (
                  <span className="rounded bg-emerald-50 px-2 py-0.5 text-emerald-800">Clear</span>
                )}
              </div>
            </div>
            <div className="rounded border border-gray-100 p-3 text-xs">
              <div className="font-medium text-slate-800">Dispatch eligibility</div>
              <div className="mt-1">
                <span className={`rounded px-2 py-0.5 ${eligibilityBadgeClass(Boolean(eligibilityQ.data?.eligible))}`}>
                  {eligibilityQ.data?.eligible ? "Eligible" : "Ineligible"}
                </span>
                {!eligibilityQ.data?.eligible ? (
                  <div className="mt-1 text-[11px] text-red-700">{(eligibilityQ.data?.reasons ?? []).join(", ")}</div>
                ) : null}
              </div>
            </div>
            <div className="rounded border border-gray-100 p-3 text-xs">
              <div className="font-medium text-slate-800">RTD case</div>
              <div className="mt-1">{rtdCase ? stageLabel(rtdCase.stage) : "None open"}</div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Record drug / alcohol test</h2>
          <div className="grid gap-2 md:grid-cols-2">
            <label className="text-xs text-slate-600">
              Type
              <select className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm" value={testType} onChange={(e) => setTestType(e.target.value as (typeof TEST_TYPES)[number])}>
                {TEST_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {stageLabel(type)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-600">
              Result
              <select className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm" value={testResult} onChange={(e) => setTestResult(e.target.value as (typeof TEST_RESULTS)[number])}>
                {TEST_RESULTS.map((result) => (
                  <option key={result} value={result}>
                    {result}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-600">
              Test date
              <input type="date" className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm" value={testDate} onChange={(e) => setTestDate(e.target.value)} />
            </label>
          </div>
          <button
            type="button"
            disabled={!driverId || createTestMutation.isPending}
            className="rounded bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            onClick={() => createTestMutation.mutate()}
          >
            Save test
          </button>
        </div>

        <div className="space-y-3 rounded border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Return-to-duty workflow</h2>
          {!rtdCase ? (
            <button
              type="button"
              disabled={!driverId || openRtdMutation.isPending}
              className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-800 disabled:opacity-50"
              onClick={() => openRtdMutation.mutate()}
            >
              Open RTD case
            </button>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1">
                {RTD_STAGES.map((stage) => {
                  const active = rtdCase.stage === stage;
                  const completed = RTD_STAGES.indexOf(stage) < RTD_STAGES.indexOf(rtdCase.stage as (typeof RTD_STAGES)[number]);
                  return (
                    <span
                      key={stage}
                      className={`rounded px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                        active ? "bg-blue-100 text-blue-900" : completed ? "bg-emerald-50 text-emerald-800" : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {stageLabel(stage)}
                    </span>
                  );
                })}
              </div>
              {nextStage ? (
                <button
                  type="button"
                  disabled={advanceRtdMutation.isPending}
                  className="rounded bg-blue-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  onClick={() => advanceRtdMutation.mutate(nextStage as (typeof RTD_STAGES)[number])}
                >
                  Advance to {stageLabel(nextStage)}
                </button>
              ) : (
                <div className="text-xs text-emerald-700">RTD case complete.</div>
              )}
              <div className="text-[11px] text-slate-600">
                Follow-up tests: {rtdCase.follow_up_tests_completed}/{rtdCase.follow_up_tests_required ?? "—"}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-900">Drug test history</h2>
        <DrugAlcoholTable rows={filteredTests as Array<Record<string, unknown>>} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded border border-gray-200 bg-white p-4 text-xs">
          <h3 className="text-sm font-semibold text-slate-900">Random pool roster</h3>
          <ul className="mt-2 space-y-1">
            {(poolQ.data ?? []).slice(0, 8).map((entry) => (
              <li key={String(entry.id)} className="flex justify-between border-b border-gray-100 py-1">
                <span>{String(entry.driver_id).slice(0, 8)}…</span>
                <span>{String(entry.status ?? "selected")}</span>
              </li>
            ))}
            {(poolQ.data ?? []).length === 0 ? <li className="text-slate-500">No pool entries.</li> : null}
          </ul>
        </div>
        <div className="rounded border border-gray-200 bg-white p-4 text-xs">
          <h3 className="text-sm font-semibold text-slate-900">Clearinghouse queries</h3>
          <ul className="mt-2 space-y-1">
            {(clearinghouseQ.data ?? []).slice(0, 8).map((entry) => (
              <li key={String(entry.id)} className="flex justify-between border-b border-gray-100 py-1">
                <span>{String(entry.driver_id).slice(0, 8)}…</span>
                <span>{String(entry.query_status ?? "pending")}</span>
              </li>
            ))}
            {(clearinghouseQ.data ?? []).length === 0 ? <li className="text-slate-500">No queries logged.</li> : null}
          </ul>
        </div>
      </div>
    </div>
  );
}
