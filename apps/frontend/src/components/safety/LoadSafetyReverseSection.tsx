import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  getSafetyAccidents,
  listSafetyIncidents,
  type SafetyIncidentType,
} from "../../api/safety";
import { formatDateUS } from "../../lib/formatDate";
import { EntityLink } from "../shared/EntityLink";

/**
 * SAF-C01 — REVERSE load↔safety. Accident reports and incidents already store load_id;
 * LoadDetailDrawer showed Insurance reverse but no Safety, so a trip looked clean while
 * accidents/cargo claims sat only on Safety screens. Filter server-side (LIMIT caps).
 */

type Row = Record<string, unknown>;
const s = (value: unknown): string => (value == null ? "" : String(value));

const INCIDENT_KINDS: { type: SafetyIncidentType; title: string; route: string }[] = [
  { type: "damage_report", title: "Damage Reports", route: "/safety/damage-reports" },
  { type: "trailer_interchange", title: "Trailer Interchanges", route: "/safety/trailer-interchanges" },
  { type: "cargo_claim", title: "Cargo Claims", route: "/safety/cargo-claims" },
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
  const accidentsQ = useQuery({
    queryKey: ["safety", "reverse", "accidents", "load", operatingCompanyId, loadId],
    queryFn: () => getSafetyAccidents(operatingCompanyId, { load_id: loadId }),
    enabled: Boolean(operatingCompanyId) && Boolean(loadId),
  });
  const accidents: Row[] = accidentsQ.data?.accidents ?? [];

  return (
    <div className="space-y-3" data-testid={testId}>
      <div className="text-xs font-semibold text-gray-600">Safety records on this load</div>

      <div className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid="load-safety-reverse-accidents">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">
            Accidents
            {accidents.length > 0 ? (
              <span className="ml-2 text-xs font-normal text-gray-600">({accidents.length})</span>
            ) : null}
          </h3>
          <Link className="text-xs font-semibold text-slate-700 underline" to="/safety/accidents">
            Open Accidents
          </Link>
        </div>
        {accidentsQ.isLoading ? <p className="text-sm text-gray-500">Loading…</p> : null}
        {accidentsQ.isError ? (
          <p className="text-sm text-red-600">Could not load accidents for this load.</p>
        ) : null}
        {!accidentsQ.isLoading && !accidentsQ.isError && accidents.length === 0 ? (
          <p className="text-sm text-gray-500">No accident reports linked to this load.</p>
        ) : null}
        {accidents.length > 0 ? (
          <ul className="space-y-2">
            {accidents.map((row) => {
              const id = s(row.id);
              const when = row.accident_at ?? row.report_date;
              return (
                <li key={id} className="text-sm text-slate-700" data-testid={`load-safety-accident-${id}`}>
                  <EntityLink kind="accident" id={id} label={s(row.description) || `Accident ${id.slice(0, 8)}`} />
                  <span className="ml-2 text-xs text-gray-500">
                    {when ? formatDateUS(String(when).slice(0, 10)) : "—"}
                    {row.driver_name ? ` · ${s(row.driver_name)}` : ""}
                    {row.unit_number ? ` · ${s(row.unit_number)}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

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
    queryKey: ["safety", "reverse", "incidents", kind.type, "load", companyId, loadId],
    queryFn: () => listSafetyIncidents(companyId, kind.type, { load_id: loadId }),
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
          {rows.length > 0 ? <span className="ml-2 text-xs font-normal text-gray-600">({rows.length})</span> : null}
        </h3>
        <Link className="text-xs font-semibold text-slate-700 underline" to={kind.route}>
          Open {kind.title}
        </Link>
      </div>
      {query.isLoading ? <p className="text-sm text-gray-500">Loading…</p> : null}
      {query.isError ? <p className="text-sm text-red-600">Could not load {kind.title.toLowerCase()}.</p> : null}
      {!query.isLoading && !query.isError && rows.length === 0 ? (
        <p className="text-sm text-gray-500">None linked to this load.</p>
      ) : null}
      {rows.length > 0 ? (
        <ul className="space-y-2">
          {rows.map((row) => {
            const id = s(row.id);
            return (
              <li key={id} className="text-sm text-slate-700">
                <EntityLink
                  kind={kind.type}
                  id={id}
                  label={s(row.description) || s(row.location) || id.slice(0, 8)}
                />
                <span className="ml-2 text-xs text-gray-500">
                  {row.incident_at ? formatDateUS(String(row.incident_at).slice(0, 10)) : "—"}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
