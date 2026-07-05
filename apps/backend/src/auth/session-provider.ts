/**
 * Session provider seam (H2-3).
 *
 * Single indirection point between the application and the underlying session
 * engine. Lucia is end-of-maintenance (frozen at 3.x — see
 * docs/specs/repairs/REPAIR-H2-3-LUCIA-DEPRECATION-DESIGN.md). Every session
 * create / validate / invalidate / cookie operation in the codebase flows
 * through this module so the eventual swap to the in-house session layer is a
 * localized, single-file change instead of a repo-wide edit.
 *
 * IMPORTANT: these are 1:1 pass-throughs to the current Lucia instance. They
 * intentionally add NO behavior. Do not add logic here without a paired update
 * to the migration design doc. `getGoogleOAuthClient` (arctic/OAuth) is NOT a
 * session operation and continues to be imported directly from ./lucia.js.
 */
import { lucia } from "./lucia.js";

/** Create a new session for a user. Mirrors `lucia.createSession`. */
export const createSession = (
  ...args: Parameters<typeof lucia.createSession>
): ReturnType<typeof lucia.createSession> => lucia.createSession(...args);

/** Validate a session id, returning `{ session, user }`. Mirrors `lucia.validateSession`. */
export const validateSession = (
  ...args: Parameters<typeof lucia.validateSession>
): ReturnType<typeof lucia.validateSession> => lucia.validateSession(...args);

/** Invalidate a single session. Mirrors `lucia.invalidateSession`. */
export const invalidateSession = (
  ...args: Parameters<typeof lucia.invalidateSession>
): ReturnType<typeof lucia.invalidateSession> => lucia.invalidateSession(...args);

/** Build the Set-Cookie payload for a session id. Mirrors `lucia.createSessionCookie`. */
export const createSessionCookie = (
  ...args: Parameters<typeof lucia.createSessionCookie>
): ReturnType<typeof lucia.createSessionCookie> => lucia.createSessionCookie(...args);
