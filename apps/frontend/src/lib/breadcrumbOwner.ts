import { useLayoutEffect, useSyncExternalStore } from "react";

/**
 * R433 (U18) — one breadcrumb per page. Shell mounts <StructuralBreadcrumb /> for every route; a page
 * that renders its own breadcrumb (shared Breadcrumb, PageHeader trail, Accounting wrapper) claims the
 * slot here so the Shell one steps aside — no page ever shows two.
 */
let claims = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function useClaimBreadcrumb(enabled = true): void {
  useLayoutEffect(() => {
    if (!enabled) return undefined;
    claims += 1;
    emit();
    return () => {
      claims -= 1;
      emit();
    };
  }, [enabled]);
}

export function useBreadcrumbClaimed(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => claims > 0,
    () => false,
  );
}
