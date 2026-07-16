# notifications — backlog verification (2026-07-16)

> Read-only verification. Verdicts carry live code evidence or say UNVERIFIED.
> `needs_live=true` = a Neon prod read is required to close it — **NOT run here**; flagged NEEDS-GUARD-LIVE for GUARD.

**Counts:** OPEN 0 · NEEDS-OWNER 0 · UNVERIFIED 0 · RESOLVED 1 · NOISE 0

| block_id | type | fin | tier | verdict | flags | evidence | missing_link_or_wiring |
|---|---|---|---|---|---|---|---|
| 0091-g10-h4 | AUDIT-NOTE | 💰 | tier-2 | **RESOLVED** | wiring:wired · linkage:[object Object] | apps/backend/src/integrations/qbo/sync-outbound-accounting.ts:650-668 — the generic `catch (err)` block now computes `dead = shouldDeadLetterAccountingAttempt(attemptCountForCap)` (line 652), the SAME function/threshold (ACCOUNTING_DEAD_LETTER_AFTER=5, line 19; fn at line 28) used by the HTTP-status |  |
