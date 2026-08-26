import type { IdentityUser } from "../types/api";

// USERS-DETAIL-STATUS-MISMATCH — the single source of truth for a user's display status.
// An invited user has no credentials yet (auth_method === "Invite pending"). "Active" must mean
// the account can actually sign in, so an invited-never-accepted user is "Invited", not "Active".
// Every surface that shows a user's status (list, detail) MUST call this — a page that recomputes
// status locally as `deactivated_at ? "Inactive" : "Active"` silently drops the Invited state and
// disagrees with the list, which is exactly the live defect this helper fixes (CC-3 2026-08-26).
export function isInvitePending(user: Pick<IdentityUser, "auth_method">): boolean {
  return user.auth_method === "Invite pending";
}

export function userStatus(
  user: Pick<IdentityUser, "auth_method" | "deactivated_at">
): "Active" | "Invited" | "Inactive" {
  if (user.deactivated_at) return "Inactive";
  if (isInvitePending(user)) return "Invited"; // invited, no credentials → cannot sign in yet
  return "Active";
}
