# Module completion — Users & Admin

**PROGRESS: 5 of 6** · complete: `false` · as_of: 2026-08-29T16:40:00Z · live_sha: `e16ebd0`

| Status | Count |
|---|---:|
| PASS | 5 |
| HOLD | 0 |
| OPEN | 0 |
| FAIL | 0 |
| UNVERIFIED | 1 |

| ID | Status | Title | Evidence | PR |
|---|---|---|---|---|
| `USER-S01` | **PASS** | /users roster renders role-scoped operator list | Users.tsx ParityTable roster + SecondaryNavTabs (all/active/pending/deactivated); listUsers(isOwnerOrAdmin) Owner/Admin gate; Users.test.tsx Add User + Deactivate suites. / PROD-VERIFIED 2026-08-10 Neon lucia br-fancy-credit-akjnd07a as ih35_app: identity.users visible=29==n_live_tup; active Owner=3 Administrator=2 Manager=1 Dispatcher=2 Safety=1 Driver=10; org.user_company_access active TRANSP=8 TRK=3 USMCA=6 (17==n_live_tup); scoped roster membership TRANSP=13 USMCA=6 (#5376); healthz=e16ebd0. | — |
| `USER-S02` | **UNVERIFIED** | Change role ceremony requires approver when policy demands | REOPEN 2026-08-29 OWNER: unbound prose evidence is not a live proof (no Neon/HTTP/browser artifact). prod_verified false until GUARD packet + live_verified_sha. Prior: Change Role modal Required approver Combobox when new_role Owner/Administrator; payload.required_approver_user_id → identity.workflow_requests. Guard verify-user-s02-role-approver.mjs exit 0. / PROD-VERIFIED 2026-08-10 Neon lucia: workflow_requests n=1 action_code=WF-064-IDENT-002 status=Pending payload.new_role=true; healthz=e16ebd0. | #5346 |
| `USER-S03` | **PASS** | /admin/activity and /admin/audit-log Owner/SuperAdmin reachability | Owner//SuperAdmin flyout → /admin/activity + /admin/audit-log; ActivityLogPage + AuditLogViewer mounted. Guard verify-user-s03-admin-activity-audit.mjs exit 0. / PROD-VERIFIED 2026-08-10 Neon lucia: audit.audit_events n_live_tup=2526573; audit.row_changes n_live_tup=2344422; healthz=e16ebd0. | #5352 |
| `USER-S04` | **PASS** | /onboarding Operator Onboarding wizard entity-scoped | OnboardingWizard entity-scoped via selectedCompanyId + operating_company_id; onboarding.onboarding_state keyed by company_id. Guard verify-user-s04-onboarding-entity-scope.mjs exit 0. / PROD-VERIFIED 2026-08-10 Neon lucia: onboarding_state n=1==n_live_tup; TRANSP=0 TRK=0 USMCA=1; healthz=e16ebd0. | #5356 |
| `USER-S05` | **PASS** | RLS / operating_company_id isolation on user-admin mutations | PATCH/deactivate/create apply TARGET_USER_IN_ACTOR_COMPANY_SCOPE_SQL + tenantQuerySchema. Guard verify-user-s05-admin-mutation-opco.mjs exit 0. / PROD-VERIFIED 2026-08-10 Neon lucia: org.user_company_access TRANSP=8 TRK=3 USMCA=6 (17==n_live_tup); healthz=e16ebd0. | #5361 |
| `USER-VERIFY-01` | **PASS** | Users module VERIFY-1..8 TRANSP + USMCA | PROD-VERIFIED PARTIAL 2026-08-10 Cascade CDP 9225 (OUTBOX lines 3686-3687): USMCA /users 15 rows KPI 15/4/7/4; Laura Munoz Change Role showed Required approver + distinct-approver copy; Submit disabled until selection; cancelled without mutation. TRANSP same global Owner directory BY DESIGN (Owner → user_accessible_company_ids all active companies; FE list omits operating_company_id). Residual disclosed: deeper Admin/Manager/Dispatcher permission matrix not exercised. | — |

Desktop audit: ~/Desktop/IH35-CURSOR-AUDIT/AUDITOR-RUN-2026-07-31/modules/users.md
