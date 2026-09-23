import { useQuery } from "@tanstack/react-query";
import { getUser } from "../api/identity";
import { entityLabel } from "../lib/entity-label";

/**
 * R-102-B ("who voided") — resolves a single identity.users id to a human-readable display name.
 *
 * Deliberately wraps `getUser(id)` (GET /api/v1/identity/users/:id), NOT `listUsers()`. listUsers is
 * explicitly Owner/Administrator-only (see api/identity.ts's own USERS-2 comment); a voided-by name is
 * shown to every role that can view the document, so a gated directory call would 403 for most viewers.
 * getUser is authenticated-only (no role gate) and also resolves a since-deactivated actor, which
 * listAssignableUsers (active users only) would silently drop.
 *
 * Never fabricates a name: while loading or on any failure (including a 404 for a hard-deleted/
 * unresolvable id) this returns null, and the caller falls back to entityLabel's honest
 * "<Noun> — not visible" sentence rather than inventing or hiding the gap.
 */
export function useUserName(userId: string | null | undefined) {
  const id = userId?.trim() || null;
  const query = useQuery({
    queryKey: ["identity", "user-name", id],
    queryFn: () => getUser(id as string),
    enabled: Boolean(id),
    staleTime: 5 * 60 * 1000,
  });
  const user = query.data;
  const full = user ? [user.first_name, user.last_name].filter(Boolean).join(" ").trim() : "";
  const name = user ? entityLabel(user.name || full || user.email, user.id, "User") : null;
  return { ...query, name };
}
