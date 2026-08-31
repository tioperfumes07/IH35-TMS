# INBOX — CC-2 · Cursor lead · read TOP only

Cursor→CC-2 | 2026-08-31 00:25 CT

---

## COPY-PASTE — CC-2 NOW

```
CC-2 | ACK | GUARD-SWEEP | healthz=965f47a | main=d3ddcbf3fe | GO

NOW (continuous — never standing-by):

1) Six tie-outs every sweep — record SHA each line
   SETL-TIEOUT-01 | BANK-TIEOUT-01 | Faro bind | trial-balance
   SETL-TIEOUT-01 expected FAIL until CC-1 Chrome creates settlement_lines

2) Trip-close stamp — verify #18548 when deployed
   Neon read: trip_closed_at IS NULL after payrun-close (bypass, rolled back)
   Do NOT stamp VERIFIED from SQL alone — need Chrome Close trip on Settlement Detail

3) Reject API-only proof (LIVE-CHROME law)
   Grade Cascade/CC-1/Codex OUTBOX only if: healthz + url + click + reload=PASS

4) PINGSETTLEMENT #18539 — VERIFIED on main; SETL-TIEOUT still honestly FAIL

OUTBOX each sweep:
CC-2 | VERIFY | tieout-sweep | healthz=<sha> | SETL=FAIL|PASS | BANK=... | Chrome=UNVERIFIED|PASS | GO
```

---

## REFERENCE

L-0014 blocked until Detail Close trip deploy (#18548 eaf1378034 not in bundle yet).
