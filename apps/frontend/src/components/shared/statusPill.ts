// Shared §7-compliant status pill class builder — slate-only palette (red reserved for
// delete/Accident). Extracted from DisputeQueuePage.tsx (unchanged behavior) so every dispute-
// style status badge shares ONE literal copy of the locked 11px/700/uppercase class string instead
// of each page re-pasting it (verify-ui-design-system-ratchet.mjs counts every raw text-[Npx]
// occurrence in the tree, even a correctly-locked one, against the frozen raw_font_sizes baseline).
export function statusPill(status: string): string {
  const base = "rounded-sm px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide";
  if (status === "denied") return `${base} border border-slate-200 bg-slate-100 text-slate-700`;
  if (status === "submitted" || status === "under_review" || status === "approved") {
    return `${base} border border-slate-200 bg-slate-100 text-slate-700`;
  }
  return `${base} border border-slate-200 bg-slate-50 text-slate-700`;
}
