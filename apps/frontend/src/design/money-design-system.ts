// ROUND-20.8 PART A — THE MONEY DESIGN SYSTEM (permanent, define once). Owner ask: "what we can
// change, graphics, colors, design, something more lively." Today Banking/Factoring/Accounting all
// render every number in the same flat gray at the same weight — a 59% uncategorized rate, a
// posting blocker, and a routine balance look identical. This file is the single source every money
// module (Banking here; CC-1's Accounting ROUND 20.9, CC-3's Factoring ROUND 21.0) imports rather
// than re-inventing its own tone/color/threshold logic.
//
// A1 — SEMANTIC COLOR ON NUMBERS, NOT DECORATION. A tile/value picks its tone from a THRESHOLD,
// never from a developer's mood — every call site that assigns a MoneyTone must carry a comment
// naming the threshold that produced it (see BankingHome.tsx's own KPI tiles for the pattern).

export type MoneyTone = "good" | "warn" | "bad" | "neutral";

/** good = reconciled/matched/funded/balanced · warn = needs review/unmatched/stale/pending ·
 * bad = blocked/overdue/unbound GL/failed · neutral = informational money (no verdict implied). */
export const MONEY_TONE_COLORS: Record<MoneyTone, { text: string; bg: string }> = {
  good: { text: "#16A34A", bg: "#e8f6ec" },
  warn: { text: "#B45309", bg: "#fdf3e3" },
  bad: { text: "#B42318", bg: "#fdecea" },
  neutral: { text: "#14314F", bg: "#ffffff" },
};

/** A darker "value" shade per tone — the reference build (09-12-2026-Claude-Lead-MONEY-MODULES-
 * PREVIEW.html) uses a slightly deeper green for the good tile's big value than the flat --ok text
 * color, so numerals stay legible on white at 27px/700 rather than reading as pastel. */
export const MONEY_TONE_VALUE_COLOR: Record<MoneyTone, string> = {
  good: "#166534",
  warn: MONEY_TONE_COLORS.warn.text,
  bad: MONEY_TONE_COLORS.bad.text,
  neutral: "#14314F",
};

// A6 — the validated dataviz palette. No other series color is permitted on a money-module
// sparkline — scripts/verify-money-module-design.mjs greps for stray hex values inside <svg>
// blocks in the money component directory.
export const MONEY_DATAVIZ_PALETTE = { blue: "#2a78d6", green: "#1baf7a", amber: "#eda100" } as const;

const HOUR_MS = 60 * 60 * 1000;
/** A5 — STALENESS IS VISIBLE. Any "last sync" older than this reads warn with its age in words,
 * never a raw timestamp sitting next to a healthy badge. */
export const STALE_AFTER_HOURS = 4;

/** Renders an ISO/Date "last sync" instant as an age-in-words label plus the tone it should render
 * in. Never returns a raw timestamp string — A5 bars that outright. `null`/`undefined` means "never
 * synced," which is its own (bad) state, not silently "0 hours ago." */
export function staleSyncLabel(lastSyncAt: string | null | undefined): { label: string; tone: MoneyTone } {
  if (!lastSyncAt) return { label: "never synced", tone: "bad" };
  const at = new Date(lastSyncAt);
  if (Number.isNaN(at.getTime())) return { label: "never synced", tone: "bad" };
  const ms = Date.now() - at.getTime();
  if (ms < 0) return { label: "just now", tone: "good" };
  const hours = ms / HOUR_MS;
  const label = hours < 1 ? `${Math.max(1, Math.round(ms / 60000))} minutes ago` : hours < 48 ? `${Math.round(hours)} hours ago` : `${Math.round(hours / 24)} days ago`;
  return { label, tone: hours > STALE_AFTER_HOURS ? "warn" : "good" };
}

/** A3 — NO BARE EM-DASH. Every "not applicable" dash must carry a reason. The three cases the spec
 * names render as distinct, honest copy rather than one undifferentiated "—":
 *   "not_applicable"  — this figure does not apply to this row/contract
 *   "no_source"       — no source column/field exists in this schema for this figure yet
 *   "not_loaded"      — the data exists but this query/screen hasn't fetched it yet
 */
export type NaReason = "not_applicable" | "no_source" | "not_loaded";
export const NA_REASON_TITLE: Record<NaReason, string> = {
  not_applicable: "Not applicable to this row.",
  no_source: "No source column exists in this schema for this figure yet.",
  not_loaded: "Not loaded yet.",
};

/** A4 — DESTRUCTIVE ACTIONS ARE NEVER THE LOUDEST THING. Neutral text at rest; the bad color and
 * its background only apply on hover/focus. Tailwind classes, not an inline style, so every
 * destructive control in a money module shares the one binding. */
export const MONEY_DESTRUCTIVE_CLASS =
  "text-[#5d6b7a] hover:text-[#B42318] hover:bg-[#fdecea] focus-visible:text-[#B42318] focus-visible:bg-[#fdecea] rounded-sm px-1.5 py-0.5 transition-colors";
