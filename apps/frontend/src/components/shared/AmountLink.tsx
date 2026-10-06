import type { MouseEvent, ReactNode } from "react";
import { Link } from "react-router-dom";

/**
 * AmountLink — the drill-through primitive for an AGGREGATE money figure.
 *
 * OWNER LAW (2026-10-04, verbatim): "every single transaction shown must be clickable and take
 * you to that transaction... that is how quickbooks works" — restated by the owner when this
 * component was specified: in QuickBooks EVERYTHING clickable takes you somewhere.
 *
 * WHY THIS EXISTS, AND WHY EntityLink COULD NOT COVER IT
 *   EntityLink answers "which ENTITY is this?" — it takes a kind + an id and opens that one
 *   document. That is correct for a figure that IS a single transaction, and useless for a figure
 *   that is a SUM. A P&L line, an aging bucket, a balance-sheet balance and a column total have no
 *   id; they have a FILTER. LST-F405 measured the consequence: the report pages build those
 *   numbers from a filter and then throw the filter away instead of handing it to a route, so
 *   nothing on them clicked anywhere.
 *
 * THE RULE — one rule, no per-cell judgement:
 *   THE DESTINATION IS DERIVABLE FROM THE FIGURE'S OWN QUERY. THE FILTER *IS* THE DRILL TARGET.
 *   Click a sum and you get the transaction list with that same filter already applied; each row
 *   there opens its own document through EntityLink; that document opens its bank match. One
 *   chain, clickable at every level, all the way down to the thing itself.
 *
 *     $1,850.00 on a bill row          -> id = this bill            -> EntityLink (not this)
 *     A/P 31-60 days: $12,400          -> bills WHERE age 31..60    -> AmountLink{ bills filter }
 *     Fuel: $36,067.97 (P&L)           -> postings WHERE acct+period-> AmountLink{ register filter }
 *     1295 Relay wallet: $33,840 (BS)  -> that account's register   -> AmountLink{ register filter }
 *
 * HONESTY CONTRACT, identical to EntityLink: this NEVER fabricates a route. A filter that cannot
 * be resolved to a mounted route renders as plain text, so a dead cell stays visibly dead instead
 * of becoming a link that 404s. Every route below is verified against routes/manifest.tsx and
 * against the params the destination page actually reads.
 */

/**
 * ACCT-F411 — the five bucket ids, matching AGING_BUCKET_IDS in
 * apps/backend/src/accounting/aging/buckets.ts. Only the NAMES live here; the day boundaries
 * behind them stay server side on purpose, so this file cannot disagree with the aging reports.
 * verify-aging-bucket-ids-match-the-ladder.mjs fails if these five drift from that module.
 */
export type AgingBucketId = "current" | "d1_30" | "d31_60" | "d61_90" | "d90_plus";

/** Styled to match EntityLink exactly — the locked §7 slate token. */
const DEFAULT_LINK_CLASSNAME = "text-slate-700 hover:underline";

/**
 * A money figure's filter. Every field is optional; the resolver picks the narrowest mounted route
 * the supplied fields can satisfy, and returns null when none can be satisfied.
 */
