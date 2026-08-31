# INBOX — CC-1 · Cursor lead · read TOP only

Cursor→CC-1 | 2026-08-31 01:00 CT | **MASTER MANUAL LIVE BOOKS**

---

## COPY-PASTE — CC-1 NOW

```
CC-1 | ACK | MASTER-MANUAL-LIVE-BOOKS | GO

READ (full packet in repo — not Downloads):
  docs/lockdown/GO-MASTER-MANUAL-LIVE-BOOKS-2026-08-31.md

YOU OWN MANUAL MONEY IN THE APP:
  0) INVOICE-DUPLICATE-COHORT-FREEZE: STOP Send/Factor/void-sweep on 19 duplicate groups.
     READ docs/lockdown/INVOICE-DUPLICATE-COHORT-FREEZE-2026-08-31.md
     11 inv ($30,800) already submitted — triage with Faro FIRST. Document crosswalk only.
  1) L13512 12-step specimen (CC-1-HUMAN-SEQUENCE-REPLAY.txt) when deploy has #18535/#18548
  2) Faro 016: $4200 invoice → $400 CM unknown_pending_backup → factor net $3800 → fund to 1296
  3) Your Faro rows: 004/L13512 · 016 · settlements 5772 · then date-order 33
  4) EVERY USMCA row in CC-1-AUG-EXPENSES-DEDUCTIONS-BY-ENTITY.csv:
     create expense/bill in Chrome → LIVE BANK MATCH (diesel + all settlement expenses)
  5) Settlement 5772 USMCA portion only (loads 13512+13513) → pay run → bills/payments matched

FARO DIGITAL ACCOUNT:
  Proceeds MUST land on Banking "Faro Factoring - USMCA" (GL 1296) — NOT 1090.
  Faro → USMCA FREIGHT = bank transfer · then match register line.

016 IS CLOSED — do not re-ask 4200 vs 3800. FACT-PLEDGE-NET-CM live (#18404).

LAW: docs/lockdown/LIVE-CHROME-NOT-API-LAW-2026-08-31.md
Frozen face: $95,075 (33 invoices incl 016)

FORBIDDEN: SQL money writes · API PATCH as proof · $3800-only invoice · idle

OUTBOX: CC-1 | LIVE-CHROME | <step> | healthz=<sha> | url=<full> | walkthrough=... | click=... | reload=PASS|BLOCKED | GO
```

---

## REFERENCE — deploy truth (secondary)

At healthz `965f47a`: #18524 live · #18535/#18539/#18548 **not** live. Verify ancestry before L13512 dispatch steps.

```bash
git merge-base --is-ancestor 1ac9b444 $(curl -s https://api.ih35dispatch.com/api/v1/healthz/shallow | jq -r .version)
```
