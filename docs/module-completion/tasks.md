# Module completion — Tasks — acceptance checklist

**PROGRESS: 5 of 5** · complete: `true` · as_of: 2026-08-10 · live_sha: `—`

| Status | Count |
|---|---:|
| PASS | 5 |
| HOLD | 0 |
| OPEN | 0 |
| FAIL | 0 |
| UNVERIFIED | 0 |

| ID | Status | Title | Evidence | PR |
|---|---|---|---|---|
| `TASK-S01` | **PASS** | Surface /tasks renders real entity-scoped data with no dead end | Route /tasks registered as ProtectedRoute wrapping TaskBoardPage; TaskBoardPage now guards missing operating company with honest empty state; page renders TasksModuleTabs and TaskPlannerGrid; TaskPlannerGrid fetches /api/v1/tasks/planner via fetchPlannerTasks with operating_company_id, date_from, date_to; query errors now surface ListErrorBanner with retry; loading and honest empty states present; + Create Task button wired to CreateTaskModal with operatingCompanyId. | #5315 |
| `TASK-S02` | **PASS** | Surface /tasks/calendar renders real entity-scoped data with no dead end | Route /tasks/calendar registered as ProtectedRoute wrapping TasksCalendarPage; page now guards missing operating company with honest empty state; fetches /api/v1/tasks/planner via fetchPlannerTasks with operating_company_id, date_from, date_to for visible month; query errors now surface ListErrorBanner with retry; month navigation and today buttons wired; calendar grid renders entity-scoped tasks by day with honest empty cells. | #5316 |
| `TASK-S03` | **PASS** | Surface /tasks/chat renders real entity-scoped data with no dead end | Route /tasks/chat registered as ProtectedRoute wrapping TasksChatPage; page now guards missing operating company with honest empty state; fetches /api/v1/tasks/planner via fetchPlannerTasks with operating_company_id, date_from, date_to for task picker; task-picker and comment-thread query errors now surface ListErrorBanner with retry; task selector updates URL search param; composer supports @mention using assignable users; createTaskComment posts to active task. | #5317 |
| `TASK-S04` | **PASS** | Surface /tasks/mine renders real entity-scoped data with no dead end | Route /tasks/mine registered as ProtectedRoute wrapping TasksMinePage; page now guards missing operating company with honest empty state; fetches current user via getMe and /api/v1/tasks/planner via fetchPlannerTasks with operating_company_id, assigned_to=currentUser, date_from, date_to; query errors now surface ListErrorBanner with retry; ParityTable renders assigned tasks with open/overdue/completed summary cards and honest empty text. | #5318 |
| `TASK-S05` | **PASS** | Surface /tasks/report renders real entity-scoped data with no dead end | Route /tasks/report registered as ProtectedRoute wrapping TasksReportPage; page now guards missing operating company with honest empty state; fetches /api/v1/tasks/planner via fetchPlannerTasks with operating_company_id, date_from, date_to for selected window; query errors now surface ListErrorBanner with retry; window selector buttons (7d/30d/90d) wired; summary cards and by-assignee ParityTable aggregate entity-scoped tasks with honest empty text. | #5320 |

Desktop audit: —
