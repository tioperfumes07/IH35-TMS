/**
 * LEAD 443.219 G-VOCAB — the frontend twin of apps/backend/src/lib/document-status-vocabulary.ts (the backend cannot import
 * this package at runtime). scripts/verify-document-status-vocabulary.mjs fails when the two lists drift.
 */
export const AP_BILL_STATUSES = ["unpaid", "partially_paid", "paid", "void"] as const;
export const AP_BILL_LEGACY_STATUSES = ["open", "partial", "voided"] as const;
export const AP_BILL_OUTSTANDING_STATUSES = ["open", "unpaid", "partial", "partially_paid"] as const;

export const DRIVER_BILL_STATUSES = ["open", "approved", "paid", "void", "disputed"] as const;
export const DRIVER_BILL_OUTSTANDING_STATUSES = ["open", "approved", "disputed"] as const;

export const LOAD_STATUSES_WITHOUT_DRIVER_BILL = ["draft", "cancelled", "voided", "abandoned", "driver_walkoff", "driver_no_show"] as const;
