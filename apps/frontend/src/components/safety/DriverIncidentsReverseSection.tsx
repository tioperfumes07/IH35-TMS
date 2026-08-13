import { useQuery } from "@tanstack/react-query";
import { listSafetyIncidents, type SafetyIncidentType } from "../../api/safety";
import { EntityLink } from "../shared/EntityLink";

const kinds: Array<{ kind: SafetyIncidentType; label: string }> = [
  { kind: "damage_report", label: "Damage reports" },
  { kind: "trailer_interchange", label: "Trailer interchanges" },
  { kind: "cargo_claim", label: "Cargo claims" },
];

function DriverIncidentKind({ companyId, driverId, kind, label }: { companyId: string; driverId: string; kind: SafetyIncidentType; label: string }) {
  const query = useQuery({ queryKey: ["driver-incidents", companyId, driverId, kind], enabled: Boolean(companyId && driverId), queryFn: () => listSafetyIncidents(companyId, kind, { driver_id: driverId }) });
  return <div className="rounded-sm border border-gray-200 bg-white p-3"><h3 className="text-sm font-semibold text-gray-800">{label}</h3>{query.isError ? <p className="mt-2 text-sm text-red-700">{label} could not be loaded.</p> : null}{query.isLoading ? <p className="mt-2 text-sm text-gray-500">Loading {label.toLowerCase()}…</p> : null}{!query.isLoading && !query.isError && (query.data?.incidents ?? []).length === 0 ? <p className="mt-2 text-sm text-gray-500">No {label.toLowerCase()} are linked to this driver.</p> : null}<div className="mt-2 space-y-2">{(query.data?.incidents ?? []).map((row) => <div key={String(row.id)} className="text-sm"><EntityLink kind={kind} id={String(row.id)} label={String(row.description || label.slice(0, -1))} />{row.load_id ? <> · <EntityLink kind="load" id={String(row.load_id)} label={String(row.load_number || "Load")} /></> : null}</div>)}</div></div>;
}

export function DriverIncidentsReverseSection({ operatingCompanyId, driverId }: { operatingCompanyId: string; driverId: string }) {
  return <div className="space-y-2">{kinds.map((item) => <DriverIncidentKind key={item.kind} companyId={operatingCompanyId} driverId={driverId} {...item} />)}</div>;
}
