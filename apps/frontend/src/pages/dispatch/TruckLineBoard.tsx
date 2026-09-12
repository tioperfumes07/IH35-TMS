/**
 * TRUCK LINE — 5th Dispatch board view (owner ruling 2026-09-11, Lead assignment).
 * THE DESIGN IS THE CONTRACT: docs/design/reference/DISPATCH-LINE-BOARD-REFERENCE-2026-09-11.html
 * + docs/design/DESIGN-CONTRACT-DISPATCH-LINE-BOARD-2026-09-11.md.
 *
 * One row per in-service truck, no dragging. The station line reached-so-far is green; a red
 * diamond ("Other") marks an open exception; the NEXT station is the only clickable-to-advance
 * node, writing through the existing transition/stop-stamp routes (never a new status writer,
 * never a second exceptions table). Double-click the truck card opens the load's Load Costs page.
 *
 * Gear/sort/density reuse ParityTable exactly like Load Costs — but ParityTable's `label` is a
 * plain string (no custom header JSX), so the exact "station names positioned above their own
 * node" mockup can't be produced through its column header alone. This renders that same
 * positioned station-name bar as its own small header strip directly above the ParityTable body
 * (not inside its <thead>) — visually the "status names on top" the owner asked for, functionally
 * outside ParityTable's column model. The Line column's own ParityTable label still names all 9
 * stations in order as a plain-text fallback for the gear/column-toggle list.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { userFacingApiError } from "../../lib/api-error-message";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
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

/** The colored rail + 9 nodes for one row — a pure render of `row.station`, never its own
 * state machine (that lives entirely in station.ts on the backend). */
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

  return (
    <div className="relative h-[46px]" data-testid={`truck-line-track-${row.unit_id}`}>
      <div className="absolute left-0 right-0 top-[22px] h-[3px] rounded bg-[#E8EDF5]" />
      <div className="absolute top-[22px] h-[3px] rounded" style={{ left: 0, width: `${pct(reached_index)}%`, background: GREEN }} />
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
                background: isDone ? GREEN : "#fff",
                border: isCurrent ? `3px solid ${GREEN}` : isNext ? `2px dashed ${GREEN}` : isDone ? `2px solid ${GREEN}` : "2px solid #D3DAE6",
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
    </div>
  );
}

/** The positioned station-name strip rendered once above the table body (the owner's "status
 * names on top" correction) — purely presentational, aligned to the SAME 9 positions the track
 * uses. Left offset approximates the Line column's real screen position; ParityTable owns actual
 * column widths, so this is a best-effort visual match, not a pixel-locked overlay. */
function StationHeaderStrip() {
  return (
    <div className="relative mb-1 h-[22px] border-b border-[#E5E7EB] bg-[rgb(228,234,241)] font-semibold text-[#374151]" data-testid="truck-line-station-header">
      <div className="relative mx-auto h-full" style={{ maxWidth: 1240, marginLeft: 260 }}>
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

  const rows = query.data?.rows ?? [];
  const catalogReady = query.data?.catalog_ready ?? false;
  const reasons = reasonsQuery.data?.reasons ?? [];

  const columns = useMemo<ParityColumn<TruckLineRow>[]>(
    () => [
      {
        key: "truck",
        label: "Truck · Driver · Load",
        alwaysVisible: true,
        sortable: true,
        sortValue: (r) => r.unit_number,
        render: (r) => (
          <div
            data-testid={`truck-line-card-${r.unit_id}`}
            className={`inline-block min-w-[200px] rounded border px-2 py-1 leading-[1.25] ${r.load ? "cursor-pointer border-[#C7D2DC] bg-[#F4F7FA] hover:border-[#14314F]" : "border-dashed border-[#C7D2DC] bg-white text-[#6B7280]"}`}
            onDoubleClick={() => r.load && onLoadClick(r.load.load_id)}
            title={r.load ? `double-click opens load ${r.load.load_number ?? ""}` : undefined}
          >
            {r.load ? (
              <>
                <div className="font-semibold text-[#1F2937]">
                  {r.unit_number}
                  {r.load.trip_type ? (
                    <span
                      className="ml-1.5 inline-block rounded-sm px-1.5 py-0.5 font-semibold text-white"
                      style={{ background: r.load.trip_type === "NB" ? "#1f2a44" : r.load.trip_type === "SB" ? "#475569" : "#b45309" }}
                    >
                      {r.load.trip_type}
                    </span>
                  ) : null}
                  {" · "}
                  {r.load.load_number}
                </div>
                <div className="text-xs text-[#6B7280]">
                  {r.drivers.map((d) => d.name ?? "Driver").join(" / ") || "No driver"} · {r.load.customer_name ?? "—"}
                </div>
                <div className="text-xs text-[#6B7280]">
                  {r.load.pickup.city ?? "—"}, {r.load.pickup.state ?? "—"} → {r.load.delivery.city ?? "—"}, {r.load.delivery.state ?? "—"} · {money(r.load.rate_total_cents)}
                </div>
              </>
            ) : (
              <>
                <div className="font-semibold">{r.unit_number}</div>
                <div className="text-xs">
                  Awaiting assignment · no load ·{" "}
                  <button type="button" className="underline" style={{ color: "#1f2a44" }} onClick={() => onBookForUnit(r.unit_id)} data-testid={`truck-line-book-load-${r.unit_id}`}>
                    Book Load
                  </button>{" "}
                  on {r.unit_number}
                </div>
              </>
            )}
          </div>
        ),
      },
      {
        key: "line",
        label: `Line — ${STATION_LABELS.join(" · ")}`,
        alwaysVisible: true,
        sortable: false,
        cellClass: "!px-1.5",
        render: (r) => (
          <TruckLineTrack
            row={r}
            onAdvance={(row, stationIndex) => {
              if (!row.load) return;
              setStampPrompt({ row, stationIndex, kind: stationIndex === 2 || stationIndex === 5 ? "arrival" : stationIndex === 3 || stationIndex === 6 ? "departure" : "arrival" });
            }}
            onOther={(row) => {
              if (!row.load) return;
              setOtherReasonId(null);
              setOtherNote("");
              setOtherPrompt({ row });
            }}
          />
        ),
      },
      {
        key: "position",
        label: "Live position (Samsara)",
        sortable: false,
        render: (r) =>
          r.position ? (
            <span className="text-xs">
              {r.position.stale ? <b className="text-[#DC2626]">Stale</b> : <b>Live</b>}{" "}
              {r.position.city ?? r.position.lat?.toFixed(2)}, {r.position.state ?? r.position.lng?.toFixed(2)}
              <div className="text-[#6B7280]">{r.position.stale_minutes != null ? `${r.position.stale_minutes} min ago` : ""}</div>
            </span>
          ) : (
            <span className="text-xs">
              <b>No ping</b> <span style={{ color: "#DC2626" }}>— last position unavailable</span>
            </span>
          ),
      },
      {
        key: "next_appt",
        label: "Next appointment",
        sortable: false,
        render: (r) =>
          r.next_appointment ? (
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
          ),
      },
    ],
    [onLoadClick, onBookForUnit]
  );

  return (
    <div data-testid="truck-line-board">
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
      <StationHeaderStrip />
      <ParityTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.unit_id}
        loading={query.isLoading}
        emptyText="No in-service trucks found for this company."
        storageKey="dispatch-truck-line-v1"
      />

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
