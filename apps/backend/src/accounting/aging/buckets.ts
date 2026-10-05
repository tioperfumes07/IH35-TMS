/**
 * ACCT-F411 — THE AGING LADDER. One definition, two renderings, proven equivalent.
 *
 * WHY THIS FILE EXISTS
 *   An aging bucket on a report ("A/P 31-60 days: $12,400") could not be clicked, because the
 *   bills and invoices lists had no age filter at all — BillsPage read vendor_id / status /
 *   has_balance / category, InvoicesListPage read customer_id / has_balance / not_sent. So the
 *   largest clickable class in the owner's click-through law had no destination that could
 *   reproduce the figure, and under the honesty contract in components/shared/AmountLink.tsx those
 *   cells stayed plain text rather than linking to a list that silently ignored the filter.
 *
 *   Giving the lists an age window is only half the job. The window has to land on EXACTLY the
 *   rows the report counted, or the owner clicks $12,400 and gets a list that adds to something
 *   else. "Write the same boundaries in a second place and keep them in step" is not a fix; it is
 *   the next defect with a delay on it. MEASURED 2026-10-05, before this file existed: the ladder
 *   was ALREADY written twice and the two copies had already diverged on the date they age off —
 *     ap-aging.service.ts  assignAgingBucket(), due date = COALESCE(b.due_date, b.bill_date)
 *     ar-aging.service.ts  the same 0/30/60/90 ladder inlined by hand, due date = i.due_date
 *   so a third and fourth copy for the two lists was never acceptable.
 *
 * WHY THE WIRE CARRIES A BUCKET NAME AND NOT TWO DAY NUMBERS
 *   The list endpoints take `aging_bucket=d31_60`, not `age_min_days=31&age_max_days=60`. The
 *   frontend therefore never holds the boundaries and cannot drift from them — it sends WHICH
 *   bucket was clicked and this module decides what that means. It also removes a whole error
 *   class by construction: there is no way to send a window whose max is below its min, so there
 *   is no empty-but-looks-filtered list to guard against. (The alternative — publishing the ladder
 *   to a shared package — would mean changing the backend's build to reach outside its rootDir;
 *   the bucket id needs no build change and leaves fewer ways to be wrong.)
 *
 * WHAT IS CANONICAL HERE
 *   AGING_BUCKETS below is the ONLY place the boundaries exist. Everything else is derived:
 *     assignAgingBucket()     the JS classifier the aging reports use
 *     agingWindowPredicate()  the SQL the lists filter with
 *     agingBucketWindow()     a bucket id -> its window, for the drill-through
 *   The report and the list agree by CONSTRUCTION, not by review. The two tests in
 *   aging/__tests__ pin it the rest of the way: they run the SQL against a REAL Postgres and the
 *   classifier in JS over the same date matrix — including real tables with real NULLs and both
 *   live due-date expressions — and require identical answers. A boundary edited here cannot pass
 *   while the two renderings disagree.
 *
 * SEMANTICS, preserved exactly as the reports already computed them — this file changes no number:
 *   daysOverdue = as_of - due_date, in whole days. Postgres `date - date` is already integer days.
 *   NO DUE DATE is "current". A/P coalesces the bill date in first, so only a bill with neither
 *   date lands there; A/R's due_date is NOT NULL. COALESCE(..., 0) in the SQL reproduces it.
 *   NOT YET DUE is "current" too: daysOverdue <= 0, negatives included. That is why "current" has
 *   no lower bound rather than a bound of 0.
 *
 * @decision Q4 / VQ4 — "AR/AP aging endpoints remain accrual only." Nothing here touches basis:
 * this is a date window over the same open-balance rows the aging reports already reconstruct. The
 * accrual-only rule is untouched, and no cash-basis path gains a drill from this change.
 */

export type AgingBucketId = "current" | "d1_30" | "d31_60" | "d61_90" | "d90_plus";

export const AGING_BUCKET_IDS: readonly AgingBucketId[] = [
  "current",
  "d1_30",
  "d31_60",
  "d61_90",
  "d90_plus",
];

