// TABLE_DATE_OMIT: this table has no date column by design — one row per LANE on file (AlwaysTrack history) into the same state, aggregated over all its runs (practical miles / trips / confidence); a lane is a route, not a dated event.
import type { LaneMileageFillConfidence, LaneMileageReferenceRow } from "../../../../api/dispatch";
import { useTranslation } from "../../../../hooks/useTranslation";
import { ParityTable } from "../../../../components/parity/ParityTable";

type Props = {
  practical?: number | null;
  shortest?: number | null;
  deadhead?: number | null;
  /** Linehaul divided by practical miles. Not the customer invoice basis. */
  ratePerMile?: number;
  /** Operator-facing fill label from the lane lookup (or "Operator entered"). */
  provenance?: string;
  /** Drives warning chrome. check_zip must stay visible — those miles feed pay. */
  fillConfidence?: LaneMileageFillConfidence | "operator";
  onPracticalChange?: { (n: number | null): void };
  onShortestChange?: { (n: number | null): void };
  onDeadheadChange?: { (n: number | null): void };
  shortestRequired?: boolean;
  practicalRequired?: boolean;
  /** MILES-INVERT-01 — inline flag when catalog short > practical. */
  milesColumnInverted?: boolean;
  /** Reverse-lane short miles differ by >100mi (catalog trigger). */
  reverseLaneShortDiff?: boolean;
  /** P0 State B — Thin lane: history + Use, never silent fill. */
  historyOffer?: { runs: number; median: number; spread: number | null } | null;
  onUseHistoryMiles?: { (): void };
  /** P0 State C */
  newLane?: boolean;
  /** DSP-48 (owner ruling 2026-09-05, "Google distance = REFERENCE ONLY"): a car-routing
   *  distance/time for comparison against the typed Practical miles above — grey, read-only,
   *  NEVER editable and NEVER copied into any miles input (LAW §2). null/undefined = not
   *  computed yet (no coordinates, provider not configured, or still loading). */
  googleReferencePractical?: { miles: number; minutes: number } | null;
  /** LDT-1 (owner ruling 2026-09-05): Google car-routing reference for the EMPTY leg —
   *  yard → pickup — grey, read-only, NEVER editable and NEVER copied into Empty miles (LAW §2).
   *  null/undefined = not computed (no coordinates, provider off, or still loading). */
  googleReferenceEmpty?: { miles: number; minutes: number } | null;
  /** P1 (owner 2026-09-14) — the shortest-miles field's OWN source label, independent of
   *  `provenance` above (which only ever describes practical/lane-history). Never invented: either
   *  a real engine label ("Route engine (osrm)") or an honest blank-reason ("Not available —
   *  osrm_not_configured"). undefined = not looked up yet (no coordinates on file). */
  shortestProvenance?: string;
  /** ROUND 443.265-A item 4 — step 2 "Select from reference": lanes on file from the same origin into
   *  the destination state (catalogs.lane_mileage). null = not looked up (exact lane found, or no stops yet). */
  referenceLanes?: { lanesOnFile: number; originLabel: string; destLabel: string; lanes: LaneMileageReferenceRow[] } | null;
  /** The reference lane the operator chose (its practical miles went into Practical). */
  referenceLaneId?: string | null;
  onUseReferenceLane?: { (lane: LaneMileageReferenceRow): void };
};

/** "LAREDO" → "Laredo" — catalogs.lane_mileage stores cities upper-case. */
export function laneCityLabel(city: string, state: string): string {
  const c = city.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
  return `${c}, ${state.toUpperCase()}`;
}

function numFromInput(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && !(n < 0) ? n : null;
}

function formatMiles(n: number | null | undefined): string {
  return n != null && Number.isFinite(n) && !(n <= 0) ? n.toLocaleString(undefined, { maximumFractionDigits: 1 }) : "";
}

function inputValue(n: number | null | undefined): string {
  return n != null && Number.isFinite(n) && !(n <= 0) ? String(n) : "";
}

