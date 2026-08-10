# Module completion — Users & Admin

**PROGRESS: 2 of 6** · complete: `false` · as_of: 2026-08-09 · live_sha: `—`

| Status | Count |
|---|---:|
| PASS | 2 |
| HOLD | 0 |
| OPEN | 4 |
| FAIL | 0 |
| UNVERIFIED | 0 |

| ID | Status | Title | Evidence | PR |
|---|---|---|---|---|
| `USER-S01` | **PASS** | /users roster renders role-scoped operator list | Users.tsx ParityTable roster + SecondaryNavTabs (all/active/pending/deactivated); listUsers(isOwnerOrAdmin) Owner/Admin gate; Users.test.tsx Add User + Deactivate suites render roster rows and action controls. | PENDING |
| `USER-S02` | **PASS** | Change role ceremony requires approver when policy demands | Change Role modal shows Required approver Combobox when new_role is Owner/Administrator; submit disabled until distinct approver selected; payload.required_approver_user_id sent to createIdentityWorkflow (identity.workflow_requests.payload jsonb). Guard: scripts/verify-user-s02-role-approver.mjs; test: Users.test Change role ceremony. | PENDING |
| `USER-S03` | **OPEN** | /admin/activity and /admin/audit-log Owner/SuperAdmin reachability | scaffold — routes in flyout; click-through UNVERIFIED | — |
| `USER-S04` | **OPEN** | /onboarding Operator Onboarding wizard entity-scoped | scaffold — not proven | — |
| `USER-S05` | **OPEN** | RLS / operating_company_id isolation on user-admin mutations | scaffold — not proven for users module specifically | — |
| `USER-VERIFY-01` | **OPEN** | Users module VERIFY-1..8 TRANSP + USMCA | scaffold — July-31 stub only | — |

Desktop audit: ~/Desktop/IH35-CURSOR-AUDIT/AUDITOR-RUN-2026-07-31/modules/users.md
