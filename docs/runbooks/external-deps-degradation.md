# External Dependencies — Degradation Behavior

**Block:** BLOCK-05-TIER2-CIRCUIT-BREAKERS  
**Updated:** 2026-06-08

When an external dependency fails repeatedly, the per-service circuit breaker opens and requests **fail fast** instead of hanging. Breaker state transitions are logged as structured JSON (`circuit_breaker_state_transition`) for Sentry/Render log drain.

## Per-dependency behavior

| Dependency | Breaker config | When open | User-visible degradation |
|------------|----------------|-----------|---------------------------|
| **QBO (QuickBooks)** | 5 failures / 30s → open 60s | `CircuitBreakerOpenError` on API calls | QBO sync/outbox pushes queue; HOME sync card shows stale counts; `/health/deep` qbo check may 503 |
| **Samsara** | 3 failures / 30s → open 30s | Fast-fail on fleet/locations fetch | Live map uses last cached positions (tier-1..4 cache); empty lists if no cache; HOS/dashcam unavailable |
| **Plaid** | 5 failures / 60s → open 120s | `withPlaidApi` rejects | Banking sync paused; existing transactions remain; owner may need re-link after prolonged outage |
| **Sentry** | **Disabled** (never break) | Passthrough always | Error reporting continues even during incidents |
| **OpenAI / LLM (Anthropic vision)** | 3 failures → open 60s | Returns `{ has_new_damage: false, findings: [] }` | Photo damage comparison skipped; manual review required |
| **ComData** | 5 failures / 60s → open 90s | Fast-fail on fuel card API | Fuel import deferred; manual CSV import still available |
| **Relay** | 5 failures / 60s → open 90s | Fast-fail on relay fuel API | IFTA relay-sourced gallons stale until breaker closes |

## Half-open probe

After `resetTimeout`, the breaker enters **half-open** and allows **one** trial request. Success → **closed**; failure → **open** again.

## Operations

1. Check Render logs for `circuit_breaker_state_transition` with `to: "open"`.
2. Confirm upstream status (Intuit, Samsara, Plaid status pages).
3. Do **not** restart solely for open breaker — wait for half-open probe unless upstream confirmed healthy and resetTimeout excessive.
4. Tune thresholds in `apps/backend/src/lib/circuit-breaker/registry.ts` and update [operational-tuning-catalog.md](./operational-tuning-catalog.md).

## CI guard

`npm run verify:circuit-breakers` — static audit that QBO, Samsara, Plaid, and LLM integrations import the breaker wrapper.
