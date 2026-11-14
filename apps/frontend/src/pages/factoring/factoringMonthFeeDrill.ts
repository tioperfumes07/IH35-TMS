/**
 * ROUND 8.20 board18 — Monthly fee / statement chargeback+fee totals drill to the
 * Chargebacks & Fees history for that statement month (date_from/date_to), with ret.
 */
import { withReturnContext } from "../../lib/returnContext";
import { FACTORING_TAB_PATH } from "../../router/route-manifest";

/** First/last calendar day of the statement month (YYYY-MM or YYYY-MM-DD). */
export function statementMonthBounds(raw: string | null | undefined): { from: string; to: string } | null {
  if (!raw) return null;
  const ym = /^(\d{4})-(\d{2})/.exec(String(raw).trim());
  if (!ym) return null;
  const y = Number(ym[1]);
  const mo = Number(ym[2]);
  if (!Number.isFinite(y) || mo < 1 || mo > 12) return null;
  const from = `${ym[1]}-${ym[2]}-01`;
  const lastDay = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const to = `${ym[1]}-${ym[2]}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

/** Chargebacks & Fees tab filtered to the statement month; ret restores the origin board. */
export function buildMonthlyFeeDrillHref(statementMonth: string | null | undefined, originHref: string): string | null {
  const bounds = statementMonthBounds(statementMonth);
  if (!bounds) return null;
  const target =
    `${FACTORING_TAB_PATH.chargebacks_fees}` +
    `?date_from=${encodeURIComponent(bounds.from)}&date_to=${encodeURIComponent(bounds.to)}`;
  return withReturnContext(target, originHref);
}
