import { useQuery } from "@tanstack/react-query";
import { fetchHosDriverMapPreview, type DriverMapRow } from "../../api/telematics";
import { BackArrowHeader } from "../../components/layout/BackArrowHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";

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

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-sm border border-gray-200 bg-white px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-0.5 text-lg font-semibold text-gray-900">{value}</div>
      {sub && <div className="text-[11px] text-gray-400">{sub}</div>}
    </div>
  );
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
            <StatCard label="Our active drivers" value={d.our_active_drivers} />
            <StatCard label="Samsara roster" value={d.samsara_roster} />
            <StatCard label="High-confidence" value={d.counts.matched_high} sub="license or phone" />
            <StatCard label="Low-confidence" value={d.counts.matched_low} sub="name only" />
            <StatCard label="Unmatched" value={d.counts.unmatched} />
          </div>

          {/* Downstream diagnostics */}
          <div className="rounded-sm border border-gray-200 bg-white px-4 py-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Downstream — HOS clock pull diagnostics</div>
            <div className="grid gap-2 sm:grid-cols-4">
              <StatCard label="Active driver query" value={d.downstream.active_driver_query_count} sub="drivers matched by pull query" />
              <StatCard label="Open assignments" value={d.downstream.open_vehicle_driver_assignments} sub="telematics.vehicle_driver_assignments" />
              <StatCard label="Linked in integrations" value={d.downstream.linked_samsara_drivers} sub="samsara_drivers.local_driver_id" />
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
                {d.rows.map((row) => (
                  <tr key={row.local_driver_id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-900">{row.driver_name}</td>
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
