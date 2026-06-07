/**
 * Drug & Alcohol Program Tab — GAP-81
 * FMCSA Part 382: consortium enrollment roster, recent tests, positive-result queue.
 * NEW component — rendered at /safety/drug-alcohol via SafetyGroupNav (tab already registered).
 * Consumes /api/safety/drug-alcohol/* endpoints (additive, separate from compliance module).
 */
import { useQuery } from "@tanstack/react-query";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { TestSchedulingPanel } from "./TestSchedulingPanel";
import { RandomPoolDashboard } from "./RandomPoolDashboard";

// ─── Types ────────────────────────────────────────────────────────────────────

type Enrollment = {
  uuid: string;
  driver_uuid: string;
  consortium_name: string;
  enrolled_at: string;
  is_active: boolean;
};

type TestRecord = {
  uuid: string;
  driver_uuid: string;
  test_type: string;
  test_kind: string;
  result: string | null;
  scheduled_at: string | null;
  collected_at: string | null;
  created_at: string;
};

// ─── API ──────────────────────────────────────────────────────────────────────

async function fetchEnrollments(companyId: string): Promise<Enrollment[]> {
  const res = await fetch(
    `/api/safety/drug-alcohol/enrollments?operating_company_id=${companyId}&active_only=true`,
    { credentials: "include" }
  );
  if (!res.ok) throw new Error(`enrollments_fetch_${res.status}`);
  const data = await res.json() as { enrollments: Enrollment[] };
  return data.enrollments;
}

async function fetchPositives(companyId: string): Promise<TestRecord[]> {
  const res = await fetch(
    `/api/safety/drug-alcohol/tests?operating_company_id=${companyId}&result=positive`,
    { credentials: "include" }
  );
  if (!res.ok) throw new Error(`positives_fetch_${res.status}`);
  const data = await res.json() as { tests: TestRecord[] };
  return data.tests;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EnrollmentRow({ enrollment }: { enrollment: Enrollment }) {
  return (
    <tr className="border-b border-gray-100 text-xs">
      <td className="py-1.5 pr-3 font-mono text-[11px] text-slate-500">
        {enrollment.driver_uuid.slice(0, 8)}…
      </td>
      <td className="py-1.5 pr-3">{enrollment.consortium_name}</td>
      <td className="py-1.5 text-slate-600">{enrollment.enrolled_at}</td>
    </tr>
  );
}

function PositiveRow({ test }: { test: TestRecord }) {
  return (
    <tr className="border-b border-gray-100 text-xs">
      <td className="py-1.5 pr-3 font-mono text-[11px] text-slate-500">
        {test.driver_uuid.slice(0, 8)}…
      </td>
      <td className="py-1.5 pr-3 capitalize">{test.test_type.replace(/_/g, " ")}</td>
      <td className="py-1.5 pr-3 capitalize">{test.test_kind}</td>
      <td className="py-1.5">
        <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
          positive
        </span>
      </td>
      <td className="py-1.5 text-slate-500">{test.collected_at?.slice(0, 10) ?? "—"}</td>
    </tr>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function DrugAlcoholProgramTab() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const enrollmentsQ = useQuery({
    queryKey: ["safety", "da-program", "enrollments", companyId],
    enabled: Boolean(companyId),
    queryFn: () => fetchEnrollments(companyId),
  });

  const positivesQ = useQuery({
    queryKey: ["safety", "da-program", "positives", companyId],
    enabled: Boolean(companyId),
    queryFn: () => fetchPositives(companyId),
  });

  const enrollmentRows = enrollmentsQ.data ?? [];
  const positiveRows = positivesQ.data ?? [];

  if (!companyId) {
    return (
      <div className="rounded border border-gray-200 bg-white p-4 text-xs text-slate-500">
        Select an operating company to view the Drug & Alcohol Program.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Consortium Enrollment Roster ─────────────────────────────────── */}
      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">
          Consortium Enrollments
          {enrollmentRows.length > 0 ? (
            <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-normal text-slate-600">
              {enrollmentRows.length} active
            </span>
          ) : null}
        </h2>

        {enrollmentsQ.isLoading ? (
          <p className="text-xs text-slate-500">Loading…</p>
        ) : enrollmentsQ.isError ? (
          <p className="text-xs text-red-600">Failed to load enrollments.</p>
        ) : enrollmentRows.length === 0 ? (
          <p className="text-xs text-slate-500">No active consortium enrollments.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="pb-1 pr-3 font-medium">Driver</th>
                  <th className="pb-1 pr-3 font-medium">Consortium</th>
                  <th className="pb-1 font-medium">Enrolled</th>
                </tr>
              </thead>
              <tbody>
                {enrollmentRows.map((e) => (
                  <EnrollmentRow key={e.uuid} enrollment={e} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Positive Results Queue ────────────────────────────────────────── */}
      <section className="rounded-lg border border-red-100 bg-red-50 p-4">
        <h2 className="mb-3 text-sm font-semibold text-red-900">
          Positive Results — SAP Referral Queue
          {positiveRows.length > 0 ? (
            <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-normal text-red-800">
              {positiveRows.length} pending
            </span>
          ) : null}
        </h2>

        {positivesQ.isLoading ? (
          <p className="text-xs text-red-500">Loading…</p>
        ) : positivesQ.isError ? (
          <p className="text-xs text-red-700">Failed to load positive results.</p>
        ) : positiveRows.length === 0 ? (
          <p className="text-xs text-red-700">No open positive results. All clear.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-red-700">
                  <th className="pb-1 pr-3 font-medium">Driver</th>
                  <th className="pb-1 pr-3 font-medium">Type</th>
                  <th className="pb-1 pr-3 font-medium">Kind</th>
                  <th className="pb-1 pr-3 font-medium">Result</th>
                  <th className="pb-1 font-medium">Collected</th>
                </tr>
              </thead>
              <tbody>
                {positiveRows.map((t) => (
                  <PositiveRow key={t.uuid} test={t} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Test Scheduling ───────────────────────────────────────────────── */}
      <TestSchedulingPanel companyId={companyId} />

      {/* ── Random Pool Dashboard ─────────────────────────────────────────── */}
      <RandomPoolDashboard companyId={companyId} />
    </div>
  );
}

export default DrugAlcoholProgramTab;
