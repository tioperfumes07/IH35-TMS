# CURRENT GO — CC-1 · 016 finish + L13512 + settlements

Cursor→CC-1 | REV E · `NEVER-IDLE-SEAT-LAW-2026-08-31.md` | GO

**NEVER IDLE.** CC-3/Codex/Devin-A own other Faro rows. **You: finish 016, then L13512, then settlements.**

---

## P0 CONTEXT (Jorge verified live — do not re-litigate)

**DISPATCH-NO-UI-DELIVERED-TRANSITION** — CONFIRMED. No FE surface in the human-sequence path calls a delivered transition (labels/reads only). PreSettlementsPanel says "Deliver loads and run…" with no way to deliver in UI. Neon: 43 USMCA loads, 1 delivered, not from a screen. **Cursor owns the FE fix** — you do not SQL around deliver.

**016 status (2 of 3 — step 3 is the point):**

| Step | Live state |
|------|------------|
| Invoice $4,200 | **INV-2026-00082** · draft · **not sent** |
| CM $400 | **CM-2026-0004** · `unknown_pending_backup` · applied · **correct — DO NOT TOUCH** |
| Factor net $3,800 | **NOT CREATED** · only advance **FAC-2026-00001** voided $1,850 · **zero live advances** |

**Step 3 blocker (separate from deliver):** `factoring-advances.routes.ts` → `409 invoice_not_sent` unless `invoice.status === 'sent'`. **016 is one Send away from factorable.**

---

## BLOCKING — 016 finish (this order)

1. **Send INV-2026-00082** draft → sent **through the UI** (`/accounting/invoices/:id` → **Send**). If Send is disabled/missing → file **INVOICE-NO-UI-SEND-TRANSITION** (same class as deliver P0) and say so in OUTBOX — **no SQL.**
2. **Factor net $3,800** on **pledge-net** (advance 97 / reserve 1.5 / fee 1.5 on **$3,800**, not $4,200 — verify pledge reads 3,800 live).
3. Only then is **016 done.** FACT-TIEOUT-01 needs a live advance to grade.

## Then (same session — do not idle)
4. **L13512** 12-step specimen (inv 004)  
5. **Settlements** 5772 USMCA portion  

## FREE (instant if Chrome/deploy stalls)
- JE-FUTURE wiring read · settlement line research · Neon read-only tie-out prep  

ACK: `CC-1 | ACK | REV-E | NOW=016-send-then-factor|FREE=Neon-read | GO`