/**
 * A money figure's filter. MEASURED AGAINST THE DESTINATIONS — every field below is a param the
 * destination page actually reads. Nothing here is invented, because a link that navigates and
 * then shows the WRONG rows is worse than plain text: the owner would be reading a filtered list
 * that silently ignored the filter.
 *
 * Verified 2026-10-04 against routes/manifest.tsx and each page's own searchParams.get calls:
 *   /accounting/chart-of-accounts/register/:accountId   AccountRegisterPage.tsx   from_date · to_date
 *     (same component also mounts at /accounting/account-register with ?accountId=; the path form
 *      is the house convention — 12 page files use it vs 5 for the query form)
 *
 * THE BASIS RULE — CLOSED by ACCT-F410. A cash-basis figure now drills, because the register
 * learned the basis instead of the link pretending the mismatch away.
 *
 * What it was: AccountRegisterPage read accountId / from_date / to_date and nothing else, and
 * account-register.service.ts had no basis concept at all (measured 2026-10-05: zero occurrences).
 * Five report pages each put `basis` in the query string and the register silently dropped it, so
 * a cash-basis figure landed on an ACCRUAL register whose total disagreed with the number clicked.
 * ACCT-F410-A returned null here so the figure rendered as plain text — honest, but a lost drill.
 *
 * What it is now: the register ACCEPTS `basis`, and for cash it runs the account through the same
 * accounting/cash-basis/engine.ts `applyCashBasisSuppression` the Trial Balance and Balance Sheet
 * run, classified by the same COA roles the route resolves with resolveRoleAccountOptional. So the
 * register's answer IS the report's answer for that account — zero on the A/R and A/P control
 * accounts (@decision Q3), unchanged everywhere else — and it ties by construction, not by review.
 * Proven in apps/backend/src/accounting/__tests__/account-register-basis.test.ts, which asserts the
 * register's output against the reports' own engine in both directions.
 *
 * So `basis` IS emitted now, and a cash-basis figure keeps its drill.
 *
 */
export type AmountFilter =
  /**
   * GL postings for one account, optionally bounded by a period. The P&L / Balance Sheet case.
   * accountId is the one field the register cannot filter without.
   */
  | {
      target: "register";
      accountId: string;
      from?: string | null;
      to?: string | null;
      /**
       * The basis the FIGURE was computed on. "cash" yields NO route — see THE BASIS RULE above.
       * Omitted or "accrual" drills normally. Callers pass their report's applied basis straight
       * through; they must not decide this themselves, or the rule drifts per page.
       */
      basis?: "accrual" | "cash" | null;
    }
  /** Vendor bills, narrowed by the params BillsPage reads. */
  | {
      target: "bills";
      vendorId?: string | null;
      status?: string | null;
      hasBalance?: boolean | null;
      category?: string | null;
      /**
       * ACCT-F411 — WHICH aging bucket(s), by name. The server resolves them against the one
       * ladder; this side never holds the day boundaries, so it cannot drift from the report that
       * produced the figure. SEVERAL ids when a report column merges buckets — the A/P table's
       * "0–30" is current + 1-30 — and the server requires them to be contiguous. Requires
       * agingAsOf to mean anything.
       */
      agingBucket?: AgingBucketId | readonly AgingBucketId[] | null;
      agingAsOf?: string | null;
    }
  /**
   * ROUND 433.2 — a TOTAL over a set of accounts (a statement section, "Total assets", a P&L section). Opens the ledger
   * lines of exactly those accounts for the period; the ledger page shows opening + listed lines = closing, so the
   * clicked total and the list tie. Same basis rule as the register: a cash-basis figure gets no drill.
   */
  | {
      target: "ledger";
      accountIds: readonly string[];
      from: string;
      to: string;
      basis?: "accrual" | "cash" | null;
    }
  /** Customer invoices, narrowed by the params InvoicesListPage reads. */
  | {
      target: "invoices";
      customerId?: string | null;
      hasBalance?: boolean | null;
      notSent?: boolean | null;
      /** ACCT-F411 — see the bills target: the bucket NAME(s), resolved server side. */
      agingBucket?: AgingBucketId | readonly AgingBucketId[] | null;
      agingAsOf?: string | null;
    };

