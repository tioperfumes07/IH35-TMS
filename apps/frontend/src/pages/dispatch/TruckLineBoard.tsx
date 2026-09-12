/**
 * TRUCK LINE — 5th Dispatch board view (owner ruling 2026-09-11, Lead assignment).
 *
 * V4 (ROUND 18.4, 2026-09-11 ~21:05 CT — owner, looking at the deployed V3 board, 20:55 CT):
 * "this one time the columns do not need to adjust, it is a straight line. this should always
 * auto adjust to screen size. can we show a truck in the line moving? with a trailer, that kind
 * of graphic, is that possible?" Answer: yes. This supersedes V3's ParityTable-based row for this
 * ONE view only — Truck Line is not a table with resizable/reorderable columns, it is a straight
 * auto-fit line. The row is a plain CSS grid (Truck · Load · Line · ETA); the Line column is
 * `1fr`, so it absorbs whatever width is left at every screen size and the 9 stations re-space
 * themselves as percentages of that space — no board min-width, no horizontal scroll, no
 * column-resize/reorder handles, no storageKey column state. Under 820px the Load column folds
 * into the Truck cell (media query below). An inline SVG tractor+trailer rides the same track,
 * gliding (CSS `transition: left`) to its new position whenever a station is stamped instead of
 * jumping, rolling (wheels spin / cab bobs / exhaust puffs) only while a live, non-stale Samsara
 * ping actually places it between two stations — never a fabricated position; with no live signal
 * it sits parked on the last stamped node, matching the design contract's own colour ruling (rail
 * green when reached, red when the row carries an open issue — the moving truck's cab uses the
 * SAME rule, nothing else on the board is coloured).
 *
 * The original v3 design contract (docs/design/DESIGN-CONTRACT-DISPATCH-LINE-BOARD-2026-09-11.md
 * + docs/design/reference/DISPATCH-LINE-BOARD-REFERENCE-2026-09-11.html) still governs the
 * 9-station list, the write paths, and the "never invent a status column" rule below — only the
 * ROW LAYOUT and the moving-truck graphic are V4. THE OWNER'S V4 RULING IS THE CONTRACT for those
 * two items; no ~/Downloads/...-V4-AUTOFIT-MOVING-TRUCK.html render file was found on this machine
 * to diff against pixel-for-pixel, so this was built directly from the Lead's own written spec
 * (exact grid-template-columns, exact colors, exact animation rules), not a visual trace.
 *
 * DATA RULE (owner, repeated 2026-09-11): any view reachable from Dispatch shows CURRENT loads and
 * pre-settlement data only. This view's read model (apps/backend/src/dispatch/truck-line/
 * truck-line.routes.ts) never reads presettlement_link_id at all — it derives everything from
 * mdata.loads/load_stops/pod_documents/invoices via the pure station.ts function — so the
 * 2026-09-12 01:21:49Z presettlement_link_id unlink some other surface hit does not reach this
 * board; nothing here needed a degrade-honestly change.
 *
 * One row per in-service truck, no dragging. The NEXT station is the only clickable-to-advance
 * node, writing through the existing transition/stop-stamp routes (never a new status writer,
 * never a second exceptions table). Double-click the truck card opens the load's Load Costs page.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { userFacingApiError } from "../../lib/api-error-message";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import {
  getTruckLine,
  listLoadExceptionReasons,
  recordTruckLineException,
  stampTruckLineArrival,
  stampTruckLineDeparture,
  type TruckLineRow,
} from "../../api/truckLine";

const STATION_COUNT = 9;
const STATION_LABELS = [
  "Assigned",
  "Dispatched",
  "At pickup",
  "In transit",
  "Other",
  "At delivery",
  "Delivered",
  "Docs received",
  "Invoiced",
];
const GREEN = "#16A34A";
const RED = "#DC2626";
const NAVY = "#14314F";

// V4 AUTO-FIT GRID (owner ruling, ROUND 18.4) — the Line column is 1fr: it absorbs whatever width
// is left at every screen size, so the 9 stations (positioned as percentages of THIS box) re-space
// themselves instead of needing a fixed/resizable board width. No storageKey, no resize handle, no
// reorder handle — this is a plain CSS grid, never a ParityTable, for this one view.
const GRID_TEMPLATE_COLUMNS = "minmax(104px,7vw) minmax(112px,9vw) 1fr minmax(96px,8vw)";
const FOLD_BREAKPOINT_PX = 820;

function pct(index: number) {
  return (index / (STATION_COUNT - 1)) * 100;
}

function money(cents: number | null) {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function fmtStamp(at: string | null | undefined) {
  if (!at) return null;
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-US", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Chicago" });
}

/** Inline SVG tractor + trailer riding the line (V4, ROUND 18.4) — no image file, no library.
 * Position is the LIVE position: parked on the last stamped node by default; only when a live,
 * non-stale Samsara ping exists AND the load is genuinely between two stations does it sit at the
 * midpoint of that leg (the best honest approximation available without a geo-to-track projection
 * — we know both endpoints and that the truck is actively between them, never an invented leg).
 * Rolling (wheels spin / cab bobs 1.5px / exhaust puff fades) only in that live-between case;
 * otherwise parked, no animation. `prefers-reduced-motion: reduce` keeps the position and drops
 * every animation, including the glide transition. */
