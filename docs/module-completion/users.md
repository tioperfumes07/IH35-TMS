# Module completion — Users & Admin

**PROGRESS: 5 of 6** · complete: `false` · as_of: 2026-08-09 · live_sha: `—`

| Status | Count |
|---|---:|
| PASS | 5 |
| HOLD | 0 |
| OPEN | 1 |
| FAIL | 0 |
| UNVERIFIED | 0 |

| ID | Status | Title | Evidence | PR |
|---|---|---|---|---|
| `USER-S01` | **PASS** | /users roster renders role-scoped operator list | Users.tsx ParityTable roster + SecondaryNavTabs (all/active/pending/deactivated); listUsers(isOwnerOrAdmin) Owner/Admin gate; Users.test.tsx Add User + Deactivate suites render roster rows and action controls. | PENDING |
| `USER-S02` | **PASS** | Change role ceremony requires approver when policy demands | Change Role modal shows Required approver Combobox when new_role is Owner/Administrator; submit disabled until distinct approver selected; payload.required_approver_user_id sent to createIdentityWorkflow (identity.workflow_requests.payload jsonb). Guard: scripts/verify-user-s02-role-approver.mjs; test: Users.test Change role ceremony. | PENDING |
| `USER-S03` | **PASS** | /admin/activity and /admin/audit-log Owner/SuperAdmin reachability | sidebar-config users flyout: Owner//SuperAdmin → Activity log /admin/activity + Audit log /admin/audit-log; manifest OwnerSuperAdminRoute mounts ActivityLogPage + AuditLogViewer (not ComingSoon); ActivityLogPage→fetchAdminActivity; AuditLogViewer→listAuditViewerEvents. Guard: scripts/verify-user-s03-admin-activity-audit.mjs. | PENDING |
| `USER-S04` | **PASS** | /onboarding Operator Onboarding wizard entity-scoped | sidebar users flyout: Operator Onboarding → /onboarding; manifest ProtectedRoute mounts OnboardingWizard; wizard uses selectedCompanyId + operating_company_id on GET/PATCH/seed; empty company gate; backend state.routes assertCompanyMembership + withCompanyScope + app.operating_company_id GUC; onboarding.onboarding_state keyed by company_id. Guard: scripts/verify-user-s04-onboarding-entity-scope.mjs. | PENDING |
| `USER-S05` | **PASS** | RLS / operating_company_id isolation on user-admin mutations | identity.users RLS is role-only (Owner/Administrator UPDATE any row). PATCH /users/:id + POST /users/:id/deactivate now apply TARGET_USER_IN_ACTOR_COMPANY_SCOPE_SQL (user_accessible_company_ids + user_company_access) matching GET detail, plus optional operating_company_id via tenantQuerySchema. POST /users create validates resolved operating_company_id (body or creator default) is in actor accessible set (operating_company_required / operating_company_forbidden). Guard: scripts/verify-user-s05-admin-mutation-opco.mjs (ITEM-14 pattern; no verify-steps/CLAIMED). | PENDING |
| `USER-VERIFY-01` | **OPEN** | Users module VERIFY-1..8 TRANSP + USMCA | scaffold — July-31 stub only | — |

Desktop audit: ~/Desktop/IH35-CURSOR-AUDIT/AUDITOR-RUN-2026-07-31/modules/users.md
