# REPAIR H2-3 — Lucia deprecation: migration design + touchpoint inventory

**Finding:** `lucia` (and its `@lucia-auth/adapter-postgresql` adapter) is
end-of-maintenance. The upstream project is frozen — no further feature or
security releases — and its author has publicly recommended that projects own
their session layer directly rather than depend on the library.

**Status of THIS PR (H2-3, step 1 — the safe first step only):**

1. **Pinned** `lucia` → `3.2.2` and `@lucia-auth/adapter-postgresql` → `3.1.2`
   (exact versions, caret removed, in both `package.json` and
   `package-lock.json`). These are the last published stable releases; no
   floating upgrade can now surprise the auth path.
2. **Documented** the deprecation inline at the single import site
   (`apps/backend/src/auth/lucia.ts` header) pointing at this doc + the seam.
3. **Added a seam** — `apps/backend/src/auth/session-provider.ts` — a 1:1
   pass-through around the four session operations we use, and rewired every
   caller through it. No behavior change (tsc clean; all 19 auth unit tests
   green).

**This PR deliberately does NOT change auth behavior.** No rip-and-replace.
Auth is the highest-blast-radius surface in the system (a mistake locks
everyone out), so the actual replacement is scoped into later, independently
shippable blocks below.

---

## 1. Why the swap is small in practice

Lucia is doing very little for us. Two things:

- **Session lifecycle** — issue / validate / invalidate opaque session ids,
  backed by a Postgres table.
- **Session cookie assembly** — serialize the session id into a `Set-Cookie`
  payload with our attributes.

The **session store already exists** and is a plain table we own:

```
identity.sessions (
  id         text PRIMARY KEY,                 -- opaque session id (Lucia-generated, 40-char)
  user_id    uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
)
-- indexes: idx_sessions_user_id, idx_sessions_expires_at
-- users PK renamed uuid -> id specifically for the Lucia adapter (migration 0005)
```

(See `db/migrations/0004_identity_init.sql` + `0005_identity_id_rename.sql`.)

There is **no Lucia-proprietary state** in the DB — no library-specific
columns, no encoding we don't control. That is what makes the eventual swap a
localized code change rather than a data migration.

---

## 2. Touchpoint inventory (complete — verified by grep)

### 2.1 Direct package imports of `lucia` / `@lucia-auth/*` (source, excl. `dist/`, `node_modules/`)

| File | Import | Purpose | After swap |
|------|--------|---------|------------|
| `apps/backend/src/auth/lucia.ts` | `Lucia`, `NodePostgresAdapter` | Constructs the singleton `lucia` instance + DB adapter | Replaced by in-house `SessionService` |
| `apps/backend/src/auth/session-cookie-policy.ts` | `type CookieAttributes`, `type SessionCookieAttributesOptions` | Type shapes for our cookie-attribute helpers | Replace with our own local types (mechanical) |

That is the **entire** package surface — two files.

### 2.2 Consumers of the local `lucia` session instance — NOW routed through the seam

All of these previously imported `{ lucia }` from `./lucia.js` and called
methods on it. After this PR they import named functions from
`./session-provider.js`:

| File | Operation(s) used | Line(s) |
|------|-------------------|---------|
| `apps/backend/src/auth/session-middleware.ts` | `validateSession`, `createSessionCookie` | 49, 51 |
| `apps/backend/src/auth/session-create.ts` | `createSession` | 19 |
| `apps/backend/src/auth/routes.ts` | `createSessionCookie`, `invalidateSession` | 120, 159 |
| `apps/backend/src/auth/invite.routes.ts` | `createSession`, `invalidateSession`, `createSessionCookie` | 78, 92, 119 |
| `apps/backend/src/auth/office-login.routes.ts` | `createSessionCookie` | 124 |
| `apps/backend/src/auth/email-routes.ts` | `createSessionCookie` | 230 |
| `apps/backend/src/auth/phone-routes.ts` | `createSessionCookie` | 235 |

> `routes.ts` still imports `getGoogleOAuthClient` from `./lucia.js` — that is
> **arctic/OAuth**, not a session op, and is intentionally out of the seam's
> scope.

### 2.3 The complete Lucia session API we depend on

Only **four** methods are used anywhere in the codebase. This is the entire
contract the in-house layer must reproduce:

| Lucia call | Returns | In-house replacement |
|------------|---------|----------------------|
| `createSession(userId, attributes)` | `{ id, userId, expiresAt, fresh }` | `INSERT` a row into `identity.sessions` with a CSPRNG id + TTL |
| `validateSession(sessionId)` | `{ session, user } \| { session: null, user: null }`; also sliding-expiry `fresh` flag | `SELECT` join sessions→users, check `expires_at`, extend if in the second half of TTL |
| `invalidateSession(sessionId)` | `void` | `DELETE` (or void-not-delete tombstone — see §4) by id |
| `createSessionCookie(sessionId)` | `{ name, value, attributes }` | Build the cookie object from our existing `session-cookie-policy.ts` attributes |

Session **attributes** registered today (`lucia.ts` `getUserAttributes`):
`email`, `role`, `google_user_id`. No custom *session* attributes are
registered. `session-middleware.ts` reads `result.user.id / .email / .role`.

### 2.4 Related same-author dependencies (NOT changed here; tracked)

- `arctic` (`^3.7.0`) — Google OAuth PKCE. Still used
  (`getGoogleOAuthClient`); actively maintained upstream. Left on caret.
- `oslo` (`^1.2.1`) — same author, deprecated. Audit its usage in a follow-up
  (it is a transitive/utility dep, not on the session hot path). Out of scope
  for H2-3.

