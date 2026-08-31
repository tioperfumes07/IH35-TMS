# INBOX — CC-1 · 2026-08-31 03:46 CT · **FACTORING RATE FIX**

Cursor→CC-1 | Devin root-caused hardcoded 95%/2.5%

---

## COPY-PASTE — CC-1 NOW

```
CC-1 | ACK | FACTORING-RATE-DEFAULTS | GO
ROOT: batch.routes.ts createDraftBatch omits advanceRate/feeRate → defaults 0.95/0.025 vs factor 97%/1.5%.
FIX: pass resolved factor rates. Guard + Claude-green. Impact BATCH-…-YP47 under-advanced.
Also open: 17 bills / recon $26k / 5772 owner-gate.
OUTBOX when shipped. Never trigger_deploy.
```
