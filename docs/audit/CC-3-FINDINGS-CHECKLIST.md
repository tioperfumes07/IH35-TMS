# CC-3 FINDINGS REGISTER & COMPLETION CHECKLIST

> **★★★ HARD STANDING RULE — OWNER-LOCKED 2026-08-07. PERMANENT. ENFORCEABLE. APPLIES TO EVERY LANE.**
>
> Owner directive, verbatim: *"I need you to create permanent rule that you will write all findings, create
> list and checklist and each coder that works on it checks it once its done so I can also request your list
> and you show it to me and I know the jobs were completed."*

**THIS FILE IS THE SINGLE PLACE THE OWNER LOOKS TO SEE WHAT IS DONE.** It is the completion register for
every defect CC-3 files. `GUARD-WORKORDERS.md` holds the evidence and the fix instructions; **this file
holds the sign-off.**

---

## THE RULE (four clauses — none optional)

**1. CC-3 WRITES EVERY FINDING HERE.** Every defect CC-3 verifies live is written to
`docs/audit/GUARD-WORKORDERS.md` (evidence + named coder + permanent-fix definition of done) **and** added
as a row in this register on the same commit. A finding that exists only in a chat message, a PR body, or
CC-3's battery notes **is not filed**.

**2. THE CODER WHO FIXES IT SIGNS IT OFF HERE — the coder, never CC-3.** When the fix is merged, the lane
that fixed it edits **its own row**: flip `☐` to `☑` and fill **Coder · PR · Date · Live proof**. CC-3
**must not** tick another lane's box; the verifier signing off its own findings destroys maker≠checker and
makes this register worthless. CC-3's only write to a completed row is an independent **VERIFIED** stamp
(clause 4).

**3. A BOX IS ONLY TICKED WHEN ALL FOUR PERMANENT-FIX CONDITIONS HOLD** (`docs/law/NEVER-GUESS-NEVER-DEFER-ALWAYS-VERIFY-ALWAYS-FIX.md` §4):
root cause corrected at source · a CI guard that FAILS on the bug and PASSES on the fix, **wired** so it
actually runs · **live proof on prod** (CI-green is the floor; merged is not done; deployed is not done
until the health SHA matches and behaviour is observed) · the class addressed elsewhere.
**Ticking a box without live proof is a false statement of completion** and is treated as the
`fake-green` violation under the hardline rule.

**4. CC-3 RE-VERIFIES INDEPENDENTLY BEFORE `VERIFIED`.** A ticked box is the coder's claim. CC-3 re-tests it
live and stamps `VERIFIED ✓` with its own evidence, or **reopens the row** with what still fails. A row is
only truly closed when both the coder's ☑ and CC-3's VERIFIED are present.

**ON DEMAND:** when the owner asks for "the list", this file is the answer — no assembly required.

---

## SCOREBOARD

| metric | count |
|---|---|
| **total findings filed** | **72** |
| **OPEN — awaiting a coder** | **65** |
| **☑ fixed & signed off by a coder** | **0** |
| **VERIFIED ✓ by CC-3 (independently re-tested)** | **0** |
| closed / withdrawn / superseded by CC-3 | 7 |

**Zero is the honest number today.** No lane has yet signed off a CC-3 finding. This register starts the
clock; every row below is waiting on the named lane.

---

## HOW A CODER SIGNS OFF (copy this into your row)

```
| ☑ | `LV-EXAMPLE-ID` | P0 | CC-1 | CC-1 | #1234 | 2026-08-09 | healthz sha abc1234 + row count 3→0 | verify-example.mjs (step 2705) |
```

Leave `☐` untouched if any of the four conditions is unmet. **A partially-fixed defect stays OPEN** — there
is no "in progress" state, because a half-fix in production is indistinguishable from no fix.

---

## OPEN FINDINGS — awaiting the named lane

