# GAP-26: Border 1000m Geofences + Customs Clearance Time

## Purpose
GPS-based detection of vehicle crossings at Laredo-area border bridges. Tracks entry/exit events and computes customs clearance time automatically.

## Tables
- `dispatch.border_crossing_events` — GPS-detected crossings with entry/exit timestamps and computed clearance minutes

## Services
- `BorderCrossingDetector` — detects entries/exits using haversine distance from bridge midpoints
- `CustomsTimeService` — analytics: average clearance time by bridge and direction

## API
- `GET /api/v1/dispatch/border-crossings/history` — history for period
- `GET /api/v1/dispatch/border-crossings/customs-time-avg` — average clearance by bridge/direction
- `GET /api/v1/dispatch/border-crossings/recent/:vehicleId` — recent crossings for vehicle

## Workers
- `border-crossing-detector` — runs every 5min, scans position events for bridge proximity

## Frontend
- `/dispatch/borders/geofence-history` — GPS Border Crossing Events page (distinct from wizard-based BorderCrossingHistoryPage)
- `CustomsTimePill` — ambient pill showing avg clearance time

## Geofences (1000m radius)
| Bridge | Lat | Lng |
|--------|-----|-----|
| Laredo Bridge I (Gateway to Americas) | 27.4934 | -99.5117 |
| Laredo Bridge II (Juarez-Lincoln) | 27.5037 | -99.5027 |
| Laredo Bridge III (World Trade) | 27.5640 | -99.4697 |
| Laredo Bridge IV (Colombia Solidarity) | 27.9022 | -99.5340 |
| Colombia Bridge | 27.9022 | -99.5340 |
