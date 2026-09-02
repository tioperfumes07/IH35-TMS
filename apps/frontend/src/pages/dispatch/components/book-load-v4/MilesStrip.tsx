import type { LaneMileageFillConfidence } from "../../../../api/dispatch";

type Props = {
  practical?: number;
  shortest?: number;
  deadhead?: number;
  /** Linehaul divided by practical miles. Not the customer invoice basis. */
  ratePerMile?: number;
  /** Operator-facing fill label from the lane lookup (or "Operator entered"). */
  provenance?: string;
  /** Drives warning chrome. check_zip must stay visible — those miles feed pay. */
  fillConfidence?: LaneMileageFillConfidence | "operator";
  onPracticalChange?: (n: number) => void;
  onShortestChange?: (n: number) => void;
  onDeadheadChange?: (n: number) => void;
  shortestRequired?: boolean;
  practicalRequired?: boolean;
  /** MILES-INVERT-01 — inline flag when catalog short > practical. */
  milesColumnInverted?: boolean;
  /** Reverse-lane short miles differ by >100mi (catalog trigger). */
  reverseLaneShortDiff?: boolean;
};

function numFromInput(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function formatMiles(n: number): string {
  return Number.isFinite(n) && n > 0 ? n.toLocaleString(undefined, { maximumFractionDigits: 1 }) : "";
}

function inputValue(n: number): string {
  return Number.isFinite(n) && n > 0 ? String(n) : "";
}

function provenanceClass(fillConfidence?: LaneMileageFillConfidence | "operator"): string {
  switch (fillConfidence) {
    case "check_zip":
      // §7 slate only (no amber). Weight + border make ZIP mismatch louder than a quiet History fill.
      return "border-t border-slate-400 bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-900";
    case "verify":
    case "reverse":
      return "border-t border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600";
    case "operator":
      return "border-t border-slate-200 px-2 py-1 text-xs text-slate-700";
    default:
      return "border-t border-slate-200 px-2 py-1 text-xs text-slate-600";
  }
}

/**
 * Practical miles drive revenue per mile (typed linehaul / practical).
 * Short miles drive driver pay. Empty miles are deadhead into the pickup.
 * Operator labels are English words only (owner 2026-09-01). Column names stay on the wire.
 * GO-16 Rev C / CC-3: provenance under the boxes; Check ZIP stays bold and visible (§7 slate).
 */
export function MilesStrip({
  practical = 0,
  shortest = 0,
  deadhead = 0,
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
}: Props) {
  // fillConfidence drives chrome; provenance is the operator sentence.
  const cell = "flex flex-1 flex-col items-center justify-center border-r border-slate-200 px-2 py-2 text-center last:border-r-0";
  const editable = Boolean(onPracticalChange && onShortestChange);
  return (
    <div className="rounded-sm border border-slate-200 bg-white" data-testid="book-load-miles-strip">
      <div className="flex text-xs font-semibold tracking-wide text-slate-700">
        <div className={cell}>
          <label className="text-slate-600" htmlFor="book-miles-practical">
            Practical miles{practicalRequired ? " *" : ""}
          </label>
          {editable ? (
            <input
              id="book-miles-practical"
              data-testid="book-miles-practical"
              type="number"
              min={0}
              step={0.1}
              required={practicalRequired}
              className={`mt-1 w-full max-w-[7rem] rounded-sm border px-1.5 py-1 font-mono text-xs ${
                practicalRequired ? "border-slate-400 text-slate-900" : "border-slate-300 text-slate-900"
              }`}
              value={inputValue(practical)}
              onChange={(e) => onPracticalChange?.(numFromInput(e.target.value))}
            />
          ) : (
            <div className="font-mono text-xs text-slate-900">{formatMiles(practical)}</div>
          )}
          <div className="text-xs font-normal text-slate-500">revenue per mile</div>
        </div>
        <div className={`${cell} bg-slate-100`}>
          <label className="text-slate-700" htmlFor="book-miles-shortest">
            Short miles{shortestRequired ? " *" : ""}
          </label>
          {editable ? (
            <input
              id="book-miles-shortest"
              data-testid="book-miles-shortest"
              type="number"
              min={0}
              step={0.1}
              required={shortestRequired}
              className={`mt-1 w-full max-w-[7rem] rounded-sm border px-1.5 py-1 font-mono text-xs ${
                shortestRequired ? "border-slate-400 text-slate-900" : "border-slate-300 text-slate-900"
              }`}
              value={inputValue(shortest)}
              onChange={(e) => onShortestChange?.(numFromInput(e.target.value))}
            />
          ) : (
            <div className="font-mono text-xs text-slate-700">{formatMiles(shortest)}</div>
          )}
          <div className="text-xs font-normal text-slate-700">driver pay</div>
        </div>
        <div className={cell}>
          <label className="text-slate-600" htmlFor="book-miles-deadhead">
            Empty miles
          </label>
          {editable ? (
            <input
              id="book-miles-deadhead"
              data-testid="book-miles-deadhead"
              type="number"
              min={0}
              step={0.1}
              className="mt-1 w-full max-w-[7rem] rounded-sm border border-slate-300 px-1.5 py-1 font-mono text-xs text-slate-900"
              value={inputValue(deadhead)}
              onChange={(e) => onDeadheadChange?.(numFromInput(e.target.value))}
            />
          ) : (
            <div className="font-mono text-xs text-slate-900">{formatMiles(deadhead)}</div>
          )}
          <div className="text-xs font-normal text-slate-500">deadhead to pickup</div>
        </div>
        <div className={cell}>
          <div className="text-slate-600">Revenue per mile</div>
          <div className="font-mono text-xs text-slate-900">{ratePerMile > 0 ? `$${ratePerMile.toFixed(3)}` : ""}</div>
        </div>
      </div>
      <p className="border-t border-slate-200 px-2 py-1 text-xs text-slate-600">
        Customer pays the typed rate. Practical miles compute revenue per mile. Short miles pay the driver. Empty miles
        are deadhead company cost.
      </p>
      {milesColumnInverted || reverseLaneShortDiff ? (
        <p
          className="border-t border-slate-400 bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-900"
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
    </div>
  );
}
