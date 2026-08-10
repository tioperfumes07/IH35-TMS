# Module completion — Tasks — acceptance checklist

**PROGRESS: 1 of 5** · complete: `false` · as_of: 2026-07-29 · live_sha: `—`

| Status | Count |
|---|---:|
| PASS | 1 |
| HOLD | 0 |
| OPEN | 4 |
| FAIL | 0 |
| UNVERIFIED | 0 |

| ID | Status | Title | Evidence | PR |
|---|---|---|---|---|
| `TASK-S01` | **PASS** | Surface /tasks renders real entity-scoped data with no dead end | Route /tasks registered as ProtectedRoute wrapping TaskBoardPage; TaskBoardPage now guards missing operating company with honest empty state; page renders TasksModuleTabs and TaskPlannerGrid; TaskPlannerGrid fetches /api/v1/tasks/planner via fetchPlannerTasks with operating_company_id, date_from, date_to; query errors now surface ListErrorBanner with retry; loading and honest empty states present; + Create Task button wired to CreateTaskModal with operatingCompanyId. | #5315 |
| `TASK-S02` | **OPEN** | Surface /tasks/calendar renders real entity-scoped data with no dead end | NOT YET VERIFIED. Surface enumerated from the route manifest on 2026-07-29. To reach PASS this route must be opened in the running app and shown to render real entity-scoped data (TRANSP and USMCA), every rendered field present in the submit payload where it writes, and forward/reverse linkage proven. No claim is made here beyond the route existing. | — |
| `TASK-S03` | **OPEN** | Surface /tasks/chat renders real entity-scoped data with no dead end | NOT YET VERIFIED. Surface enumerated from the route manifest on 2026-07-29. To reach PASS this route must be opened in the running app and shown to render real entity-scoped data (TRANSP and USMCA), every rendered field present in the submit payload where it writes, and forward/reverse linkage proven. No claim is made here beyond the route existing. | — |
| `TASK-S04` | **OPEN** | Surface /tasks/mine renders real entity-scoped data with no dead end | NOT YET VERIFIED. Surface enumerated from the route manifest on 2026-07-29. To reach PASS this route must be opened in the running app and shown to render real entity-scoped data (TRANSP and USMCA), every rendered field present in the submit payload where it writes, and forward/reverse linkage proven. No claim is made here beyond the route existing. | — |
| `TASK-S05` | **OPEN** | Surface /tasks/report renders real entity-scoped data with no dead end | NOT YET VERIFIED. Surface enumerated from the route manifest on 2026-07-29. To reach PASS this route must be opened in the running app and shown to render real entity-scoped data (TRANSP and USMCA), every rendered field present in the submit payload where it writes, and forward/reverse linkage proven. No claim is made here beyond the route existing. | — |

Desktop audit: —
