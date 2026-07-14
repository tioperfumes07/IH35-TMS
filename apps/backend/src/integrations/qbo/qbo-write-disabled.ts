// QBO-WRITE-KILL — reconcile-only architecture lock.
//
// TMS is RECONCILE-ONLY: it must NEVER create or update a QuickBooks object. QBO is the system of
// record through 12/31/2025; the books are kept in parallel and reconciled, never written back
// (docs/specs/ACCOUNTING-ARCHITECTURE.md). Every former outbound QBO-write callsite now funnels
// through this hard, permanent no-op instead of issuing an entity POST/PATCH. Read / reconcile /
// mirror-pull paths (query, cdc, companyinfo, GETs) are unaffected.
//
// Enforced by scripts/verify-no-qbo-write-path.mjs (a POST/PATCH to a QBO entity endpoint fails the
// build). Do NOT re-introduce an outbound entity write here or anywhere without removing this lock
// with explicit owner sign-off.

export const QBO_WRITE_DISABLED_CODE = "qbo_write_disabled_reconcile_only";

/** Permanent no-op for a former QBO-write path. Throws — a caller can never create/update a QBO object. */
export function qboWriteDisabled(context: string): never {
  const err = new Error(QBO_WRITE_DISABLED_CODE) as Error & { code?: string; context?: string };
  err.code = QBO_WRITE_DISABLED_CODE;
  err.context = context;
  throw err;
}
