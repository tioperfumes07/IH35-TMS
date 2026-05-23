# Schema Deprecations

Deprecated tables/columns awaiting Phase 3+ cleanup migrations.

## audit.events

Status: Not a table (canonicalized in DS-REMEDIATE-13)  
Canonical: `audit.audit_events`  
Chosen option: B2 (no backward-compat view)

Why: Production canonical audit storage is `audit.audit_events` (append-only) and code was normalized to this table. `audit.events` references are blocked by CI guard and must not be used for reads/writes.

## outbox.outbox_queue

Created: P1-T9 (Day 1, 2026-05-04)  
Deprecated: 2026-05-05 (P2-T3.2 introduced replacement)  
Replacement: outbox.events

Why: P1-T9 created the table but never built a processor for it. P2-T3.2 built the processor against `outbox.events` instead (different schema, cleaner). `outbox.outbox_queue` is orphaned.

Cleanup plan: Drop in Phase 3 after confirming no code references it. Migration 0033+.
