/**
 * Test Scheduling Panel — GAP-81
 * Allows Safety Officers to schedule FMCSA Part 382 tests for enrolled drivers.
 * Consumes POST /api/safety/drug-alcohol/tests.
 */
import { useEffect, useRef, useState } from "react";
import { DatePicker } from "../../../components/forms/DatePicker";
import { resolveApiUrl } from "../../../api/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { EntityPicker } from "../../../components/parity/EntityPicker";
import { Combobox } from "../../../components/Combobox";

type TestType = "pre_employment" | "random" | "post_accident" | "reasonable_suspicion" | "return_to_duty" | "follow_up";
type TestKind = "drug" | "alcohol" | "both";

const TEST_TYPES: { value: TestType; label: string }[] = [
  { value: "pre_employment", label: "Pre-Employment" },
  { value: "random", label: "Random" },
  { value: "post_accident", label: "Post-Accident" },
  { value: "reasonable_suspicion", label: "Reasonable Suspicion" },
  { value: "return_to_duty", label: "Return-to-Duty" },
  { value: "follow_up", label: "Follow-Up" },
];

const TEST_KINDS: { value: TestKind; label: string }[] = [
  { value: "drug", label: "Drug" },
  { value: "alcohol", label: "Alcohol" },
  { value: "both", label: "Drug & Alcohol" },
];

type Props = {
  companyId: string;
};

async function postScheduleTest(companyId: string, payload: {
  driver_uuid: string;
  test_type: TestType;
  test_kind: TestKind;
  scheduled_at?: string;
}) {
  const res = await fetch(resolveApiUrl("/api/safety/drug-alcohol/tests"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operating_company_id: companyId, ...payload }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? `http_${res.status}`);
  }
  return res.json();
}

export function TestSchedulingPanel({ companyId }: Props) {
  const queryClient = useQueryClient();
  const [driverUuid, setDriverUuid] = useState("");
  const [testType, setTestType] = useState<TestType>("random");
  const [testKind, setTestKind] = useState<TestKind>("drug");
  const [scheduledAt, setScheduledAt] = useState("");
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const lifecycleGenerationRef = useRef(0);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mutation = useMutation({
    mutationFn: (input: {
      companyId: string;
      generation: number;
      payload: Parameters<typeof postScheduleTest>[1];
    }) => postScheduleTest(input.companyId, input.payload),
    onSuccess: async (_result, input) => {
      if (input.generation !== lifecycleGenerationRef.current) return;
      setDriverUuid("");
      setScheduledAt("");
      setSuccessMsg("Test scheduled successfully.");
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => {
        if (input.generation === lifecycleGenerationRef.current) setSuccessMsg(null);
      }, 4000);
      await queryClient.invalidateQueries({ queryKey: ["safety", "da-program", "tests", input.companyId] });
    },
  });

  useEffect(() => {
    lifecycleGenerationRef.current += 1;
    mutation.reset();
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    successTimerRef.current = null;
    setDriverUuid("");
    setTestType("random");
    setTestKind("drug");
    setScheduledAt("");
    setSuccessMsg(null);
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, [companyId]); // Mutation reset is stable; company transitions own a fresh compliance draft.

  const canSubmit = driverUuid.trim().length > 0 && !mutation.isPending;

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-900">Schedule Test</h2>
      <p className="mb-3 text-xs text-slate-500">
        FMCSA Part 382 — schedule a drug or alcohol test for an enrolled driver.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-xs text-slate-600">
          Driver
          {/* C1 PICKER LAW: was a raw-UUID box whose placeholder literally showed a uuid mask. An
              FMCSA Part 382 test scheduled against a mistyped id is a compliance record for the
              wrong driver. */}
          <EntityPicker
            kind="driver"
            operatingCompanyId={companyId}
            value={driverUuid || null}
            onChange={(next) => setDriverUuid(next ?? "")}
            placeholder="Select driver"
            className="mt-1"
          />
        </label>

        <div className="block text-xs text-slate-600">
          <label htmlFor="schedule-test-type">Test Type</label>
          <Combobox
            id="schedule-test-type"
            className="mt-1"
            options={TEST_TYPES}
            value={testType}
            onChange={(next) => next && setTestType(next as TestType)}
            placeholder="Select test type"
          />
        </div>

        <div className="block text-xs text-slate-600">
          <label htmlFor="schedule-test-kind">Test Kind</label>
          <Combobox
            id="schedule-test-kind"
            className="mt-1"
            options={TEST_KINDS}
            value={testKind}
            onChange={(next) => next && setTestKind(next as TestKind)}
            placeholder="Select test kind"
          />
        </div>

        <div className="block text-xs text-slate-600">
          <label htmlFor="drug-alcohol-scheduled-date">Scheduled Date (optional)</label>
          <DatePicker
            id="drug-alcohol-scheduled-date"
            className="mt-1 block w-full"
            value={scheduledAt}
            onChange={(next) => setScheduledAt(next)}
          />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          disabled={!canSubmit}
          className="rounded-sm bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
          onClick={() => mutation.mutate({
            companyId,
            generation: lifecycleGenerationRef.current,
            payload: {
              driver_uuid: driverUuid,
              test_type: testType,
              test_kind: testKind,
              scheduled_at: scheduledAt ? `${scheduledAt}T00:00:00Z` : undefined,
            },
          })}
        >
          {mutation.isPending ? "Scheduling…" : "Schedule Test"}
        </button>

        {successMsg ? (
          <span className="text-xs font-medium text-slate-700">{successMsg}</span>
        ) : null}

        {mutation.isError ? (
          <span className="text-xs text-red-700">
            Error: {(mutation.error as Error).message}
          </span>
        ) : null}
      </div>
    </section>
  );
}

export default TestSchedulingPanel;
