# ★★★ PERMANENT LAW — NEVER GUESS · NEVER DEFER · ALWAYS VERIFY · ALWAYS FIX, NEVER PATCH

**Owner-locked 2026-08-07 (Jorge, verbatim in chat). Supreme and permanent. Applies to every agent, every
lane, every session, every change — no expiry, no exception, no "just this once".**

> **WE NEVER GUESS. WE NEVER DEFER. WE ALWAYS VERIFY. WE ALWAYS FIX, NOT PATCH. WE WANT PERMANENT FIXES
> ALWAYS.**

This law is enforced, not aspirational — per `LAW-2026-08-05-B2-ENFORCED-GUARD-OR-NOT-LAW`
(*"LAW = ENFORCED GUARD, OR IT IS NOT LAW"*), it ships with
`scripts/verify-no-patch-or-defer-language.mjs`, registered in `docs/law/LAW.json`. **Writing this law
as prose alone would itself have been a patch.**

---

## 1. NEVER GUESS

A statement of fact requires evidence produced **this session** from a **primary source**: the running
application, a row read from the live database, a job log, or the file itself. Memory, a doc, a skill, a
prior agent's "verified", and inference from a similar case are **not** evidence.

- A `0`/empty is not a verdict without the completeness discriminator on the **same** table.
- A guard passing is not proof the law it encodes holds — **read what the guard actually gates.**
- When you cannot verify, the required output is **"UNVERIFIED — needs live check"**, never a guess
  dressed as a finding.

**Corollary — verify the SCOPE, not just the data.** Comparing content across branches proves nothing
about a forward-only gate. Establish what a check actually examines before declaring whose failure it is.

## 2. NEVER DEFER

The root problem is fixed now, in this change. Forbidden: `// TODO fix later`, "ship now and fix
isolation later", "CI green is enough", "the user can SQL it for now", and every other form of moving a
known defect into the future.

**The one allowed deferral** is an owner-written tracker entry with a future block id — an explicit,
owned, scheduled commitment. An agent may never create that deferral for its own convenience.

**Not deferring is not the same as doing everything.** If part of a scope is genuinely blocked, finish
every other part **in full** and say plainly what is left and why. Silence about a gap is deferral.

## 3. ALWAYS VERIFY

Definition of done, all of it: code matches the **real** schema; local green; CI green; merged per the
rules; **deploy verified live**; behaviour confirmed on prod. **CI-green is the floor, not the verdict.
Merged is not done. Deployed is not done until the health SHA matches.**

The strongest evidence, in ascending order: read it → create the row yourself and read it back →
**controlled before/after with a baseline captured first**.

**Check before you file.** A finding that dissolves on one more query was never a finding. Confirm the
control isn't merely awaiting a prerequisite, the table isn't populated by design, and the "wrong" code
isn't correctly scoped to data you haven't looked at.

## 4. ALWAYS FIX — NEVER PATCH

A fix is complete only when **all** hold:

1. **Root cause corrected at its source** — not the symptom, not the caller, not the display.
2. **A guard that fails on the bug and passes on the fix**, wired into CI via
   `scripts/verify-steps/NNNN-*.mjs`.
3. **Live proof on prod** that the behaviour changed.
4. **The class is addressed** — if the same shape exists elsewhere, it is fixed or explicitly bounded
   with evidence, never left implicit.

**Forbidden as "fixes":** silencing a guard; widening a constraint to make red go green; special-casing
the one row that failed; editing the message instead of the behaviour; reverting a correct change to
dodge a check; or "fixing" a symptom whose root cause you have not located.

**Prefer the permanent mechanism.** A database constraint beats a guard; a guard beats a convention; a
convention beats a comment. If a future writer can silently recreate the defect, the fix is not
permanent.

**When a correct fix turns something red, that redness is the fix working.** Do not silence it — finish
the work it is pointing at.

## 5. WHY THIS IS LAW

Every clause above was written against a real, measured failure in this repo. The recurring shape is not
laziness — it is a plausible shortcut taken under time pressure that leaves the system **looking**
correct: a green guard whose matcher never examined the broken file; a UI that promises a reversing entry
it never posts; a banner reporting a global default while the per-entity override says the opposite; a
subledger that reads `paid` against a ledger still carrying the debt in full.

**Every one of those was green somewhere.** That is precisely why proof — not green, not merged, not
"it should be fine" — is the only gate that counts.

---

**Enforcement:** `scripts/verify-no-patch-or-defer-language.mjs` (registered `enforced` in
`docs/law/LAW.json`, wired at `scripts/verify-steps/2703-verify-no-patch-or-defer-language.mjs`). It
bans affirmative defer/patch instructions in **ACTIVE** work orders, while explicitly permitting
sentences that RECORD this law, honest `UNVERIFIED` disclosures, and owner-written tracker deferrals —
because banning those would delete the very record that makes the law legible.
