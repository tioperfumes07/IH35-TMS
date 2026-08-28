# FINDINGS TRIPLE-LOCK LAW — permanent · owner-locked 2026-08-11

**Why this exists:** Jorge keeps reading about issues that were "already fixed." That happens when a coder
marks SHIPPED in chat/OUTBOX, or a PR says FIXED, but the **register and routing table still show OPEN** —
or when the next agent re-files the same defect because nobody wrote it to the shared board the first time.

**This law ends that.** A finding is not real until it is locked in three places. A fix is not real until
five proofs land in the same turn as merge.

**Applies to:** Cursor · Codex · CC-1 · CC-2 · Cascade · Devin-A · every future seat.

**Companion files (read every cycle):**
- `docs/audit/GUARD-WORKORDERS.md` — evidence + fix instructions
- `docs/audit/CC-3-FINDINGS-CHECKLIST.md` — owner completion register (☐/☑)
- Desktop `FINDINGS-OPEN-P1-ROUTING.md` — P1 routing table (Cursor lead maintains)
- Desktop `INBOX-SYNC-LAW.md` — read/write cycle

---

## TRIPLE-LOCK — file the finding (same turn, before you move on)

When you **discover**, **confirm**, or **route** a defect — including "not my lane" — you **MUST** write
**all four** in the **same turn** (before starting the next task):

| Lock | Where | What |
|------|--------|------|
| **1 · Board** | `docs/audit/GUARD-WORKORDERS.md` | OPEN row: finding id · severity · owning lane · root cause · permanent-fix DoD · evidence · **plus** `SOURCE-OF-TRUTH:` / `I QUERIED:` / `NOT CHECKED:` (`docs/lockdown/FINDING-SOURCE-OF-TRUTH-BLOCK-LAW-2026-08-28.md`) |
| **2 · Register** | `docs/audit/CC-3-FINDINGS-CHECKLIST.md` | ☐ row with same id · lane · severity (register = owner checklist) |
| **3 · Routing** | Desktop `FINDINGS-OPEN-P1-ROUTING.md` | Table row: id · owner seat · task id · Status=OPEN · required action |
| **4 · OUTBOX** | Your `OUTBOX-<SEAT>.md` | `FINDING` or `ROUTE` or `BLOCKED` one-liner naming id + owner + `board OPEN` |

**Cursor lead** (or Cascade when lead idle): bump target `INBOX-<OWNER>.md` `## CURSOR LEAD` block with
task id in the **same turn**.

**Then keep working your lane.** Never idle waiting for the owner lane.

### Finding id shape

Use stable ids: `LV-*` (live verify) · `CLS-*` (class) · `PNN` (wire plan) · `ACCT-F*` / `BANK-F*` (money).

**One id per defect.** Do not invent a second id for the same root cause.

---

## ANTI-RESURRECTION — before you file OPEN

**Search all three:** board · register · routing table · your OUTBOX tail for the id or obvious duplicate.

| Prior state | What you do |
|-------------|-------------|
| **FIXED** with PR # + merge sha on `origin/main` | **Do NOT re-file as new OPEN.** If live still broken → **REOPEN** row: cite deployed healthz sha, name what regressed, new evidence. |
| **OPEN** with your lane | **Do not duplicate.** Add evidence to existing row or OUTBOX `APPEND evidence`. |
| **RETRACTED / N/A** | Read why. Do not rebuild unless new evidence contradicts the retraction. |
| **Only in chat / PR REMAINING / agent summary** | **Treat as unfixed.** File all four locks now. |

**"We fixed that in #NNNN" without `git show origin/main:` proof is not a defense** — grep the mechanism
on current main or reopen.

---

## FIXED MEANS — five proofs (same turn as merge)

A finding may move to **FIXED** only when **all five** are true:

1. **PR merged** to `origin/main` (squash sha recorded)
2. **Mechanism on main** — `git show origin/main:<file>` or Neon row proves the fix landed (not branch-only)
3. **Guard** — ratcheting `scripts/verify-*.mjs` fails on bug, passes on fix (`--selftest` where applicable)
4. **Register** — coder flips ☐ → ☑ with **Coder · PR · Date · Live proof · Guard** (coder signs own row)
5. **Board + routing** — same turn: board status **FIXED (PR #N)** · routing Status **FIXED** · OUTBOX `SHIPPED <id> PR#N @ <sha>`

**Cascade / Devin re-prove** when the finding was Tier L live verify — OUTBOX `PASS` closes the loop.

**Forbidden "fixed" states:**
- OUTBOX `SHIPPED` with no PR number
- PR merged but board still OPEN
- Register ☐ while board says FIXED
- "FIXED" in routing while register has no ☑
- Closing because CI is green on an unrelated check

---

## FORBIDDEN (reopen the row if you see this)

- **Skip** because another coder owns it — **route with all four locks**, then continue your work
- **Chat-only** or **Jorge relay** — owner is not the message bus
- **BLOCKED other lane** without board OPEN row
- **REMAINING:** in PR for cross-lane gap without board row (use OPEN + owner lane)
- **Duplicate OPEN rows** for the same id
- **Mark FIXED** without register ☑
- **Re-ask** owner decisions already in locked files (`OWNER-USMCA-FLAGS-LOCKED.md`, etc.)

---

## CODER CLOSEOUT TEMPLATE (on merge)

```
OUTBOX: <SEAT> | SHIPPED <ID> | PR#<N> @ <sha> | guard=<script> | NEXT=<next task>
Board:  | … | **FIXED (PR #N)** |
Register: ☐ → ☑ | Coder | PR#N | <date> | <live proof one line> | <guard + step#> |
Routing: Status → FIXED |
```

---

## CURSOR LEAD — every heartbeat

1. Reconcile **routing OPEN** vs **board OPEN** — every id must exist in both or be explained
2. Escalate OPEN **>24h** without PR — bump owner INBOX
3. Kill **ghost FIXED** — routing FIXED but register ☐ → downgrade to OPEN
4. Update `STATUS-NOW.md` when main/healthz moves

---

## GUARD

`scripts/verify-findings-triple-lock-law.mjs` — law file present + cited in board/AGENTS/register header.

`scripts/verify-findings-register-signoff.mjs` — every board OPEN id has register ☐; every ☑ has evidence cells.

Wired: `scripts/verify-steps/3074-verify-findings-triple-lock-law.mjs` (after claim on main).
