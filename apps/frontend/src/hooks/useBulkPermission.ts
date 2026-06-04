import { useMemo } from "react";
import { useAuth } from "../auth/useAuth";
import type { UserRole } from "../types/api";

/** Roles allowed to invoke bulk update APIs (matches backend isWriteRole). */
export const BULK_WRITE_ROLES: readonly UserRole[] = ["Owner", "Administrator", "Manager"];

/** Roles allowed for destructive bulk actions (archive, void, bulk_pay, bulk_transfer). */
export const BULK_DESTRUCTIVE_ROLES: readonly UserRole[] = ["Owner", "Administrator"];

export const DEFAULT_DESTRUCTIVE_BULK_ACTIONS = ["archive", "void", "bulk_pay", "bulk_transfer"] as const;

export type BulkPermissionResult = {
  role: UserRole | null;
  canUseBulkOps: boolean;
  canRunDestructiveBulk: boolean;
  isActionAllowed: (action?: string, destructiveActions?: readonly string[]) => boolean;
};

export function useBulkPermission(destructiveActions: readonly string[] = DEFAULT_DESTRUCTIVE_BULK_ACTIONS): BulkPermissionResult {
  const auth = useAuth();
  const role = auth.user?.role ?? null;

  return useMemo(() => {
    const canUseBulkOps = role != null && BULK_WRITE_ROLES.includes(role);
    const canRunDestructiveBulk = role != null && BULK_DESTRUCTIVE_ROLES.includes(role);

    const isActionAllowed = (action?: string, actionDestructiveList?: readonly string[]) => {
      if (!canUseBulkOps) return false;
      if (!action) return true;
      const destructive = actionDestructiveList ?? destructiveActions;
      if (destructive.includes(action) && !canRunDestructiveBulk) return false;
      return true;
    };

    return {
      role,
      canUseBulkOps,
      canRunDestructiveBulk,
      isActionAllowed,
    };
  }, [destructiveActions, role]);
}