| ☐ | Finding ID | Sev | Owning lane | Coder | PR | Date | Live proof of fix | Guard (file + step #) | CC-3 VERIFIED |
|---|---|---|---|---|---|---|---|---|---|
| ☐ | `LV-TXN-002` | — | CC-2 / mechanical+routes+FE | — | — | — | — | — | — |
| ☐ | `LV-TXN-004` | P0 | CC-1 (money) | — | — | — | — | — | — |
| ☐ | `LV-TXN-005` | — | CC-2 / mechanical+FE+route contract | — | — | — | — | — | — |
| ☐ | `LV-TXN-007` | P0 | CC-1 (money) | — | — | — | — | — | — |
| ☐ | `LV-TXN-009` | — | CC-1 (money) | — | — | — | — | — | — |
| ☐ | `LV-TXN-008` | — | — | — | — | — | — | — | — |
| ☐ | `LV-TXN-010` | — | CC-1 | — | — | — | — | — | — |
| ☐ | `LV-TXN-011` | — | — | — | — | — | — | — | — |
| ☐ | `LV-TXN-012` | — | CC-1 (money) | — | — | — | — | — | — |
| ☐ | `LV-TXN-013` | — | CC-1 (money) | — | — | — | — | — | — |
| ☐ | `LV-TXN-014` | P0 | CC-1 (schema/RLS) | — | — | — | — | — | — |
| ☐ | `LV-TXN-015` | P0 | CC-1 (money) | — | — | — | — | — | — |
| ☐ | `LV-TXN-016` | P0 | CC-1 (schema/RLS) | — | — | — | — | — | — |
| ☐ | `LV-TXN-017` | — | CC-2 / mechanical+routes+validation | — | — | — | — | — | — |
| ☐ | `LV-TXN-018` | P0 | CC-1 (money) | — | — | — | — | — | — |
| ☐ | `LV-PAY-SETTLE-NOPOST` | — | CC-1 / money | — | — | — | — | — | — |
| ☐ | `LV-AP-OPEN-INCLUDES-VOIDED` | — | CC-1 / money | — | — | — | — | — | — |
| ☐ | `LV-BILLS-VENDOR-UUID` | — | CC-2 / mechanical+FE | — | — | — | — | — | — |
| ☐ | `LV-REVREC-NOT-FIRING` | — | CC-1 / money — URGENT | — | — | — | — | — | — |
| ☐ | `LV-BILLVOID-DATE-ERROR` | — | CC-1 / money — URGENT, blocks the void path | — | — | — | — | — | — |
| ☐ | `LV-VOID-NO-REVERSAL` | — | CC-1 / money — URGENT | — | — | — | — | — | — |
| ☐ | `LV-CREDITMEMO-NOPATH` | — | CC-2 / mechanical+route (CC-1 confirms posti | — | — | — | — | — | — |
| ☐ | `LV-BLOCKACCEPT-RED-ON-MAIN` | — | CC-2 / mechanical + whoever owns those 3 blo | — | — | — | — | — | — |
| ☐ | `LV-EXP-NOLOAD` | — | CC-2 / mechanical+FE | — | — | — | — | — | — |
| ☐ | `LV-CI-DEPENDABOT-RED` | — | CC-2 / mechanical + CI | — | — | — | — | — | — |
| ☐ | `LV-BANKFLAG-STALE` | — | CC-1 / money | — | — | — | — | — | — |
| ☐ | `LV-SPAWN-LIABILITY-NOSAVE` | — | — | — | — | — | — | — | — |
| ☐ | `LV-WO-NOSAVE` | — | — | — | — | — | — | — | — |
| ☐ | `LV-SEND-NOREASON` | — | — | — | — | — | — | — | — |
| ☐ | `LV-INV-UUID` | — | — | — | — | — | — | — | — |
| ☐ | `LV-LOAD-EDIT-BLANK` | — | — | — | — | — | — | — | — |
| ☐ | `LV-STOPS-NOSAVE` | — | — | — | — | — | — | — | — |
| ☐ | `LV-LOAD-UNASSIGNED` | — | — | — | — | — | — | — | — |
| ☐ | `LV-OUTBOX-ERRCOL` | — | — | — | — | — | — | — | — |
| ☐ | `LV-DRV-TAB` | — | — | — | — | — | — | — | — |
| ☐ | `LV-AP-DUP` | — | CC-1 / money | — | — | — | — | — | — |
| ☐ | `LV-CAT-500` | — | — | — | — | — | — | — | — |
| ☐ | `LV-BULK-DELIVER-NOLATCH` | — | CC-1 / money (fix) + CC-2 / guard | — | — | — | — | — | — |
| ☐ | `LV-STOP-ZIP-DROPPED` | — | CC-2 / mechanical | — | — | — | — | — | — |
| ☐ | `LV-DISPATCH-TOAST-LIES` | — | CC-2 / mechanical | — | — | — | — | — | — |
| ☐ | `LV-LOAD-DETAIL-SHOWS-UNASSIGNED` | — | CC-2 / mechanical | — | — | — | — | — | — |
| ☐ | `LV-CANCEL-VOIDS-STATUS-ONLY` | — | CC-1 / money | — | — | — | — | — | — |
| ☐ | `LV-AR-OPEN-INCLUDES-VOIDED` | — | CC-1 / money | — | — | — | — | — | — |
| ☐ | `LV-BILL-NO-DISPLAY-ID` | — | CC-1 / money | — | — | — | — | — | — |
| ☐ | `LV-VOID-INVARIANT-BOTH-WAYS` | — | CC-1 / money | — | — | — | — | — | — |
| ☐ | `LV-PAYABLE-SELECTOR-OFFERS-VOIDED-BILLS` | — | CC-1 / money — HIGH | — | — | — | — | — | — |
| ☐ | `LV-BILLPAY-VOID-NO-REVERSAL` | — | CC-1 / money — HIGH | — | — | — | — | — | — |
| ☐ | `LV-VOID-LINKAGE-MISSING` | — | CC-1 / money | — | — | — | — | — | — |
| ☐ | `LV-EXPENSE-VOID-UNREACHABLE` | — | CC-2 / mechanical (FE) + a design answer fro | — | — | — | — | — | — |
| ☐ | `LV-BANK-TWO-SIGN-CONVENTIONS` | — | CC-1 / money (recon + banking) | — | — | — | — | — | — |
| ☐ | `LV-BANK-BANNER-SAYS-FLAG-OFF` | — | CC-2 / mechanical (FE copy) — flag to CC-1 ( | — | — | — | — | — | — |
| ☐ | `LV-TRK-AP-SPLIT-ACROSS-TWO-ACTIVE-ACCOUNTS` | — | CC-1 / money | — | — | — | — | — | — |
| ☐ | `LV-WO-PARTPANEL-BEHIND-MODAL-DESTROYS-FORM` | — | mechanical / FE lane (CC-3 role per board §3 | — | — | — | — | — | — |
| ☐ | `LV-WO-CREATE-500-OPENED-AT` | P0 | mechanical / backend lane — ROUTING CONFLICT | — | — | — | — | — | — |
| ☐ | `LV-WO-RECONCILE-EXCLUDES-SECTION-A` | P0 | CC-1 (money / GL / A-P) | — | — | — | — | — | — |
| ☐ | `CI-CC3-HAS-NO-VERIFY-STEP-BAND` | — | owner / lane-allocation decision (NOT self-a | — | — | — | — | — | — |
| ☐ | `CI-CODEQL-BASELINE-STALE-ON-MAIN` | — | — | — | — | — | — | — | — |
| ☐ | `LV-EXPENSE-CATEGORY-PICKER-EMPTY` | P1 | FE / mechanical lane | — | — | — | — | — | — |
| ☐ | `LV-REVREC-BULK-LATCH-GUARD-READY` | P0 | CC-1 (money / revenue latch) | — | — | — | — | — | — |
| ☐ | `LV-AUDIT-TRAIL-HAS-NO-ACTOR` | P0 | CC-1 (WORM / audit integrity) | — | — | — | — | — | — |
| ☐ | `LV-BANKING-QBO-CONNECTED-IS-HARDCODED` | P1 | FE / mechanical (render); CC-1 to sanity-che | — | — | — | — | — | — |
| ☐ | `LV-BANK-MATCH-SCORE-SATURATES-TO-MEMO` | P1 | CC-1 (money / bank reconciliation) | — | — | — | — | — | — |
| ☐ | `CI-CC3-GUARDS-NEED-A-BANDED-ADOPTER` | P1 | CC-1 or CC-2 — EITHER may take this; whoever | — | — | — | — | — | — |
| ☐ | `LV-BANK-CATEGORIZE-POSTS-GL-WHILE-BANNER-SAYS-IT-DOES-NOT` | P0 | CC-1 (money / GL) + FE | — | — | — | — | — | — |
| ☐ | `LV-BANK-CATEGORIZE-REVERSE-LINK-IS-A-MEMO-STRING` | P2 | CC-1 (ledger linkage) | — | — | — | — | — | — |

---

## CLOSED / WITHDRAWN BY CC-3 (no coder action required)

These were filed and then **withdrawn or superseded by CC-3 itself** after re-verification — recorded, never
deleted, so the correction is auditable. **No lane owes work on these.**

| Finding ID | Sev | Why it is closed |
|---|---|---|
| `CI-F20` | — | — |
| `CI-F22` | — | — |
| `LV-ANSWERS-LOCATED` | — | EVIDENCE — removes every "awaiting owner decision" excuse on financial cards |
| `LV-GLDARK-BLOCKED` | — | EVIDENCE + BLOCKER — re-scopes the P0; no build until stops are fixed |
| `LV-WF064-ALIVE` | P1 | EVIDENCE — refutes the 2 WF064 cards; no build required |
| `LV-LATCH-GUARD-BLIND` | — | GUARD FIXED (unmerged) — blocks on `LV-BULK-DELIVER-NOLATCH` |
| `CI-BLOCK-ACCEPTANCE-RED-ON-MAIN` | — | WITHDRAWN (self-corrected) 2026-08-07 |
---

## ENFORCEMENT — stated honestly

**What is enforceable today:** this register is committed to the repo, is the named source of truth in the
board's standing rule, and every OPEN row names a lane and a definition of done. Any lane, and the owner,
can read completion state at a glance.

**What is NOT yet machine-enforced, and must not be assumed:** there is no CI guard failing the build when a
finding is fixed without its box ticked, or when a box is ticked without live proof. CC-3 cannot wire a
verify-step (`CI-CC3-GUARDS-NEED-A-BANDED-ADOPTER`), so the guard for this rule must be written by a banded
lane. **Required guard, specified here so the adopting lane has the spec:**

> `verify-findings-register-signoff.mjs` — for every row in this register marked `☑`, assert the row carries
> a non-empty **PR**, **Date**, **Live proof** and **Guard** cell; and for every finding id present in
> `GUARD-WORKORDERS.md` with status OPEN, assert a matching `☐` row exists here. Fail the build otherwise.
> That makes "the list is complete and honest" a build-time property instead of a promise.

Until that guard exists, this rule is **documented and mandatory but not machine-enforced** — recorded
plainly, because per LAW-2026-08-05-B2 an unenforced rule is not yet law, and pretending otherwise is the
exact failure this register exists to prevent.