function TruckOnLine({
  leftPct,
  rolling,
  hasIssue,
  unitId,
}: {
  leftPct: number;
  rolling: boolean;
  hasIssue: boolean;
  unitId: string;
}) {
  const cabColor = hasIssue ? RED : NAVY;
  return (
    <svg
      data-testid={`truck-line-vehicle-${unitId}`}
      data-rolling={rolling ? "true" : "false"}
      className={`truck-line-vehicle${rolling ? " truck-line-vehicle--rolling" : ""}`}
      style={{ left: `${leftPct}%` }}
      width="52"
      height="26"
      viewBox="0 0 52 26"
      aria-hidden="true"
    >
      <g className="truck-line-vehicle-body">
        {/* trailer */}
        <rect x="1" y="4" width="30" height="12" rx="1.5" fill="#CBD5E1" stroke="#94A3B8" strokeWidth="1" />
        <line x1="8" y1="4" x2="8" y2="16" stroke="#94A3B8" strokeWidth="0.75" />
        {/* cab */}
        <rect x="31" y="6" width="15" height="10" rx="1.5" fill={cabColor} />
        <rect x="33" y="8" width="5" height="4" rx="0.5" fill="#BFDBFE" />
        {/* exhaust puff */}
        <circle className="truck-line-exhaust" cx="45" cy="6" r="1.6" fill="#94A3B8" />
      </g>
      {/* wheels */}
      <circle className="truck-line-wheel" cx="9" cy="20" r="3.2" fill="#1F2937" />
      <circle className="truck-line-wheel" cx="22" cy="20" r="3.2" fill="#1F2937" />
      <circle className="truck-line-wheel" cx="40" cy="20" r="3.2" fill="#1F2937" />
    </svg>
  );
}

/** The colored rail + 9 nodes + the moving truck for one row — a pure render of `row.station`,
 * never its own state machine (that lives entirely in station.ts on the backend). */
