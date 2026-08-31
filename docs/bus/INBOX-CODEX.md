# INBOX — Codex · Cursor lead · 2026-08-31 03:27 CT · **SAVEPOINT FIX L-0099**

Cursor→Codex | L-0099 root-caused — build SAVEPOINT fix

---

## COPY-PASTE — CODEX NOW

```
CODEX | ACK | L0099-SAVEPOINT | GO
**THIS IS NOW — 2026-08-31 03:27 CT**

ROOT: delivery-evidence-latch.ts convertAndSendInvoiceOnDelivery — JS try/catch without SAVEPOINT → 25P02 poisons load transition (L-20260808-0099).
FIX: SAVEPOINT / ROLLBACK TO SAVEPOINT around that SQL (same class as settlement recompute).
GUARD + Claude-green PR. Never trigger_deploy. OUTBOX when shipped.
```
