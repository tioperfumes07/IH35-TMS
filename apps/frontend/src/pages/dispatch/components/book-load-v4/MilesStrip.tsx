type Props = {
  practical?: number;
  shortest?: number;
  deadhead?: number;
  /** Linehaul divided by practical miles. Not the customer invoice basis. */
  ratePerMile?: number;
  provenance?: string;
  onPracticalChange?: (n: number) => void;
  onShortestChange?: (n: number) => void;
  onDeadheadChange?: (n: number) => void;
  shortestRequired?: boolean;
  practicalRequired?: boolean;
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

/**
 * Practical miles drive revenue per mile (typed linehaul / practical).
 * Short miles drive driver pay. Empty miles are deadhead into the pickup.
 * Operator labels are English words only (owner 2026-09-01). Column names stay on the wire.
 */
export function MilesStrip({
  practical = 0,
  shortest = 0,
  deadhead = 0,
  ratePerMile = 0,
  provenance,
  onPracticalChange,
  onShortestChange,
  onDeadheadChange,
  shortestRequired = false,
  practicalRequired = false,
}: Props) {
  const cell = "flex flex-1 flex-col items-center justify-center border-r border-slate-200 px-2 py-2 text-center last:border-r-0";
  const editable = Boolean(onPracticalChange && onShortestChange);
  return (
    <div className="rounded-sm border border-slate-200 bg-white" data-testid="book-load-miles-strip">
      <div className="flex text-[10px] font-semibold tracking-wide text-slate-700">
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
              className={`mt-1 w-full max-w-[7rem] rounded-sm border px-1.5 py-1 font-mono text-sm ${
                practicalRequired ? "border-slate-400 text-slate-900" : "border-slate-300 text-slate-900"
              }`}
              value={inputValue(practical)}
              onChange={(e) => onPracticalChange?.(numFromInput(e.target.value))}
            />
          ) : (
            <div className="font-mono text-sm text-slate-900">{formatMiles(practical)}</div>
          )}
          <div className="text-[9px] font-normal text-slate-500">revenue per mile</div>
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
              className={`mt-1 w-full max-w-[7rem] rounded-sm border px-1.5 py-1 font-mono text-sm ${
                shortestRequired ? "border-slate-400 text-slate-900" : "border-slate-300 text-slate-900"
              }`}
              value={inputValue(shortest)}
              onChange={(e) => onShortestChange?.(numFromInput(e.target.value))}
            />
          ) : (
            <div className="font-mono text-sm text-slate-700">{formatMiles(shortest)}</div>
          )}
          <div className="text-[9px] font-normal text-slate-700">driver pay</div>
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
              className="mt-1 w-full max-w-[7rem] rounded-sm border border-slate-300 px-1.5 py-1 font-mono text-sm text-slate-900"
              value={inputValue(deadhead)}
              onChange={(e) => onDeadheadChange?.(numFromInput(e.target.value))}
            />
          ) : (
            <div className="font-mono text-sm text-slate-900">{formatMiles(deadhead)}</div>
          )}
          <div className="text-[9px] font-normal text-slate-500">deadhead to pickup</div>
        </div>
        <div className={cell}>
          <div className="text-slate-600">Revenue per mile</div>
          <div className="font-mono text-sm text-slate-900">{ratePerMile > 0 ? `$${ratePerMile.toFixed(3)}` : ""}</div>
        </div>
      </div>
      <p className="border-t border-slate-200 px-2 py-1 text-[9px] text-slate-600">
        Customer pays the typed rate. Practical miles compute revenue per mile. Short miles pay the driver and already include empty miles.
        {provenance ? ` ${provenance}` : ""}
      </p>
    </div>
  );
}
