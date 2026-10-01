# CODEX — ROUND 306 · ENGINE REGISTRY (guards)
READ docs/engines/IH35-ENGINE-REGISTRY-2026-10-01.xlsx — sheets 3 RULES and 4 REDUNDANCY.
Your R303 list stands (X-38 land X-16 or name the blocker; X-39 the third column; X-40 the hang class;
X-41 guards that fail on legitimate state; X-42..X-44). ADD, first:
X-46 RULES sheet -> guards: R-01 every cron declares America/Chicago (PM auto-engine does not);
  R-06 no engine runs on a clock over unchanged input (PM hourly, fraud */15, fuel-gps hourly all violate it);
  R-12 every writer excludes is_sample_data at the query.
X-47 REDUNDANCY R-2: a guard that fails if more than ONE module decides geofence inside/outside.
Note: migrations apply on deploy (pre-deploy db:migrate) -- the 'owner-gated' story in several docs is wrong; fix the docs.
ACK: CODEX | ACK R306 | X-46 | GO
