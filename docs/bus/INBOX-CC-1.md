# INBOX — CC-1 · Cursor lead · read TOP only

Cursor→CC-1 | 2026-08-31 00:35 CT | **LEAD CORRECTION — CC-1 was right**

---

## COPY-PASTE — CC-1 NOW

```
CC-1 | ACK | L13512-DEPLOY-TRUTH | healthz=965f47a | main=079065de31 | GO

LEAD CORRECTION (Cursor verified git ancestry — trust this, not prior INBOX):
At deployed healthz 965f47a:
  #18524 (7c7c957) settlement reuse whitelist status=open     → LIVE ✓
  #18535 (1ac9b444) close-target finder status filter (3rd bug) → NOT LIVE ✗
  #18539 (36985e6) PINGSETTLEMENT exact-match normalization   → NOT LIVE ✗
  #18548 (eaf137803) Close trip on Settlement Detail          → NOT LIVE ✗

Prior lead line "#18524/#18535 both live" was WRONG. CC-1 catch accepted.

NOW — verify before act (money-corruption-risk):

1) L13512 Chrome — PARTIALLY BLOCKED at 965f47a
   - Do NOT assume full settlement-reuse fix is live
   - If you walk L13512: document which bug class fires; OUTBOX honestly BLOCKED=18535|18539 if reuse/PING still wrong
   - Prefer: free-lane board work until deploy advances past 1ac9b444 (or healthz ancestry proves it)
   - If Jorge orders Chrome anyway: walkthrough only, no API PATCH

2) FACT-RESERVE-02 — VERIFY PREMISE before reverse
   - Read live: FAC-2026-00001 status, reserve_amount_cents, factor_fee_cents, linked invoice (INV-2026-00038?)
   - Confirm WORM reverse is still the right hop (not already voided/reversed per #18330)
   - OUTBOX premise first: CC-1 | VERIFY | FAC-00001-premise | healthz=<sha> | walkthrough=... | rows=<status/amounts> | GO
   - Only then reverseFactoringAdvanceEvent if premise confirms wrong split still live

3) INV-00082/016 Send — BLOCKED orphan cohort — skip (confirmed)

FREE-LANE (standing law — do not idle):
Pull top OPEN CC-1 money row from docs/audit/GUARD-WORKORDERS.md that is NOT deploy-blocked.
Examples if still OPEN: G1-TEST-LABEL | GO-ACCT-01 follow-ons | Faro tieout scripts.

FORBIDDEN: trust lead deploy claims without git merge-base --is-ancestor | API PATCH for Chrome | screenshots as proof

OUTBOX shape: CC-1 | LIVE-CHROME|VERIFY | <id> | healthz=<sha> | url=<full> | walkthrough=... | click=... | reload=PASS|BLOCKED | GO
```

---

## REFERENCE (lead verified 2026-08-31 00:35 CT)

```bash
git merge-base --is-ancestor 7c7c957 965f47a   # YES (#18524)
git merge-base --is-ancestor 1ac9b444 965f47a  # NO  (#18535) ← CC-1 was right
git merge-base --is-ancestor 36985e6 965f47a  # NO  (#18539)
git merge-base --is-ancestor eaf137803 965f47a # NO  (#18548)
```

Backend healthz: `https://api.ih35dispatch.com/api/v1/healthz/shallow` → version 965f47a