function qs(
  pairs: Array<[string, string | number | boolean | readonly string[] | null | undefined]>
): string {
  const p = new URLSearchParams();
  for (const [k, v] of pairs) {
    if (v === null || v === undefined || v === "" || v === false) continue;
    // ACCT-F411 — an array APPENDS, so a merged column sends ?aging_bucket=current&aging_bucket=d1_30
    // and the server sees both. set() would have kept only the last one and drilled to half the cell.
    if (Array.isArray(v)) {
      for (const one of v) if (one !== "" && one !== null && one !== undefined) p.append(k, String(one));
      continue;
    }
    p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

/**
 * ACCT-F411 — a bucket without an as-of date is meaningless ("31-60 days" from WHEN?), and an
 * as-of without a bucket filters nothing while looking filtered. Half the pair would navigate to a
 * list computed off the server's today instead of the report's as-of: a different number, silently.
 * So the pair travels whole or the route is null and the figure stays plain text.
 */
function agingPairIsWhole(
  bucket: string | readonly string[] | null | undefined,
  asOf: string | null | undefined
): boolean {
  const hasBucket = Array.isArray(bucket) ? bucket.length > 0 : Boolean(bucket);
  const hasAsOf = Boolean(asOf);
  return hasBucket === hasAsOf;
}

/**
 * Resolve a filter to a mounted route, or null. Mirrors resolveEntityRoute's discipline: a target
 * with no route, or missing the one field its route cannot work without, returns null rather than
 * a guess.
 */
export function resolveAmountRoute(filter: AmountFilter | null | undefined): string | null {
  if (!filter) return null;
  switch (filter.target) {
    case "register":
      if (!filter.accountId) return null;
      // PATH form, not the query form. BOTH routes mount the SAME component
      // (AccountRegisterPage reads useParams accountId AND searchParams accountId), and the path
      // form is the house convention: 12 page files use it, 5 use the query form. Using the path
      // form here consolidates onto the majority instead of adding a third spelling.
      // ACCT-F410 — from_date, to_date AND basis are all read by AccountRegisterPage and honored
      // by account-register.service.ts. Only "cash" is emitted: accrual is the default on both
      // sides (@decision Q7), so sending it would change every existing URL for no behavior.
      return `/accounting/chart-of-accounts/register/${filter.accountId}${qs([
        ["from_date", filter.from],
        ["to_date", filter.to],
        ["basis", filter.basis === "cash" ? "cash" : null],
      ])}`;
    case "ledger":
      // No accounts = no total to explain; a cash-basis figure would not tie to the accrual ledger.
      if (!filter.accountIds.length || filter.basis === "cash") return null;
      return `/accounting/reclassify${qs([
        ["account_ids", filter.accountIds.join(",")],
        ["from_date", filter.from],
        ["to_date", filter.to],
      ])}`;
    case "bills":
      // ACCT-F411 — a bucket without an as-of date is meaningless ("31-60 days" from when?), so
      // the pair travels together or not at all. Half of it would navigate to a list filtered off
      // the server's today instead of the report's as-of: a different number, silently.
      if (!agingPairIsWhole(filter.agingBucket, filter.agingAsOf)) return null;
      return `/accounting/bills${qs([
        ["vendor_id", filter.vendorId],
        ["status", filter.status],
        ["has_balance", filter.hasBalance ? "true" : null],
        ["category", filter.category],
        ["aging_bucket", filter.agingBucket],
        ["as_of", filter.agingAsOf],
      ])}`;
    case "invoices":
      // ACCT-F411 — see the bills case: the bucket and its as-of date travel together or not at all.
      if (!agingPairIsWhole(filter.agingBucket, filter.agingAsOf)) return null;
      return `/accounting/invoices${qs([
        ["customer_id", filter.customerId],
        ["has_balance", filter.hasBalance ? "true" : null],
        ["not_sent", filter.notSent ? "true" : null],
        ["aging_bucket", filter.agingBucket],
        ["as_of", filter.agingAsOf],
      ])}`;
    default:
      return null;
  }
}

export type AmountLinkProps = {
  /** The filter that produced this figure. null/undefined renders plain text. */
  filter: AmountFilter | null | undefined;
  /** The formatted figure, already money-formatted by the caller. */
  children: ReactNode;
  className?: string;
  title?: string;
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
  "data-testid"?: string;
};

export function AmountLink({
  filter,
  children,
  className,
  title,
  onClick,
  "data-testid": testId,
}: AmountLinkProps) {
  const route = resolveAmountRoute(filter);
  if (!route) {
    return (
      <span className={className} title={title} data-testid={testId}>
        {children}
      </span>
    );
  }
  return (
    <Link
      to={route}
      className={className ?? DEFAULT_LINK_CLASSNAME}
      title={title ?? "Show the transactions behind this figure"}
      data-testid={testId}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(event);
      }}
    >
      {children}
    </Link>
  );
}
