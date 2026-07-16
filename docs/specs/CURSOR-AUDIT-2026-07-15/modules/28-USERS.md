# 28 — USERS (Identity / Admin)

**Verdict:** Solid Owner/Admin identity surface: create user, role-change workflow, deactivate, KPI tabs with URL `?tab=`, returning-dispatcher gate, CSV export of selection. Bulk deactivate is honestly disabled. User detail Activity tab is a stub; Integrity checks flyout link intentionally hidden. Meets QB/NetSuite-style admin basics for invite/role; not a full SSO/IdP console.

## Live evidence notes
**REPO-ONLY.**

- Sidebar: `users` → `/users`, roles Owner/Administrator/SuperAdmin (`sidebar-config.ts:131-138`).
- Flyout: Users, Operator Onboarding, Owner admin tools, Activity/Audit for Owner/SuperAdmin (`:248-268`). Integrity `/admin/integrity` **commented hidden** — route kept (#29).
- Pages: `Users.tsx`, `UserDetail.tsx` (`/users/:id`).
- Create CTA: **+ Create User** (locked vocabulary) (`Users.tsx:460`).

## Surface / button inventory

| Surface | Control | Route/behavior | Status |
|---------|---------|----------------|--------|
| Sidebar USERS | Nav | `/users` | HAVE |
| Flyout | Users | `/users` | HAVE |
| Flyout | Operator Onboarding | `/onboarding` | HAVE |
| Flyout | Migration Status / Error monitor / Launch Readiness / QBO Vendor Linkage | `/admin/*` (Owner) | HAVE |
| Flyout | Activity log / Audit log / Audit Trail | Owner/SuperAdmin | HAVE |
| Flyout | Integrity checks | Hidden; endpoint unshipped | STUB / DEAD (route kept) |
| Header | + Create User | Opens Create User modal | HAVE |
| KPI strip | Total / Active / Pending / Deactivated | Drill `?tab=` | HAVE (`Users.tsx:462-468`) |
| Tabs | All / Active / Pending / Deactivated | URL-synced via `searchParams` | HAVE (`:81-84,189-198`) |
| Search | Filter name/email/role/auth | Client filter | HAVE |
| Bulk bar | Deactivate | Disabled + toast “Coming soon” | STUB honest (`:495-500`) |
| Bulk bar | Export Selected | Client CSV download | HAVE (`:425-456`) |
| Row | Click | Navigate `/users/:id` | HAVE |
| Row | Change Role | Modal → `createIdentityWorkflow` approval | HAVE |
| Row | Deactivate | Confirm → `deactivateUser` (last-owner guard) | HAVE |
| Create modal | Name/Email/Role/Password setup | Invite email OR set password; Viewer rejected | HAVE |
| Create modal | Returning dispatcher check | `checkReturningDispatcher` + override checkbox | HAVE (`:298-321`) |
| Owner tools | Deactivate Probe Accounts | Admin job trigger + poll | HAVE (`:787-840`) |
| Detail | Profile / Company Access tabs | `getUserDetail` | HAVE |
| Detail | Safety File | Dispatcher safety events; **+ Create Event** (Owner) | HAVE (`UserDetail.tsx:293-307`) |
| Detail | Activity tab | Placeholder copy only | STUB (`:404`) |
| Detail tabs | Client `useState` — no `?tab=` | Cannot bookmark Safety File | WILL FAIL bookmark (`:75,245-258`) |

## HAVE / MISSING / DRIFT / WILL FAIL

**HAVE:** Role-gated module; URL list tabs; create with password policy checklist; returning-dispatcher safety gate; per-row deactivate with error toasts; role-change workflow (not silent PATCH); probe deactivation job; dispatcher safety file with void pattern.

**MISSING:** Bulk deactivate API; User Activity audit export on detail; Integrity dashboard restore when backend lands; Viewer role (future — correctly blocked).

**DRIFT:** Flyout admin tools overlap SYSTEM/PROGRAM modules — dual doors KEEP. SuperAdmin in types but create combobox uses ROLE_OPTIONS without SuperAdmin invite path (verify intentional).

**WILL FAIL**
1. **Bulk Deactivate looks actionable in bar** — disabled; operators may think selection is broken until they read toast (`Users.tsx:500`).
2. **User detail Activity tab promises history** — always placeholder (`UserDetail.tsx:404`).
3. **Bookmark User detail Safety File** — tabs not in URL.
4. **Opening hidden Integrity flyout elsewhere** — if bookmarked `/admin/integrity`, expect unshipped endpoint (route kept on purpose).

## Professional recommendation
Ship bulk deactivate as real multi-id API with last-owner and RLS checks (NetSuite-grade) — or remove the bulk control until ready (prefer keep disabled honesty). Wire Activity tab to `/admin/activity` or audit events filtered by actor. Keep Integrity route archived until backend. Never delete Users module or Owner flyout admin doors — add labels (“also under SYSTEM”) if needed.

## Sources
- `apps/frontend/src/pages/Users.tsx`
- `apps/frontend/src/pages/UserDetail.tsx`
- `apps/frontend/src/components/layout/sidebar-config.ts` (L131-138, L248-268)
- `apps/frontend/src/api/identity` (imported create/list/deactivate/workflow)
- `apps/frontend/src/routes/manifest.tsx` (L773-786)
