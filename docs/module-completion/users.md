# Module completion — Users & Admin

**PROGRESS: 5 of 6** · complete: `false` · as_of: 2026-08-10T04:36:00.000Z · live_sha: `ed061c2`

| Status | Count |
|---|---:|
| PASS | 5 |
| HOLD | 0 |
| OPEN | 1 |
| FAIL | 0 |
| UNVERIFIED | 0 |

| ID | Status | Title | Evidence | PR |
|---|---|---|---|---|
| `USER-S01` | **PASS** | /users roster renders role-scoped operator list | PROD-VERIFIED 2026-08-10 Neon lucia + healthz ed061c2: scoped roster membership resolves 13 users for TRANSP and 6 for USMCA; deployed ParityTable and role gate remain guarded. | PENDING |
| `USER-S02` | **PASS** | Change role ceremony requires approver when policy demands | PROD-VERIFIED 2026-08-10 Neon lucia + healthz ed061c2: identity.workflow_requests is live with WF-064-IDENT-002 role-change data. Deployed Owner/Administrator approver ceremony is ratcheted by verify-user-s02-role-approver.mjs and Users.test; no proof mutation created. | PENDING |
| `USER-S03` | **PASS** | /admin/activity and /admin/audit-log Owner/SuperAdmin reachability | PROD-VERIFIED 2026-08-10 Neon lucia + healthz ed061c2: audit.audit_events has 2,526,479 rows including 120 identity/user/onboarding events. Owner/SuperAdmin activity and audit routes remain ratcheted by verify-user-s03-admin-activity-audit.mjs. | PENDING |
| `USER-S04` | **PASS** | /onboarding Operator Onboarding wizard entity-scoped | PROD-VERIFIED 2026-08-10 Neon lucia + healthz ed061c2: onboarding.onboarding_state has one USMCA company-keyed row and onboarding_state_tenant_scope ALL policy is active. GET/PATCH/seed company scope remains ratcheted by verify-user-s04-onboarding-entity-scope.mjs. | PENDING |
| `USER-S05` | **PASS** | RLS / operating_company_id isolation on user-admin mutations | PROD-VERIFIED 2026-08-10 Neon lucia + healthz ed061c2: org.user_company_access has 8 TRANSP and 6 USMCA rows; identity.users SELECT/INSERT/UPDATE policies are present. Admin mutation target scope and create-company validation remain guarded by verify-user-s05-admin-mutation-opco.mjs; no destructive proof mutation performed. | PENDING |
| `USER-VERIFY-01` | **OPEN** | Users module VERIFY-1..8 TRANSP + USMCA | scaffold — July-31 stub only | — |

Desktop audit: ~/Desktop/IH35-CURSOR-AUDIT/AUDITOR-RUN-2026-07-31/modules/users.md
