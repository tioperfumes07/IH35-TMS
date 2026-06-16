/**
 * Test Scheduling Panel — GAP-81
 * Allows Safety Officers to schedule FMCSA Part 382 tests for enrolled drivers.
 * Consumes POST /api/safety/drug-alcohol/tests.
 */
import { useState } from "react";
import { resolveApiUrl } from "../../../api/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";

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

  const mutation = useMutation({
    mutationFn: () =>
      postScheduleTest(companyId, {
        driver_uuid: driverUuid,
        test_type: testType,
        test_kind: testKind,
        scheduled_at: scheduledAt ? `${scheduledAt}T00:00:00Z` : undefined,
      }),
    onSuccess: async () => {
      setDriverUuid("");
      setScheduledAt("");
      setSuccessMsg("Test scheduled successfully.");
      setTimeout(() => setSuccessMsg(null), 4000);
      await queryClient.invalidateQueries({ queryKey: ["safety", "da-program", "tests", companyId] });
    },
  });

  const canSubmit = driverUuid.trim().length > 0 && !mutation.isPending;

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-900">Schedule Test</h2>
      <p className="mb-3 text-xs text-slate-500">
        FMCSA Part 382 — schedule a drug or alcohol test for an enrolled driver.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-xs text-slate-600">
          Driver UUID
          <input
            type="text"
            className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 font-mono text-xs"
            placeholder="xxxxxxxx-xxxx-…"
            value={driverUuid}
            onChange={(e) => setDriverUuid(e.target.value)}
          />
        </label>

        <label className="block text-xs text-slate-600">
          Test Type
          <select
            className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm"
            value={testType}
            onChange={(e) => setTestType(e.target.value as TestType)}
          >
            {TEST_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs text-slate-600">
          Test Kind
          <select
            className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm"
            value={testKind}
            onChange={(e) => setTestKind(e.target.value as TestKind)}
          >
            {TEST_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs text-slate-600">
          Scheduled Date (optional)
          <input
            type="date"
            className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
          />
        </label>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          disabled={!canSubmit}
          className="rounded bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Scheduling…" : "Schedule Test"}
        </button>

        {successMsg ? (
          <span className="text-xs font-medium text-emerald-700">{successMsg}</span>
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
