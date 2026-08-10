# Module completion — Tasks — acceptance checklist

**PROGRESS: 4 of 5** · complete: `false` · as_of: 2026-07-29 · live_sha: `—`

| Status | Count |
|---|---:|
| PASS | 4 |
| HOLD | 0 |
| OPEN | 1 |
| FAIL | 0 |
| UNVERIFIED | 0 |

| ID | Status | Title | Evidence | PR |
|---|---|---|---|---|
| `TASK-S01` | **PASS** | Surface /tasks renders real entity-scoped data with no dead end | Route /tasks registered as ProtectedRoute wrapping TaskBoardPage; TaskBoardPage now guards missing operating company with honest empty state; page renders TasksModuleTabs and TaskPlannerGrid; TaskPlannerGrid fetches /api/v1/tasks/planner via fetchPlannerTasks with operating_company_id, date_from, date_to; query errors now surface ListErrorBanner with retry; loading and honest empty states present; + Create Task button wired to CreateTaskModal with operatingCompanyId. | #5315 |
| `TASK-S02` | **PASS** | Surface /tasks/calendar renders real entity-scoped data with no dead end | Route /tasks/calendar registered as ProtectedRoute wrapping TasksCalendarPage; page now guards missing operating company with honest empty state; fetches /api/v1/tasks/planner via fetchPlannerTasks with operating_company_id, date_from, date_to for visible month; query errors now surface ListErrorBanner with retry; month navigation and today buttons wired; calendar grid renders entity-scoped tasks by day with honest empty cells. | #5316 |
| `TASK-S03` | **PASS** | Surface /tasks/chat renders real entity-scoped data with no dead end | Route /tasks/chat registered as ProtectedRoute wrapping TasksChatPage; page now guards missing operating company with honest empty state; fetches /api/v1/tasks/planner via fetchPlannerTasks with operating_company_id, date_from, date_to for task picker; task-picker and comment-thread query errors now surface ListErrorBanner with retry; task selector updates URL search param; composer supports @mention using assignable users; createTaskComment posts to active task. | #5317 |
| `TASK-S04` | **PASS** | Surface /tasks/mine renders real entity-scoped data with no dead end | Route /tasks/mine registered as ProtectedRoute wrapping TasksMinePage; page now guards missing operating company with honest empty state; fetches current user via getMe and /api/v1/tasks/planner via fetchPlannerTasks with operating_company_id, assigned_to=currentUser, date_from, date_to; query errors now surface ListErrorBanner with retry; ParityTable renders assigned tasks with open/overdue/completed summary cards and honest empty text. | #5318 |
| `TASK-S05` | **OPEN** | Surface /tasks/report renders real entity-scoped data with no dead end | NOT YET VERIFIED. Surface enumerated from the route manifest on 2026-07-29. To reach PASS this route must be opened in the running app and shown to render real entity-scoped data (TRANSP and USMCA), every rendered field present in the submit payload where it writes, and forward/reverse linkage proven. No claim is made here beyond the route existing. | — |

Desktop audit: —
