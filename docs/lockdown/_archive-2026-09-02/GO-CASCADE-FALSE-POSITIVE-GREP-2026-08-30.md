# GO-CASCADE-FALSE-POSITIVE-GREP — REV 2 (2026-08-30)

**SUPERSEDES** the first packet’s sequence **“B then A.”** Claude independently verified. Lead agrees. **Owner order: A then B. Never C. Do not start B tonight.**

## Confirmed

8/8 spot-check (50300–50307): ledger says “zero isError”; files **have** `isError`. Self-report of 50277–50344 contamination is **true**. Miss C staying 188 after 107 findings / 8 PRs is **explained**: nothing real to close.

## Postmortem (do not write “alternation is broken”)

GNU `grep -E 'isError|ErrorBanner|ListError'` **works**. What failed is **that seat’s `grep_search` tool in directory-scope mode** (false empty). If we ban `|`, we keep the real bug: **directory-scope search must not back a finding.**

## Never C

The ledger asserts ~68 defects that do not exist. Leaving it up “for Jorge” is how a seat “fixes” a page that was never broken. **SUPERSEDE with reason. Do not delete.** Append-only.

## A FIRST — today (Cascade, one docs PR)

- Stop filing new Miss-C / `isError` rows.
- Mark **50277–50344** Status=`SUPERSEDED` with Evidence:
  `FALSE POSITIVE — grep_search directory-scope returned empty while file contains isError. Not GNU-grep alternation. PRs #18198 #18216 #18225 #18229 #18245.`
- **50309 SafetyHome.tsx:** do **not** keep as proven FAIL. `SafetyHome.tsx` has 0 `isError`; `tabs/SafetyHomeTab.tsx` has 15. Status: `SUPERSEDED` **or** leave a **new** dated row `[AUDIT — RE-VERIFY LIVE]` — **Live Chrome** of Safety Home silent-fail **required** before OPEN FAIL. One survivor of 68 gets the scrutiny the 67 did not.
- Scoreboard regen if required. FAST-MERGE. Never recertify U14. Skip #15546. Never `trigger_deploy`.

## B SECOND — not tonight, and not until the detector is proven

“Single-term grep” is a **new detector**. Prove it can fail **before** any re-audit:

1. File that **does** render `isError` → detector must **not** flag.
2. Copy of that file with `isError` UI deleted → detector **must** flag.
3. **Directory containing both** → both verdicts still correct (original bug was directory-scope; file-by-file selftest would miss it).
4. Record 1–3 in the B PR. Then re-audit **50277–50344 leftovers** and **50226–50276** with the **same** proven detector. “Probably fine” is how 68 shipped.

## Other seats

- **CC-3:** do **not** mass-wire `isError` on superseded files. LEGAL-HEARING-DEADLINES (#18252) still yours. SafetyHome only after Live Chrome says silent-fail.
- **CC-1:** C30 probe; no `PROOF_REPLAY_FAIL_ON_FAIL`.
- **CC-2:** BANK-ECON-04/SURF-04 stay FAIL.
- **Codex / Cursor:** `DriverPlanner.tsx` does not import `PlannerGrid`; it mounts `SafetyDriverSchedulerGrid`, which **does** import `PlannerGrid`. Direct-import guard is 4/5; composed path is 5/5. Align the guard or add a named import — do not invent a second grid. Claude A1–A7 needs a live Chrome tab (unresponsive).

ACK: `Cascade | ACK | GO-CASCADE-FALSE-POSITIVE-GREP-R2 | SHA=<healthz> | NOW=A SUPERSEDE 50277-50344 today · B blocked until detector 1-3 | GO`
