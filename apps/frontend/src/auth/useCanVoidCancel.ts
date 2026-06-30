// [HOLD-FOR-JORGE — TIER 1] useCanVoidCancel — frontend mirror of the backend void/cancel authz.
//
// Void/cancel EXECUTORS = Owner | Administrator | Accountant (Jorge-locked 2026-06-29). Everyone else
// must FILE a void/cancel request for an executor to approve. Use this hook to gate direct-void/cancel
// controls in the UI; non-executors should see a "Request void/cancel" path instead. The backend is the
// real gate (lib/authz/void-cancel-authz.ts) — this only mirrors it for UX.

import { useAuth } from "./useAuth";

/** The three executor roles allowed to void/cancel directly (keep in lockstep with the backend). */
export const VOID_CANCEL_EXECUTOR_ROLES = ["Owner", "Administrator", "Accountant"] as const;

/** True when the current user may void/cancel DIRECTLY (Owner|Administrator|Accountant). */
export function useCanVoidCancel(): boolean {
  const { user } = useAuth();
  const role = user?.role ?? "";
  return role === "Owner" || role === "Administrator" || role === "Accountant";
}
