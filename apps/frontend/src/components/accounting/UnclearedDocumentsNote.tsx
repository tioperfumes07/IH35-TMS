import { useEffect, useRef, useState } from "react";
import { mmmDd } from "../../lib/formatDate";
import { formatUsdCents } from "../../lib/money";

export type UnclearedDocumentNote = {
  document_type: string;
  document_number: string;
  document_date: string;
  amount_cents: number;
};

/**
 * ROUND 363-CUR-A — name the uncleared document beside the cleared balance.
 * LEAD 443.173 (owner 2026-10-16: "the messages or info that appears should not be permanent … it should not make my screen
 * smaller") — ONE line ("N not cleared · $X · View"); the document list opens in a floating panel on demand and never pushes
 * the page down. Same component on every balance surface, so every screen gets the same behaviour.
 */
export function UnclearedDocumentsNote({ docs }: { docs: UnclearedDocumentNote[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  if (!docs.length) return null;
  const total = docs.reduce((a, d) => a + Number(d.amount_cents ?? 0), 0);
  return (
    <span ref={ref} className="relative ml-1 inline-flex items-center gap-1 text-xs text-[#4B5563]" data-testid="uncleared-documents-note">
      <span>
        {docs.length} {docs.length === 1 ? "document" : "documents"} · {formatUsdCents(total)} not cleared
      </span>
      <button
        type="button"
        className="font-semibold text-[#1F2A44] underline underline-offset-2"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        data-testid="uncleared-documents-note-toggle"
      >
        {open ? "Hide" : "View"}
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Documents not cleared"
          className="absolute left-0 top-full z-30 mt-1 max-h-72 w-max min-w-[320px] max-w-[90vw] overflow-auto rounded-sm border border-gray-200 bg-white p-2 shadow-lg"
          data-testid="uncleared-documents-note-panel"
        >
          <ul>
            {docs.map((d) => (
              <li key={`${d.document_type}-${d.document_number}-${d.document_date}-${d.amount_cents}`} className="whitespace-nowrap py-0.5">
                {d.document_type} {d.document_number} {d.document_date ? mmmDd(d.document_date) : "—"}{" "}
                {formatUsdCents(d.amount_cents)} not cleared
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </span>
  );
}
