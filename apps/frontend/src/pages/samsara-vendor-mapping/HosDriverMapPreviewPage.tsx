import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchHosDriverMapPreview, type DriverMapRow } from "../../api/telematics";
import { BackArrowHeader } from "../../components/layout/BackArrowHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { DrillKpiCard } from "../../components/layout/DrillKpiCard";
import { entityLabel } from "../../lib/entity-label";
import { EntityLink } from "../../components/shared/EntityLink";

function ConfidencePill({ confidence }: { confidence: DriverMapRow["confidence"] }) {
  const cls =
    confidence === "high"
      ? "bg-emerald-100 text-emerald-800"
      : confidence === "low"
        ? "bg-yellow-100 text-yellow-800"
        : "bg-slate-100 text-slate-500";
  return <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${cls}`}>{confidence}</span>;
}

function BasisPill({ basis }: { basis: DriverMapRow["match_basis"] }) {
  if (!basis) return <span className="text-[11px] text-gray-400">—</span>;
  return <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">{basis}</span>;
}

/**
 * C8: a drill target is REQUIRED. The confidence counts filter the driver-map table below (that IS
 * the record set they count); the roster/driver counts open the driver list.
 */
type StatCardProps = { label: string; value: string | number | null; sub?: string } & (
  | { to: string; onClick?: never; unavailable?: never }
  | { onClick: () => void; to?: never; unavailable?: never }
  | { unavailable: string; to?: never; onClick?: never }
);

function StatCard(props: StatCardProps) {
  const { label, value, sub, to, onClick, unavailable } = props;
  if (to) return <DrillKpiCard size="md" label={label} value={value} hint={sub} to={to} />;
  if (unavailable) return <DrillKpiCard size="md" label={label} value={value} hint={sub} unavailable={unavailable} />;
  return <DrillKpiCard size="md" label={label} value={value} hint={sub} onClick={onClick!} />;
}

export function HosDriverMapPreviewPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const q = useQuery({
    queryKey: ["telematics", "hos-driver-map-preview", companyId],
    queryFn: () => fetchHosDriverMapPreview(companyId),
    enabled: Boolean(companyId),
    staleTime: 5 * 60 * 1000,
  });

  const d = q.data;
  // C8: the confidence KPIs drill into the table below — additive filter, all rows by default.
  const [confidenceFilter, setConfidenceFilter] = useState<DriverMapRow["confidence"] | null>(null);
  const visibleRows = (d?.rows ?? []).filter((row) => !confidenceFilter || row.confidence === confidenceFilter);

  return (
    <div className="space-y-4">
      <BackArrowHeader
        backTo="/samsara/vendor-mapping-integrity"
        breadcrumb={["Samsara", "Driver Map Preview"]}
        title="HOS Driver Map — Preview"
      />

      {!companyId ? (
        <p className="text-sm text-gray-600">Select an operating company.</p>
      ) : q.isLoading ? (
        <p className="text-sm text-gray-500">Loading preview from Samsara…</p>
      ) : q.isError ? (
        <p className="text-sm text-red-600">Could not load preview.</p>
      ) : d ? (
        <>
          {/* Summary stats */}
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard label="Our active drivers" value={d.our_active_drivers} to="/drivers" />
            <StatCard label="Samsara roster" value={d.samsara_roster} onClick={() => setConfidenceFilter(null)} />
            <StatCard
              label="High-confidence"
              value={d.counts.matched_high}
              sub="license or phone"
              onClick={() => setConfidenceFilter("high")}
            />
            <StatCard
              label="Low-confidence"
              value={d.counts.matched_low}
              sub="name only"
              onClick={() => setConfidenceFilter("low")}
            />
            <StatCard label="Unmatched" value={d.counts.unmatched} onClick={() => setConfidenceFilter("none")} />
          </div>

          {/* Downstream diagnostics */}
          <div className="rounded-sm border border-gray-200 bg-white px-4 py-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Downstream — HOS clock pull diagnostics</div>
            <div className="grid gap-2 sm:grid-cols-4">
              <StatCard label="Active driver query" value={d.downstream.active_driver_query_count} sub="drivers matched by pull query" to="/drivers" />
              <StatCard
                label="Open assignments"
                value={d.downstream.open_vehicle_driver_assignments}
                sub="telematics.vehicle_driver_assignments"
                unavailable="telematics.vehicle_driver_assignments has no list screen — this count is a pull diagnostic only."
              />
              <StatCard
                label="Linked in integrations"
                value={d.downstream.linked_samsara_drivers}
                sub="samsara_drivers.local_driver_id"
                to="/samsara/vendor-mapping-integrity"
              />
              <div className="rounded-sm border border-gray-200 bg-white px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-gray-500">Last HOS pull</div>
                {d.downstream.last_hos_clocks_pull ? (
                  <>
                    <div className={`mt-0.5 text-sm font-semibold ${d.downstream.last_hos_clocks_pull.success ? "text-emerald-700" : "text-red-600"}`}>
                      {d.downstream.last_hos_clocks_pull.success ? "Success" : "Failed"}
                    </div>
                    <div className="text-[11px] text-gray-500">{d.downstream.last_hos_clocks_pull.finished_at?.slice(0, 16)?.replace("T", " ")} UTC</div>
                    <div className="text-[11px] text-gray-500">{d.downstream.last_hos_clocks_pull.rows_added} rows added</div>
                    {d.downstream.last_hos_clocks_pull.error_message && (
                      <div className="mt-0.5 text-[11px] text-red-500">{d.downstream.last_hos_clocks_pull.error_message}</div>
                    )}
                  </>
                ) : (
                  <div className="mt-0.5 text-sm text-gray-400">No pull on record</div>
                )}
              </div>
            </div>
          </div>

          {/* ID reconcile */}
          <div className="rounded-sm border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700">Stored vs proposed ID reconciliation</div>
            <div className="flex flex-wrap gap-4 text-[12px] text-gray-700">
              <span><span className="font-semibold text-emerald-700">{d.id_reconcile.stored_matches_proposed}</span> stored = proposed</span>
              <span><span className="font-semibold text-red-600">{d.id_reconcile.stored_differs_from_proposed}</span> stored ≠ proposed</span>
              <span><span className="font-semibold text-amber-700">{d.id_reconcile.stored_but_no_roster_match}</span> stored but no roster match</span>
              <span><span className="font-semibold text-slate-500">{d.id_reconcile.both_null}</span> both null</span>
            </div>
            <p className="mt-2 text-[11px] text-amber-700">
              Write step requires Jorge approval. Review the table below, confirm the proposed IDs are correct, then request the approved-write migration.
            </p>
          </div>

          {/* Driver map table */}
          <div className="overflow-x-auto rounded-sm border border-gray-200 bg-white">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2 text-left">Driver</th>
                  <th className="px-3 py-2 text-left">CDL</th>
                  <th className="px-3 py-2 text-left">Confidence</th>
                  <th className="px-3 py-2 text-left">Basis</th>
                  <th className="px-3 py-2 text-left">Proposed Samsara ID</th>
                  <th className="px-3 py-2 text-left">Samsara Name</th>
                  <th className="px-3 py-2 text-left">Current stored ID</th>
                  <th className="px-3 py-2 text-center">Ambiguous</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.local_driver_id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-900">
                      <EntityLink kind="driver" id={row.local_driver_id} label={entityLabel(row.driver_name, row.local_driver_id, "Driver")} />
                    </td>
                    <td className="px-3 py-2 font-mono text-gray-600">{row.cdl_number ?? "—"}</td>
                    <td className="px-3 py-2"><ConfidencePill confidence={row.confidence} /></td>
                    <td className="px-3 py-2"><BasisPill basis={row.match_basis} /></td>
                    <td className="px-3 py-2 font-mono text-[11px] text-gray-700">
                      {row.proposed_samsara_driver_id ?? <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-3 py-2 text-gray-700">{row.samsara_name ?? <span className="text-gray-400">—</span>}</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-gray-500">
                      {row.current_samsara_driver_id ? (
                        <span className={row.current_samsara_driver_id === row.proposed_samsara_driver_id ? "text-emerald-700" : "text-amber-600"}>
                          {row.current_samsara_driver_id}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {row.ambiguous ? <span className="font-semibold text-red-500">!</span> : <span className="text-gray-300">·</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-gray-400">
            Generated {d.generated_at.replace("T", " ").slice(0, 16)} UTC · Read-only. Ambiguous (!) rows have multiple Samsara candidates and must be resolved manually.
          </p>
        </>
      ) : null}
    </div>
  );
}
