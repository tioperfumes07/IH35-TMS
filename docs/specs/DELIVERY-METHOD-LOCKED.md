# IH35 — FULL DELIVERY PLAN (NOW → LAUNCH)

**Status:** LOCKED hybrid — DORA/WIP + walking skeleton + Owner module certify  
**Date:** 2026-08-04 (rev **B** — Claude Coder corrections applied)  
**Supersedes as primary queue:** 400+ block pile, breadth-first 30×13 certify-everything, multi-agent sprawl  
**Does not supersede:** Law of the Land · Rule 16/21/23/24 · `00-operating-method-LAW.mdc` (OWNER LAW 2026-08-03) · parallel books (no TMS→QBO write-back)

**Remind every session:**  
`Execute docs/specs/DELIVERY-METHOD-LOCKED.md — vertical money skeleton → certify modules under WIP≤3 — do not invent a fourth method.`

Companion: `docs/trackers/OWNER-EXECUTION-PLAN-2026-07-22.md` (module order + audit depth).  
Governance: `.cursor/rules/00-operating-method-LAW.mdc` — **NO HOLDS. NO `JORGE-APPROVED`. Merge on green with proof.**

---

## 0. Honest starting point (2026-08-04)

| Fact | Truth |
|------|--------|
| Motion | Hundreds of PRs; ~2.8k remote heads historically |
| Certified modules (full-PASS / launch bar) | **0 / 30** as operating system of record |
| Checklist-complete (Rule 24 JSON) | Some near-complete (lists, inventory, eld, help, home); **accounting/banking still incomplete** |
| Constraint | **WIP + finishing**, not “more discovery” |
| Push blockers (thrash / lists N/M / step 2360) | Cleared via #4305 |
| Ledger | ~680 rows = **read-only reference**, not a work queue |

**Unit of progress (only these count):**

1. Money skeleton live-proven on Neon + app  
2. Modules **certified** (Rule 24 `complete:true` + Desktop audit + prod proof)  
3. Launch gate checklist green  

**Do not count:** PR volume, ledger row count, “cells covered,” agents “working.”

---

## 1. Standing operating laws (every day)

| # | Law |
|---|-----|
| O1 | **WIP ≤ 3 active feature branches across ALL agents / ALL lanes** (one counter — no separate Cursor cap) |
| O2 | **One agent = one git worktree** — no shared-clone branch thrash |
| O3 | Start at **2** concurrent builders; scale only after **1 full day / 0 collisions** |
| O4 | **Kill after ~3 stuck iterations** — fix or hand off with evidence; no CI babysit loops |
| O5 | **One ranked FAIL (or one skeleton hop) per PR** |
| O6 | Every land: `AUDIT-COVERAGE-LIVE.md` → `Status = FIXED (PR #n)` **same commit** (Coder/Cursor columns only) |
| O7 | **Done = Neon (`bypass_rls=lucia`) + live app proof** — CI green is floor, not verdict |
| O8 | **OWNER LAW 2026-08-03:** NO HOLDS. NO `JORGE-APPROVED` label. Coders have **FULL Neon access** and **merge on green** in every lane (including money). Safeguard = **PROOF** (18-key evidence · independent review · additive migration · GUARD verify-after) — not a merge label. Owner steers by **decision in chat** only (e.g. “turn posting flag ON”). |
| O9 | No new breadth-audit inventory except defects found **while** finishing the active skeleton hop or active module. The 680-row ledger is **read-only reference**, not a queue. |
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
Make the factory capable of finishing work **without destroying unshipped work**.

### Actions (safe prune — Claude Coder correction)

1. List every open non-Dependabot PR; keep only skeleton / unblock / active-module work under WIP ≤ 3.  
2. Close or park everything else (comment: deferred under DELIVERY-METHOD-LOCKED).  
3. **Branch hygiene — NEVER “delete down to dozens” blindly:**  
   - **Delete** remote heads already **merged into main** (~539 class) — zero risk.  
   - **Tag-archive** then remove heads for unmerged-and-stale (`archive/<name>`) so commits stay recoverable — **archive, never destroy**. Aligns with `07-never-delete-only-add` for financial-evidence history.  
   - **Leave** branches touched in ~last 3 days (~196 class); triage by hand.  
