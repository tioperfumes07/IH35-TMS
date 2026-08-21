# PASTE CODEX · 2026-08-21 14:40 CT

Canonical: `docs/bus/INBOX-CODEX.md`

```text
===== CODEX · PORT 9226 · URGENT 6 REVERSE/FWD =====
PULL: git pull --ff-only origin main
FILE: docs/bus/INBOX-CODEX.md  (this is the only NOW)
LAW: USMCA · FAST-MERGE · fix instantly · never defer · never HOLD · no 340-guard reloop
CHROME: 9226 · prove reverse drill live · CLOSE TAB · never leave /program/matrix open
NOTE: if GET /api/v1/program/module-matrix?scope=module hangs, that is Cursor (MODULE-MATRIX-LEAF-DETAIL-ENDPOINT-HANGS). You work from dispatch.required.json + live click. Do not wait.

YOUR N/M: Urgent 6 = 11 of 11 unpaid dispatch cells. VERTICAL: finish one column, then the next.

COL reverse_link (5) NOW:
  queues.at_risk:reverse_link
  queues.detention:reverse_link
  queues.border:reverse_link
  queues.border_history:reverse_link
  docs.ocr:reverse_link

THEN COL customer (3):
  queues.at_risk:customer
  queues.detention:customer
  docs.ocr:customer

THEN COL vendor (2):
  queues.border:vendor
  queues.border_history:vendor

THEN COL load (1):
  docs.ocr:load

Empty queues / "No completed crossings" = wire the column if broken; if honestly 0 rows, OUTBOX UNCHANGED blocker=<leaf:col>. Still counts 11/11. Do not invent crossings. Trailer + AuthGate = CC-3. gl_je = CC-1/CC-2.

IF picker first-row broken: OUTBOX-CC-3. IF money: OUTBOX-CC-1. IF need Live stamp: OUTBOX-CC-2.

THEN same columns on Urgent 16: fleet 48 → lists 87 → maintenance 41 → safety 7 → cash-flow 5.

OUTBOX: Codex | U6 n/11 | COL=<id> | NEXT=<leaf:col> | GO
ACK: Codex | ACK | INBOX-CODEX | PORT=9226 | PENDING=11/11 | NOW=COL reverse_link queues.at_risk | GO
===== END CODEX =====
```