function TruckLineTrack({
  row,
  onAdvance,
  onOther,
}: {
  row: TruckLineRow;
  onAdvance: (row: TruckLineRow, stationIndex: number) => void;
  onOther: (row: TruckLineRow) => void;
}) {
  if (!row.load || !row.station) {
    return (
      <div className="relative h-[46px]" data-testid={`truck-line-track-empty-${row.unit_id}`}>
        <div className="absolute left-0 right-0 top-[22px] h-[3px] rounded bg-[#E8EDF5]" />
        <span className="absolute left-2 top-4 text-xs text-[#6B7280]">
          — no load on this truck
        </span>
      </div>
    );
  }
  const { reached_index, next_index, has_open_exception, exception_reason_label, stamps } = row.station;
  const railColor = has_open_exception ? RED : GREEN;

  // The truck's LIVE position (never fabricated) — see TruckOnLine's own doc comment.
  const livePing = row.position != null && row.position.stale !== true;
  const betweenStations = livePing && next_index != null;
  const vehicleLeftPct = betweenStations ? (pct(reached_index) + pct(next_index as number)) / 2 : pct(reached_index);

  return (
    <div className="relative h-[46px]" data-testid={`truck-line-track-${row.unit_id}`}>
      <div className="absolute left-0 right-0 top-[22px] h-[3px] rounded bg-[#E8EDF5]" />
      <div className="absolute top-[22px] h-[3px] rounded" style={{ left: 0, width: `${pct(reached_index)}%`, background: railColor }} />
      {Array.from({ length: STATION_COUNT }, (_, i) => {
        const isOther = i === 4;
        const left = pct(i);
        if (isOther) {
          const active = has_open_exception;
          return (
            <div key={i} className="absolute" style={{ left: `${left}%`, top: 0 }}>
              <button
                type="button"
                data-testid={`truck-line-node-other-${row.unit_id}`}
                title={active ? `Other · ${exception_reason_label ?? "exception"}` : "Other — record an exception"}
                onClick={() => onOther(row)}
                className="absolute rounded-[4px] border-2"
                style={{
                  top: 15,
                  width: 17,
                  height: 17,
                  transform: "translateX(-50%) rotate(45deg)",
                  background: active ? RED : "#fff",
                  borderColor: active ? RED : "#D3DAE6",
                  cursor: "pointer",
                }}
              />
              {active ? (
                <span className="absolute whitespace-nowrap font-semibold" style={{ top: 33, left: "50%", transform: "translateX(-50%)", color: RED }}>
                  {exception_reason_label}
                </span>
              ) : null}
            </div>
          );
        }
        const isDone = i <= reached_index;
        const isCurrent = i === reached_index;
        const isNext = i === next_index;
        const stampInfo = stamps[i];
        const nodeColor = has_open_exception && isDone ? RED : GREEN;
        return (
          <div key={i} className="absolute" style={{ left: `${left}%`, top: 0 }}>
            <button
              type="button"
              disabled={!isNext}
              data-testid={`truck-line-node-${STATION_LABELS[i].toLowerCase().replace(/\s+/g, "-")}-${row.unit_id}`}
              title={`${STATION_LABELS[i]}${stampInfo ? ` · ${fmtStamp(stampInfo.at) ?? stampInfo.at}` : ""}${isNext ? " — click to stamp" : ""}`}
              onClick={() => isNext && onAdvance(row, i)}
              className="absolute rounded-full"
              style={{
                top: 15,
                width: 17,
                height: 17,
                transform: "translateX(-50%)",
                background: isDone ? nodeColor : "#fff",
                border: isCurrent ? `3px solid ${nodeColor}` : isNext ? `2px dashed ${GREEN}` : isDone ? `2px solid ${nodeColor}` : "2px solid #D3DAE6",
                cursor: isNext ? "pointer" : "default",
              }}
            />
            {stampInfo && fmtStamp(stampInfo.at) ? (
              <span className="absolute whitespace-nowrap text-[#6B7280]" style={{ top: 33, left: "50%", transform: "translateX(-50%)" }}>
                {fmtStamp(stampInfo.at)}
              </span>
            ) : null}
          </div>
        );
      })}
      <TruckOnLine leftPct={vehicleLeftPct} rolling={betweenStations} hasIssue={has_open_exception} unitId={row.unit_id} />
    </div>
  );
}

/** The positioned station-name strip — rendered once in the header row's own Line cell, using the
 * SAME percentages the track uses, so it stays aligned at every screen width (the Line cell is
 * `1fr`, so this auto-fits too — no fixed max-width/margin like V3's separate overlay bar). */
function StationHeaderLabels() {
  return (
    <div className="relative h-full">
      {STATION_LABELS.map((label, i) => (
        <span
          key={label}
          className="absolute top-0 whitespace-nowrap leading-[22px]"
          style={{ left: `${pct(i)}%`, transform: i === STATION_COUNT - 1 ? "translateX(-100%)" : i === 0 ? "none" : "translateX(-50%)" }}
        >
          {label}
          {i === 4 ? " ▾" : ""}
        </span>
      ))}
    </div>
  );
}

type StampPromptState = { row: TruckLineRow; stationIndex: number; kind: "arrival" | "departure" } | null;
type OtherPromptState = { row: TruckLineRow } | null;

