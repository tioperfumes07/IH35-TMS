import { useQuery } from "@tanstack/react-query";
import { listSafetyIncidents, type SafetyIncidentType } from "../../api/safety";
import { EntityLink } from "../shared/EntityLink";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";

function DriverIncidentKind({ companyId, driverId, kind, label, openKind }: { companyId: string; driverId: string; kind: SafetyIncidentType; label: string; openKind: "damage_reports_driver" | "trailer_interchanges_driver" | "cargo_claims_driver" }) {
  const query = useQuery({ queryKey: ["driver-incidents", companyId, driverId, kind], enabled: Boolean(companyId && driverId), queryFn: () => listSafetyIncidents(companyId, kind, { driver_id: driverId }) });
  return <div className="rounded-sm border border-gray-200 bg-white p-3"><div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold text-gray-800">{label}</h3><EntityLink kind={openKind} id={driverId} label={`Open ${label}`} className="text-xs font-semibold text-slate-700 underline" /></div>{query.isError ? <p className="mt-2 text-sm text-red-700">{label} could not be loaded.</p> : null}{query.isLoading ? <p className="mt-2 text-sm text-gray-500">Loading {label.toLowerCase()}…</p> : null}{!query.isLoading && !query.isError && (query.data?.incidents ?? []).length === 0 ? <p className="mt-2 text-sm text-gray-500">No {label.toLowerCase()} are linked to this driver.</p> : null}<div className="mt-2 space-y-2">{(query.data?.incidents ?? []).map((row, index) => <div key={row.id == null ? `${kind}-${index}` : String(row.id)} className="text-sm"><EntityLinkOrTombstone kind={kind} id={row.id == null ? null : String(row.id)} name={row.description} noun={label.slice(0, -1)} />{row.load_id ? <> · <EntityLinkOrTombstone kind="load" id={String(row.load_id)} name={row.load_number} noun="Load" /></> : null}</div>)}</div></div>;
}

const kinds: Array<{ kind: SafetyIncidentType; label: string; openKind: "damage_reports_driver" | "trailer_interchanges_driver" | "cargo_claims_driver" }> = [
  { kind: "damage_report", label: "Damage reports", openKind: "damage_reports_driver" },
  { kind: "trailer_interchange", label: "Trailer interchanges", openKind: "trailer_interchanges_driver" },
  { kind: "cargo_claim", label: "Cargo claims", openKind: "cargo_claims_driver" },
];

export function DriverIncidentsReverseSection({ operatingCompanyId, driverId }: { operatingCompanyId: string; driverId: string }) {
  return <div className="space-y-2">{kinds.map((item) => <DriverIncidentKind key={item.kind} companyId={operatingCompanyId} driverId={driverId} {...item} />)}</div>;
}
