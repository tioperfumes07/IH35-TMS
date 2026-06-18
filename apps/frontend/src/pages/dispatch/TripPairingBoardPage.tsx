import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { getTripPairingBoard, type TripLeg, type TripPairingUnitRow } from "../../api/dispatch";

const TRIP_COLOR: Record<"NB" | "TR" | "SB", string> = { NB: "#2563eb", TR: "#7c3aed", SB: "#16a34a" };

function legChip(leg: TripLeg) {
  const dest = [leg.delivery_city, leg.delivery_state].filter(Boolean).join(", ");
  return (
    <span key={leg.load_id} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold text-white" style={{ backgroundColor: TRIP_COLOR[leg.trip_type] }}>
      {leg.trip_type}{dest ? ` · ${dest}` : ""}
    </span>
  );
}

function Kpi({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded border border-slate-200 bg-white px-3 py-1.5 text-center">
      <div className="text-base font-bold" style={accent ? { color: accent } : undefined}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

export function TripPairingBoardPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [search, setSearch] = useState("");

  const query = useQuery({
    queryKey: ["trip-pairing-board", companyId],
    queryFn: () => getTripPairingBoard(companyId),
    enabled: Boolean(companyId),
    staleTime: 30_000,
    refetchInterval: 5 * 60 * 1000,
  });

  const data = query.data;
  const q = search.trim().toLowerCase();
  const matches = (r: { unit_number: string | null; driver_name?: string | null }) =>
    !q || (r.unit_number ?? "").toLowerCase().includes(q) || (r.driver_name ?? "").toLowerCase().includes(q);
  const unbooked = (data?.unbooked ?? []).filter(matches);
  const tours = (data?.tours ?? []).filter(matches);

  return (
    <div>
      <PageHeader title="Trip Pairing Board" subtitle="Northbound · Triangulation(s) · Southbound — settlement closes on return to Laredo." />

      {data ? (
        <div className="mb-3 grid grid-cols-3 gap-2 md:grid-cols-6">
          <Kpi label="Active trucks" value={data.kpis.active_trucks} />
          <Kpi label="Northbound" value={data.kpis.northbound} accent={TRIP_COLOR.NB} />
          <Kpi label="NB unbooked" value={data.kpis.nb_unbooked} />
          <Kpi label="Southbound" value={data.kpis.southbound} accent={TRIP_COLOR.SB} />
          <Kpi label="SB unbooked" value={data.kpis.sb_unbooked} accent="#b45309" />
          <Kpi label="Up north 30d+" value={data.kpis.up_north_30d} accent="#b45309" />
        </div>
      ) : null}

      <input
        className="mb-3 h-9 w-56 rounded border border-slate-300 px-2 text-sm print:hidden"
        placeholder="Search unit or driver…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {query.isLoading ? (
        <div className="px-3 py-6 text-sm text-slate-500">Loading board…</div>
      ) : query.isError ? (
        <div className="px-3 py-6 text-sm text-red-600">Failed to load the board.</div>
      ) : (
        <div className="space-y-4">
          {/* Zone 1 — Unbooked / available */}
          <section>
            <div className="mb-1 text-xs font-semibold text-slate-700">Unbooked / available · {unbooked.length} units <span className="font-normal text-slate-500">— no trip assigned; book a Northbound to start a tour</span></div>
            <div className="flex flex-wrap gap-2">
              {unbooked.map((u) => (
                <div key={u.unit_id} className="flex items-center gap-2 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs">
                  <span className="font-semibold">{u.unit_number ?? "—"}</span>
                  <span className="text-slate-500">{u.driver_name ?? "no driver"}</span>
                </div>
              ))}
              {unbooked.length === 0 ? <span className="text-xs text-slate-400">None.</span> : null}
            </div>
          </section>

          {/* Zone 2 — Assigned trips */}
          <section>
            <div className="mb-1 text-xs font-semibold text-slate-700">Assigned trips · {tours.length} units <span className="font-normal text-slate-500">— multi-leg tours stack under the unit; SB return = settlement closes</span></div>
            <div className="overflow-x-auto rounded border border-slate-200 bg-white">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-2 py-2">Unit</th>
                    <th className="px-2 py-2">Driver</th>
                    <th className="px-2 py-2">▲ Northbound / Triangulation (out)</th>
                    <th className="px-2 py-2">▼ Southbound (return)</th>
                    <th className="px-2 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {tours.map((t: TripPairingUnitRow) => {
                    const outbound = t.legs.filter((l) => l.trip_type === "NB" || l.trip_type === "TR");
                    const sb = t.legs.find((l) => l.trip_type === "SB") ?? null;
                    return (
                      <tr key={t.unit_id} className="border-t border-slate-100 align-top hover:bg-slate-50">
                        <td className="px-2 py-1.5 font-medium">{t.unit_number ?? "—"}</td>
                        <td className="px-2 py-1.5">{t.driver_name ?? "—"}</td>
                        <td className="px-2 py-1.5">
                          <div className="flex flex-col gap-1">
                            {outbound.map((l, i) => (
                              <span key={l.load_id} className="flex items-center gap-1">
                                {i > 0 ? <span className="text-slate-400">↳ leg {i + 1}</span> : null}
                                {legChip(l)}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-2 py-1.5">
                          {sb ? (
                            legChip(sb)
                          ) : t.open_return ? (
                            <span className="inline-flex items-center rounded border border-dashed border-sky-400 bg-sky-50 px-1.5 py-0.5 text-[11px] text-sky-700">
                              + Find Southbound{t.return_city ? ` · empty in ${t.return_city}` : ""}{t.return_avail_date ? ` · avail ${new Date(t.return_avail_date).toLocaleDateString()}` : ""}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          {t.settlement_signal === "round_trip" ? (
                            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">Round trip</span>
                          ) : t.settlement_signal === "settlement_open" ? (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                              Up north · settlement open{t.up_north_days != null ? ` · ${t.up_north_days}d` : ""}
                            </span>
                          ) : (
                            <span className="text-slate-400">{t.status ?? "—"}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {tours.length === 0 ? (
                    <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">No assigned trips.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <p className="text-[11px] text-slate-400">
            <Link to="/dispatch" className="text-sky-700 hover:underline">← Dispatch</Link> · refreshes every 5 min · DAT360 auto-publish not yet wired (the delivery-city + avail-date here feed it later).
          </p>
        </div>
      )}
    </div>
  );
}
