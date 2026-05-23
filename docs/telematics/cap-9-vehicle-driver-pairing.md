# CAP-9 Vehicle-Driver Pairing

## Investigation Notes

- Vehicle identity source: `mdata.equipment.samsara_vehicle_id` resolves to `mdata.units` through `mdata.equipment.current_unit_id`.
- Driver identity source: `mdata.drivers.samsara_driver_id`.
- Webhook ingestion path: `samsara-webhook.routes.ts` stores immutable events in `integrations.samsara_webhook_events`, then projection worker routes assignment event types.
- Assignment event patterns handled:
  - `driver_log_on` / `driver.log_on`
  - `driver_log_off` / `driver.log_off`
  - `vehicle_assigned` / `vehicle.assigned`
  - `vehicle_unassigned` / `vehicle.unassigned`

## Source-of-Truth Precedence

- Primary source: Samsara webhook assignment events.
- Secondary source: manual override rows (`source = 'manual_override'`) used only when Samsara is unavailable.
- Conflict rule for CAP-9: incoming Samsara assignments close any open interval for the unit and become the active assignment window.
