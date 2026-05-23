# CAP-8 Engine Fault Auto Work Order

## Decision

Auto-create maintenance work orders when Samsara vehicle payloads include major or critical DTC fault codes.

## Design

- Reuse webhook projection path (`vehicle` projector) so CAP-8 stays local-first and append-only on source events.
- Add pure classifier (`dtc-classifier.service.ts`) that maps DTC code families to `critical|major|minor|info`.
- Only `critical` and `major` create work orders.
- Deduplicate within 7 days for same tenant + unit + DTC code while an open/in-progress/waiting-parts WO exists.
- Use explicit source marker in description prefix: `[samsara_dtc_auto] <CODE>`.

## UI Surface

- Maintenance Home includes **DTC Auto Work Orders** card.
- Card shows open auto-created records for office users to triage quickly.

## Guardrails

- Tenant-scope guard: `scripts/verify-dtc-auto-wo-tenant-scope.mjs`
- Dedupe guard: `scripts/verify-dtc-auto-wo-dedup.mjs`