4. Confirm each live agent has its **own worktree**.  
5. Publish daily scorecard (section 4).

### Exit criteria
- [ ] ≤ 3 active feature branches (WIP counter)  
- [ ] Merged-branch cleanup done; stale unmerged are archived (recoverable), not obliterated  
- [ ] Zero shared-clone collisions in the last work day  
- [ ] This file (rev B) on `main` and Desktop-copied  

---

## PHASE 1 — Vertical money skeleton (first operating value)

### Purpose
One thin end-to-end path through the TMS+books spine (walking skeleton).  
Faster to “TMS operating” than certifying 30 modules in breadth.

### Entry condition (must be explicit)
Prod historically has **imported loads / no TMS-dispatched going-forward load**.  
**Hop 0 (owner go-ahead):** Jorge authorizes creating **one real going-forward load** in the app (TRANSP or named entity).  
Linkage law is going-forward — this skeleton **is** that path. Without Hop 0, Phase 1 stalls on day one.

### The slice (must be one continuous story)

```text
0. Owner go-ahead — create one real going-forward load
1. Book load (+ customer)           ── Dispatch / Lists pickers real
2. Assign driver / unit / trailer   ── Ops FKs entity-scoped
3. Dispatch → in transit            ── Status machine honest
4. Deliver                          ── actual_departure_at stamped (WIRE-07 class)
5. POD + BOL evidence               ── WIRE-03 / WIRE-09 class
6. Revenue recognition latch        ── WIRE-05 (flags ON only when owner says so in chat)
7. Invoice + evidence gate          ── WIRE-04
8. GL / JE balanced                 ── CoA roles resolve; no silent skip
9. Bank path                        ── Match/categorize wiring proven;
                                       density may be ops backlog (named)
```

### Build rules
- Only PRs that advance a **named hop** above (or unblock CI/push for that hop).  
- Prefer **live** exercise after each hop.  
- Posting flags stay OFF until owner says “turn it on” in chat; prove wiring either way.  
- Money PRs: **merge on green** when proof gate passes (OWNER LAW) — do not wait on a label.  
- Update ledger Status same commit.

### Exit criteria (Phase 1 DONE)
- [ ] Hop 0 complete (real going-forward load exists)  
- [ ] That load has continuous drill: load ↔ stops ↔ POD/BOL ↔ invoice ↔ JE (and bank link if applicable)  
- [ ] Neon lucia counts / row IDs in Desktop evidence pack  
- [ ] Remaining gaps named UNVERIFIED with owner chat decision needed (or FIXED)  

### Explicitly out of Phase 1
Certifying all 30 modules; treating the 680-row ledger as a queue; CLS waves that don’t unblock the slice.

---

## PHASE 2 — Certify modules (one at a time)

### Purpose
Turn “partially wired” into **module COMPLETE** under Rule 24 + Full Audit Law.  
Skeleton-first prevents Rule 21 “certified but money-empty” amnesia.

### Order (money-risk first — Owner Plan aligned)

| Seq | Module | Notes |
|----:|--------|-------|
| 1 | **accounting** | Close remaining FAIL/UNVERIFIED after skeleton |
| 2 | **banking** | matched_je / categorize / recon — honest ops vs wiring |
| 3 | **settlements** | Pay, deductions, escrow, advances |
| 4 | **dispatch** | Beyond skeleton |
| 5 | **factoring** | |
| 6 | **vendors** | |
| 7 | **customers** | LV-001 class etc. |
| 8 | **drivers** | |
| 9 | **driver-hub** | |
| 10 | **fleet** | |
| 11 | **maintenance** | |
| 12 | **safety** | |
| 13 | **insurance** | |
| 14 | **legal** | |
| 15–16 | **lists**, **inventory** | Checklist-complete → prod_verified / Desktop certify |
| 17–18 | **cash-flow**, **finance** | |
| 19–29 | Last wave | home → fuel → form_425 → reports → tasks → docs → users → help → program → system → eld |
| 30 | **compliance** | Absolute end |

