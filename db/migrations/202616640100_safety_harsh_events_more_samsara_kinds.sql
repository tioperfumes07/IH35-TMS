-- E-12 (Lead ROUND 12, owner 2026-11-15 18:40 CT "the apps transportation engines fully built").
-- MEASURED (prod USMCA, audit safety.harsh_events_poll): every daily poll since 11-12 saw Samsara safety events
-- (followingDistance 3-6/day, edgeRailroadCrossingViolation 1-5/day; 30-day sample 10-01: followingDistance 57,
-- edgeRailroadCrossingViolation 67, unsafeParking 13, laneDeparture 1) and DROPPED them — the CHECK has no kind for them, so
-- safety.harsh_events last grew 11-12 although the poll runs green daily. These are Samsara's own recorded events
-- (immutable telematics evidence), stored under their own kinds; driver scoring counts named kinds only, so no score moves.
-- Idempotent: the constraint is replaced only when it lacks the new kinds.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conrelid = 'safety.harsh_events'::regclass AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) LIKE '%following_distance%'
  ) THEN
    EXECUTE (
      SELECT string_agg(format('ALTER TABLE safety.harsh_events DROP CONSTRAINT %I', c.conname), '; ')
        FROM pg_constraint c
       WHERE c.conrelid = 'safety.harsh_events'::regclass AND c.contype = 'c'
         AND pg_get_constraintdef(c.oid) LIKE '%event_kind%'
    );
    ALTER TABLE safety.harsh_events ADD CONSTRAINT harsh_events_event_kind_check CHECK (
      event_kind IN (
        'harsh_brake', 'harsh_accel', 'harsh_turn', 'speeding', 'mobile_use', 'distracted', 'rolling_stop', 'no_seatbelt',
        'following_distance', 'railroad_crossing', 'lane_departure', 'unsafe_parking'
      )
    );
  END IF;
END $$;
