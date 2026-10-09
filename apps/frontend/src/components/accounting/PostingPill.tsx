// ACC-51 (owner 01:33Z: "Accounting → Expenses list + Bills list carry the same truth as Load
// costs"): one shared pill, reused by both lists, so "posted / held / unposted" never drifts into
// different renderings of the same three states.
//
// ACC-50 REMOVED (claude/00-SEAT-CONTRACT.md §3 corollary, owner ruling 2026-09-29): "tour_open" can
// no longer occur as a hold reason for a NEW row (nothing writes it any more) — a held row now means
// a genuine remaining reason (no resolvable payment account/vendor, an account-mapping failure,
// etc.), still worth surfacing honestly rather than silently hidden. Renders whatever hold reason is
// actually present instead of special-casing one specific (now-retired) cause.
//
// Red for the hold is intentional and on-palette: verify-section7-palette-financial.mjs's
// OFF_PALETTE regex only flags amber/emerald/green/yellow — red is reserved for exactly this kind
// of real, actionable financial-control alert (matches this file's own sibling void-button red
// already live in ExpensesListPage.tsx). Slate/gray for the two non-alert states, matching each
// list's own existing §7 "no green/red on a browse list" status-pill convention.
function humanizeHoldReason(reason: string): string {
  return reason.replace(/^post_failed:/, "post failed: ").replace(/_/g, " ");
}

export function PostingPill({ posted, holdReason }: { posted: boolean; holdReason?: string | null }) {
  if (holdReason) {
    return (
      <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
        held — {humanizeHoldReason(holdReason)}
      </span>
    );
  }
  if (posted) {
    return <span className="inline-flex rounded-full bg-[#F7F8FA] px-2 py-0.5 text-xs font-semibold text-[#1F2A44]">posted</span>;
  }
  return <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">unposted</span>;
}