export type AgingBucketDef = {
  id: AgingBucketId;
  /** Inclusive lower bound on days overdue. null = no lower bound (not-yet-due counts as current). */
  minDaysOverdue: number | null;
  /** Inclusive upper bound on days overdue. null = no upper bound (the oldest bucket). */
  maxDaysOverdue: number | null;
  /** Operator-facing label, so a report header and a drilled list say the same thing. */
  label: string;
};

/** THE LADDER. Edit here and nowhere else. Ordered youngest to oldest. */
export const AGING_BUCKETS: readonly AgingBucketDef[] = [
  { id: "current", minDaysOverdue: null, maxDaysOverdue: 0, label: "Current" },
  { id: "d1_30", minDaysOverdue: 1, maxDaysOverdue: 30, label: "1-30 days" },
  { id: "d31_60", minDaysOverdue: 31, maxDaysOverdue: 60, label: "31-60 days" },
  { id: "d61_90", minDaysOverdue: 61, maxDaysOverdue: 90, label: "61-90 days" },
  { id: "d90_plus", minDaysOverdue: 91, maxDaysOverdue: null, label: "91+ days" },
];

export type AgingWindow = { minDaysOverdue: number | null; maxDaysOverdue: number | null };

export function isAgingBucketId(value: unknown): value is AgingBucketId {
  return typeof value === "string" && (AGING_BUCKET_IDS as readonly string[]).includes(value);
}