---

## 3. The seam (shipped in this PR)

`apps/backend/src/auth/session-provider.ts` exports four thin, typed
pass-throughs (`createSession`, `validateSession`, `invalidateSession`,
`createSessionCookie`) that forward to the current `lucia` instance with
`Parameters<>` / `ReturnType<>` so the types are identical to Lucia's.

**Invariant going forward:** no file outside `auth/lucia.ts` may import `lucia`
directly. Every session op goes through `session-provider.ts`. When the swap
lands, only `session-provider.ts` (and `lucia.ts`) change — the seven callers
in §2.2 stay untouched.

> Recommended follow-up guard: a static CI check (grep) that fails if
> `from "./lucia.js"` / `from "lucia"` appears anywhere except `lucia.ts`,
> `session-cookie-policy.ts`, and `session-provider.ts`. Mirrors the repo's
> "every fix gets a CI guard" rule. (Not added in this PR to keep it
> behavior-free; add it in Block 1 below.)

---

## 4. In-house session layer — target design

A small `SessionService` behind the seam, using the pool wiring that already
exists (`auth/db.ts`: `luciaPool` runs with `app.bypass_rls=lucia` + `SET ROLE
ih35_app`; reuse or rename to `sessionPool`).

- **Id generation:** 40 chars from a CSPRNG, base32/base64url (matches Lucia's
  entropy: ~256 bits). `crypto.randomBytes` / `randomUUID`-derived. Store the
  id (or a hash of it — see hardening note) in `identity.sessions.id`.
- **create:** `INSERT (id, user_id, expires_at)` with `expires_at = now() +
  SESSION_TTL` (Lucia default is 30 days; **match current effective TTL exactly**
  — confirm from Lucia's `expires: false` cookie + 30-day session window before
  cutover).
- **validate:** single `SELECT` joining `identity.sessions` → `identity.users`
  filtered on `id` and `expires_at > now()`. Return `null` when missing/expired.
  Reproduce Lucia's **sliding expiration**: if the session is past the halfway
  point of its TTL, `UPDATE expires_at` and mark the returned session `fresh`
  so the middleware re-issues the cookie (existing behavior in
  `session-middleware.ts` lines 50-52 depends on `fresh`).
- **invalidate:** `DELETE FROM identity.sessions WHERE id = $1`. Per the repo's
  void-not-delete rule, evaluate a tombstone/`revoked_at` column instead of a
  hard delete for auditability; sessions are ephemeral, so a scheduled purge of
  expired rows is acceptable — decide with the audit spine owner.
- **cookie:** reuse `session-cookie-policy.ts` verbatim; only the type imports
  (`CookieAttributes`, `SessionCookieAttributesOptions`) get swapped for local
  equivalents. Cookie name stays `ih35_session`; attributes stay
  prod=`SameSite=None; Secure` / partitioned per env.

**Hardening opportunities to fold in during the swap (do not silently
regress):**
- Store `sha256(sessionId)` at rest and compare hashes on validate (so a DB
  leak doesn't yield live session tokens). This is a behavior/security change —
  requires a session-invalidation window at cutover; gate it.
- Add `created_at`, `last_seen_at`, `user_agent`/`ip` for a "sessions/devices"
  admin view (additive, optional).

**Schema:** `identity.sessions` already satisfies the minimum. Any added
columns (`revoked_at`, `created_at`, hash) are **additive, idempotent
migrations** and — touching `identity.*` on the auth path — are **financial-
cluster-adjacent / STOP-gated**: show full SQL, get Jorge's explicit OK, never
self-merge (§1.3–1.4 of the constitution).

---

## 5. Block breakdown (each independently shippable; auth never half-migrated)

- **H2-3 (this PR) — SAFE FIRST STEP:** pin versions, document deprecation,
  add the seam + rewire callers. No behavior change. ✅
- **Block 1 — Lockdown guard:** add the static CI grep guard (§3) so no new
  direct `lucia` import can be introduced while the migration is in flight.
  Pure-CI, non-financial, auto-mergeable.
- **Block 2 — `SessionService` behind the seam (parity, flag OFF):** implement
  create/validate/invalidate/cookie in-house against `identity.sessions`,
  byte-for-byte parity with Lucia (id entropy, 30-day TTL, sliding-expiry
  `fresh`). Wire behind a `SESSION_ENGINE=inhouse|lucia` flag defaulting to
  `lucia`. Ship dark. Dual-read compatibility: existing Lucia-issued session
  ids remain valid because the row format is identical.
- **Block 3 — Cutover:** flip the flag to `inhouse` in a low-traffic window;
  because the store is shared and id-compatible, existing logins survive. Watch
  auth error rate; instant rollback = flip the flag back.
- **Block 4 — Remove Lucia:** delete `lucia.ts`'s Lucia construction, drop
  `lucia` + `@lucia-auth/adapter-postgresql` from `package.json`/lockfile, and
  replace the type imports in `session-cookie-policy.ts`. Localized to the two
  files in §2.1 plus `session-provider.ts`.
- **Block 5 (optional) — Hardening:** session-id hashing at rest + device/
  session admin view (§4). Behavior change → its own gated block.

## 6. Risk / rollback

- **This PR:** version pin can only *reduce* drift (already the resolved
  versions); seam is a pure delegation verified by tsc + the auth test suite.
  Rollback = revert the PR; nothing stateful changed.
- **Blocks 2-3:** the flag makes cutover reversible in one env-var flip. The
  shared, id-compatible `identity.sessions` table means no session wipe and no
  data migration at cutover.
