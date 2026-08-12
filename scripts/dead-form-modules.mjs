/**
 * Single source of truth for @archived / dead Workflow-B forms (verify-dead-forms-unmounted)
 * and list-error discovery exclusions (verify-list-error-state-coverage).
 *
 * A dead form must never enter the list-error baseline — operators cannot reach it, so
 * ListErrorState there is cosmetic and conflicts with verify-dead-forms-unmounted.
 */
const SCAN_ROOT = "apps/frontend/src";

/** Module paths under apps/frontend/src without .tsx — same set as verify-dead-forms-unmounted. */
export const DEAD_FORM_MODULE_SUFFIXES = [
  "pages/banking/BankTxCategorizationPage",
  "pages/banking/components/CategorizeDrawer",
  "pages/banking/components/forms/ApplyToBillForm",
  "pages/banking/components/forms/BillPaymentForm",
  "pages/banking/components/forms/CreateExpenseForm",
  "pages/banking/components/forms/DriverSettlementForm",
  "pages/banking/components/forms/FactoringAdvanceForm",
  "pages/banking/components/forms/ManualJEForm",
  "pages/banking/components/forms/SplitTransactionModal",
  "pages/banking/components/forms/TransferForm",
  "pages/maintenance/WorkOrderCreateModal",
];

export function deadFormTsxPath(suffix) {
  return `${SCAN_ROOT}/${suffix}.tsx`;
}

export const DEAD_FORM_TSX_PATHS = DEAD_FORM_MODULE_SUFFIXES.map(deadFormTsxPath);

export const DEAD_FORM_TSX_PATH_SET = new Set(DEAD_FORM_TSX_PATHS);

export const DEAD_FORM_BASENAMES = new Set(DEAD_FORM_MODULE_SUFFIXES.map((m) => m.split("/").pop()));

/**
 * Live pages with alternate honest outage UX — not dead, but must not enter discovery baseline.
 * LegacyAuditScoreboardPage: placeholderData + explicit stale/fallback banners (PROG-PRFEED).
 *
 * CustomersListView.tsx / VendorsListView.tsx (CLS-LIST-ERROR-STATE-UNGUARDED vertical drain) —
 * both are SUBCOMPONENTS rendered by a parent (Customers.tsx / Vendors.tsx respectively) that
 * already early-returns a `<ListErrorState .../>` BEFORE rendering the subcomponent at all when
 * its roster query errors (Vendors.tsx:286-292 is the AUTO-13 canonical fix; Customers.tsx:475-479
 * mirrors it). The per-file static scan cannot see that call-graph relationship, so it flags the
 * subcomponent as having no error branch even though the actual page always shows one. Verified
 * by reading both parents before exempting — this is the guard's own documented
 * detector-blind-to-a-moved-control failure mode, not a real gap.
 */
export const LIST_ERROR_DISCOVERY_EXEMPT_EXTRA = [
  "apps/frontend/src/pages/program/LegacyAuditScoreboardPage.tsx",
  "apps/frontend/src/pages/customers/CustomersListView.tsx",
  "apps/frontend/src/pages/vendors/VendorsListView.tsx",
];

export const LIST_ERROR_DISCOVERY_EXEMPT_PATHS = [
  ...DEAD_FORM_TSX_PATHS,
  ...LIST_ERROR_DISCOVERY_EXEMPT_EXTRA,
];

export const LIST_ERROR_DISCOVERY_EXEMPT_SET = new Set(LIST_ERROR_DISCOVERY_EXEMPT_PATHS);

export function normalizeRepoRelPath(relPath) {
  return relPath.replace(/\\/g, "/");
}

export function isListErrorDiscoveryExempt(relPath) {
  return LIST_ERROR_DISCOVERY_EXEMPT_SET.has(normalizeRepoRelPath(relPath));
}
