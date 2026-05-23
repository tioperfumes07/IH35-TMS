# CAP-3 250-Foot Arrival Prompt

## Investigation Notes

- Stop model source: `mdata.load_stops` plus `mdata.locations` for `latitude` and `longitude`.
- Real-time GPS source: Samsara vehicle webhook payloads consumed in `vehicle-projector.ts`.
- Driver notification surface: existing driver PWA + web push channel (`notifyDriverWebPush`) and in-app modal support.

## Detection Rules

- Radius is locked to **250 feet** (`ARRIVAL_RADIUS_FEET = 250`).
- On each GPS update for a unit:
  - resolve active load stops that are not departed;
  - compute haversine distance to each remaining stop;
  - if within 250 ft and no prior trigger for same stop/unit in the last 30 minutes, insert `dispatch.stop_arrivals`.
- Driver context uses CAP-9 pairing lookup from `telematics.vehicle_driver_assignments`.

## Prompt Behavior

- Driver sees modal prompt: "You appear to be at `<stop>`; are you arrived?"
- **Yes** confirms arrival and stamps stop `actual_arrival_at`.
- **No/Later** logs dismissal to audit and snoozes prompt for 5 minutes in client session before re-prompting if still pending.
