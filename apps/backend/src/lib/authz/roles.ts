// Role predicates — pure, no HTTP. Services import them from here; they used to live in bulk/bulk-update.factory.ts (a route
// factory), so two money services (cash-advance disburse, driver reimbursement) dragged the auth middleware and session
// provider in just to compare a role string (CC-2 2026-10-04).
export function isOwnerOrAdmin(role: string): boolean {
  return role === "Owner" || role === "Administrator";
}
