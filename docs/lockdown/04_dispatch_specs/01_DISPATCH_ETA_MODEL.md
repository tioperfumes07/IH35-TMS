# UNIFIED_BLUEPRINT_ADDITIONS.md — append (ETA model, additive to 3.16 Geofence)

## 2026-06-07 — DISPATCH ETA MODEL locked (blended, real-traffic + issues + HOS)

STATUS: locked by Jorge 2026-06-07. ADDITIVE to the geofence timing model. Nothing removed.

### Purpose
ETA / on-time prediction is NOT just Samsara's raw ETA. It is a BLEND of every live signal so the
predicted arrival reflects reality (traffic, breakdowns, accidents, HOS), and we are never surprised.

### Inputs (all feed the predicted arrival)
- Samsara GPS: current lat/lng, last-10-min avg speed, heading, route deviation.
- Samsara service ETA: traffic-aware ETA to next stop / destination (L1 cache 30s, L2 60s).
- Driver PWA status + updates: loading / driving / break / fueling / delivering / delayed / detained, plus
  driver-entered notes and status changes in the app.
- Geofence events: arrival/departure dwell per stop (60s arrival / 120s departure thresholds, 200m/500m/1000m radii).
- Dispatcher manual updates: dispatcher overrides / corrections (audit-logged, source priority lowest).
- Incidents / accidents / reports / breakdowns / in-transit issues: any open issue on the load delays/holds ETA.
- HOS remaining (Samsara): drive hours left + required breaks → inserts mandatory stop time into the ETA.
- Scheduled appointment window (load + customer contract).

### Source priority for time facts (unchanged)
geofence (auto) > driver PWA > dispatcher manual. Earliest timestamp wins; >5min mismatch logs reconciliation.

### Output — 3-tier on-time signal (per load row)
- ON TIME (green): predicted arrival <= appt, confidence >= 80%.
- BEHIND (amber): predicted arrival 1-60 min late OR confidence < 80% → driver PWA nudge.
- LATE (red): predicted arrival > 60 min late OR a driver-reported delay/incident → dispatcher must intervene,
  customer auto-notification queued.
Confidence drops when: signal stale, route deviation, open incident, HOS tight, driver-reported delay.

### Refresh + freshness
- Auto-refresh 60s from L1/L2 cache (no Samsara hit on most rows). Click row = force refresh + full trajectory.
- Recompute immediately on any NEW event (geofence, PWA status, incident, dispatcher update, HOS change).
- Freshness budget + stale/degraded handling per existing Samsara rules (T-066.x): <60s fresh, 60-7200s stale
  indicator, >7200s degraded.

### Acceptance
1. ETA = blend of all inputs above, not raw Samsara ETA alone.
2. Open incident/accident/breakdown on a load pushes ETA + lowers confidence.
3. HOS remaining inserts required stop time into predicted arrival.
4. 3-tier signal + confidence shown per load; recompute on every new event; 60s refresh.
