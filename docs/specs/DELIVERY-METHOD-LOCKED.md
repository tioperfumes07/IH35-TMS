# IH35 — FULL DELIVERY PLAN (NOW → LAUNCH)

**Status:** LOCKED hybrid — DORA/WIP + walking skeleton + Owner module certify  
**Date:** 2026-08-04  
**Supersedes as primary queue:** 400+ block pile, breadth-first 30×13 certify-everything, multi-agent sprawl  
**Does not supersede:** Law of the Land, Rule 16/21/23/24, financial HOLD / Neon, parallel books (no TMS→QBO write-back)

**Remind every session:**  
`Execute docs/specs/DELIVERY-METHOD-LOCKED.md — vertical money skeleton → certify modules under WIP≤3 — do not invent a fourth method.`

Companion: `docs/trackers/OWNER-EXECUTION-PLAN-2026-07-22.md` (module order + audit depth).  
This file is the **operating method** from 2026-08-04 until launch-ready.

---

## 0. Honest starting point (2026-08-04)

| Fact | Truth |
|------|--------|
| Motion | Hundreds of PRs; high branch inventory historically |
| Certified modules (full-PASS / launch bar) | **0 / 30** as operating system of record |
| Checklist-complete (Rule 24 JSON) | Some modules near-complete (lists, inventory, eld, help, home); **accounting/banking still incomplete** |
| Constraint | **WIP + finishing**, not “more discovery” |
| Push blockers (thrash / lists N/M / step 2360) | Cleared via #4305 |

**Unit of progress (only these count):**

1. Money skeleton live-proven on Neon + app  
2. Modules **certified** (Rule 24 `complete:true` + Desktop audit + prod proof)  
3. Launch gate checklist green  

**Do not count:** PR volume, ledger row count, “cells covered,” agents “working.”

---

## 1. Standing operating laws (every day)

| # | Law |
|---|-----|
| O1 | **WIP ≤ 3** active feature branches across **all** agents; **≤ 2** open Cursor PRs |
| O2 | **One agent = one git worktree** — no shared-clone branch thrash |
| O3 | Start at **2** concurrent builders; scale only after **1 full day / 0 collisions** |
| O4 | **Kill after ~3 stuck iterations** — fix or hand off with evidence; no CI babysit loops |
| O5 | **One ranked FAIL (or one skeleton hop) per PR** |
| O6 | Every land: `AUDIT-COVERAGE-LIVE.md` → `Status = FIXED (PR #n)` **same commit** (Coder/Cursor columns only) |
| O7 | **Done = Neon (`bypass_rls=lucia`) + live app proof** — CI green is floor, not verdict |
| O8 | Money/migrations/GL/RLS → **HOLD** until `JORGE-APPROVED` + owner Neon-apply |
| O9 | No new breadth-audit inventory except defects found **while** finishing the active skeleton hop or active module |
| O10 | PR titles Cursor lane: must start with `Cursor-` |

---

## 2. Phase map (NOW → FINISH)

```text
P0 Stabilization ──► P1 Money skeleton ──► P2 Certify modules ──► P3 Leftover drain ──► P4 Launch gates ──► LAUNCH
     (hours–1 day)        (days–2 weeks)         (weeks)              (as needed)           (cannot skip)
```

---

## PHASE 0 — Stabilization (do first; same day)

### Purpose
Make the factory capable of finishing work.

### Actions
1. List every open non-Dependabot PR; keep only skeleton / unblock / active-module work.  
2. Close or park everything else (comment: deferred to Phase 2/3 under DELIVERY-METHOD-LOCKED).  
3. Prune stale remote feature branches (measurable: active set countable).  
4. Confirm each live agent has its **own worktree**.  
5. Publish daily scorecard (section 7).

### Exit criteria
- [ ] ≤ 3 active feature branches  
- [ ] ≤ 2 open Cursor PRs  
- [ ] Zero shared-clone collisions in the last work day  
- [ ] This file committed on `main` and Desktop-copied  

---

## PHASE 1 — Vertical money skeleton (first operating value)

### Purpose
One thin end-to-end path through the TMS+books spine (walking skeleton).  
This is **faster to “TMS operating”** than certifying 30 modules in breadth.

### The slice (must be one continuous story)

