/**
 * CLS-SILENT-CAP — the shared way to fetch a capped list and KNOW whether it was truncated.
 *
 * THE DEFECT THIS EXISTS TO KILL. Every list in this app picks a `limit` literal and then throws the
 * boundary away. `legal.matters` shipped `LIMIT 500` with no offset and no total, so matter 501 did not
 * exist as far as the screen was concerned — and a cap the caller cannot see is indistinguishable from
 * "there is no more data". Nothing errors, nothing warns, the rows are just silently absent. On a
 * legal-evidence surface that is not a UX nit.
 *
 * WHY A HELPER RATHER THAN "ADD A PAGER EVERYWHERE". The 61 baselined offenders are two different
 * problems wearing the same shape, and the wrong fix for either makes things worse:
 *
 *   1. REFERENCE PICKERS (`CustomerEditModal` limit 5000, `AssignTruckModal` limit 500, the accessorial
 *      and journal-entry-type combos). These fill a dropdown. A pager inside a combobox is not a fix —
 *      nobody pages a picker. What the user needs is to be TOLD the option they are looking for may not
 *      be in the list, so they search instead of concluding it does not exist.
 *   2. LISTS AND STRIPS (`FleetOosStrip` limit 500, the accounting/safety page lists). These render rows
 *      as fact. They need the real total, and ideally a pager.
 *
 * Both need the SAME primitive first: a truthful answer to "did this response hit the cap?". That is all
 * this file provides. It deliberately does not render anything and does not fetch anything — mixing the
 * detection into a component is what made the boundary easy to drop in the first place.
 *
 * HONEST LIMIT — READ THIS BEFORE TRUSTING `truncated`. When the API returns a `total`, truncation is
 * EXACT (`total > received`). When it does not, the only available signal is `received >= limit`, which
 * is a HEURISTIC with a known failure in each direction:
 *
 *   FALSE POSITIVE — a list holding exactly `limit` rows reports `truncated: true` while nothing is
 *   missing. Deliberate, and the correct way to err: over-warning costs one redundant search,
 *   under-warning hides a legal matter.
 *
 *   FALSE NEGATIVE (the one that cannot be fixed here) — if the client asks for 500 and the SERVER
 *   silently caps at 200, then `received=200 / limit=500` is indistinguishable from "there were only
 *   200 rows". No arithmetic on those two numbers recovers the difference. This helper reports NOT
 *   truncated in that case, which is the honest answer rather than a guess. Closing it requires the
 *   endpoint to return a `total` (or to echo its effective cap) — which is the real fix, and the
 *   reason `total` is preferred everywhere it exists. Asserted in the tests so it stays documented.
 *
 * `exact` tells you which branch you got, so a caller that needs certainty can require it.
 */

/** What a capped fetch tells us about its own boundary. */
export type ListCapInfo = {
  /** Rows actually received. */
  received: number;
  /** The cap that was requested. */
  limit: number;
  /** Server-reported total when available, else null. */
  total: number | null;
  /** True when rows are known or suspected to be missing. See the honest-limit note above. */
  truncated: boolean;
  /** True when `truncated` came from a server `total` (exact), false when inferred from `received >= limit`. */
  exact: boolean;
  /** Known number of hidden rows; null when the server gave no total. */
  hiddenCount: number | null;
};

/**
 * Compute the cap boundary for a fetched list.
 *
 * @param received length of the array actually rendered
 * @param limit    the cap that was requested
 * @param total    server-reported total, when the endpoint returns one
 */
export function listCapInfo(received: number, limit: number, total?: number | null): ListCapInfo {
  const hasTotal = typeof total === "number" && Number.isFinite(total) && total >= 0;
  if (hasTotal) {
    const t = total as number;
    return {
      received,
      limit,
      total: t,
      truncated: t > received,
      exact: true,
      hiddenCount: Math.max(0, t - received),
    };
  }
  return {
    received,
    limit,
    total: null,
    // Heuristic branch. `>=` not `===` on purpose: a server may cap below the requested limit.
    truncated: received >= limit,
    exact: false,
    hiddenCount: null,
  };
}

/**
 * The sentence to show the user. Returns null when nothing is hidden, so a caller can render
 * `{capNotice(info) && <p>{capNotice(info)}</p>}` without inventing its own copy.
 *
 * Wording is deliberately different for the exact and heuristic cases — claiming "12 more" when we are
 * guessing would be inventing a number, which is the same class of dishonesty this guard is about.
 */
export function capNotice(info: ListCapInfo, noun = "results"): string | null {
  if (!info.truncated) return null;
  if (info.exact && info.hiddenCount && info.hiddenCount > 0) {
    return `Showing ${info.received} of ${info.total} ${noun}. ${info.hiddenCount} not shown — search to narrow.`;
  }
  return `Showing the first ${info.received} ${noun}. There may be more — search to narrow.`;
}
