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
 */
export const LIST_ERROR_DISCOVERY_EXEMPT_EXTRA = [
  "apps/frontend/src/pages/program/LegacyAuditScoreboardPage.tsx",
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
