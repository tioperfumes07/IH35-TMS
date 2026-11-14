/**
 * ROUND 8.20 board18 — Faro Daily Import money columns drill factoring cohorts
 * for that statement day (date_from=date_to), with ret back to Faro imports.
 */
import { withReturnContext } from "../../lib/returnContext";
import { FACTORING_TAB_PATH } from "../../router/route-manifest";

export type FaroImportMoneyKind = "gross" | "advance" | "reserve" | "fee" | "chargeback";

/** Single calendar day bounds (YYYY-MM-DD). */
export function statementDayBounds(raw: string | null | undefined): { from: string; to: string } | null {
  if (!raw) return null;
  const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(raw).trim());
  if (!day) return null;
  const y = Number(day[1]);
  const mo = Number(day[2]);
  const d = Number(day[3]);
  if (!Number.isFinite(y) || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const iso = `${day[1]}-${day[2]}-${day[3]}`;
  return { from: iso, to: iso };
}

function tabForKind(kind: FaroImportMoneyKind): string {
  switch (kind) {
    case "gross":
      return FACTORING_TAB_PATH.purchase_report;
    case "advance":
      return FACTORING_TAB_PATH.payments_to_you;
    case "reserve":
      return FACTORING_TAB_PATH.escrow_account;
    case "fee":
    case "chargeback":
      return FACTORING_TAB_PATH.chargebacks_fees;
    default:
      return FACTORING_TAB_PATH.chargebacks_fees;
  }
}

/** Factoring tab filtered to the Faro statement day; ret restores Faro imports. */
export function buildFaroImportDrillHref(
  kind: FaroImportMoneyKind,
  statementDate: string | null | undefined,
  originHref: string,
): string | null {
  const bounds = statementDayBounds(statementDate);
  if (!bounds) return null;
  return buildFaroImportRangeDrillHref(kind, bounds.from, bounds.to, originHref);
}

/** Factoring tab filtered to an explicit date range (summary KPI drills). Always returns a ret href. */
export function buildFaroImportRangeDrillHref(
  kind: FaroImportMoneyKind,
  dateFrom: string | null | undefined,
  dateTo: string | null | undefined,
  originHref: string,
): string {
  const from = String(dateFrom ?? "").trim();
  const to = String(dateTo ?? "").trim();
  const params = new URLSearchParams();
  if (from) params.set("date_from", from);
  if (to) params.set("date_to", to);
  const qs = params.toString();
  const target = qs ? `${tabForKind(kind)}?${qs}` : tabForKind(kind);
  return withReturnContext(target, originHref);
}