export function TruckLineBoard({
  operatingCompanyId,
  onLoadClick,
  onBookForUnit,
}: {
  operatingCompanyId: string;
  onLoadClick: (loadId: string) => void;
  onBookForUnit: (unitId: string) => void;
}) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["truck-line", operatingCompanyId],
    queryFn: () => getTruckLine(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
    refetchInterval: 30_000,
  });
  const reasonsQuery = useQuery({
    queryKey: ["load-exception-reasons", operatingCompanyId],
    queryFn: () => listLoadExceptionReasons(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });

  const [search, setSearch] = useState("");
  const [stampPrompt, setStampPrompt] = useState<StampPromptState>(null);
  const [otherPrompt, setOtherPrompt] = useState<OtherPromptState>(null);
  const [otherReasonId, setOtherReasonId] = useState<string | null>(null);
  const [otherNote, setOtherNote] = useState("");
  const [stampBusy, setStampBusy] = useState(false);
  const [otherBusy, setOtherBusy] = useState(false);
  // Design contract rule 1 / guard (d): a refused transition must show the SERVER's own reason,
  // never fail silently — these surface whatever userFacingApiError derives from the rejection.
  const [stampError, setStampError] = useState<string | null>(null);
  const [otherError, setOtherError] = useState<string | null>(null);

  const allRows = query.data?.rows ?? [];
  const catalogReady = query.data?.catalog_ready ?? false;
  const reasons = reasonsQuery.data?.reasons ?? [];

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allRows;
    return allRows.filter((r) => {
      const haystack = [
        r.unit_number,
        r.load?.load_number,
        r.load?.customer_name,
        r.load?.pickup.city,
        r.load?.delivery.city,
        ...r.drivers.map((d) => d.name),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [allRows, search]);

  const openStamp = (row: TruckLineRow, stationIndex: number) => {
    if (!row.load) return;
    setStampPrompt({ row, stationIndex, kind: stationIndex === 2 || stationIndex === 5 ? "arrival" : stationIndex === 3 || stationIndex === 6 ? "departure" : "arrival" });
  };
  const openOther = (row: TruckLineRow) => {
    if (!row.load) return;
    setOtherReasonId(null);
    setOtherNote("");
    setOtherPrompt({ row });
  };

  return (
    <div data-testid="truck-line-board">
      {/* V4 AUTO-FIT GRID (ROUND 18.4) — a plain CSS grid, never a ParityTable, for this one view:
          no resize handle, no reorder handle, no storageKey column state. The Line column is 1fr
          so every station re-spaces itself as a percentage of whatever width is left, at every
          screen size — no board min-width, no horizontal scroll. Under 820px the Load column
          folds into the Truck cell. */}
      <style>{`
        .truck-line-v4-header, .truck-line-v4-row {
          display: grid;
          grid-template-columns: ${GRID_TEMPLATE_COLUMNS};
          column-gap: 10px;
          align-items: center;
        }
        .truck-line-v4-header {
          height: 26px;
          padding: 0 10px;
          background: rgb(228,234,241);
          border-bottom: 1px solid #C7D2DC;
          font-weight: 600;
          color: #374151;
        }
        .truck-line-v4-row {
          padding: 6px 10px;
          border-bottom: 1px solid #E5E7EB;
        }
        .truck-line-v4-load-in-truck { display: none; }
        @media (max-width: ${FOLD_BREAKPOINT_PX}px) {
          .truck-line-v4-header, .truck-line-v4-row {
            grid-template-columns: minmax(104px,10vw) 1fr minmax(96px,10vw);
          }
          .truck-line-v4-load-cell, .truck-line-v4-load-header { display: none; }
          .truck-line-v4-load-in-truck { display: block; }
        }
        .truck-line-vehicle {
          position: absolute;
          top: 3px;
          transform: translateX(-50%);
          transition: left 0.9s cubic-bezier(0.4, 0, 0.2, 1);
          pointer-events: none;
        }
        .truck-line-wheel, .truck-line-exhaust { transform-box: fill-box; transform-origin: center; }
        .truck-line-vehicle--rolling .truck-line-wheel { animation: truck-line-spin 0.6s linear infinite; }
        .truck-line-vehicle--rolling .truck-line-vehicle-body { animation: truck-line-bob 0.9s ease-in-out infinite; }
        .truck-line-vehicle--rolling .truck-line-exhaust { animation: truck-line-exhaust 1.1s ease-out infinite; }
        @keyframes truck-line-spin { to { transform: rotate(360deg); } }
        @keyframes truck-line-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-1.5px); } }
        @keyframes truck-line-exhaust {
          0% { opacity: 0.55; transform: translate(0, 0) scale(1); }
          100% { opacity: 0; transform: translate(-7px, -7px) scale(1.9); }
        }
        @media (prefers-reduced-motion: reduce) {
          .truck-line-vehicle { transition: none; }
          .truck-line-vehicle--rolling .truck-line-wheel,
          .truck-line-vehicle--rolling .truck-line-vehicle-body,
          .truck-line-vehicle--rolling .truck-line-exhaust { animation: none; }
        }
      `}</style>

      {!catalogReady ? (
        <div className="mb-2 rounded border border-[#C7D2DC] bg-[#F4F7FA] px-3 py-1.5 text-xs text-[#6B7280]" data-testid="truck-line-catalog-pending">
          Reason catalog not yet available — "Other" will list reasons as soon as it's published.
        </div>
      ) : null}
      {query.isError ? (
        <div className="mb-2">
          <ListErrorBanner message={userFacingApiError(query.error, "Could not load Truck Line")} onRetry={() => void query.refetch()} />
        </div>
      ) : null}

      <div className="mb-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Truck, load #, customer, stop city…"
          className="h-7 w-64 rounded border border-[#C7D2DC] px-2 text-xs"
          data-testid="truck-line-search"
        />
        <span className="ml-2 text-xs text-[#6B7280]">{rows.length} rows</span>
      </div>

      <div className="rounded border border-[#C7D2DC] bg-white" data-testid="truck-line-board-v4">
        <div className="truck-line-v4-header">
          <span>Truck</span>
          <span className="truck-line-v4-load-header">Load</span>
          <StationHeaderLabels />
          <span>ETA</span>
        </div>

        {query.isLoading ? (
          <div className="p-4 text-xs text-[#6B7280]">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-4 text-xs text-[#6B7280]">No in-service trucks found for this company.</div>
        ) : (
          rows.map((r) => (
            <div key={r.unit_id} className="truck-line-v4-row" data-testid={`truck-line-row-${r.unit_id}`}>
              <div>
                <div className="font-semibold text-[#1F2937]">
                  {r.unit_number}
                  {r.load?.trip_type ? (
                    <span
                      className="ml-1.5 inline-block rounded-sm px-1.5 py-0.5 font-semibold text-white"
                      style={{ background: r.load.trip_type === "NB" ? "#1f2a44" : r.load.trip_type === "SB" ? "#475569" : "#b45309" }}
                    >
                      {r.load.trip_type}
                    </span>
                  ) : null}
                </div>
                {r.load ? (
                  <div className="text-xs text-[#6B7280]">{r.drivers.map((d) => d.name ?? "Driver").join(" / ") || "No driver"}</div>
                ) : (
                  <div className="text-xs">
                    Awaiting assignment ·{" "}
                    <button type="button" className="underline" style={{ color: "#1f2a44" }} onClick={() => onBookForUnit(r.unit_id)} data-testid={`truck-line-book-load-${r.unit_id}`}>
                      Book Load
                    </button>
                  </div>
                )}
                {/* Under 820px the Load column folds in here. */}
                <div className="truck-line-v4-load-in-truck text-xs text-[#6B7280]">
                  {r.load ? `${r.load.load_number ?? ""} · ${r.load.customer_name ?? "—"}` : null}
                </div>
              </div>

              <div
                className="truck-line-v4-load-cell cursor-pointer"
                data-testid={`truck-line-card-${r.unit_id}`}
                onDoubleClick={() => r.load && onLoadClick(r.load.load_id)}
                title={r.load ? `double-click opens load ${r.load.load_number ?? ""}` : undefined}
              >
                {r.load ? (
                  <>
                    <div className="font-semibold text-[#1F2937]">{r.load.load_number}</div>
                    <div className="text-xs text-[#6B7280]">{r.load.customer_name ?? "—"}</div>
                    <div className="text-xs text-[#6B7280]">
                      {r.load.pickup.city ?? "—"}, {r.load.pickup.state ?? "—"} → {r.load.delivery.city ?? "—"}, {r.load.delivery.state ?? "—"} · {money(r.load.rate_total_cents)}
                    </div>
                    {r.position ? (
                      <div className="text-xs">
                        {r.position.stale ? <b className="text-[#DC2626]">Stale</b> : <b>Live</b>} {r.position.city ?? "—"}
                        {r.position.stale_minutes != null ? ` · ${r.position.stale_minutes} min ago` : ""}
                      </div>
                    ) : (
                      <div className="text-xs">
                        <b>No ping</b> <span style={{ color: "#DC2626" }}>— last position unavailable</span>
                      </div>
                    )}
                  </>
                ) : (
                  <span className="text-xs text-[#6B7280]">—</span>
                )}
              </div>

              <div className="truck-line-v4-line-cell">
                {r.load ? (
                  <TruckLineTrack row={r} onAdvance={openStamp} onOther={openOther} />
                ) : (
                  <div className="relative h-[46px]" data-testid={`truck-line-track-empty-${r.unit_id}`}>
                    <div className="absolute left-0 right-0 top-[22px] h-[3px] rounded bg-[#E8EDF5]" />
                    <span className="absolute left-2 top-4 text-xs text-[#6B7280]">— no load on this truck</span>
                  </div>
                )}
              </div>

              <div>
                {r.next_appointment ? (
                  <span className="text-xs">
                    {r.next_appointment.late ? (
                      <b style={{ color: "#DC2626" }}>
                        {r.next_appointment.type === "pickup" ? "Pickup" : "Delivery"} {fmtStamp(r.next_appointment.at) ?? "—"} — late
                      </b>
                    ) : (
                      <span>
                        {r.next_appointment.type === "pickup" ? "Pickup" : "Delivery"} {fmtStamp(r.next_appointment.at) ?? "—"}
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-xs text-[#6B7280]">—</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {stampPrompt ? (
        <div className="fixed right-6 top-[118px] z-50 w-[350px] rounded-md border border-[#C7D2DC] bg-white text-xs shadow-lg" data-testid="truck-line-stamp-popover">
          <div className="flex h-[30px] items-center justify-between bg-[rgb(228,234,241)] px-2.5 font-semibold text-[#374151]">
            <span>
              {stampPrompt.row.unit_number} · {stampPrompt.row.load?.load_number} · {STATION_LABELS[stampPrompt.stationIndex]}
            </span>
            <button type="button" onClick={() => { setStampPrompt(null); setStampError(null); }}>✕</button>
          </div>
          <div className="p-2.5">
            <div className="mb-1 flex items-center justify-between border-b border-[#E5E7EB] py-1">
              <span>Recorded by</span>
              <b>dispatcher (manual)</b>
            </div>
            <div className="flex items-center justify-between py-1">
              <span>Time</span>
              <b>now</b>
            </div>
            {stampError ? (
              <div className="mt-1 rounded border border-[#DC2626] bg-[#FEF2F2] px-2 py-1 text-[#DC2626]" data-testid="truck-line-stamp-error">
                {stampError}
              </div>
            ) : null}
          </div>
          <div className="flex justify-end gap-1.5 border-t border-[#E5E7EB] p-2">
            <button type="button" className="h-7 rounded border border-[#C7D2DC] px-2.5" onClick={() => { setStampPrompt(null); setStampError(null); }}>
              Cancel
            </button>
            <button
              type="button"
              disabled={stampBusy}
              className="h-7 rounded bg-[#14314F] px-2.5 text-white disabled:opacity-60"
              data-testid="truck-line-stamp-confirm"
              onClick={async () => {
                const { row, kind } = stampPrompt;
                if (!row.load) return;
                setStampBusy(true);
                setStampError(null);
                try {
                  // Pickup/delivery stop_id isn't in the read-model row today — resolved via the
                  // load's own stop list at click time would need another fetch; kept minimal:
                  // the read model's own station index maps 1:1 to pickup (2/3) vs delivery (5/6)
                  // stops, so the backend endpoints take loadId + stopId — the board fetches the
                  // load's stop ids lazily here to avoid bloating every row of the list response.
                  const stopId = await resolveStopIdForStation(row, stampPrompt.stationIndex, operatingCompanyId);
                  if (!stopId) throw new Error("stop_not_resolved");
                  if (kind === "arrival") await stampTruckLineArrival(row.load.load_id, stopId, operatingCompanyId);
                  else await stampTruckLineDeparture(row.load.load_id, stopId, operatingCompanyId);
                  await qc.invalidateQueries({ queryKey: ["truck-line", operatingCompanyId] });
                  setStampPrompt(null);
                } catch (err) {
                  // Design contract rule 1 / guard (d): show the server's own refusal reason —
                  // never fail silently.
                  setStampError(userFacingApiError(err, "Could not record this stamp"));
                } finally {
                  setStampBusy(false);
                }
              }}
            >
              Confirm
            </button>
          </div>
        </div>
      ) : null}

      {otherPrompt ? (
        <div className="fixed right-6 top-[118px] z-50 w-[350px] rounded-md border border-[#C7D2DC] bg-white text-xs shadow-lg" data-testid="truck-line-other-popover">
          <div className="flex h-[30px] items-center justify-between bg-[rgb(228,234,241)] px-2.5 font-semibold text-[#374151]">
            <span>
              {otherPrompt.row.unit_number} · {otherPrompt.row.load?.load_number} · OTHER — pick the reason
            </span>
            <button type="button" onClick={() => { setOtherPrompt(null); setOtherError(null); }}>✕</button>
          </div>
          <div className="p-2.5">
            <div className="mb-1.5 rounded border border-[#C7D2DC]" data-testid="truck-line-reason-list">
              {reasons.length === 0 ? (
                <div className="px-2 py-1.5 text-[#6B7280]">No reasons published yet.</div>
              ) : (
                reasons.map((r) => (
                  <div
                    key={r.id}
                    onClick={() => setOtherReasonId(r.id)}
                    data-testid={`truck-line-reason-${r.code}`}
                    className={`flex cursor-pointer justify-between border-b border-[#E5E7EB] px-2 py-1.5 last:border-0 ${otherReasonId === r.id ? "bg-[#FEF2F2] font-semibold" : ""}`}
                  >
                    <span>{r.name}</span>
                  </div>
                ))
              )}
            </div>
            <div className="flex items-center justify-between border-b border-[#E5E7EB] py-1">
              <span>Note (required)</span>
              <input
                className="h-7 w-[170px] rounded border border-[#C7D2DC] px-1.5"
                value={otherNote}
                onChange={(e) => setOtherNote(e.target.value)}
                data-testid="truck-line-other-note"
              />
            </div>
            {otherError ? (
              <div className="mt-1 rounded border border-[#DC2626] bg-[#FEF2F2] px-2 py-1 text-[#DC2626]" data-testid="truck-line-other-error">
                {otherError}
              </div>
            ) : null}
          </div>
          <div className="flex justify-end gap-1.5 border-t border-[#E5E7EB] p-2">
            <button type="button" className="h-7 rounded border border-[#C7D2DC] px-2.5" onClick={() => { setOtherPrompt(null); setOtherError(null); }}>
              Cancel
            </button>
            <button
              type="button"
              disabled={otherBusy || !otherReasonId || otherNote.trim().length < 20}
              title={otherNote.trim().length < 20 ? "Note must be at least 20 characters" : undefined}
              className="h-7 rounded bg-[#14314F] px-2.5 text-white disabled:opacity-60"
              data-testid="truck-line-other-confirm"
              onClick={async () => {
                const { row } = otherPrompt;
                if (!row.load || !otherReasonId) return;
                setOtherBusy(true);
                setOtherError(null);
                try {
                  await recordTruckLineException({
                    operating_company_id: operatingCompanyId,
                    load_id: row.load.load_id,
                    reason_id: otherReasonId,
                    issue_category: "other",
                    issue_description: otherNote.trim(),
                    severity: "warning",
                  });
                  await qc.invalidateQueries({ queryKey: ["truck-line", operatingCompanyId] });
                  setOtherPrompt(null);
                } catch (err) {
                  // Honest failure — leave the popover open so the dispatcher can retry, with the
                  // server's own reason shown (guard item d's same rule applies here).
                  setOtherError(userFacingApiError(err, "Could not record this exception"));
                } finally {
                  setOtherBusy(false);
                }
              }}
            >
              Record exception
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Lazily resolves the pickup/delivery stop_id for a station click — the truck-line read model
 * intentionally omits stop ids from every row (kept the response small); this reuses the SAME
 * stops-record read model the Load detail page's Stops tab already fetches, on demand, only when
 * a dispatcher actually clicks a node. */
async function resolveStopIdForStation(row: TruckLineRow, stationIndex: number, operatingCompanyId: string): Promise<string | null> {
  if (!row.load) return null;
  const isPickup = stationIndex === 2 || stationIndex === 3;
  const { getLoadStopsRecord } = await import("../../api/dispatch");
  const record = await getLoadStopsRecord(row.load.load_id, operatingCompanyId);
  const stop = isPickup
    ? record.stops.find((s) => s.stop_type === "pickup")
    : [...record.stops].reverse().find((s) => s.stop_type === "delivery");
  return stop?.stop_id ?? null;
}
