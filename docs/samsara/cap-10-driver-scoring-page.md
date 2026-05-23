# CAP-10 Driver Scoring Page

## Scope

- Add append-only `safety.harsh_events` table with tenant RLS and idempotent raw event key.
- Ingest Samsara harsh-event payloads through existing webhook projection path.
- Add per-driver scoring route and Safety UI tab for period-based scoring drill-down.

## Scoring Formula

- Base score: `100`
- Penalty weights:
  - `critical` x `10`
  - `major` x `5`
  - `minor` x `1`
- Score floor: `0`

## Guardrails

- `scripts/verify-harsh-events-append-only.mjs`
- `scripts/verify-driver-scoring-no-db-writes.mjs`

## Notes

- `period_miles` currently defaults to `0` pending dedicated per-driver mileage ledger.
- Safety surface change is additive: new `Driver Scoring` tab only.
