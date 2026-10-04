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
 * KNOWN GAP, NOT PAPERED OVER: AccountRegisterPage reads only accountId / from_date / to_date. It
 * does NOT read `basis`. BalanceSheetPage's local registerHref already passes basis and the
 * register silently ignores it, so a CASH-basis balance sheet drills into an ACCRUAL register.
 * This component does not pass basis rather than pretend it works. Filed as the basis gap.
 *   /accounting/bills             BillsPage.tsx             vendor_id · status · has_balance · category
 *   /accounting/invoices          InvoicesListPage.tsx      customer_id · has_balance · not_sent
 *
 * DELIBERATELY ABSENT: aging-bucket bounds. BillsPage and InvoicesListPage read no age/date params
 * at all, so an A/P or A/R aging bucket CANNOT yet drill to its own rows. Those cells must stay
 * plain text (this component renders them as such) until the destination learns the params. Adding
 * an `ageMinDays` here before then would be exactly the fake green this guard class exists to stop.
 */
export type AmountFilter =
  /**
   * GL postings for one account, optionally bounded by a period. The P&L / Balance Sheet case.
   * accountId is the one field the register cannot filter without.
   */
  | { target: "register"; accountId: string; from?: string | null; to?: string | null }
  /** Vendor bills, narrowed by the params BillsPage reads. */
  | {
      target: "bills";
      vendorId?: string | null;
      status?: string | null;
      hasBalance?: boolean | null;
      category?: string | null;
    }
  /** Customer invoices, narrowed by the params InvoicesListPage reads. */
  | {
      target: "invoices";
      customerId?: string | null;
      hasBalance?: boolean | null;
      notSent?: boolean | null;
    };

function qs(pairs: Array<[string, string | number | boolean | null | undefined]>): string {
  const p = new URLSearchParams();
  for (const [k, v] of pairs) {
    if (v === null || v === undefined || v === "" || v === false) continue;
    p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
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
      // from_date / to_date are read by AccountRegisterPage (verified). `basis` is NOT read by it,
      // so this deliberately does not pass one — see the file header note on the basis gap.
      return `/accounting/chart-of-accounts/register/${filter.accountId}${qs([
        ["from_date", filter.from],
        ["to_date", filter.to],
      ])}`;
    case "bills":
      return `/accounting/bills${qs([
        ["vendor_id", filter.vendorId],
        ["status", filter.status],
        ["has_balance", filter.hasBalance ? "true" : null],
        ["category", filter.category],
      ])}`;
    case "invoices":
      return `/accounting/invoices${qs([
        ["customer_id", filter.customerId],
        ["has_balance", filter.hasBalance ? "true" : null],
        ["not_sent", filter.notSent ? "true" : null],
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
