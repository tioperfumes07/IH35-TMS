-- RULING 443.86 #1 (CC-3): deadhead = the previous load's last stop -> this load's first pickup (Google practical), or, for
-- a unit's first load, the truck's Samsara position at dispatch -> first pickup (Google practical). The method is recorded
-- in mdata.loads.deadhead_miles_calculation_method, so the CHECK admits the two Google methods. Additive: every existing
-- value stays allowed.
SET LOCAL lock_timeout = '60s';

ALTER TABLE mdata.loads DROP CONSTRAINT IF EXISTS loads_deadhead_miles_calculation_method_check;
ALTER TABLE mdata.loads ADD CONSTRAINT loads_deadhead_miles_calculation_method_check CHECK (
  deadhead_miles_calculation_method IS NULL OR deadhead_miles_calculation_method = ANY (ARRAY[
    'samsara', 'manual', 'estimated', 'google_routes_shortest', 'google_routes_shortest_provisional',
    'google_practical_prev_stop', 'google_practical_samsara_position'
  ]::text[])
) NOT VALID;
ALTER TABLE mdata.loads VALIDATE CONSTRAINT loads_deadhead_miles_calculation_method_check;
