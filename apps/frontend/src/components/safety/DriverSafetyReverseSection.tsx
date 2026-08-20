import { useQuery } from "@tanstack/react-query";
import {
  getComplaints,
  getDotInspections,
  getDriverDrugAlcoholTests,
  getInternalFines,
  getSafetyFines,
  getSafetyAccidents,
  getTrainingCompletions,
} from "../../api/safety";
import { useAuth } from "../../auth/useAuth";
import { formatDateUS } from "../../lib/formatDate";
import { formatUsd, formatUsdCents } from "../../lib/money";
import { EntityLink } from "../shared/EntityLink";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";
import { entityLabel } from "../../lib/entity-label";
import { DispatcherSafetyEventsReverseBlock } from "./DispatcherSafetyEventsReverseBlock";
import { SafetyEventsReverseBlock } from "./SafetyEventsReverseBlock";
import { listHosViolations } from "../../api/safetyV64";
import { DriverIncidentsReverseSection } from "./DriverIncidentsReverseSection";

/**
 * SAF-F16 — the REVERSE half of the driver↔safety link.
 *
 * Before this, every one of these records carried a canonical FK to `mdata.drivers` and none of
 * them was readable from the driver. A safety officer opening a driver saw the internal safety-event
 * log and nothing else: no civil fine, no internal fine, no complaint, no drug/alcohol test. Under
 * DEFINITION-OF-DONE §1.C forward persistence without a reverse surface is NOT done, so this is the
 * missing half, not a nicety.
 *
 * Scoping is done SERVER-SIDE in every one of the four reads. Each list route caps at LIMIT 500, so
 * fetching the company list and filtering in the browser would silently under-report the moment a
 * company crosses that cap — and a reverse view that quietly omits a driver's fines is worse than
 * no view at all.
 *
 * Units differ by table and are NOT interchangeable:
 *   safety.civil_fines.amount_cents   → bigint cents   → formatUsdCents
 *   safety.internal_fines.amount      → numeric DOLLARS → formatUsd
 */

type Row = Record<string, unknown>;

const s = (value: unknown): string => (value == null ? "" : String(value));

function SectionShell({
  title,
  openKind,
  openId,
  linkLabel,
  testId,
  isLoading,
  isError,
  errorText,
  emptyText,
  count,
  children,
}: {
  title: string;
  // LINK-F5171: Open is always EntityLink — bare Link fallback removed (no unfiltered / dead #).
  openKind:
    | "accidents_driver"
    | "hos_violations_driver"
    | "internal_fines_driver"
    | "safety_fines_driver"
    | "dot_inspections_driver"
    | "training_records_driver"
    | "complaints_driver"
    | "drug_alcohol_driver";
  openId: string;
  linkLabel: string;
  testId: string;
  isLoading: boolean;
  isError: boolean;
  errorText: string;
  emptyText: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid={testId}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">
          {title}
          {count > 0 ? <span className="ml-2 text-xs font-normal text-gray-600">({count})</span> : null}
        </h3>
        <EntityLink
          kind={openKind}
          id={openId}
          label={linkLabel}
          className="text-xs font-semibold text-slate-700 underline"
        />
      </div>
      {isLoading ? <p className="text-sm text-gray-500">Loading…</p> : null}
      {isError ? <p className="text-sm text-red-600">{errorText}</p> : null}
      {!isLoading && !isError && count === 0 ? <p className="text-sm text-gray-500">{emptyText}</p> : null}
      {count > 0 ? <ul className="space-y-2">{children}</ul> : null}
    </div>
  );
}

type Props = {
  operatingCompanyId: string;
  driverId: string;
  /** Optional test id for the section root. */
  "data-testid"?: string;
};

