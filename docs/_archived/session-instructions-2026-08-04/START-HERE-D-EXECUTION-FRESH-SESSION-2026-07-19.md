# START HERE — D-execution fresh session (2026-07-19)

**Owner:** Jorge · **Mode:** financial-cluster, design-first, gated  
**Do not continue the old long chat.** Open a **new Cursor chat** and paste the block at the bottom of this file (or `@` this file + the two handoffs).

---

## 0. First 60 seconds (mandatory)

1. Read (in order):
   - `docs/specs/QUALITY-STANDARD-LOCKED.md` (Rule #0)
   - `docs/specs/CURSOR-OPERATING-CONSTITUTION.md`
   - `docs/specs/ARCHITECTURE-BLUEPRINT-2026-07-05.md` (§ linkage)
   - **This file**
   - `docs/trackers/CODER-FINAL-HANDOFF-2026-07-19.md` (v2+ OWNER-APPROVED stamp)
   - `docs/trackers/CODER-FINAL-HANDOFF-CURSOR-VERIFY-2026-07-19.md` (AUTHORITATIVE Neon settle)
2. Confirm PR **#2762** is merged or rebase your worktree onto latest `origin/main` + these docs if still only on branch `chore/audit-note-purge-2026-07-19` @ `f7608c323235317f950909bd9eee09863052fdaa`.
3. Worktree: prefer `/tmp/ih35-*` — do **not** thrash `coord-main`.
4. Rule 17: new guards = `scripts/verify-*.mjs` + `scripts/verify-steps/NNN-*.mjs` only — **never** edit `package.json` / `ci.yml` / `locked-guards.yml` for wiring.

---

## 1. What is OWNER-APPROVED vs what is NOT

### APPROVED (2026-07-19) — scope + priority only
Jorge approved the **D build list and order**. That is **not** a waiver of §1.4.

### STILL REQUIRED every financial PR
- Design-first (1-page: tables, poster reuse, flags, acceptance, rollback)
- Throwaway PG apply-twice for migrations
- Independent code-review agent on non-trivial / money diffs
- Financial/CPA agent when GL/posting/money
- **Jorge eyes on the actual diff + full SQL** before merge
- Label `JORGE-APPROVED` (or explicit “OK to merge”) then squash-merge
- Owner Neon-apply for DDL; GUARD re-proves with `app.bypass_rls='lucia'`
- Money-posting flags: do not flip without owner; **no TMS→QBO write-back**

### Explicitly NOT approved as “build now”
- `0519-at2` DB SoD → **DEFER-WITH-TRIGGER** (lender/auditor/insurer OR 2nd approver exists)
- Blanket CLOSE of enterprise audit templates except as listed in handoff A
- Flipping `REVENUE_RECOGNITION_POST_ENABLED` (impl prereqs still open — Unbilled CoA + earn-first path)

---

## 2. Build order (LOCKED — do not reorder without Jorge)

| # | Block | Why |
|---|---|---|
| **1** | `PHASE2_RECON-COLLECTOR` / unfreeze `accounting.qbo_remote_counts` | Frozen since **2026-06-03** (3 rows, vendors only). Parallel-books safety. Also prove **money** TMS↔QBO recon health (`recon_runs` is NOT fully dark — do not overclaim). |
| **2** | `dip-mor-pre-post-petition-ap-split` | Ch.11 MOR legal (petition dates TRK 6/5/25, TRANSP 10/3/25) |
| **3** | `flow5-dual-deduction-systems-consolidate` | Execute lockdown **§9.1** → canonical `driver_finance.driver_settlement_deductions`; retire duplicate paths |
| then | flow2 · ruling-3 · module25 · P4-01/03/04/05/06/07 · PHASE2_ACCESSORIAL · 0518-r18 · 0091-m-factor-1 · **0275-audit171** DQ monitor | Design-first; financial-gated as applicable |

**ACCESSORIAL:** extend the **canonical** revenue engine — never a divergent poster.  
**P4 / parts-GL:** design naming `allowed_files` before code (Rule 14).

---

## 3. AUTHORITATIVE prod facts (do not re-argue)

Neon `br-fancy-credit-akjnd07a`, RLS bypass `app.bypass_rls='lucia'`, Cursor 2026-07-19:

| Fact | Value |
|---|---|
| Active drivers | 165 |
| Settlements rows | 0 in `driver_finance.driver_settlements` |
| Blank hire_date | 165/165 |
| Blank CDL | 16 |
| `is_sample_data=true` | 78 (B1 roster mis-flag — gated write to fix) |
| Phone `000-000-0000` | **74** (not 2) |
| Units | 186 total; 82 InService |
| PM schedules | **30** active; **4/82** InService covered (not zero) |
| `qbo_remote_counts` | frozen max `collected_at` **2026-06-03** |
| `recon_runs` | still partially active (do not say “all recon dark”) |
| Units `InService` + `deactivated_at` set | **45** total / **4** non-sample — status integrity bug |

---

## 4. Standing product / accounting locks (do not reopen)

- Parallel TMS + QBO books; **no TMS→QBO write-back**
- Factoring = secured borrowing (ASC 860), not sale
- Revenue recognition decision = two-event latch (#2733/#2735); **impl prereqs** still block flag flip
- Deduction canonical = `driver_finance.driver_settlement_deductions` (lockdown §9.1)
- Recovery = pay-first, then escrow; escrow = liability; no auto-escrow from safety events
- No auto driver-status from safety events (explicit-only)
- Manual payment application default; 5% net-pay floor kept
- Never consolidate TRK/TRANSP/USMCA books
- Never delete modules — only add
- Void, don’t delete; FORCE RLS; `security_invoker` views
- Display IDs server-generated only
- Primary buttons: `+ Create` / `+ Book` only

---

## 5. How to work without interruption (operating rules)

1. **One D item at a time** — finish design → branch → proof → PR → Jorge gate → merge → live prove → next.  
2. **Never idle:** while CI runs on a non-financial babysit PR, start design doc for the next D item (disjoint files).  
3. **Serialize migrations** — one migration author at a time (number collisions).  
4. **No guessing:** unverified → say `UNVERIFIED`. False-empty: re-run with RLS bypass.  
5. **No patch / no silent defer** — root cause + guard + evidence (Rule 16).  
6. **Independent review** before claiming money PR ready.  
7. **Frontend-only** (F items) may self-merge on green; **anything money/schema/mdata/accounting** = HOLD.  
8. Keep STATUS lines both lanes every reply.  
9. Prefer `/tmp/ih35-*` worktrees; Rule 17 for guards.  
10. If context gets long again → **new chat** with this START-HERE; do not grind financial SQL in a fatigued thread.

---

## 6. First concrete task (start here — nothing else)

**Block:** RECON-COLLECTOR unfreeze  

**Deliverables before code:**
1. One-page design: which job writes `accounting.qbo_remote_counts`, why frozen since 2026-06-03, entity keys to collect, schedule (align with twice-daily recon), RLS/entity scope, failure/alerting, how Lists Hub vs money recon differ.  
2. Acceptance: after deploy, `MAX(collected_at)` is fresh (<24h) for expected entity types; money recon path named and proven healthy (or gap explicitly ticketed).  
3. Guards: verify collector wired + planted failure (Rule 17 steps).  
4. **STOP for Jorge** with full SQL/diff before merge.

Do **not** start MOR or flow5 until #1 has owner merge + live proof.

---

## 7. Also in flight (do not drop)

- PR **#2762** — purge + handoff docs — merge when CI green (docs/tracker-only).  
- URL-sort frontend PRs still open as of handoff: check `gh pr list` for #2754/#2756/#2757/#2759/#2760/#2761/#2763 — babysit/merge on green, one at a time.  
- F frontend (non-gated): idvr row click, `/finance` stub→hub, compliance tabs URL-sync — can parallel after RECON design lands.

---

## 8. Paste this into the new Cursor chat

```
FRESH SESSION — D-EXECUTION (OWNER-APPROVED SCOPE+ORDER 2026-07-19)

Read first, in order:
1) docs/trackers/START-HERE-D-EXECUTION-FRESH-SESSION-2026-07-19.md
2) docs/trackers/CODER-FINAL-HANDOFF-2026-07-19.md
3) docs/trackers/CODER-FINAL-HANDOFF-CURSOR-VERIFY-2026-07-19.md
4) docs/specs/QUALITY-STANDARD-LOCKED.md
5) docs/specs/CURSOR-OPERATING-CONSTITUTION.md
6) docs/lockdown/00_LOCKED_DECISIONS.md §8–§9
7) docs/specs/ARCHITECTURE-BLUEPRINT-2026-07-05.md linkage checklist

LAW:
- My approval is SCOPE+PRIORITY only. Every financial migration/SQL/posting still needs my eyes on the actual diff before merge (§1.4). Never self-merge money/schema.
- No TMS→QBO write-back. No flag flips without me. No guessing. Fix root cause + guard + live proof.
- Rule 17: guards via verify-*.mjs + verify-steps only (no package.json/ci.yml/locked-guards thrash).
- SoD 0519-at2 = DEFER-WITH-TRIGGER. Do not build it now.

ORDER (LOCKED):
#1 RECON-COLLECTOR / qbo_remote_counts unfreeze (+ money recon health proof)
#2 DIP MOR pre/post-petition A/P split
#3 flow5 execute §9.1 canonical deductions
then: flow2 · ruling-3 · module25 · P4s · ACCESSORIAL(extend canonical) · 0518-r18 · 0091-m-factor-1 · audit171 DQ monitor

START NOW: design-first for #1 RECON-COLLECTOR only. Worktree under /tmp/ih35-*. Respond with RESPOND-BEFORE-CODING spec block, then design doc, then wait for my OK before migration/code. Do not interrupt for A–G re-litigation — already locked in the handoff. Keep both-lane STATUS. Fan out only disjoint non-money babysit while #1 is in design.
```

---

_End of START-HERE. If this file and the two handoffs disagree, the more conservative / protective reading wins; OWNER-APPROVED stamp in the final handoff wins on D order._