/** "18 h 40 m" — DSP-48's own example format. */
function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours} h ${minutes} m` : `${minutes} m`;
}

function provenanceClass(fillConfidence?: LaneMileageFillConfidence | "operator"): string {
  switch (fillConfidence) {
    case "check_zip":
      // §7 slate only (no amber). Weight + border make ZIP mismatch louder than a quiet History fill.
      return "border-t border-[#E5E7EB] bg-[#F7F8FA] px-2 py-1 text-xs font-semibold text-[#0F1219]";
    case "verify":
    case "reverse":
      return "border-t border-[#E5E7EB] bg-[#F7F8FA] px-2 py-1 text-xs text-[#4B5563]";
    case "operator":
      return "border-t border-[#E5E7EB] px-2 py-1 text-xs text-[#4B5563]";
    default:
      return "border-t border-[#E5E7EB] px-2 py-1 text-xs text-[#4B5563]";
  }
}

/**
 * Practical miles drive revenue per mile (typed linehaul / practical).
 * Short miles drive driver pay. Empty miles are deadhead into the pickup.
 * Operator labels are English words only (owner 2026-09-01). Column names stay on the wire.
 * GO-16 Rev C / CC-3: provenance under the boxes; Check ZIP stays bold and visible (§7 slate).
 */
export function MilesStrip({
  practical,
  shortest,
  deadhead,
  ratePerMile = 0,
  provenance,
  fillConfidence,
  onPracticalChange,
  onShortestChange,
  onDeadheadChange,
  shortestRequired = false,
  practicalRequired = false,
  milesColumnInverted = false,
  reverseLaneShortDiff = false,
  historyOffer = null,
  onUseHistoryMiles,
  newLane = false,
  googleReferencePractical = null,
  googleReferenceEmpty = null,
  shortestProvenance,
  referenceLanes = null,
  referenceLaneId = null,
  onUseReferenceLane,
}: Props) {
  const { t } = useTranslation();
  // fillConfidence drives chrome; provenance is the operator sentence.
  // ROUND 443.265-A (V3-Dispatch-BookLoad-Modal §C): four equal cells, each box with its own caption and
  // its Google reference line UNDER it; inputs left-aligned 32px; revenue per mile is the big read-only cell.
  const cell = "flex min-w-0 flex-col gap-1 border-r border-[#E5E7EB] px-3 py-2 text-left last:border-r-0";
  const label = "text-xs font-semibold text-[#4B5563]";
  const caption = "text-xs font-normal text-[#6B7280]";
  const googleLine = "text-xs font-normal text-[#1F2A44]";
  const editable = Boolean(onPracticalChange && onShortestChange);
  const laneState = newLane ? "new" : historyOffer ? "thin" : fillConfidence && fillConfidence !== "operator" ? "high" : null;
  const chosenReference = referenceLanes?.lanes.find((l) => l.lane_id === referenceLaneId) ?? null;
  // Step order is the owner's: 1 AlwaysTrack lane history → 2 Select from reference → 3 Type it.
  const activeStep = chosenReference || (referenceLanes && referenceLanes.lanes.length > 0 && laneState === "new")
    ? 2
    : laneState === "high" || laneState === "thin"
      ? 1
      : fillConfidence === "operator" || laneState === "new"
        ? 3
        : 1;
  const fmt1 = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const practicalCaption = chosenReference
    ? `from reference: ${laneCityLabel(chosenReference.origin_city, chosenReference.origin_state).replace(/, [A-Z]+$/, "")} → ${laneCityLabel(chosenReference.dest_city, chosenReference.dest_state)}`
    : "revenue per mile";
  const laneText = (lane: LaneMileageReferenceRow) =>
    `${laneCityLabel(lane.origin_city, lane.origin_state)} → ${laneCityLabel(lane.dest_city, lane.dest_state)}`;
  return (
    <div className="rounded-sm border border-[#E5E7EB] bg-white" data-testid="book-load-miles-strip">
      <div
        className="flex flex-wrap items-center gap-2 border-b border-[#E5E7EB] px-3 py-1.5 text-xs"
        data-testid="book-load-mileage-source-steps"
      >
        <span className="font-semibold text-[#0F1219]">{t("bookLoad.miles.source", "Mileage source")}</span>
        {(["AlwaysTrack lane history", "Select from reference", "Type it"] as const).map((name, i) => (
          <span key={name} className="inline-flex items-center gap-2">
            {i > 0 ? <span aria-hidden className="text-[#6B7280]">→</span> : null}
            <span
              data-testid={`book-load-mileage-step-${i + 1}`}
              data-active={activeStep === i + 1 ? "true" : "false"}
              className={`rounded-sm px-1.5 py-0.5 ${
                activeStep === i + 1 ? "bg-[#EEF1F6] font-semibold text-[#1F2A44]" : "bg-[#F3F4F6] text-[#4B5563]"
              }`}
            >
              {i + 1} · {name}
            </span>
          </span>
        ))}
        <span className="ml-auto text-[#6B7280]">{t("bookLoad.miles.googleAlways", "Google practical + short always shown under each box")}</span>
      </div>
      {laneState === "high" ? (
        <p className="border-b border-[#E5E7EB] px-3 py-1 text-xs text-[#1F2A44]" data-testid="book-load-miles-state-high">
          High — filled from history. Source shown under the boxes. You can still type over it.
        </p>
      ) : null}
      {laneState === "thin" ? (
        <p className="border-b border-[#E5E7EB] bg-[#F7F8FA] px-3 py-1 text-xs text-[#1F2A44]" data-testid="book-load-miles-state-thin">
          Thin — boxes stay empty. History (runs / median / spread) is below. Use only if you accept it.
        </p>
      ) : null}
      {laneState === "new" ? (
        <p className="border-b border-[#E5E7EB] px-3 py-1 text-xs text-[#1F2A44]" data-testid="book-load-miles-state-new">
          {chosenReference
            ? "New — no history. Practical is from the reference lane you chose; you can still type over it."
            : "New — no history. Type practical miles. Nothing is filled."}
        </p>
      ) : null}
      <div className="grid grid-cols-2 md:grid-cols-4">
        <div className={cell}>
          <label className={label} htmlFor="book-miles-practical">
            Practical (long){practicalRequired ? " *" : ""}
          </label>
          {editable ? (
            <input
              id="book-miles-practical"
              data-testid="book-miles-practical"
              type="number"
              min={0}
              step={0.1}
              required={practicalRequired}
              className={`h-8 w-full rounded-sm border px-2 text-right font-mono text-xs ${
                practicalRequired ? "border-[#4B5563] font-semibold text-[#0F1219]" : "border-[#E5E7EB] text-[#0F1219]"
              }`}
              value={inputValue(practical)}
              onChange={(e) => onPracticalChange?.(numFromInput(e.target.value))}
            />
          ) : (
            <div className="font-mono text-xs text-[#0F1219]">{formatMiles(practical)}</div>
          )}
          <div className={caption} data-testid="book-load-practical-caption">
            {practicalCaption}
          </div>
          {/* ROUND 443.258-B: Google practical ALWAYS under the box (even while loading / null).
              Reference only — never copied into the mile inputs (LAW §2 / DSP-48). */}
          <p className={googleLine} data-testid="book-load-google-reference-miles" title="Google car routing — reference only">
            {googleReferencePractical
              ? `Google practical ${fmt1(googleReferencePractical.miles)} mi · ${formatDuration(googleReferencePractical.minutes)}`
              : "Google practical — not computed yet"}
          </p>
        </div>
        <div className={cell}>
          <label className={label} htmlFor="book-miles-shortest">
            Shortest{shortestRequired ? " *" : ""}
          </label>
          {editable ? (
            <input
              id="book-miles-shortest"
              data-testid="book-miles-shortest"
              type="number"
              min={0}
              step={0.1}
              required={shortestRequired}
              className={`h-8 w-full rounded-sm border px-2 text-right font-mono text-xs ${
                shortestRequired ? "border-[#4B5563] font-semibold text-[#0F1219]" : "border-[#E5E7EB] text-[#0F1219]"
              }`}
              value={inputValue(shortest)}
              onChange={(e) => onShortestChange?.(numFromInput(e.target.value))}
            />
          ) : (
            <div className="font-mono text-xs text-[#4B5563]">{formatMiles(shortest)}</div>
          )}
          <div className={caption}>{t("bookLoad.miles.driverPay", "driver pay")}</div>
          <p
            className={googleLine}
            data-testid="book-load-google-reference-short"
            title="Google car routing (short reference) — reference only; driver pay uses Shortest above"
          >
            {googleReferencePractical
              ? `Google short ${fmt1(googleReferencePractical.miles)} mi · ${formatDuration(googleReferencePractical.minutes)}`
              : "Google short — not computed yet"}
          </p>
        </div>
        <div className={cell}>
          <label className={label} htmlFor="book-miles-deadhead">
            Empty miles
          </label>
          {editable ? (
            <input
              id="book-miles-deadhead"
              data-testid="book-miles-deadhead"
              type="number"
              min={0}
              step={0.1}
              className="h-8 w-full rounded-sm border border-[#E5E7EB] px-2 text-right font-mono text-xs text-[#0F1219]"
              value={inputValue(deadhead)}
              onChange={(e) => onDeadheadChange?.(numFromInput(e.target.value))}
            />
          ) : (
            <div className="font-mono text-xs text-[#0F1219]">{formatMiles(deadhead)}</div>
          )}
          <div className={caption}>{t("bookLoad.miles.deadhead", "deadhead to pickup")}</div>
          <p className={googleLine} data-testid="book-load-google-reference-empty" title="Google car routing, yard to pickup — reference only">
            {googleReferenceEmpty
              ? `Empty leg ref (yard → pickup) ${fmt1(googleReferenceEmpty.miles)} mi · ${formatDuration(googleReferenceEmpty.minutes)}`
              : "Empty leg ref (yard → pickup) — not computed yet"}
          </p>
        </div>
        <div className={`${cell} bg-[#F7F8FA]`}>
          <div className={label}>Revenue per mile</div>
          <div className="text-right font-mono text-xs font-semibold text-[#0F1219]" data-testid="book-load-revenue-per-mile">
            {!(ratePerMile <= 0) ? `$${ratePerMile.toFixed(2)}` : "—"}
          </div>
          <div className={caption}>{practical != null && practical > 0 ? `on practical ${formatMiles(practical)}` : "on practical miles"}</div>
        </div>
      </div>
      {referenceLanes && laneState === "new" ? (
        <div className="border-t border-[#E5E7EB]" data-testid="book-load-miles-reference">
          <p className="mx-3 my-2 border-l-2 border-[#B45309] bg-white px-2 py-1 text-xs text-[#0F1219]">
            No lane {referenceLanes.originLabel} → {referenceLanes.destLabel} in AlwaysTrack history (
            {referenceLanes.lanesOnFile.toLocaleString()} lanes on file).{" "}
            {referenceLanes.lanes.length > 0
              ? "Select from reference — lanes on file into the same state:"
              : "No lane on file into that state — type the miles."}
          </p>
          {referenceLanes.lanes.length > 0 ? (
            <ParityTable<LaneMileageReferenceRow>
              tableTestId="book-load-miles-reference-table"
              appearance="board"
              hidePager
              density="compact"
              suppressToolbarSearch
              suppressToolbarRange
              rows={referenceLanes.lanes}
              rowKey={(lane) => lane.lane_id}
              rowTestId={() => "book-load-miles-reference-row"}
              emptyText="No lane on file into that state."
              columns={[
                {
                  key: "lane",
                  label: t("bookLoad.miles.ref.lane", "Lane on file (AlwaysTrack history)"),
                  sortable: true,
                  sortValue: (lane) => laneText(lane),
                  render: (lane) => <span className="text-[#0F1219]">{laneText(lane)}</span>,
                },
                {
                  key: "practical",
                  label: t("bookLoad.miles.ref.practical", "Practical"),
                  sortable: true,
                  kind: "number",
                  sortValue: (lane) => lane.practical_miles,
                  render: (lane) => (
                    <span data-quantity className="font-mono tabular-nums">
                      {fmt1(lane.practical_miles)}
                    </span>
                  ),
                },
                {
                  key: "short",
                  label: t("bookLoad.miles.ref.short", "Short"),
                  sortable: false,
                  className: "text-right",
                  cellClass: "text-right",
                  // Short is never offered from the catalog (verify-miles-shortest-never-autofilled-from-catalog).
                  render: () => <span className="text-[#6B7280]">—</span>,
                },
                {
                  key: "trips",
                  label: t("bookLoad.miles.ref.trips", "Trips"),
                  sortable: true,
                  kind: "number",
                  sortValue: (lane) => lane.runs,
                  render: (lane) => <span data-quantity>{lane.runs}</span>,
                },
                {
                  key: "confidence",
                  label: t("bookLoad.miles.ref.confidence", "Confidence"),
                  sortable: true,
                  sortValue: (lane) => lane.confidence ?? "",
                  render: (lane) => lane.confidence ?? "—",
                },
                {
                  key: "use",
                  label: "",
                  sortable: false,
                  className: "text-right",
                  cellClass: "text-right",
                  render: (lane) =>
                    onUseReferenceLane ? (
                      <button
                        type="button"
                        data-testid="book-load-miles-reference-use"
                        onClick={() => onUseReferenceLane(lane)}
                        className="font-semibold text-[#1F2A44] hover:underline"
                      >
                        {lane.lane_id === referenceLaneId ? "Use ✓" : "Use"}
                      </button>
                    ) : null,
                },
              ]}
            />
          ) : null}
        </div>
      ) : null}
      {historyOffer ? (
        <p className="border-t border-[#E5E7EB] bg-[#F7F8FA] px-3 py-1 text-xs text-[#1F2A44]" data-testid="book-load-lane-history">
          Seen {historyOffer.runs} times · median {historyOffer.median.toLocaleString(undefined, { maximumFractionDigits: 1 })} mi
          {historyOffer.spread != null
            ? ` · spread ${historyOffer.spread.toLocaleString(undefined, { maximumFractionDigits: 1 })}`
            : ""}{" "}
          {onUseHistoryMiles ? (
            <button
              type="button"
              data-testid="book-load-lane-history-use"
              onClick={onUseHistoryMiles}
              className="ml-2 rounded-sm border border-[#E5E7EB] bg-white px-2 py-0.5 text-xs font-semibold"
            >
              Use
            </button>
          ) : null}
        </p>
      ) : null}
      {newLane && !referenceLanes ? (
        <p className="border-t border-[#E5E7EB] px-3 py-1 text-xs text-[#4B5563]" data-testid="book-load-lane-new">
          New lane — not in the history table. Type practical miles.
        </p>
      ) : null}
      {milesColumnInverted || reverseLaneShortDiff ? (
        <p
          className="border-t border-[#E5E7EB] bg-[#F7F8FA] px-3 py-1 text-xs font-semibold text-[#0F1219]"
          data-testid="book-load-miles-invert-flag"
        >
          {milesColumnInverted && reverseLaneShortDiff
            ? "Short miles exceed practical miles and the reverse lane's short miles differ by more than 100 — verify all three fields before you book."
            : milesColumnInverted
              ? "Short miles exceed practical miles on this lane — verify short miles before you book."
              : "Reverse-lane short miles differ by more than 100 on this road — verify short miles before you book."}
        </p>
      ) : null}
      {provenance ? (
        <p className={provenanceClass(fillConfidence)} data-testid="book-load-miles-provenance">
          {fillConfidence === "check_zip"
            ? `Filled from a lane whose ZIP does not match. Check these miles before you book. ${provenance}`
            : provenance}
        </p>
      ) : null}
      {shortestProvenance ? (
        <p
          className="border-t border-[#E5E7EB] px-3 py-1 text-xs text-[#4B5563]"
          data-testid="book-load-shortest-provenance"
        >
          Shortest: {shortestProvenance}
        </p>
      ) : null}
    </div>
  );
}
