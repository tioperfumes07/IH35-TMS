# CAP-11 — Driver HOS Tracking

## Piece 0 Investigation

### DS-REMEDIATE-17 ingestion path used by CAP-11

1. `POST /api/v1/integrations/samsara/webhook` receives signed Samsara payloads and stores immutable rows in `integrations.samsara_webhook_events`.
2. `samsara.webhook_projection_cron` drains pending rows and routes each event through `webhook-projection.service.ts`.
3. CAP-11 adds a new projector path for HOS/ELD duty-status events (`*hos*`, `*eld*`, `*duty_status*`) that inserts append-only rows into `hos.duty_status_events`.
4. HOS clocks are computed from `hos.duty_status_events` only (local-first, tenant-scoped).

### Samsara duty-status vocabulary confirmed for CAP-11

CAP-11 normalizes Samsara payload status values into:

- `off_duty`
- `sleeper`
- `driving`
- `on_duty_not_driving`
- `personal_conveyance`
- `yard_moves`

Accepted aliases in payloads include common variants (`sleeper_berth`, `on_duty`, underscore/spacing differences), but persisted values are canonical.

### FMCSA clocks implemented

- **11-hour driving limit**  
  Driving minutes since last valid reset (10 consecutive hours of `off_duty`/`sleeper`/`personal_conveyance`). Remaining clock: `11h - accumulated driving`.

- **14-hour on-duty window**  
  Elapsed time since last valid reset. Remaining clock: `14h - elapsed since reset`.

- **30-minute break by 8th driving hour**  
  Driving minutes since last 30+ consecutive non-driving segment. Remaining clock: `8h - driving since last qualifying break`.

- **70-hour / 8-day cycle**  
  On-duty minutes (`driving`, `on_duty_not_driving`, `yard_moves`) over rolling 8 days. Remaining clock: `70h - rolling on-duty`.

## Runtime surfaces

- Dispatch board HOS pill (`green/amber/red` by computed status).
- Driver HOS detail page with:
  - 24-hour duty timeline
  - 8-day summary
  - manual edit audit section (supervisor-signoff required)
