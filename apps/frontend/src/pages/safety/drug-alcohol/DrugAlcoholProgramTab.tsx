/**
 * Drug & Alcohol Program Tab — GAP-81
 * FMCSA Part 382: consortium enrollment roster, recent tests, positive-result queue.
 * NEW component — rendered at /safety/drug-alcohol via SafetyGroupNav (tab already registered).
 * Consumes /api/safety/drug-alcohol/* endpoints (additive, separate from compliance module).
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { EntityLink } from "../../../components/shared/EntityLink";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { ListErrorState } from "../../../components/ListErrorState";
import { TestSchedulingPanel } from "./TestSchedulingPanel";
import { RandomPoolDashboard } from "./RandomPoolDashboard";
import { resolveApiUrl } from "../../../api/client";
import { entityLabel } from "../../../lib/entity-label";

// ─── Types ────────────────────────────────────────────────────────────────────

type Enrollment = {
  uuid: string;
  driver_uuid: string;
  driver_name: string | null;
  consortium_name: string;
  enrolled_at: string;
  is_active: boolean;
};

type TestRecord = {
  uuid: string;
  driver_uuid: string;
  driver_name: string | null;
  test_type: string;
  test_kind: string;
  result: string | null;
  scheduled_at: string | null;
  collected_at: string | null;
  created_at: string;
};

// ─── API ──────────────────────────────────────────────────────────────────────

async function fetchEnrollments(companyId: string): Promise<Enrollment[]> {
  const res = await fetch(resolveApiUrl(`/api/safety/drug-alcohol/enrollments?operating_company_id=${companyId}&active_only=true`),
    { credentials: "include" }
  );
  if (!res.ok) throw new Error(`enrollments_fetch_${res.status}`);
  const data = await res.json() as { enrollments: Enrollment[] };
  return data.enrollments;
}

async function fetchPositives(companyId: string): Promise<TestRecord[]> {
  const res = await fetch(resolveApiUrl(`/api/safety/drug-alcohol/tests?operating_company_id=${companyId}&result=positive`),
    { credentials: "include" }
  );
  if (!res.ok) throw new Error(`positives_fetch_${res.status}`);
  const data = await res.json() as { tests: TestRecord[] };
  return data.tests;
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

  const enrollmentColumns = useMemo<ParityColumn<Enrollment>[]>(
    () => [
      {
        key: "driver_uuid",
        label: "Driver",
        sortable: true,
        render: (enrollment) => (
          <EntityLink
            kind="driver"
            id={enrollment.driver_uuid}
            label={entityLabel(enrollment.driver_name?.trim(), enrollment.driver_uuid, "Driver")}
          />
        ),
      },
      { key: "consortium_name", label: "Consortium", sortable: true },
      { key: "enrolled_at", label: "Enrolled", sortable: true },
    ],
    [],
  );

  const positiveColumns = useMemo<ParityColumn<TestRecord>[]>(
    () => [
      {
        key: "driver_uuid",
        label: "Driver",
        sortable: true,
        render: (test) => (
          <EntityLink kind="driver" id={test.driver_uuid} label={entityLabel(test.driver_name?.trim(), test.driver_uuid, "Driver")} />
        ),
      },
      {
        key: "test_type",
        label: "Type",
        sortable: true,
        render: (test) => <span className="capitalize">{test.test_type.replace(/_/g, " ")}</span>,
      },
      {
        key: "test_kind",
        label: "Kind",
        sortable: true,
        render: (test) => <span className="capitalize">{test.test_kind}</span>,
      },
      {
        key: "result",
        label: "Result",
        render: () => (
          <span className="rounded-sm bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700">
            positive
          </span>
        ),
      },
      {
        key: "collected_at",
        label: "Collected",
        sortable: true,
        render: (test) => test.collected_at?.slice(0, 10) ?? "—",
      },
    ],
    [],
  );

  if (!companyId) {
    return (
      <div className="rounded-sm border border-gray-200 bg-white p-4 text-xs text-slate-500">
        Select an operating company to view the Drug & Alcohol Program.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Consortium Enrollment Roster ─────────────────────────────────── */}
      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-xs font-semibold text-slate-900">
          Consortium Enrollments
          {enrollmentRows.length > 0 ? (
            <span className="ml-2 rounded-sm bg-slate-100 px-1.5 py-0.5 text-[11px] font-normal text-slate-600">
              {enrollmentRows.length} active
            </span>
          ) : null}
        </h2>

        {enrollmentsQ.isError ? (
          <ListErrorState
            title="Couldn't load consortium enrollments"
            status={0}
            message={(enrollmentsQ.error as Error)?.message}
            onRetry={() => void enrollmentsQ.refetch()}
          />
        ) : (
          <ParityTable<Enrollment>
            columns={enrollmentColumns}
            rows={enrollmentRows}
            rowKey={(enrollment) => enrollment.uuid}
            loading={enrollmentsQ.isLoading}
            emptyText="No active consortium enrollments."
            storageKey="safety-da-program-enrollments"
            exportFilename="da-program-enrollments"
          />
        )}
      </section>

      {/* ── Positive Results Queue ────────────────────────────────────────── */}
      <section className="rounded-lg border border-red-100 bg-red-50 p-4">
        <h2 className="mb-3 text-xs font-semibold text-red-900">
          Positive Results — SAP Referral Queue
          {positiveRows.length > 0 ? (
            <span className="ml-2 rounded-sm bg-red-100 px-1.5 py-0.5 text-[11px] font-normal text-red-800">
              {positiveRows.length} pending
            </span>
          ) : null}
        </h2>

        {positivesQ.isError ? (
          <ListErrorState
            title="Couldn't load positive results"
            status={0}
            message={(positivesQ.error as Error)?.message}
            onRetry={() => void positivesQ.refetch()}
          />
        ) : (
          <ParityTable<TestRecord>
            columns={positiveColumns}
            rows={positiveRows}
            rowKey={(test) => test.uuid}
            loading={positivesQ.isLoading}
            emptyText="No open positive results. All clear."
            storageKey="safety-da-program-positives"
            exportFilename="da-program-positives"
          />
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
