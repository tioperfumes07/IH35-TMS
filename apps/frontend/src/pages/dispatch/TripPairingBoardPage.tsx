import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader";
import { DrillKpiCard } from "../../components/layout/DrillKpiCard";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { getTripPairingBoard, type TripLeg, type TripPairingUnitRow } from "../../api/dispatch";
import { BookLoadModalV4 } from "./components/BookLoadModalV4";
import { EntityLink } from "../../components/shared/EntityLink";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { userFacingApiError } from "../../lib/api-error-message";
import { companyToday } from "../../lib/businessDate";

// §7 navy ruling (Jorge 2026-06-23): NB/TR/SB render in the navy family — no blue/purple/green pills.
// Three distinguishable navy-family shades replace the old SB green (#16a34a) and any blue/purple.
const TRIP_COLOR: Record<"NB" | "TR" | "SB", string> = { NB: "#1F2A44", TR: "#64748b", SB: "#334155" };

type Segment = "All" | "NB" | "TR" | "SB" | "open" | "upnorth";
const SEGMENTS: { key: Segment; label: string }[] = [
  { key: "All", label: "All" },
  { key: "NB", label: "NB" },
  { key: "TR", label: "TR" },
  { key: "SB", label: "SB" },
  { key: "open", label: "Open returns" },
  { key: "upnorth", label: "Up north 30d+" },
];

// C5 (L5) — every leg chip already carried `leg.load_id` and rendered as an inert <span>: the
// board showed you the tour but gave you no way into any of its loads. The chip keeps its exact
// §7 navy pill chrome and becomes the canonical drill-through.
function legChip(leg: TripLeg) {
  const dest = [leg.delivery_city, leg.delivery_state].filter(Boolean).join(", ");
  return (
    <EntityLink
      key={leg.load_id}
      kind="load"
      id={leg.load_id}
      className="inline-flex hover:underline"
      label={
        <span
          className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] font-semibold text-white"
          style={{ backgroundColor: TRIP_COLOR[leg.trip_type] }}
        >
          {leg.trip_type}
          {dest ? ` · ${dest}` : ""}
        </span>
      }
    />
  );
}

function LegendSwatch({ color, dashed, label }: { color?: string; dashed?: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-600">
      <span
        className="inline-block h-3 w-3 rounded-xs"
        style={dashed ? { border: "1px dashed #94a3b8", background: "#f1f5f9" } : { backgroundColor: color }}
      />
      {label}
    </span>
  );
}