/** Days between two ISO dates, as whole days. Mirrors Postgres `date - date`. */
export function daysOverdue(asOfDate: string, dueDate: string | null | undefined): number {
  if (!dueDate) return 0;
  const asOf = Date.parse(`${asOfDate.slice(0, 10)}T00:00:00.000Z`);
  const due = Date.parse(`${String(dueDate).slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(asOf) || Number.isNaN(due)) return 0;
  return Math.round((asOf - due) / 86_400_000);
}

/** True when `days` falls inside the window. The one containment rule both renderings obey. */
export function isInAgingWindow(days: number, window: AgingWindow): boolean {
  if (window.minDaysOverdue !== null && days < window.minDaysOverdue) return false;
  if (window.maxDaysOverdue !== null && days > window.maxDaysOverdue) return false;
  return true;
}

/**
 * The JS classifier. Derived from AGING_BUCKETS, so it cannot drift from the SQL. Replaces the
 * hand-written ladder in ap-aging.service.ts and the second copy inlined in ar-aging.service.ts.
 */
export function assignAgingBucket(asOfDate: string, dueDate: string | null | undefined): AgingBucketId {
  const days = daysOverdue(asOfDate, dueDate);
  for (const bucket of AGING_BUCKETS) {
    if (isInAgingWindow(days, bucket)) return bucket.id;
  }
  // Unreachable while the ladder covers the number line, which bucketLadderIsTotal() asserts.
  return "d90_plus";
}

/** The window a given bucket covers. This is what a clicked bucket id resolves to, server side. */
export function agingBucketWindow(id: AgingBucketId): AgingWindow {
  const found = AGING_BUCKETS.find((b) => b.id === id);
  if (!found) throw new Error(`unknown_aging_bucket:${id}`);
  return { minDaysOverdue: found.minDaysOverdue, maxDaysOverdue: found.maxDaysOverdue };
}

/**
 * The ladder must cover every integer with no gap and no overlap, or a row could land in two
 * buckets (double-counted) or none (silently dropped). Asserted by the tests rather than trusted,
 * because a future edit to AGING_BUCKETS is exactly where that would happen.
 */
export function bucketLadderIsTotal(): { ok: true } | { ok: false; reason: string } {
  const first = AGING_BUCKETS[0];
  const last = AGING_BUCKETS[AGING_BUCKETS.length - 1];
  if (!first || first.minDaysOverdue !== null) return { ok: false, reason: "first bucket must be open below" };
  if (!last || last.maxDaysOverdue !== null) return { ok: false, reason: "last bucket must be open above" };
  for (let i = 0; i < AGING_BUCKETS.length - 1; i += 1) {
    const a = AGING_BUCKETS[i];
    const b = AGING_BUCKETS[i + 1];
    if (a.maxDaysOverdue === null) return { ok: false, reason: `${a.id} is open above but is not last` };
    if (b.minDaysOverdue === null) return { ok: false, reason: `${b.id} is open below but is not first` };
    if (b.minDaysOverdue !== a.maxDaysOverdue + 1) {
      return { ok: false, reason: `gap or overlap between ${a.id} and ${b.id}` };
    }
  }
  return { ok: true };
}

/**
 * The SQL counterpart of isInAgingWindow, as a WHERE predicate.
 *
 * @param dueDateExpr the table's due-date expression — A/P passes BILL_AGING_DUE_DATE_SQL
 *                    (COALESCE(b.due_date, b.bill_date)), A/R passes `i.due_date`, each matching
 *                    what its own aging report reconstructs. Caller-supplied SQL, never user input.
 * @param bind        binds a value and returns its `$n` placeholder, so this composes with the
 *                    existing where/values builders instead of replacing them.
 * Returns null when the window is unbounded both ways, so an absent filter adds no SQL at all.
 */
export function agingWindowPredicate(
  dueDateExpr: string,
  asOfDate: string,
  window: AgingWindow,
  bind: (value: unknown) => string
): string | null {
  if (window.minDaysOverdue === null && window.maxDaysOverdue === null) return null;
  const asOfParam = bind(asOfDate);
  // Postgres date - date yields integer days. COALESCE(..., 0) makes a missing due date "current",
  // the same answer daysOverdue() gives it in JS.
  const days = `COALESCE(${asOfParam}::date - (${dueDateExpr})::date, 0)`;
  const parts: string[] = [];
  if (window.minDaysOverdue !== null) parts.push(`${days} >= ${bind(window.minDaysOverdue)}`);
  if (window.maxDaysOverdue !== null) parts.push(`${days} <= ${bind(window.maxDaysOverdue)}`);
  return parts.length === 1 ? parts[0] : `(${parts.join(" AND ")})`;
}

/**
 * Resolve a request's `aging_bucket` to a window. Accepts ONE id or SEVERAL, because a report
 * column is not always one bucket: MEASURED 2026-10-05, the A/P aging table's "0–30" column is
 * `current + b1_30` (reports/ap-aging.routes.ts line 173, `bucket_0_30_cents: current + b1_30`),
 * two buckets in one figure. Wiring that column to a single bucket id would have drilled to HALF
 * of the money it displays — a link that navigates to a different number than the one clicked,
 * which is the whole defect class this block exists to close. So the column sends both ids and
 * gets the span they cover.
 *
 * A SPAN, not an OR: the ids are required to be CONTIGUOUS on the ladder, and the window returned
 * runs from the youngest selection's lower bound to the oldest selection's upper bound. A
 * non-contiguous selection (current + 61-90, say) cannot be expressed as one window, and silently
 * spanning the gap would include 1-60 and overstate the list. It throws instead.
 *
 * Returns null when nothing was sent, so every existing caller keeps its behavior untouched.
 */
export function agingWindowFromBucket(
  bucket: string | readonly string[] | null | undefined
): AgingWindow | null {
  if (bucket === null || bucket === undefined) return null;
  const requested = (Array.isArray(bucket) ? bucket : [bucket]).filter((b) => b !== "");
  if (requested.length === 0) return null;
  for (const id of requested) {
    if (!isAgingBucketId(id)) throw new Error(`unknown_aging_bucket:${id}`);
  }
  const indices = requested
    .map((id) => AGING_BUCKETS.findIndex((b) => b.id === id))
    .sort((a, b) => a - b);
  const deduped = [...new Set(indices)];
  for (let i = 1; i < deduped.length; i += 1) {
    if (deduped[i] !== deduped[i - 1] + 1) {
      throw new Error(`non_contiguous_aging_buckets:${requested.join(",")}`);
    }
  }
  const first = AGING_BUCKETS[deduped[0]];
  const last = AGING_BUCKETS[deduped[deduped.length - 1]];
  return { minDaysOverdue: first.minDaysOverdue, maxDaysOverdue: last.maxDaysOverdue };
}