### Per-module loop
Audit → rank FAILs → fix under WIP → guards → Neon proof → `complete:true` → **only then** next module.

### Exit criteria
- [ ] All 30: `complete:true` **or** owner-written HOLD in chat with tracker + future block id  
- [ ] Desktop scoreboard matches  
- [ ] No theater complete  

---

## PHASE 3 — Leftover drain

Dedupe old blocks/GAP against audits. Build only true leftovers.  
**Do not** reopen the 400+ block index as primary queue.  
Ledger stays reference unless a leftover maps to an active defect.

---

## PHASE 4 — Launch gates (cannot skip)

- All 30 DONE or owner DEFER/HOLD with future block id  
- Law §9 money paths PASS or named HOLD  
- Held migrations reconciled  
- USMCA / entity isolation to threshold  
- Reverse-drill guard live  
- Sidebar 30 = config  
- Posting flags policy (owner chat)  
- Parallel books; no TMS→QBO write-back  
- OB/cutover locked files only  
- 425C virtual banks excluded  
- Deploy SHA = health  
- Jorge **LAUNCH-READY** in chat  

---

## 3. Agent map

| Role | Owns |
|------|------|
| **Cursor** | Skeleton FE/ops, non-financial, guards, Cursor ledger Status, WIP enforcement |
| **Claude Coder** | Financial cluster code + Neon apply + **merge on green when proof gate passes** (no `JORGE-APPROVED` wait) |
| **Cascade** | Audit evidence on **active** slice/module only; class cards; **does not treat 680-row ledger as a queue** |
| **GUARD** | Independent live verify **AFTER** merge |
| **Jorge** | Decisions in chat (flags, Hop 0 go-ahead, launch); kill WIP when > 3; does **not** review PRs for a label |

---

## 4. Daily scorecard (5 minutes — Jorge)

| Metric | Target |
|--------|--------|
| Active feature branches (all agents) | ≤ 3 |
| Phase | P0 / P1 / P2(module=X) / P3 / P4 |
| Skeleton hops green (incl. Hop 0) | n / 10 |
| Modules certified | N / 30 |
| Collisions today | 0 |
| Ledger FIXED updates today | ≥ merges |

Ignore: PR volume, “agents working,” cells covered.

---

## 5. Definition of DONE

| Layer | Meaning |
|-------|---------|
| Hop DONE | Live proof for that skeleton hop |
| Module DONE | Rule 24 complete:true + Desktop + Neon |
| Launch DONE | Phase 4 + Jorge LAUNCH-READY in chat |

CI green ≠ hop done ≠ module done ≠ launch ready.  
Proof gate ≠ `JORGE-APPROVED` label.

---

## 6. Anti-patterns (forbidden)

- Restarting the 400+ block index as primary queue  
- Breadth-certifying 30×13 before skeleton exit  
- Waiting on deleted `JORGE-APPROVED` label  
- Blind-deleting unmerged branches to hit “dozens”  
- Treating the 680-row ledger as the work queue  
- 4+ agents / shared clone  
- Babysit loops instead of fixing reds  
- EntityLink / honesty theater while economics empty  
- Inventing a fourth methodology mid-flight  

---

## 7. Immediate next actions

1. Land this file rev B on `main` + Desktop.  
2. **Phase 0 safe half:** delete merged-into-main heads; tag-archive stale unmerged; report real active count.  
3. Jorge: **Hop 0 go-ahead** (create one real going-forward load).  
4. Phase 1 hops 1–9 under WIP ≤ 3.  
5. After Phase 1 exit → accounting certify.

---

## 8. Progress log

| Date | Note |
|------|------|
| 2026-08-04 | Plan from three-coder synthesis + Owner Plan + DORA/WIP + walking skeleton |
| 2026-08-04 | #4305 cleared push blockers |
| 2026-08-04 | **Rev B** — Claude Coder defects accepted: (1) NO JORGE-APPROVED / merge-on-green+proof per OWNER LAW 2026-08-03; (2) safe branch archive not blind prune; (3) single WIP≤3 counter; (4) Phase 1 Hop 0 = create going-forward load; ledger = read-only reference |

---

**End of full plan (rev B).**  
Amend only with Jorge in writing.
