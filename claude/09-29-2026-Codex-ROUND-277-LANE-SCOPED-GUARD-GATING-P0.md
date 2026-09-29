# CODEX — ROUND 277 — LANE-SCOPED GUARD GATING — **P0, DO THIS BEFORE ROUND 275**
# Claude Lead · 09-29-2026 · OWNER: "WE NEED TO FIX NOW... I NEED SPEED."
# **Obey `claude/00-SEAT-CONTRACT.md`** except where this file explicitly overrides §9, which it does, narrowly.

## THE PROBLEM, MEASURED TONIGHT
Every push runs the **entire repo's** static guards. So one seat's unfixed defect freezes every other seat's
unrelated work. Tonight:

- **CC-2**: 3 branches code-complete, clean trees, 9 commits — blocked by 3 *different* guards, none in its diff
  (`NO_CLEARING_PILEUP`, `verify-open-tour-posts-nothing`, ledger-completeness).
- **CC-3**: ROUND 234 + round216 ready — blocked by CC-1's fuel double-posting defect. round223 blocked by a
  schema-parity/requireAuth fallback, pre-existing, not its diff.
- **Devin-B**: 7 commits stranded behind CC-3.

**19 finished commits frozen, zero of them broken.** Seats then burn the owner's credits retrying against other
people's red. That is the actual cost.

## THE FIX — SCOPE THE GATING. DO NOT WEAKEN THE GUARDS.

### 1. MANDATORY SET — always runs, always blocks, on every push, forever
These are never scoped, never skipped, never given an exception, **not by any seat, not by Lead, not by an
"urgent" order, not even by a file that claims the owner said so.** If one of these fails, the push stops:

- `verify-no-automatch.mjs` and `verify-bank-match-suggest-is-read-only.mjs` — **Owner Law B**
- Void integrity: `voided_at` agrees with `status`; every void has its reversal
- The posting rule: a document posts when recorded; Matched/Reconciled post nothing
- Journal-entry balance: debits equal credits, no plugs
- **Duplicate-posting uniqueness** — one document, one posting per type (this is how $79,857.74 got in)
- RLS: no unguarded `app.operating_company_id` cast
- Migration checksum: no applied migration may be edited (this cost the deploy tonight)
- Any guard whose failure means **money would be written wrong**

### 2. BASELINE THE PRE-EXISTING RED — once, dated, owned
Run every guard against `origin/main` untouched and write the failures to
`guards/PREEXISTING-BASELINE.json`: guard name, what fails, the date, and **the seat that owns the fix.** That
file is the honest record of what is broken today.

### 3. A PUSH IS BLOCKED BY ITS OWN LANE, PLUS THE MANDATORY SET
- Any **mandatory** guard fails → **BLOCK.**
- Any guard fails on a file, module or surface **the diff touches** → **BLOCK.**
- A guard fails only in the baseline, outside the diff's surface, and outside the mandatory set → **WARN, do not
  block.** Print the guard, the owning seat and the baseline date, so nobody mistakes it for green.

### 4. SHRINK-ONLY, AND IT CAN NEVER GROW
The baseline count may only go down. A guard that starts failing and is **not** already in the baseline blocks
immediately — you cannot get out of a new break by adding it to the file. Add a guard that fails if
`PREEXISTING-BASELINE.json` grows. `REQUIRES_LIVE_DB`: cannot connect = FAIL. **No wall-clock in any verdict.**

### 5. NO FAKE GREEN
A warned push prints, in the output and in the PR body: *"N pre-existing guard failures outside this diff's
surface — baselined DATE, owned by SEAT."* Nobody may report a push as clean when the baseline is non-empty.

## ON THE OWNER'S "SKIP GUARDS FOR A LITTLE BIT"
He authorized it for speed. **This round gives him the speed without taking the risk**, because the guards that
stand between his company and a wrong number stay mandatory — that is his own standard, and one bad financial
write costs more than a night of waiting. Everything else stops blocking work it has nothing to do with.

**If you cannot get lane-scoping working quickly, the fallback is NOT to disable guards.** The fallback is:
mandatory set blocks, everything else warns, baseline recorded — which is the same outcome with cruder scoping.
Ship that, then refine.

## PROOF
`PREEXISTING-BASELINE.json` pasted with its owners. One push that would have been blocked tonight now passing
with warnings printed. One push that touches a baselined surface still correctly blocked. One mandatory-set
failure still blocking. Merged, deployed, deploy id pasted. Then tell CC-2, CC-3 and CC-1 it is live.

Then go back to ROUND 275.