export function DriverSafetyReverseSection({
  operatingCompanyId,
  driverId,
  "data-testid": testId = "driver-safety-reverse-section",
}: Props) {
  const { user } = useAuth();
  const role = user?.role;
  const canViewSafety = role === "Owner" || role === "Administrator" || role === "Manager" || role === "Safety";
  // Complaints are privacy-gated server-side to owner/admin/safety (E_COMPLAINT_PRIVACY_GATED).
  // Managers can see the rest of the Safety File, so gate ONLY this block rather than showing a
  // Manager a red failure banner for a record class they are not entitled to.
  const canViewComplaints = role === "Owner" || role === "Administrator" || role === "Safety";

  const enabled = canViewSafety && Boolean(operatingCompanyId) && Boolean(driverId);

  const civilFinesQuery = useQuery({
    queryKey: ["safety", "reverse", "civil-fines", operatingCompanyId, driverId],
    queryFn: () => getSafetyFines(operatingCompanyId, { subject_driver_id: driverId }),
    enabled,
  });

  const internalFinesQuery = useQuery({
    queryKey: ["safety", "reverse", "internal-fines", operatingCompanyId, driverId],
    queryFn: () => getInternalFines(operatingCompanyId, { driver_id: driverId }),
    enabled,
  });

  const complaintsQuery = useQuery({
    queryKey: ["safety", "reverse", "complaints", operatingCompanyId, driverId],
    queryFn: () => getComplaints(operatingCompanyId, { driver_id: driverId }),
    enabled: enabled && canViewComplaints,
  });

  const testsQuery = useQuery({
    queryKey: ["safety", "reverse", "da-tests", operatingCompanyId, driverId],
    queryFn: () => getDriverDrugAlcoholTests(operatingCompanyId, driverId),
    enabled,
  });

  const dotInspectionsQuery = useQuery({
    queryKey: ["safety", "reverse", "dot-inspections", operatingCompanyId, driverId],
    queryFn: () => getDotInspections(operatingCompanyId, { driver_id: driverId }),
    enabled,
  });

  const accidentsQuery = useQuery({
    queryKey: ["safety", "reverse", "accidents", operatingCompanyId, driverId],
    queryFn: () => getSafetyAccidents(operatingCompanyId, { driver_id: driverId }),
    enabled,
  });

  const trainingQuery = useQuery({
    queryKey: ["safety", "reverse", "training-records", operatingCompanyId, driverId],
    queryFn: () => getTrainingCompletions(operatingCompanyId, { driver_id: driverId }),
    enabled,
  });

  const hosViolationsQuery = useQuery({
    queryKey: ["safety", "reverse", "hos-violations", operatingCompanyId, driverId],
    queryFn: () => listHosViolations(operatingCompanyId, { driver_id: driverId }),
    enabled,
  });

  if (!canViewSafety) return null;

  const civilFines: Row[] = civilFinesQuery.data?.fines ?? [];
  const internalFines: Row[] = internalFinesQuery.data?.fines ?? [];
  const complaints: Row[] = complaintsQuery.data?.complaints ?? [];
  const tests: Row[] = testsQuery.data?.tests ?? [];
  const dotInspections: Row[] = dotInspectionsQuery.data?.dot_inspections ?? [];
  const accidents: Row[] = accidentsQuery.data?.accidents ?? [];
  const trainingRecords: Row[] = trainingQuery.data?.training_completions ?? [];
  const hosViolations: Row[] = hosViolationsQuery.data?.hos_violations ?? [];

  return (
    <div className="space-y-3" data-testid={testId}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-900">Safety records linked to this driver</h2>
        {/* SAF-F22: /safety/driver-profiles/:driverId was MOUNTED with zero inbound links — reachable
            only by typing the URL. It is per-driver and parameterized, so it cannot be a nav entry
            like the other five orphans; the driver's own page is its natural entry point. */}
        <EntityLink
          className="text-xs font-semibold text-slate-700 underline"
          kind="driver_safety_profile"
          id={driverId}
          label="Open Safety Profile"
          data-testid="driver-safety-profile-link"
        />
      </div>
      <DispatcherSafetyEventsReverseBlock
        operatingCompanyId={operatingCompanyId}
        related="driver"
        entityId={driverId}
        data-testid="driver-dispatcher-safety-events-reverse"
      />
      <SafetyEventsReverseBlock companyId={operatingCompanyId} subject="driver" entityId={driverId} />
      <DriverIncidentsReverseSection operatingCompanyId={operatingCompanyId} driverId={driverId} />

      <SectionShell
        title="Training Records"
        openKind="training_records_driver"
        openId={driverId}
        linkLabel="Open Training Records"
        testId="driver-safety-reverse-training-records"
        isLoading={trainingQuery.isLoading}
        isError={trainingQuery.isError}
        errorText="Failed to load this driver's training records."
        emptyText="No training records for this driver."
        count={trainingRecords.length}
      >
        {trainingRecords.map((record) => (
          <li key={s(record.id)} className="rounded-sm border border-gray-200 bg-white px-3 py-2 text-sm">
            <EntityLink
              kind="training_record"
              id={s(record.id)}
              label={entityLabel(record.training_name ?? record.training_type, record.id, "Training")}
              className="font-semibold text-slate-700 underline"
            />
            <span className="ml-2 text-gray-600">{formatDateUS(record.completed_at)}</span>
          </li>
        ))}
      </SectionShell>

      <SectionShell
        title="Accidents"
        openKind="accidents_driver"
        openId={driverId}
        linkLabel="Open Accidents"
        testId="driver-safety-reverse-accidents"
        isLoading={accidentsQuery.isLoading}
        isError={accidentsQuery.isError}
        errorText="Failed to load this driver's accidents."
        emptyText="No accident reports for this driver."
        count={accidents.length}
      >
        {accidents.map((accident) => (
          <li key={s(accident.id)} className="rounded-sm border border-gray-200 bg-white px-3 py-2 text-sm">
            <EntityLink kind="accident" id={s(accident.id)} label={entityLabel(accident.description, accident.id, "Accident")} className="font-semibold" />
            {accident.load_id ? <span className="ml-2"><EntityLink kind="load" id={s(accident.load_id)} label={entityLabel(accident.load_number, accident.load_id, "Load")} /></span> : null}
            {accident.unit_id ? <span className="ml-2"><EntityLinkOrTombstone kind="unit" id={s(accident.unit_id)} name={accident.unit_number} noun="Unit" /></span> : null}
            {accident.trailer_id ? <span className="ml-2"><EntityLinkOrTombstone kind="trailer" id={s(accident.trailer_id)} name={accident.trailer_number} noun="Trailer" /></span> : null}
            {accident.vendor_id ? <span className="ml-2"><EntityLinkOrTombstone kind="vendor" id={s(accident.vendor_id)} name={accident.vendor_name} noun="Vendor" /></span> : null}
          </li>
        ))}
      </SectionShell>

      <SectionShell
        title="HOS Violations"
        openKind="hos_violations_driver"
        openId={driverId}
        linkLabel="Open HOS Violations"
        testId="driver-safety-reverse-hos-violations"
        isLoading={hosViolationsQuery.isLoading}
        isError={hosViolationsQuery.isError}
        errorText="Failed to load this driver's HOS violations."
        emptyText="No HOS violations for this driver."
        count={hosViolations.length}
      >
        {hosViolations.map((violation) => (
          <li key={s(violation.id)} className="rounded-sm border border-gray-200 bg-white px-3 py-2 text-sm">
            <EntityLink
              kind="hos_violation"
              id={s(violation.id) || null}
              label={s(violation.violation_type) || "HOS violation"}
              className="font-semibold text-slate-700"
            />
            <span className="ml-2 text-gray-600">{s(violation.source) || "manual_office"}</span>
            <div className="mt-1 text-xs text-gray-600">
              {formatDateUS(s(violation.occurred_at))}
              {violation.duration_minutes != null ? ` · ${s(violation.duration_minutes)} min` : ""}
            </div>
          </li>
        ))}
      </SectionShell>

      <SectionShell
        title="DOT Inspections"
        openKind="dot_inspections_driver"
        openId={driverId}
        linkLabel="Open DOT Inspections"
        testId="driver-safety-reverse-dot-inspections"
        isLoading={dotInspectionsQuery.isLoading}
        isError={dotInspectionsQuery.isError}
        errorText="Failed to load this driver's DOT inspections."
        emptyText="No DOT inspections for this driver."
        count={dotInspections.length}
      >
        {dotInspections.map((inspection) => (
          <li key={s(inspection.id)} className="rounded-sm border border-gray-200 bg-white px-3 py-2 text-sm">
            <EntityLink
              kind="dot_inspection"
              id={s(inspection.id) || null}
              label={`Level ${s(inspection.fmcsa_level) || "—"} · ${s(inspection.outcome) || "—"}`}
              className="font-semibold text-slate-700"
            />
            <div className="mt-1 text-xs text-gray-600">
              {formatDateUS(s(inspection.inspection_date))}
              {inspection.inspector_name ? ` · ${s(inspection.inspector_name)}` : ""}
              {inspection.location ? ` · ${s(inspection.location)}` : ""}
            </div>
          </li>
        ))}
      </SectionShell>

      <SectionShell
        title="External Fines"
        openKind="safety_fines_driver"
        openId={driverId}
        linkLabel="Open External Fines"
        testId="driver-safety-reverse-civil-fines"
        isLoading={civilFinesQuery.isLoading}
        isError={civilFinesQuery.isError}
        errorText="Failed to load this driver's external fines."
        emptyText="No external fines for this driver."
        count={civilFines.length}
      >
        {civilFines.map((fine) => (
          <li key={s(fine.id)} className="rounded-sm border border-gray-200 bg-white px-3 py-2 text-sm">
            <EntityLink
              kind="safety_fine"
              id={s(fine.id) || null}
              label={entityLabel(s(fine.violation_description) || s(fine.issued_by_authority) || null, s(fine.id), "Fine")}
              className="font-semibold text-slate-700"
            />
            <span className="ml-2 text-gray-600">{s(fine.status) || "open"}</span>
            <div className="mt-1 text-xs text-gray-600">
              {formatDateUS(s(fine.issued_date))} · {formatUsdCents(fine.amount_cents as number)}
              {fine.issued_by_authority ? ` · ${s(fine.issued_by_authority)}` : ""}
            </div>
          </li>
        ))}
      </SectionShell>

      <SectionShell
        title="Internal Fines"
        openKind="internal_fines_driver"
        openId={driverId}
        linkLabel="Open Internal Fines"
        testId="driver-safety-reverse-internal-fines"
        isLoading={internalFinesQuery.isLoading}
        isError={internalFinesQuery.isError}
        errorText="Failed to load this driver's internal fines."
        emptyText="No internal fines for this driver."
        count={internalFines.length}
      >
        {internalFines.map((fine) => (
          <li key={s(fine.id)} className="rounded-sm border border-gray-200 bg-white px-3 py-2 text-sm">
            <EntityLink
              kind="internal_fine"
              id={s(fine.id) || null}
              label={entityLabel(s(fine.reason_name) || s(fine.reason_code), fine.id, "Internal fine")}
              className="font-semibold text-slate-700"
            />
            <span className="ml-2 text-gray-600">{s(fine.status) || "pending"}</span>
            <div className="mt-1 text-xs text-gray-600">
              {formatDateUS(s(fine.imposed_date))} · {formatUsd(fine.amount as number)}
              {fine.voided_at ? " · VOIDED" : ""}
            </div>
            {fine.driver_liability_id ? (
              <div className="mt-1 text-xs text-gray-600">
                Converted to driver liability{" "}
                <EntityLink
                  kind="liability"
                  id={s(fine.driver_liability_id) || null}
                  label={entityLabel(null, s(fine.driver_liability_id), "Liability")}
                  className="font-semibold text-slate-700"
                />
              </div>
            ) : null}
          </li>
        ))}
      </SectionShell>

      {canViewComplaints ? (
        <SectionShell
          title="Complaints"
          openKind="complaints_driver"
          openId={driverId}
          linkLabel="Open Complaints"
          testId="driver-safety-reverse-complaints"
          isLoading={complaintsQuery.isLoading}
          isError={complaintsQuery.isError}
          errorText="Failed to load this driver's complaints."
          emptyText="No complaints involving this driver."
          count={complaints.length}
        >
          {complaints.map((complaint) => {
            // The driver can be on either side of a complaint; say which, because "a complaint" on
            // a driver's file means something very different depending on the answer.
            const isRespondent = s(complaint.respondent_driver_id) === driverId;
            const sideLabel = isRespondent ? "Filed against this driver" : "Filed by this driver";
            return (
              <li key={s(complaint.id)} className="rounded-sm border border-gray-200 bg-white px-3 py-2 text-sm">
                <EntityLink
                  kind="complaint"
                  id={s(complaint.id) || null}
                  label={sideLabel}
                  className="font-semibold text-slate-700"
                />
                <span className="ml-2 text-gray-600">{s(complaint.status) || "open"}</span>
                <div className="mt-1 text-xs text-gray-600">{formatDateUS(s(complaint.filed_at))}</div>
              </li>
            );
          })}
        </SectionShell>
      ) : null}

      <SectionShell
        title="Drug & Alcohol Tests"
        openKind="drug_alcohol_driver"
        openId={driverId}
        linkLabel="Open Drug & Alcohol"
        testId="driver-safety-reverse-drug-alcohol"
        isLoading={testsQuery.isLoading}
        isError={testsQuery.isError}
        errorText="Failed to load this driver's drug & alcohol tests."
        emptyText="No drug or alcohol tests recorded for this driver."
        count={tests.length}
      >
        {tests.map((test) => (
          <li key={s(test.uuid)} className="rounded-sm border border-gray-200 bg-white px-3 py-2 text-sm">
            <span className="font-semibold text-slate-700">
              {s(test.test_type).replace(/_/g, " ") || "test"} · {s(test.test_kind) || "drug"}
            </span>
            <span className="ml-2 text-gray-600">{s(test.result) || "pending"}</span>
            <div className="mt-1 text-xs text-gray-600">
              {test.collected_at
                ? `Collected ${formatDateUS(s(test.collected_at))}`
                : test.scheduled_at
                  ? `Scheduled ${formatDateUS(s(test.scheduled_at))}`
                  : "No date recorded"}
            </div>
          </li>
        ))}
      </SectionShell>
    </div>
  );
}
