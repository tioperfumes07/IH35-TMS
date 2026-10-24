/**
 * ROUND 443.254 N1 + 443.258-B (D006–D014) — every Settlements tab stays under
 * /driver-finance/… (Settlements module mount; sidebar id `settlements`) so the
 * Settlements tab bar and SETTLEMENTS sidebar stay active. Never jump to /drivers,
 * /feed-gate, /cash-advances, /liabilities, or /accounting/escrow.
 *
 * ROUND 443.280-A — Open / Closed / Payments / Company & Driver / Disputes / Needs
 * Review are own subnav tabs (not a Button row under the Settlements home board).
 */
export type SettlementsSubnavItem = {
  label: string;
  to: string;
  match?: string;
  testId?: string;
};

export const SETTLEMENTS_SUBNAV: readonly SettlementsSubnavItem[] = [
  { label: "Drivers", to: "/driver-finance/drivers", match: "/driver-finance/drivers" },
  { label: "Profiles", to: "/driver-finance/profiles", match: "/driver-finance/profiles" },
  { label: "Pre-Settlements", to: "/driver-finance/pre-settlements", match: "/driver-finance/pre-settlements" },
  { label: "Settlements", to: "/driver-finance/settlements", match: "/driver-finance/settlements" },
  { label: "Open", to: "/driver-finance/settlements?tab=open", testId: "tab-settlements-open" },
  { label: "Closed", to: "/driver-finance/settlements?tab=closed", testId: "tab-settlements-closed" },
  { label: "Payments", to: "/driver-finance/settlements?tab=payments", testId: "tab-settlements-payments" },
  { label: "Company & Driver", to: "/driver-finance/settlements?tab=company_driver", testId: "tab-company-driver" },
  { label: "Company Settlements", to: "/driver-finance/company-settlements", match: "/driver-finance/company-settlements", testId: "tab-company-settlements" },
  { label: "Disputes", to: "/driver-finance/settlements?tab=disputes", testId: "tab-settlements-disputes" },
  { label: "Needs Review", to: "/driver-finance/settlements?tab=needs_review", testId: "tab-needs-review" },
  { label: "Batch Settlements", to: "/driver-finance/settlements/batch", match: "/driver-finance/settlements/batch" },
  { label: "Feed Gate", to: "/driver-finance/feed-gate", match: "/driver-finance/feed-gate" },
  { label: "Settlement Close", to: "/driver-finance/settlement-close", match: "/driver-finance/settlement-close" },
  { label: "Cash Advance Requests", to: "/driver-finance/cash-advance-requests", match: "/driver-finance/cash-advance-requests" },
  { label: "Cash Advances", to: "/driver-finance/cash-advances", match: "/driver-finance/cash-advances" },
  { label: "Liabilities", to: "/driver-finance/liabilities", match: "/driver-finance/liabilities" },
  { label: "Escrow", to: "/driver-finance/escrow", match: "/driver-finance/escrow" },
  { label: "Pay Rate Templates", to: "/driver-finance/pay-rate-templates", match: "/driver-finance/pay-rate-templates" },
  { label: "Deductions", to: "/driver-finance/deductions", match: "/driver-finance/deductions" },
] as const;

/** Escrow register for one driver — stays in Settlements module. */
export function settlementsEscrowRegisterHref(driverId: string): string {
  return `/driver-finance/escrow/${encodeURIComponent(driverId)}`;
}
