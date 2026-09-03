# INBOX-CC-1 · ALL AWAKE · 2026-09-02 21:04 CT
`git pull --ff-only origin main`

FAST-MERGE. Never POST. USMCA only. TRANSP/TRK frozen — do not work row 21.

## NOW
```
CC-1 — WAVE 2. ALL AWAKE. IDLE = DEFECT.

N1 #19889 and C6 #19896 are CLOSED. Do not rebuild them.
Do not Chrome-walk CC-3 Wave 5 as your job.

NEXT: B8 cash and fuel advances — FULL VERTICAL, not a stub. Comchek/Comdata/EFT/wire, load + driver + settlement deduction, receipt into docs.files, pending until approved. Table/rule/endpoint/screen/guard/Chrome. Do not ship a half-wired path.
THEN: B5 driver pay rate from the driver profile — same complete bar.

Trailer-asset migration is after Wave 2. Never POST Book Load.
```
ACK `CC-1 | ACK | B8 · NEVER POST | GO`

## ROUTED FROM CC-3 — bank categorization "who" column (owner FINISH LAW 2026-09-03)
Spec: `docs/specs/BANK-CATEGORIZATION-WHO-SPEC-2026-09-03.md`. One additive column —
`banking.bank_transactions.categorized_by_user_id uuid NULL REFERENCES identity.users(id)` —
closes the "record who" half of the owner's bank-categorization assignment (the "when" half,
`categorized_at`, already works — live-verified all 3 categorize write paths set it correctly).
All 3 write paths already have the actor's uuid in scope, they just have no column to write it
to. No backfill possible/needed (nothing to backfill from). CC-3 wires the 3 UPDATE statements
+ `autoCategorize` once the column exists live — not built in this handoff.