```text
1. Book load (+ customer)           ── Dispatch / Lists pickers real
2. Assign driver / unit / trailer   ── Ops FKs entity-scoped
3. Dispatch → in transit            ── Status machine honest
4. Deliver                          ── actual_departure_at stamped (WIRE-07 class)
5. POD + BOL evidence               ── WIRE-03 / WIRE-09 class
6. Revenue recognition latch        ── WIRE-05 (flags ON only with proof)
7. Invoice + evidence gate          ── WIRE-04
8. GL / JE balanced                 ── CoA roles resolve; no silent skip
9. Bank path                        ── Match/categorize wiring proven;
                                       density may be ops backlog (named)
```

### Build rules
- Only PRs that advance a **named hop** above (or unblock CI/push for that hop).  
- Prefer **live TRANSP (or USMCA where required)** exercise after each hop.  
- Financial posting stays flag-gated; prove wiring even when flag OFF; turn ON only with Jorge + Neon proof.  
- Update ledger Status same commit.

### Exit criteria (Phase 1 DONE)
- [ ] One real load has continuous drill: load ↔ stops ↔ POD/BOL ↔ invoice ↔ JE (and bank link if applicable)  
- [ ] Neon lucia counts / row IDs recorded in Desktop evidence pack  
- [ ] Remaining skeleton gaps are **named** UNVERIFIED with owner blocker (or FIXED)  
- [ ] ACCT-R-24 / revenue / invoice evidence no longer blocked by missing departure/POD (or blocker named)

### Explicitly out of Phase 1
Certifying all 30 modules; draining 680 ledger rows; random CLS waves that don’t unblock the slice.

---

## PHASE 2 — Certify modules (one at a time)

### Purpose
Turn “partially wired” into **module COMPLETE** under Rule 24 + Full Audit Law.

### Order (money-risk first — Owner Plan aligned)

| Seq | Module | Notes |
|----:|--------|-------|
| 1 | **accounting** | Close remaining FAIL/UNVERIFIED (econ density, surfaces, links). Last open items (e.g. ACCT-R-24 class) after skeleton. |
| 2 | **banking** | matched_je density / categorize / recon — honest ops vs wiring |
| 3 | **settlements** | Pay, deductions, escrow, advances |
| 4 | **dispatch** | Finish beyond skeleton (board, docs, remaining WIRE) |
| 5 | **factoring** | Advances ↔ AR |
| 6 | **vendors** | A/P counterparty — freeze complete only with prod_verified honesty |
| 7 | **customers** | A/R — including LV-001 class defects |
| 8 | **drivers** | Profile reverse money+ops |
| 9 | **driver-hub** | Hub ↔ profile |
| 10 | **fleet** | Truck + trailer |
| 11 | **maintenance** | WO ↔ bill/expense/unit |
| 12 | **safety** | Finish remaining (near-complete checklist ≠ certified OS) |
| 13 | **insurance** | Claim economics |
| 14 | **legal** | Matters ↔ claims |
| 15 | **lists** | Already checklist-complete — **prod_verified / Desktop certify** if not done |
| 16 | **inventory** | Same |
| 17 | **cash-flow** | |
| 18 | **finance** | |
| 19–29 | Last wave | home, fuel, form_425, reports, tasks, docs, users, help, program, system, eld |
| 30 | **compliance** | Owner: absolute end |

### Per-module loop (mandatory)

```text
A. Deep audit (click-through + economics) → Desktop modules/<m>.md
B. Rank FAILs
C. Fix PRs under WIP cap (one FAIL / hop per PR)
D. Guards so regression cannot return
E. Neon + app proof → Rule 24 item PASS
F. When all items PASS (or owner HOLD with tracker+future block): complete:true
G. Scoreboard + Desktop agree → only then start next module
```

### Parallelism
- Second agent may work a **non-overlapping** module **only** if Phase 1 skeleton is green **and** WIP ≤ 3.  
- Prefer: Agent A = active certify module; Agent B = skeleton residual / guard / non-money.

### Exit criteria (Phase 2 DONE)
- [ ] All 30 modules: Rule 24 `complete:true` **or** owner-written HOLD with tracker + future block id  
- [ ] Desktop scoreboard matches  
- [ ] No module marked complete with open FAIL/UNVERIFIED theater  

---

## PHASE 3 — Leftover drain

