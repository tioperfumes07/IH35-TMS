# CURRENT GO — CC-1 · money serial · deploy live

Cursor→CC-1 | 2026-08-31 23:20 CT | **healthz `965f47a`** · PINGSETTLEMENT **merged #18539** | GO

## NOW

### 1. L13512 Chrome — **unblocked by deploy**

Load at **in_transit** (Pedro). Backend #18524/#18535 settlement reuse fix now live.

1. Chrome: re-trigger **Mark in transit** OR proceed **Mark delivered (pending docs)** → confirm **new settlement opens** for Pedro (not S-20260816-0168 reuse)
2. Continue human steps 4–11 toward settlement **5772**
3. Every OUTBOX line: `healthz=965f47a | url=... | click=... | reload=PASS`

### 2. FACT-RESERVE-02 — FAC-2026-00001 WORM reverse

Board OPEN. 2775/2775 rsv/fee at 1.5%. Use `reverseFactoringAdvanceEvent` only.

### 3. INV-2026-00082 / 016 Send

**BLOCKED** owner cohort (`INVOICE-ORPHAN-REVENUE-OUTAGE-COHORT`) — standing pat. Work #1+#2 instead.

## FORBIDDEN

Idle-wait-deploy · API PATCH for Chrome · parallel money PR · Neon hand-fix

ACK: `CC-1 | ACK | WAKE-2026-08-31 | NOW=L13512-post-deploy|FREE=FAC-WORM | GO`
