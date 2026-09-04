---
name: ih35-wave-roadmap
description: Historical Wave 1-5 build queue (auto-generated memory). SUPERSEDED by claude/GO-23-BUILD-SEQUENCE-STRICT-2026-09-02.md; load for historical context only.
---

# ih35-wave-roadmap

**Source:** auto-generated Cascade memory `caab38eb-50e3-4478-b185-4737a3fd2bd2`.

Full wave roadmap for IH35-TMS. Build strictly in order. Each block = fresh branch, BLOCK_ID env override, ONE manifest per block, no agent1 touch, push only, Jorge merges.

## WAVE 1 — EVENT-LOG-SPINE (prerequisite for everything)

- **W1-A: EVENT-LOG-SPINE** — schema `events`, table `events.event_log` (`event_id`, `operating_company_id`, `event_type`, `actor_type`, `actor_id`, `subject_type`, `subject_id`, `occurred_at`, `payload` jsonb, `source`, `is_active`). RLS. `logEvent()` helper. All downstream blocks write to this. GUARD: `verify-event-log-spine.mjs`.

## WAVE 2 — PROFITABILITY + ALERTS (after Wave 1)

- **W2-A: PROFITABILITY-ENGINE** — schema `analytics`, read model rollup per load (revenue/cost/margin/mile). UI: Finance > Profitability, By Lane / By Type / By Customer / By Load. ONE engine grouped 3 ways. Shared FilterBar. GUARD: `verify-profitability-engine.mjs`.
- **W2-B: ALERT-RULES-PROFILES** — schema `alerts` (profile, rule, broker_queue). THREE QBO profile pages: App (2-3 pings then daily, cutoff, escalate), Driver (force_ack + force_alarm), Broker (auto_send vs hold_for_review + approval queue). GUARD: `verify-alert-rules-profiles.mjs`.
- **W2-PLANNER: PLANNER-REDESIGN-UNIVERSAL-GRID** — rebuild existing planners: narrow day cols (~9%), gridlines YES/column-shading NO, day-of-week headers, ~27-30px rows, progress box on task blocks, multi-item stacked sub-rows, ~170px detail drawer (not full page), shared FilterBar (QBO period presets + Custom), resizable columns everywhere (persisted). GUARD: `verify-planner-universal-grid.mjs`.

## WAVE 3 — GEOFENCE + DRIVER ACK (after Wave 1 + Wave 2)

- **W3-A: GEOFENCE-ENGINE** — schema `geofence` (fence, event). EXTENDS existing GAP-54/55/56 groundwork. Enter/exit debounced, auto status-switch to spine, left-yard-without-load alert, dwell->detention. UI: Dispatch > Geofences + map. GUARD: `verify-geofence-engine.mjs`.
- **W3-B: FORCED-DRIVER-ACK** — schema `driveralert` (dispatch, alarm_event). Blocking ACK modal in Driver PWA. Timestamped to spine. Re-alarm until ack. Office-side ack-evidence view. GUARD: `verify-forced-driver-ack.mjs`.

## WAVE 4 — SAFETY DOCS + BROKER (after Wave 1+2+3)

- **W4-A: SIGNED-SAFETY-DOCS** — schema `safetydoc` (document, assignment). Send->view->e-sign flow. Both sides timestamped to spine. Immutable signed records. UI: Safety > Driver Files + Driver profile. GUARD: `verify-signed-safety-docs.mjs`.
- **W4-B: BROKER-AUTO-UPDATE** — schema `brokerupdate` (send). Reuses `alerts.broker_queue`. Status/geofence triggers -> auto-send (only enabled classes) or hold-for-review queue. Approve/edit/reject. Recipients from config ONLY. GUARD: `verify-broker-auto-update.mjs`.

## WAVE 5 — TIME UTILIZATION (build LAST, depends on everything)

- **W5: TIME-UTILIZATION** — schema `utilization` (`driver_period`, `unit_period`). Per-driver+truck minute ledger: driving/on_duty/loading/detention/idle/rest/deadhead/layover/OOS/UNACCOUNTED. $/productive-hr, $/driving-hr, utilization%. Reuses PROFITABILITY-ENGINE for $. UI: Finance > Time / Utilization, By Driver / By Truck / Detail. GUARD: `verify-time-utilization.mjs`.

Migration sequence as of now: last migration = 0167. Next = 0168 (W1-A event_log), then increment per block.

Block-ready rules: `BLOCK_ID` env override, NEVER edit `.block-ready.agent1.json`, ONE `<BLOCK_ID>.json` per block.

## Current status

- **SUPERSEDED** by `claude/GO-23-BUILD-SEQUENCE-STRICT-2026-09-02.md` (owner ruling 2026-09-02).
- Migration sequence numbers in this memory are outdated; current migrations are in `db/migrations/` with the latest tracked in `.ledger.json` / prod.
- Do not use this roadmap for active dispatch; load for historical context only.
