# Module completion — Users & Admin

**PROGRESS: 4 of 6** · complete: `false` · as_of: 2026-08-09 · live_sha: `—`

| Status | Count |
|---|---:|
| PASS | 4 |
| HOLD | 0 |
| OPEN | 2 |
| FAIL | 0 |
| UNVERIFIED | 0 |

| ID | Status | Title | Evidence | PR |
|---|---|---|---|---|
| `USER-S01` | **PASS** | /users roster renders role-scoped operator list | Users.tsx ParityTable roster + SecondaryNavTabs (all/active/pending/deactivated); listUsers(isOwnerOrAdmin) Owner/Admin gate; Users.test.tsx Add User + Deactivate suites render roster rows and action controls. | PENDING |
| `USER-S02` | **PASS** | Change role ceremony requires approver when policy demands | Change Role modal shows Required approver Combobox when new_role is Owner/Administrator; submit disabled until distinct approver selected; payload.required_approver_user_id sent to createIdentityWorkflow (identity.workflow_requests.payload jsonb). Guard: scripts/verify-user-s02-role-approver.mjs; test: Users.test Change role ceremony. | PENDING |
| `USER-S03` | **PASS** | /admin/activity and /admin/audit-log Owner/SuperAdmin reachability | sidebar-config users flyout: Owner//SuperAdmin → Activity log /admin/activity + Audit log /admin/audit-log; manifest OwnerSuperAdminRoute mounts ActivityLogPage + AuditLogViewer (not ComingSoon); ActivityLogPage→fetchAdminActivity; AuditLogViewer→listAuditViewerEvents. Guard: scripts/verify-user-s03-admin-activity-audit.mjs. | PENDING |
| `USER-S04` | **PASS** | /onboarding Operator Onboarding wizard entity-scoped | sidebar users flyout: Operator Onboarding → /onboarding; manifest ProtectedRoute mounts OnboardingWizard; wizard uses selectedCompanyId + operating_company_id on GET/PATCH/seed; empty company gate; backend state.routes assertCompanyMembership + withCompanyScope + app.operating_company_id GUC; onboarding.onboarding_state keyed by company_id. Guard: scripts/verify-user-s04-onboarding-entity-scope.mjs. | PENDING |
| `USER-S05` | **OPEN** | RLS / operating_company_id isolation on user-admin mutations | scaffold — not proven for users module specifically | — |
| `USER-VERIFY-01` | **OPEN** | Users module VERIFY-1..8 TRANSP + USMCA | scaffold — July-31 stub only | — |

Desktop audit: ~/Desktop/IH35-CURSOR-AUDIT/AUDITOR-RUN-2026-07-31/modules/users.md
