type Props = {
  practical?: number;
  shortest?: number;
  deadhead?: number;
  ratePerMile?: number;
  /** Manual entry until PC*MILER — required for driver pay (shortest). */
  onPracticalChange?: (n: number) => void;
  onShortestChange?: (n: number) => void;
  onDeadheadChange?: (n: number) => void;
  /** When true, shortest field shows required affordance. */
  shortestRequired?: boolean;
};

function numFromInput(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * Manual short + practical miles (owner 2026-08-09: no PC*MILER yet).
 * Previously display-only while real inputs lived in a hidden div — every book shipped 0.
 */
export function MilesStrip({
  practical = 0,
  shortest = 0,
  deadhead = 0,
  ratePerMile = 0,
  onPracticalChange,
  onShortestChange,
  onDeadheadChange,
  shortestRequired = false,
}: Props) {
  const cell = "flex flex-1 flex-col items-center justify-center border-r border-gray-200 px-2 py-2 text-center last:border-r-0";
  const editable = Boolean(onPracticalChange && onShortestChange);
  return (
    <div className="rounded-sm border border-slate-200 bg-white" data-testid="book-load-miles-strip">
      <div className="flex text-[10px] font-semibold uppercase tracking-wide text-slate-700">
        <div className={cell}>
          <label className="text-gray-500" htmlFor="book-miles-practical">
            Practical (long)
          </label>
          {editable ? (
            <input
              id="book-miles-practical"
              data-testid="book-miles-practical"
              type="number"
              min={0}
              step={1}
              className="mt-1 w-full max-w-[7rem] rounded-sm border border-gray-300 px-1.5 py-1 font-mono text-sm text-gray-900"
              value={Number.isFinite(practical) ? practical : 0}
              onChange={(e) => onPracticalChange?.(numFromInput(e.target.value))}
            />
          ) : (
            <div className="font-mono text-sm text-gray-900">{Number.isFinite(practical) ? practical.toLocaleString() : "—"}</div>
          )}
          <div className="text-[9px] font-normal normal-case text-gray-500">fuel + ETA</div>
        </div>
        <div className={`${cell} bg-slate-100`}>
          <label className="text-slate-700" htmlFor="book-miles-shortest">
            Shortest{shortestRequired ? " *" : ""}
          </label>
          {editable ? (
            <input
              id="book-miles-shortest"
              data-testid="book-miles-shortest"
              type="number"
              min={0}
              step={1}
              required={shortestRequired}
              className="mt-1 w-full max-w-[7rem] rounded-sm border border-slate-400 px-1.5 py-1 font-mono text-sm text-slate-900"
              value={Number.isFinite(shortest) ? shortest : 0}
              onChange={(e) => onShortestChange?.(numFromInput(e.target.value))}
            />
          ) : (
            <div className="font-mono text-sm text-slate-700">{Number.isFinite(shortest) ? shortest.toLocaleString() : "—"}</div>
          )}
          <div className="text-[9px] font-normal normal-case text-slate-700">driver pay</div>
        </div>
        <div className={cell}>
          <label className="text-gray-500" htmlFor="book-miles-deadhead">
            Deadhead
          </label>
          {editable ? (
            <input
              id="book-miles-deadhead"
              data-testid="book-miles-deadhead"
              type="number"
              min={0}
              step={1}
              className="mt-1 w-full max-w-[7rem] rounded-sm border border-gray-300 px-1.5 py-1 font-mono text-sm text-gray-900"
              value={Number.isFinite(deadhead) ? deadhead : 0}
              onChange={(e) => onDeadheadChange?.(numFromInput(e.target.value))}
            />
          ) : (
            <div className="font-mono text-sm text-gray-900">{Number.isFinite(deadhead) ? deadhead.toLocaleString() : "—"}</div>
          )}
        </div>
        <div className={cell}>
          <div className="text-gray-500">RPM</div>
          <div className="font-mono text-sm text-gray-900">{ratePerMile > 0 ? ratePerMile.toFixed(3) : "—"}</div>
        </div>
      </div>
      <p className="border-t border-slate-200 px-2 py-1 text-[9px] text-gray-600">
        Type miles manually (PC*MILER not connected yet). Shortest = driver pay. Practical = fuel / ETA.
      </p>
    </div>
  );
}
