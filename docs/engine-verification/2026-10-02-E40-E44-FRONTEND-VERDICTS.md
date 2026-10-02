# E-40 … E-44 — frontend engines (owner "NO FILE FOUND" was scanner scope error)

**Measured:** 2026-10-02 · tip search under `apps/frontend/src` (owner sheet searched backend only).

| E-id | Verdict | Path | Route | Notes |
|---|---|---|---|---|
| **E-40** Maintenance faults view | **OK — BUILT** | `pages/maintenance/FaultCodeAlertsPage.tsx` + `components/fleet/UnitFaultsReverseSection.tsx` + `api/maintenance.ts` (fault-code-alerts) | Maintenance Faults nav + unit reverse section | Samsara fault-code history; both-ways under unit maintenance view |
| **E-41** Engine status board | **OK — BUILT** | `pages/system/EngineStatusBoardPage.tsx` + `pages/maintenance/components/MaintEnginesStatusWidget.tsx` + `api/engine-status` | SYSTEM home Owner-only (`manifest.tsx` E-41 comment) + Maintenance widget | Self-reporting audit board — keep investing here |
| **E-42** Dashcam viewer | **OK — BUILT** | `pages/safety/DashcamViewerPage.tsx` | `/safety/…/dashcam` | Reads `telematics.dashcam_clips`; clip rows when E-12 ticks |
| **E-43** Driver messaging screen | **OK — BUILT (UI)** | `pages/drivers/MessagesInboxPage.tsx` + `components/drivers/SendMessageModal.tsx` + `api/driver-messages.ts` | Drivers messages inbox | UI present; **E-30 backend POST /v1/fleet/messages still the pairing build** — screen without push is incomplete end-to-end |
| **E-44** Stops + miles | **OK — BUILT** | `components/driver-profile/DriverProfileStopsMilesSection.tsx` + `components/shared/StopsMilesSection.tsx` + driver telematics panel | Driver profile section + shared stop-events section | GET `/drivers/:id/profile/stops-miles` + `/telematics/stop-events` |

## Correction to owner sheet

Replace **NO FILE FOUND** on E-40..E-44 with the paths above. Backend-only scan cannot see frontend engines.

## Still open on these

- E-41: deepen as the audit self-report surface (catalog probes already guarded).
- E-43: incomplete until E-30 Samsara messages API is built and harnessed.
- E-44: miles empty until E-03 table lives — label "pending E-03" where applicable (ORDERS note).

NO production writes. Chrome verify = owner walk.
