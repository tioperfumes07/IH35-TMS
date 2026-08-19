import { useQuery } from "@tanstack/react-query";
import { listSafetyIncidents } from "../../api/safety";
import { EntityLink } from "../shared/EntityLink";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";
import { entityLabel } from "../../lib/entity-label";

export function CustomerCargoClaimsReverseSection({ operatingCompanyId, customerId }: { operatingCompanyId: string; customerId: string }) {
  const query = useQuery({ queryKey: ["cargo-claims", operatingCompanyId, "customer", customerId], enabled: Boolean(operatingCompanyId && customerId), queryFn: () => listSafetyIncidents(operatingCompanyId, "cargo_claim", { claimant_customer_id: customerId }) });
  return <section className="rounded-sm border border-gray-200 bg-white p-3"><h3 className="text-sm font-semibold text-gray-800">Cargo claims</h3>{query.isError ? <p className="mt-2 text-sm text-red-700">Cargo claims could not be loaded.</p> : null}{query.isLoading ? <p className="mt-2 text-sm text-gray-500">Loading cargo claims…</p> : null}{!query.isLoading && !query.isError && (query.data?.incidents ?? []).length === 0 ? <p className="mt-2 text-sm text-gray-500">No cargo claims are linked to this customer.</p> : null}<div className="mt-2 space-y-2">{(query.data?.incidents ?? []).map((row) => <div key={String(row.id)} className="text-sm"><EntityLinkOrTombstone kind="cargo_claim" id={row.id == null ? null : String(row.id)} name={row.claim_reason_code ?? row.description} noun="Cargo claim" />{row.load_id ? <> · <EntityLink kind="load" id={String(row.load_id)} label={entityLabel(row.load_number, row.load_id, "Load")} /></> : null}</div>)}</div></section>;
}
