import { useState } from "react";

// GLOBAL-TABLE-CONTROLS — shared paginator: First · Prev · Page X of Y · Next · Last + jump-to-page.
type Props = {
  page: number;
  pageCount: number;
  onPageChange: (p: number) => void;
  className?: string;
};

export function Paginator({ page, pageCount, onPageChange, className = "" }: Props) {
  const [jump, setJump] = useState("");
  const safePageCount = Math.max(1, pageCount);
  const clamp = (p: number) => Math.min(safePageCount, Math.max(1, p));
  const go = (p: number) => onPageChange(clamp(p));
  const btn =
    "rounded border border-gray-300 bg-white px-2 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40";

  return (
    <div className={`flex flex-wrap items-center gap-1.5 text-[11px] text-gray-600 ${className}`} role="navigation" aria-label="Pagination">
      <button type="button" className={btn} onClick={() => go(1)} disabled={page <= 1}>« First</button>
      <button type="button" className={btn} onClick={() => go(page - 1)} disabled={page <= 1}>‹ Prev</button>
      <span className="px-1">Page {page} of {safePageCount}</span>
      <button type="button" className={btn} onClick={() => go(page + 1)} disabled={page >= safePageCount}>Next ›</button>
      <button type="button" className={btn} onClick={() => go(safePageCount)} disabled={page >= safePageCount}>Last »</button>
      <span className="ml-2 flex items-center gap-1">
        Jump to
        <input
          type="number"
          min={1}
          max={safePageCount}
          value={jump}
          onChange={(e) => setJump(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && jump) {
              go(Number(jump));
              setJump("");
            }
          }}
          className="h-7 w-14 rounded border border-gray-300 px-1 text-[11px]"
          aria-label="Jump to page"
        />
      </span>
    </div>
  );
}
