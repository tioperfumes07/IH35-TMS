import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getSafetyAccidents,
  getInternalFines,
  listSafetyEventLog,
  listSafetyIncidents,
  type SafetyIncidentType,
} from "../../api/safety";
import { formatDateUS } from "../../lib/formatDate";
import { EntityLink } from "../shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { DispatcherSafetyEventsReverseBlock } from "./DispatcherSafetyEventsReverseBlock";
import { CivilFinesReverseBlock } from "./CivilFinesReverseBlock";
import { listHosViolations } from "../../api/safetyV64";
import { ListErrorState } from "../ListErrorState";
import { Button } from "../Button";

/**
 * SAF-C01 — REVERSE load↔safety. Accident reports and incidents already store load_id;
 * LoadDetailDrawer showed Insurance reverse but no Safety, so a trip looked clean while
 * accidents/cargo claims sat only on Safety screens. Filter server-side (LIMIT caps).
 */

type Row = Record<string, unknown>;
const s = (value: unknown): string => (value == null ? "" : String(value));

const INCIDENT_KINDS: {
  type: SafetyIncidentType;
  title: string;
  openKind: "damage_reports_load" | "trailer_interchanges_load" | "cargo_claims_load";
}[] = [
  {
    type: "damage_report",
    title: "Damage Reports",
    openKind: "damage_reports_load",
  },
  {
    type: "trailer_interchange",
    title: "Trailer Interchanges",
    openKind: "trailer_interchanges_load",
  },
  { type: "cargo_claim", title: "Cargo Claims", openKind: "cargo_claims_load" },
];

type Props = {
  operatingCompanyId: string;
  loadId: string;
  "data-testid"?: string;
};