export function TripPairingBoardPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState<Segment>("All");
  // C1a "+ Book NB" shell — opens the Book Load wizard prefilled with the unit.
  const [bookUnitId, setBookUnitId] = useState<string | null>(null);

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

  const tourInSegment = (t: TripPairingUnitRow) => {
    switch (segment) {
      case "All": return true;
      case "NB": return t.legs.some((l) => l.trip_type === "NB");
      case "TR": return t.legs.some((l) => l.trip_type === "TR");
      case "SB": return t.has_sb;
      case "open": return t.open_return;
      case "upnorth": return (t.up_north_days ?? 0) >= 30;
      default: return true;
    }
  };

  // Unbooked units are NB-booking candidates → show them for the All + NB segments only.
  const showUnbooked = segment === "All" || segment === "NB";
  const unbooked = showUnbooked ? (data?.unbooked ?? []).filter(matches) : [];
  const tours = (data?.tours ?? []).filter(matches).filter(tourInSegment);

  if (!companyId) {
    return (
      <div
        data-testid="dispatch-trip-pairing-need-company"
        className="rounded-sm border bg-white p-4 text-sm text-slate-600"
      >
        Select an operating company to load the trip pairing board.
      </div>
    );
  }

  // Real client-side CSV export of exactly what's on the board (respects the active segment + search).
  // Mirrors the Blob-download pattern used by DispatchBoard's "Export CSV".
  const legsText = (row: TripPairingUnitRow, type: "NB" | "TR" | "SB") =>
    row.legs
      .filter((l) => l.trip_type === type)
      .map((l) => [l.trip_type, [l.delivery_city, l.delivery_state].filter(Boolean).join(", ")].filter(Boolean).join(" · "))
      .join(" | ");
  const exportCsv = () => {
    const headers = ["row_type", "unit", "driver", "northbound", "triangulation", "southbound", "status"];
    const bodyRows: string[][] = [
      ...unbooked.map((u) => ["unbooked", u.unit_number ?? "", u.driver_name ?? "", "", "", "", "available"]),
      ...tours.map((t) => [
        "assigned",
        t.unit_number ?? "",
        t.driver_name ?? "",
        legsText(t, "NB"),
        legsText(t, "TR"),
        legsText(t, "SB") || (t.open_return ? "open return" : ""),
        t.settlement_signal ?? t.status ?? "",
      ]),
    ];
    const csv = [headers, ...bodyRows]
      .map((row) => row.map((item) => `"${String(item).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `trip-pairing-board-${companyToday()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div data-testid="dispatch-trip-pairing-page">
      <PageHeader title="Trip Pairing Board" subtitle="Northbound · Triangulation(s) · Southbound — settlement closes on return to Laredo." />

      {data ? (
        <div className="mb-3 grid grid-cols-3 gap-2 md:grid-cols-6">
          {/* C8: each KPI selects the board segment holding the rows it counted — the board below IS
              the drill target, so a click filters instead of navigating away. */}
          <DrillKpiCard label="Active trucks" value={data.kpis.active_trucks} onClick={() => setSegment("All")} active={segment === "All"} />
          <DrillKpiCard label="Northbound" value={data.kpis.northbound} accent={TRIP_COLOR.NB} onClick={() => setSegment("NB")} active={segment === "NB"} />
          <DrillKpiCard label="NB unbooked" value={data.kpis.nb_unbooked} onClick={() => setSegment("NB")} active={segment === "NB"} />
          <DrillKpiCard label="Southbound" value={data.kpis.southbound} accent={TRIP_COLOR.SB} onClick={() => setSegment("SB")} active={segment === "SB"} />
          <DrillKpiCard label="SB unbooked" value={data.kpis.sb_unbooked} onClick={() => setSegment("open")} active={segment === "open"} />
          <DrillKpiCard label="Up north 30d+" value={data.kpis.up_north_30d} onClick={() => setSegment("upnorth")} active={segment === "upnorth"} />
        </div>
      ) : null}

      {/* Bespoke trip-pairing toolbar (GUARD ruling: NOT FilterBar — wrong filter model). 6-segment toggle
          + trailer-type dropdown (disabled until C1b adds trailer_type to the board payload) + search + CSV export. */}
      <div className="mb-3 flex flex-wrap items-center gap-2 print:hidden">
        <div className="inline-flex overflow-hidden rounded-sm border border-slate-300">
          {SEGMENTS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSegment(s.key)}
              className={`border-l border-slate-300 px-2.5 py-1 text-[11px] font-semibold first:border-l-0 ${
                segment === s.key ? "bg-[#1F2A44] text-white" : "bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <select
          disabled
          title="Trailer-type filtering lights up once trailer_type is on the board payload (C1b backend)."
          className="h-9 rounded-sm border border-slate-300 bg-slate-50 px-2 text-[12px] text-slate-400"
        >
          <option>All trailer types</option>
          <option>Reefer</option>
          <option>Dry Van</option>
          <option>Flatbed</option>
        </select>
        <input
          className="h-9 w-56 rounded-sm border border-slate-300 px-2 text-sm"
          placeholder="Search unit or driver…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          type="button"
          onClick={exportCsv}
          disabled={!data || (tours.length === 0 && unbooked.length === 0)}
          title="Download the visible board rows (current segment + search) as CSV"
          className="ml-auto h-9 rounded-sm border border-slate-300 bg-white px-2.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Export CSV
        </button>
      </div>

      {query.isLoading ? (
        <div className="px-3 py-6 text-sm text-slate-500">Loading board…</div>
      ) : query.isError ? (
        <ListErrorBanner
          message={userFacingApiError(query.error, "Could not load trip pairing board")}
          onRetry={() => void query.refetch()}
        />
      ) : tours.length === 0 && unbooked.length === 0 ? (
        <div
          data-testid="dispatch-trip-pairing-honest-empty"
          className="rounded-sm border bg-white px-3 py-6 text-center text-sm text-slate-500"
        >
          No tours or unbooked units for this company on the trip pairing board. Assign units/drivers
          and book northbound loads — rows appear once the board feed returns tours or an unbooked pool.
        </div>
      ) : (
        <div className="space-y-4">
          {/* Zone 1 — Unbooked / available pool (navy-family per §7; "+ Book NB" cards). */}
          {showUnbooked ? (
            <section>
              <div className="mb-1 flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.4px] text-slate-700">Unbooked / available</span>
                <span className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700">{unbooked.length}</span>
                <span className="text-[11px] text-slate-500">— no trip assigned; book a Northbound to start a tour</span>
              </div>
              <div className="flex flex-wrap gap-2 rounded-sm border border-slate-200 bg-slate-50 p-2">
                {unbooked.map((u) => (
                  <div key={u.unit_id} className="flex min-w-[180px] flex-col gap-1 rounded-sm border border-slate-200 bg-white px-2.5 py-2 text-xs">
                    <EntityLinkOrTombstone kind="unit" id={u.unit_id} name={u.unit_number} noun="Unit" className="font-semibold text-slate-800" />
                    <span className="text-slate-500"><EntityLinkOrTombstone kind="driver" id={u.driver_id} name={u.driver_name} noun="Driver" /></span>
                    {/* C1b: live location ("now: <city>") arrives with the backend payload — not fabricated. */}
                    <span className="text-[10px] text-slate-400">now: —</span>
                    <button
                      type="button"
                      onClick={() => setBookUnitId(u.unit_id)}
                      className="mt-0.5 inline-flex w-fit items-center rounded-sm bg-[#1F2A44] px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-[#0f1729]"
                    >
                      + Book NB
                    </button>
                  </div>
                ))}
                {unbooked.length === 0 ? <span className="px-1 text-xs text-slate-400">None.</span> : null}
              </div>
            </section>
          ) : null}

          {/* Zone 2 — Assigned trips (Northbound / Triangulation / Southbound = 6 columns). */}
          <section>
            <div className="mb-1 flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.4px] text-slate-800">Assigned trips</span>
              <span className="rounded-sm border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700">{tours.length}</span>
              <span className="text-[11px] text-slate-500">— multi-leg tours stack under the unit; SB return = settlement closes</span>
            </div>
            <div className="overflow-x-auto rounded-sm border border-slate-200 bg-white">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-2 py-2">Unit</th>
                    <th className="px-2 py-2">Driver</th>
                    <th className="px-2 py-2">▲ Northbound (out)</th>
                    <th className="px-2 py-2">▶ Triangulation(s)</th>
                    <th className="px-2 py-2">▼ Southbound (return)</th>
                    <th className="px-2 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {tours.map((t: TripPairingUnitRow) => {
                    const nbLegs = t.legs.filter((l) => l.trip_type === "NB");
                    const trLegs = t.legs.filter((l) => l.trip_type === "TR");
                    const sb = t.legs.find((l) => l.trip_type === "SB") ?? null;
                    return (
                      <tr key={t.unit_id} className="border-t border-slate-100 align-top hover:bg-slate-50">
                        <td className="px-2 py-1.5 font-medium">
                          <EntityLinkOrTombstone kind="unit" id={t.unit_id} name={t.unit_number} noun="Unit" />
                        </td>
                        <td className="px-2 py-1.5">
                          <EntityLinkOrTombstone kind="driver" id={t.driver_id} name={t.driver_name} noun="Driver" />
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="flex flex-col gap-1">
                            {nbLegs.map((l) => legChip(l))}
                            {nbLegs.length === 0 ? <span className="text-slate-400">—</span> : null}
                          </div>
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="flex flex-col gap-1">
                            {trLegs.map((l, i) => (
                              <span key={l.load_id} className="flex items-center gap-1">
                                {i > 0 ? <span className="text-slate-400">↳ leg {i + 1}</span> : null}
                                {legChip(l)}
                              </span>
                            ))}
                            {trLegs.length === 0 ? <span className="text-slate-400">—</span> : null}
                          </div>
                        </td>
                        <td className="px-2 py-1.5">
                          {sb ? (
                            legChip(sb)
                          ) : t.open_return ? (
                            <button
                              type="button"
                              onClick={() => setBookUnitId(t.unit_id)}
                              className="inline-flex items-center rounded-sm border border-dashed border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700 hover:border-slate-500 hover:bg-slate-200"
                              aria-label={`Book Southbound return for ${t.unit_number ?? "unit"}`}
                            >
                              + Find Southbound{t.return_city ? ` · empty in ${t.return_city}` : ""}{t.return_avail_date ? ` · avail ${new Date(t.return_avail_date).toLocaleDateString()}` : ""}
                            </button>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          {t.settlement_signal === "round_trip" ? (
                            <span className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">Round trip</span>
                          ) : t.settlement_signal === "settlement_open" ? (
                            <span className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
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
                    <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">No assigned trips.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          {/* Legend — five states (NB/TR/SB navy-family per §7; open-return dashed; settlement-open amber). */}
          <div className="flex flex-wrap items-center gap-4 rounded-sm border border-slate-200 bg-white px-3 py-2">
            <LegendSwatch color={TRIP_COLOR.NB} label="NB Northbound" />
            <LegendSwatch color={TRIP_COLOR.TR} label="TR Triangulation" />
            <LegendSwatch color={TRIP_COLOR.SB} label="SB Southbound return" />
            <LegendSwatch dashed label="Open return" />
            <LegendSwatch color="#b45309" label="Up north — settlement open" />
          </div>

          <p className="text-[11px] text-slate-400">
            <Link to="/dispatch" className="text-slate-700 hover:underline">← Dispatch</Link> · refreshes every 5 min · DAT360 auto-publish not yet wired (the delivery-city + avail-date here feed it later).
          </p>
        </div>
      )}

      {bookUnitId && companyId ? (
        <BookLoadModalV4
          open={Boolean(bookUnitId)}
          operatingCompanyId={companyId}
          prefillUnitId={bookUnitId}
          prefillDriverId={
            unbooked.find((u) => u.unit_id === bookUnitId)?.driver_id ??
            tours.find((tour) => tour.unit_id === bookUnitId)?.driver_id ??
            null
          }
          onClose={() => setBookUnitId(null)}
          onCreated={() => {
            setBookUnitId(null);
            void query.refetch();
          }}
        />
      ) : null}
    </div>
  );
}
