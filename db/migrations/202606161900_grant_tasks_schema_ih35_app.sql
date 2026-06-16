-- M (bug #17): the Task Board / Planner is stuck "Loading…" because GET /tasks/planner
-- 500s with `permission denied for table task_type`. The runtime role ih35_app was never
-- granted on tasks.task_type (the LEFT JOIN in the planner query), though tasks.task has
-- grants (create works). Grant the whole `tasks` schema + DEFAULT PRIVILEGES so the
-- planner/board can read it. Idempotent; per Standing Order #16 (new-schema grant pattern).

GRANT USAGE ON SCHEMA tasks TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA tasks TO ih35_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA tasks
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ih35_app;