### Purpose
Consume old block/GAP/pile items **without** rebuilding covered work.

### Actions
1. Map each leftover to a module audit row or skeleton hop.  
2. If covered → close/mark covered by PR#.  
3. If not → single-domain PR under WIP cap.  
4. Do **not** reopen the master 400+ block index as primary queue.

### Exit criteria
- [ ] Leftover pile empty or only owner-gated HOLD items  

---

## PHASE 4 — Launch gates (cannot skip)

Before **launch-ready**:

- [ ] All 30 modules DONE or owner DEFER/HOLD with future block id  
- [ ] Law §9 twelve money paths PASS or HOLD with named Neon work  
- [ ] Held-migration reconciliation — no merged code needing silent unapplied schema  
- [ ] Entity-scope / USMCA isolation to owner threshold  
- [ ] Reverse-drill CI guard live  
- [ ] Sidebar = 30; matches `SIDEBAR_ITEM_IDS`  
- [ ] Posting flags policy signed (what’s ON in prod vs OFF)  
- [ ] Parallel books: QBO reconcile-only; no TMS→QBO write-back  
- [ ] Opening balances / cutover (03/31 OB · 04/01 cutover) owner-locked files only  
- [ ] Form 425C virtual banks excluded from main totals  
- [ ] Deploy SHA = `/api/v1/healthz/shallow` version  
- [ ] Jorge launch sign-off  

### Exit criteria
- [ ] Jorge writes **LAUNCH-READY** (or dated deferrals)  

---

## 3. Agent map

| Role | Owns |
|------|------|
| **Cursor** | Skeleton FE/ops, non-financial fixes, guards, Cursor ledger Status, WIP enforcement |
| **Claude Coder** | Money/GL design+code under HOLD, financial review, merge money after `JORGE-APPROVED` |
| **Claude Agent / Cascade** | Audit evidence on **active** slice/module only; class cards; no inventory sprawl |
| **Jorge** | Neon apply, owner decisions, HOLD approvals, kill WIP when > 3, launch sign-off |

---

## 4. Daily scorecard (5 minutes — Jorge)

| Metric | Target |
|--------|--------|
| Active feature branches | ≤ 3 |
| Open Cursor PRs | ≤ 2 |
| Phase | P0 / P1 / P2(module=X) / P3 / P4 |
| Skeleton hops green | n / 9 |
| Modules certified | N / 30 |
| Collisions today | 0 |
| Ledger FIXED updates today | ≥ merges |

If Phase answer is vague → agents are drifting → stop and re-read this file.

---

## 5. Definition of DONE (recap)

| Layer | Meaning |
|-------|---------|
| Hop DONE | Live proof for that skeleton hop |
| Module DONE | Rule 24 complete:true + Desktop + Neon |
| Launch DONE | Phase 4 checklist + Jorge sign-off |

CI green ≠ hop done ≠ module done ≠ launch ready.

---

## 6. Anti-patterns (forbidden)

- Restarting the 400+ block index as primary queue  
- Breadth-certifying 30×13 before skeleton exit  
- 4+ agents / shared clone / thousands of stale branches  
- Babysit/poll loops instead of fixing reds  
- EntityLink / honesty-banner PRs while economics stay empty  
- Claiming module complete with open FAIL/UNVERIFIED  
- Inventing a fourth methodology mid-flight  

---

## 7. Immediate next actions (start now)

1. **Commit this file to main** (governance) + Desktop copy.  
2. **Phase 0:** Cap WIP; close/park non-skeleton PRs; prune branches.  
3. **Phase 1 board:** Nine skeleton hops as the only P1 backlog.  
4. Finish open skeleton-related work (WIRE residuals, invoice/revenue evidence) under WIP cap.  
5. Only after Phase 1 exit → **accounting certify** (Phase 2 seq 1).

---

## 8. Progress log

| Date | Note |
|------|------|
| 2026-08-04 | Plan locked from three-coder research synthesis (Cursor + Claude Agent + Claude Coder 2) + Owner Execution Plan + DORA/WIP + walking skeleton |
| 2026-08-04 | #4305 cleared repo-wide push blockers (thrash selftest, lists 23/23, step 2360→2372 for WIRE-07) |

---

**End of full plan.**  
Do not invent a competing sequence. Amend only with Jorge in writing.
