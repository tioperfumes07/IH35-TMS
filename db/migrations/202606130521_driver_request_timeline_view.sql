-- B4: driver-request accountability timeline + response-time reporting view.
--
-- Pivots the immutable spine (events.event_log, 'request.*' events emitted by B4) into
-- one row per request with the 5 step timestamps, the actor + role at each step, and the
-- ELAPSED TIME between steps (computed at read, not stored) — so Jorge can settle
-- driver-vs-admin response-time questions ("requested a diesel code at 2pm, dispatch didn't
-- view it until 9pm"). Generic across request types via source_table / source_reference_id.
--
-- security_invoker = true so the view honors events.event_log's tenant RLS (runs as the
-- querying role). No new tables/columns; the only DDL is the view + its SELECT grant.

BEGIN;

CREATE OR REPLACE VIEW views.driver_request_timeline
WITH (security_invoker = true) AS
WITH steps AS (
  SELECT
    e.operating_company_id,
    e.source_table,
    e.source_reference_id AS request_id,
    e.event_type,
    e.actor_user_id,
    (e.payload ->> 'request_type') AS request_type,
    (e.payload ->> 'actor_role')   AS actor_role,
    e.occurred_at
  FROM events.event_log e
  WHERE e.event_type LIKE 'request.%'
    AND e.source_table IS NOT NULL
)
SELECT
  request_id,
  operating_company_id,
  max(source_table)  AS source_table,
  max(request_type)  AS request_type,

  -- Step timestamps (first occurrence of each).
  min(occurred_at) FILTER (WHERE event_type = 'request.requested') AS requested_at,
  min(occurred_at) FILTER (WHERE event_type = 'request.viewed')    AS viewed_at,
  min(occurred_at) FILTER (WHERE event_type = 'request.approved')  AS approved_at,
  min(occurred_at) FILTER (WHERE event_type = 'request.denied')    AS denied_at,
  min(occurred_at) FILTER (WHERE event_type = 'request.posted')    AS posted_at,

  -- Actor (user + role) at each accountability step.
  max(actor_user_id::text) FILTER (WHERE event_type = 'request.viewed')   AS viewed_by_user_id,
  max(actor_role)          FILTER (WHERE event_type = 'request.viewed')   AS viewed_by_role,
  max(actor_user_id::text) FILTER (WHERE event_type = 'request.approved') AS approved_by_user_id,
  max(actor_role)          FILTER (WHERE event_type = 'request.approved') AS approved_by_role,
  max(actor_user_id::text) FILTER (WHERE event_type = 'request.denied')   AS denied_by_user_id,
  max(actor_role)          FILTER (WHERE event_type = 'request.denied')   AS denied_by_role,

  -- Response time between steps, in seconds (computed at read).
  EXTRACT(EPOCH FROM (
    min(occurred_at) FILTER (WHERE event_type = 'request.viewed')
    - min(occurred_at) FILTER (WHERE event_type = 'request.requested')
  ))::bigint AS seconds_requested_to_viewed,
  EXTRACT(EPOCH FROM (
    COALESCE(
      min(occurred_at) FILTER (WHERE event_type = 'request.approved'),
      min(occurred_at) FILTER (WHERE event_type = 'request.denied')
    ) - min(occurred_at) FILTER (WHERE event_type = 'request.viewed')
  ))::bigint AS seconds_viewed_to_decision,
  EXTRACT(EPOCH FROM (
    COALESCE(
      min(occurred_at) FILTER (WHERE event_type = 'request.approved'),
      min(occurred_at) FILTER (WHERE event_type = 'request.denied')
    ) - min(occurred_at) FILTER (WHERE event_type = 'request.requested')
  ))::bigint AS seconds_requested_to_decision,
  EXTRACT(EPOCH FROM (
    min(occurred_at) FILTER (WHERE event_type = 'request.posted')
    - min(occurred_at) FILTER (WHERE event_type = 'request.approved')
  ))::bigint AS seconds_approved_to_posted
FROM steps
GROUP BY request_id, operating_company_id;

GRANT SELECT ON views.driver_request_timeline TO ih35_app;

COMMIT;