export function LoadSafetyReverseSection({
  operatingCompanyId,
  loadId,
  "data-testid": testId = "load-detail-safety-records",
}: Props) {
  const accidentPageSize = 25;
  const [accidentPage, setAccidentPage] = useState(1);
  useEffect(() => setAccidentPage(1), [operatingCompanyId, loadId]);
  const accidentsQ = useQuery({
    queryKey: [
      "safety",
      "reverse",
      "accidents",
      "load",
      operatingCompanyId,
      loadId,
      accidentPage,
    ],
    queryFn: () => getSafetyAccidents(operatingCompanyId, { load_id: loadId, limit: accidentPageSize, offset: (accidentPage - 1) * accidentPageSize }),
    enabled: Boolean(operatingCompanyId) && Boolean(loadId),
  });
  const accidents: Row[] = accidentsQ.data?.accidents ?? [];
  const accidentTotal = accidentsQ.isError ? 0 : accidentsQ.data?.total_count ?? 0;
  const accidentPageCount = Math.max(1, Math.ceil(accidentTotal / accidentPageSize));
  const hosViolationsQ = useQuery({
    queryKey: [
      "safety",
      "reverse",
      "hos-violations",
      "load",
      operatingCompanyId,
      loadId,
    ],
    queryFn: () => listHosViolations(operatingCompanyId, { load_id: loadId }),
    enabled: Boolean(operatingCompanyId) && Boolean(loadId),
  });
  const hosViolations: Row[] = hosViolationsQ.data?.hos_violations ?? [];
  const internalFinesQ = useQuery({
    queryKey: [
      "safety",
      "reverse",
      "internal-fines",
      "load",
      operatingCompanyId,
      loadId,
    ],
    queryFn: () => getInternalFines(operatingCompanyId, { load_id: loadId }),
    enabled: Boolean(operatingCompanyId) && Boolean(loadId),
  });
  const internalFines: Row[] = internalFinesQ.data?.fines ?? [];

  return (
    <div className="space-y-3" data-testid={testId}>
      <div className="text-xs font-semibold text-gray-600">
        Safety records on this load
      </div>

      <div
        className="space-y-2 rounded-sm border border-gray-200 bg-white p-3"
        data-testid="load-safety-reverse-accidents"
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">
            Accidents
            {accidentTotal > 0 ? (
              <span className="ml-2 text-xs font-normal text-gray-600">
                ({accidentTotal})
              </span>
            ) : null}
          </h3>
          <EntityLink
            kind="accidents_load"
            id={loadId}
            label="Open Accidents"
            className="text-xs font-semibold text-slate-700 underline"
          />
        </div>
        {accidentsQ.isLoading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : null}
        {accidentsQ.isError ? (
          <ListErrorState status={0} message="Could not load accidents for this load." onRetry={() => void accidentsQ.refetch()} />
        ) : null}
        {!accidentsQ.isLoading &&
        !accidentsQ.isError &&
        accidents.length === 0 ? (
          <p className="text-sm text-gray-500">
            No accident reports linked to this load.
          </p>
        ) : null}
        {!accidentsQ.isError && accidents.length > 0 ? (
          <ul className="space-y-2">
            {accidents.map((row) => {
              const id = s(row.id);
              const when = row.accident_at ?? row.report_date;
              return (
                <li
                  key={id}
                  className="text-sm text-slate-700"
                  data-testid={`load-safety-accident-${id}`}
                >
                  <EntityLink
                    kind="accident"
                    id={id}
                    label={entityLabel(
                      s(row.description) || null,
                      id,
                      "Accident",
                    )}
                  />
                  <span className="ml-2 inline-flex flex-wrap items-center gap-1 text-xs text-gray-500">
                    {when ? formatDateUS(String(when).slice(0, 10)) : "—"}
                    {row.driver_id ? (
                      <>
                        <span>·</span>
                        <EntityLink
                          kind="driver"
                          id={s(row.driver_id)}
                          label={entityLabel(
                            row.driver_name,
                            row.driver_id,
                            "Driver",
                          )}
                        />
                      </>
                    ) : null}
                    {row.unit_id ? (
                      <>
                        <span>·</span>
                        <EntityLink
                          kind="unit"
                          id={s(row.unit_id)}
                          label={entityLabel(
                            row.unit_number,
                            row.unit_id,
                            "Unit",
                          )}
                        />
                      </>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
        {!accidentsQ.isError && accidentTotal > accidentPageSize ? (
          <div className="flex items-center justify-end gap-2 text-xs" data-testid="load-safety-reverse-accidents-pager">
            <Button size="sm" variant="secondary" disabled={accidentPage <= 1 || accidentsQ.isFetching} onClick={() => setAccidentPage((current) => Math.max(1, current - 1))}>Previous accidents</Button>
            <span className="text-slate-600">Page {accidentPage} of {accidentPageCount} · {accidentTotal} accidents</span>
            <Button size="sm" variant="secondary" disabled={accidentPage >= accidentPageCount || accidentsQ.isFetching} onClick={() => setAccidentPage((current) => Math.min(accidentPageCount, current + 1))}>Next accidents</Button>
          </div>
        ) : null}
      </div>

      <LoadSafetyEventsBlock companyId={operatingCompanyId} loadId={loadId} />
      <div
        className="space-y-2 rounded-sm border border-gray-200 bg-white p-3"
        data-testid="load-safety-reverse-hos-violations"
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">
            HOS Violations
            {hosViolations.length ? ` (${hosViolations.length})` : ""}
          </h3>
          <EntityLink
            kind="hos_violations_load"
            id={loadId}
            label="Open HOS Violations"
            className="text-xs font-semibold text-slate-700 underline"
          />
        </div>
        {hosViolationsQ.isLoading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : null}
        {hosViolationsQ.isError ? (
          <ListErrorState status={0} message="Could not load HOS violations for this load." onRetry={() => void hosViolationsQ.refetch()} />
        ) : null}
        {!hosViolationsQ.isLoading &&
        !hosViolationsQ.isError &&
        hosViolations.length === 0 ? (
          <p className="text-sm text-gray-500">
            No HOS violations linked to this load.
          </p>
        ) : null}
        {!hosViolationsQ.isError ? hosViolations.map((row) => (
          <div key={s(row.id)} className="text-sm text-slate-700">
            <EntityLink
              kind="hos_violation"
              id={s(row.id)}
              label={s(row.violation_type) || "HOS violation"}
            />
            <span className="ml-2 text-xs text-gray-500">
              {row.occurred_at
                ? formatDateUS(String(row.occurred_at).slice(0, 10))
                : "—"}
            </span>
          </div>
        )) : null}
      </div>
      <CivilFinesReverseBlock
        companyId={operatingCompanyId}
        related="load"
        entityId={loadId}
      />
      <div
        className="space-y-2 rounded-sm border border-gray-200 bg-white p-3"
        data-testid="load-safety-reverse-internal-fines"
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">
            Internal Fines
            {internalFines.length ? ` (${internalFines.length})` : ""}
          </h3>
          <EntityLink
            kind="internal_fines_load"
            id={loadId}
            label="Open Internal Fines"
            className="text-xs font-semibold text-slate-700 underline"
          />
        </div>
        {internalFinesQ.isLoading ? (
          <p className="text-sm text-gray-500">Loading internal fines…</p>
        ) : null}
        {internalFinesQ.isError ? (
          <ListErrorState status={0} message="Could not load internal fines for this load." onRetry={() => void internalFinesQ.refetch()} />
        ) : null}
        {!internalFinesQ.isLoading &&
        !internalFinesQ.isError &&
        internalFines.length === 0 ? (
          <p className="text-sm text-gray-500">
            No internal fines linked to this load.
          </p>
        ) : null}
        {!internalFinesQ.isError ? internalFines.map((row) => (
          <div key={s(row.id)} className="text-sm text-slate-700">
            <EntityLink
              kind="internal_fine"
              id={s(row.id)}
              label={entityLabel(
                s(row.reason_name) || s(row.reason_code),
                row.id,
                "Internal fine",
              )}
            />
            <span className="ml-2 text-xs text-gray-500">
              {row.imposed_date ? formatDateUS(String(row.imposed_date)) : "—"}
            </span>
            {row.driver_id ? (
              <span className="ml-2">
                <EntityLink
                  kind="driver"
                  id={s(row.driver_id)}
                  label={entityLabel(s(row.driver_name), s(row.driver_id), "Driver")}
                />
              </span>
            ) : null}
          </div>
        )) : null}
      </div>
      <DispatcherSafetyEventsReverseBlock
        operatingCompanyId={operatingCompanyId}
        related="load"
        entityId={loadId}
        data-testid="load-dispatcher-safety-events-reverse"
      />

      {INCIDENT_KINDS.map((kind) => (
        <LoadIncidentBlock
          key={kind.type}
          companyId={operatingCompanyId}
          loadId={loadId}
          kind={kind}
        />
      ))}
    </div>
  );
}

/**
 * FAIL-S1 REVERSE half. #5019 gave the Log Safety Event form a Related load picker, so new events
 * finally carry `related_load_id` — proven live on prod (event 262f6d5e → load L-20260808-0085).
 * But this section listed Accidents, Damage Reports, Trailer Interchanges and Cargo Claims and NOT
 * safety events, so the link existed in the database and appeared on no screen: open the load and it
 * still looked clean. §10a is explicit that a link is only done when it drills BOTH ways.
 */
function LoadSafetyEventsBlock({
  companyId,
  loadId,
}: {
  companyId: string;
  loadId: string;
}) {
  const query = useQuery({
    queryKey: ["safety", "reverse", "events-log", "load", companyId, loadId],
    queryFn: () => listSafetyEventLog(companyId, { related_load_id: loadId }),
    enabled: Boolean(companyId) && Boolean(loadId),
  });
  const rows = query.data?.events ?? [];

  return (
    <div
      className="space-y-2 rounded-sm border border-gray-200 bg-white p-3"
      data-testid="load-safety-reverse-safety-events"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">
          Safety Events
          {rows.length > 0 ? (
            <span className="ml-2 text-xs font-normal text-gray-600">
              ({rows.length})
            </span>
          ) : null}
        </h3>
        <EntityLink
          kind="safety_events_load"
          id={loadId}
          label="Open Safety Events"
          className="text-xs font-semibold text-slate-700 underline"
        />
      </div>
      {query.isLoading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : null}
      {query.isError ? (
        <ListErrorState status={0} message="Could not load safety events for this load." onRetry={() => void query.refetch()} />
      ) : null}
      {!query.isLoading && !query.isError && rows.length === 0 ? (
        <p className="text-sm text-gray-500">None linked to this load.</p>
      ) : null}
      {!query.isError && rows.length > 0 ? (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="text-sm text-slate-700"
              data-testid={`load-safety-event-${row.id}`}
            >
              <EntityLink
                kind="safety_event"
                id={row.id}
                label={entityLabel(row.title || null, row.id, "Safety event")}
                className="font-medium text-slate-900"
              />
              <span className="ml-2 inline-flex flex-wrap items-center gap-1 text-xs text-gray-500">
                {row.occurred_at
                  ? formatDateUS(String(row.occurred_at).slice(0, 10))
                  : "—"}
                {` · ${row.severity} · ${row.status}`}
                {row.subject_driver_id ? (
                  <>
                    <span>·</span>
                    <EntityLink
                      kind="driver"
                      id={s(row.subject_driver_id)}
                      label={entityLabel(
                        row.subject_driver_name,
                        row.subject_driver_id,
                        "Driver",
                      )}
                    />
                  </>
                ) : null}
                {row.subject_unit_id ? (
                  <>
                    <span>·</span>
                    <EntityLink
                      kind="unit"
                      id={s(row.subject_unit_id)}
                      label={entityLabel(
                        row.subject_unit_number,
                        row.subject_unit_id,
                        "Unit",
                      )}
                    />
                  </>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function LoadIncidentBlock({
  companyId,
  loadId,
  kind,
}: {
  companyId: string;
  loadId: string;
  kind: (typeof INCIDENT_KINDS)[number];
}) {
  const query = useQuery({
    queryKey: [
      "safety",
      "reverse",
      "incidents",
      kind.type,
      "load",
      companyId,
      loadId,
    ],
    queryFn: () =>
      listSafetyIncidents(companyId, kind.type, { load_id: loadId }),
    enabled: Boolean(companyId) && Boolean(loadId),
  });
  const rows: Row[] = query.data?.incidents ?? [];

  return (
    <div
      className="space-y-2 rounded-sm border border-gray-200 bg-white p-3"
      data-testid={`load-safety-reverse-${kind.type.replace(/_/g, "-")}`}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">
          {kind.title}
          {rows.length > 0 ? (
            <span className="ml-2 text-xs font-normal text-gray-600">
              ({rows.length})
            </span>
          ) : null}
        </h3>
        <EntityLink
          kind={kind.openKind}
          id={loadId}
          label={`Open ${kind.title}`}
          className="text-xs font-semibold text-slate-700 underline"
        />
      </div>
      {query.isLoading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : null}
      {query.isError ? (
        <ListErrorState status={0} message={`Could not load ${kind.title.toLowerCase()}.`} onRetry={() => void query.refetch()} />
      ) : null}
      {!query.isLoading && !query.isError && rows.length === 0 ? (
        <p className="text-sm text-gray-500">None linked to this load.</p>
      ) : null}
      {!query.isError && rows.length > 0 ? (
        <ul className="space-y-2">
          {rows.map((row) => {
            const id = s(row.id);
            return (
              <li key={id} className="text-sm text-slate-700">
                <EntityLink
                  kind={kind.type}
                  id={id}
                  label={entityLabel(
                    s(row.description) || s(row.location) || null,
                    id,
                    "Event",
                  )}
                />
                <span className="ml-2 text-xs text-gray-500">
                  {row.incident_at
                    ? formatDateUS(String(row.incident_at).slice(0, 10))
                    : "—"}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
