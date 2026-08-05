# IH35 — FULL DELIVERY PLAN (NOW → LAUNCH)

**Status:** LOCKED hybrid — DORA/WIP + walking skeleton + Owner module certify  
**Date:** 2026-08-05 (rev **H** — Rule 37 claim→merge→author hardline · close claim-reserve same-PR bypass · §9.0 item 17 + Claude serial)  
**Authority:** This committed file wins over any chat summary, agent memory, or stale paste.  
**Supersedes as primary queue:** 400+ block pile, breadth-first 30×13 certify-everything, multi-agent sprawl  
**Does not supersede:** Law of the Land · Rule 16/21/23/24 · `00-operating-method-LAW.mdc` (OWNER LAW 2026-08-03) · parallel books (no TMS→QBO write-back)

**Remind every session:**  
`Execute docs/specs/DELIVERY-METHOD-LOCKED.md — vertical money skeleton → certify modules under WIP≤3 — do not invent a fourth method. Obey §9 coder instructions exactly.`

Companion: `docs/trackers/OWNER-EXECUTION-PLAN-2026-07-22.md` (module order + audit depth).  
**Reservation protocol (before starting any class-drain wave):** `docs/audit/RESERVATION-LEDGER-PROTOCOL-2026-08-05.md` — reserve class-id **+ files** (as ONE reservation when two classes share a hotfile); draw verify-step numbers from your own CLAIM-BLOCK band and land the claim on `main` first (Rule 25/37); Scoreboard conflicts = union the Findings rows and **regenerate**, never hand-merge a generated file.  
Sidebar / modules: **30** (`SIDEBAR_ITEM_IDS` + 30 module-completion files). Not 28.  
Ratchet: `scripts/verify-no-approval-holds.mjs` (verify-step **2218**) — FAILS only on **new affirmative** hold language in **active governance**. Abolition lines (`NO HOLDS. NO JORGE-APPROVED`) are **retained on purpose**. History (`docs/audit`, `db/migrations`, `.block-ready`) is **excluded**.

**One writer for this file: Cursor.** Claude Coder / Cascade / GUARD execute; they do **not** author competing delivery methods.

---

## GOVERNANCE (OWNER LAW 2026-08-03 — FINAL)

- **Money PRs:** the coder **MERGES ON GREEN with proof**. No approval gate. **NO `JORGE-APPROVED`.** No hold.
- **Neon:** the coder **APPLIES migrations** and **flips posting flags** on Neon themselves. The owner does **NOT** apply on Neon.
- **Owner's only money role:** the **DECISION of WHEN** to turn a posting flag ON (chat), and entering **opening-balance figures**. Nothing else.
- **Safety = PROOF, not approval:** additive/idempotent + guard + tests → coder applies on Neon → **GUARD verifies live AFTER**.
- **Agent map:** Claude Coder = money/GL/migrations — builds, applies on Neon, merges on green with proof. Cascade = auditor on active slice only. Owner = decisions + launch sign-off. Owner does **not** apply Neon.

### How permanence works (Claude Coder measured — 2026-08-04)

| Wrong | Right |
|-------|--------|
| Claim “1,178 lines / ~40 files instruct a hold” | Measured: ~208 mentions / 118 files; active governance affirmative waits = **zero** |
| Purge every mention of `JORGE-APPROVED` | **Keep** abolition sentences (“NO HOLDS. NO `JORGE-APPROVED`”) — deleting them removes the law that kills the gate |
| Rewrite `docs/audit`, `db/migrations`, `.block-ready` | **Forbidden** — WORM / never-delete / migration checksum freeze |
| Zero-tolerance token ban | Ratchet fails on **affirmative** holds only; baselines abolition lines |

Canonical: `.cursor/rules/00-operating-method-LAW.mdc`.

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
| Branch inventory (Phase 0 shape) | ~539 merged → delete safe; ~2,366 unmerged → **tag-archive only**; ~196 recent → hand triage |

**Unit of progress (only these count):**

1. Money skeleton live-proven on Neon + app  
2. Modules **certified** (Rule 24 `complete:true` + Desktop audit + prod proof)  
3. Launch gate checklist green  

**Do not count:** PR volume, ledger row count, “cells covered,” agents “working.”

---

## 1. Standing operating laws (every day)

| # | Law |
|---|-----|
| O1 | **WIP ≤ 3 active feature branches across ALL agents / ALL lanes** (one counter — no separate Cursor cap). **P0 main-unblock PRs are excluded** from the counter (§9.0 item 14). |
| O2 | **One agent = one git worktree** — no shared-clone branch thrash |
| O3 | Start at **2** concurrent builders; scale only after **1 full day / 0 collisions** |
| O4 | **Kill after ~3 stuck iterations** — fix or hand off with evidence; no CI babysit loops |
| O5 | **One ranked FAIL (or one skeleton hop) per PR** |
| O6 | Every land: `AUDIT-COVERAGE-LIVE.md` → `Status = FIXED (PR #n)` **same commit** (Coder/Cursor columns only) |
| O7 | **Done = Neon (`bypass_rls=lucia`) + live app proof** — CI green is floor, not verdict |
| O8 | **See GOVERNANCE block above.** NO HOLDS. Coders **FULL Neon** + **merge on green with proof** (every lane, including money). Owner steers by **decision in chat** only (e.g. “turn posting flag ON”). |
| O9 | No new breadth-audit inventory except defects found **while** finishing the active skeleton hop or active module. The 680-row ledger is **read-only reference**, not a queue. |
| O10 | PR titles Cursor lane: must start with `Cursor-` |
| O11 | **Committed plan file beats chat summary.** |
| O12 | **No CPA merge gate.** Jorge is the sole financial-decision authority (chat only). Proof agents inform; they do not withhold merges. |
| O13 | Living law must stay clean under `verify-no-approval-holds` (step 2218). Do not reintroduce deleted merge-label tokens. |

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
- [ ] This file (rev C+) on `main` and Desktop-copied  

**Owner of Phase 0 branch hygiene: Claude Coder** (safe half only). Cursor does not race it.

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
- [ ] All 30: `complete:true` **or** owner-written **DEFER** in chat with tracker + future block id (not a merge label; not a CPA gate)  
- [ ] Desktop scoreboard matches  
- [ ] No theater complete  

---

## PHASE 3 — Leftover drain

Dedupe old blocks/GAP against audits. Build only true leftovers.  
**Do not** reopen the 400+ block index as primary queue.  
Ledger stays reference unless a leftover maps to an active defect.

---

## PHASE 4 — Launch gates (cannot skip)

**There is no CPA. There is no CPA HOLD path.** Jorge alone decides financial policy in chat. Proof agents (code-review + financial-agent skills) **inform** correctness; they **never** withhold a merge for owner/CPA sign-off. Merge = green + proof gate (O8).

- All **30** modules DONE, or Jorge DEFER in chat with tracker + future block id  
- Law §9 money paths PASS, or Jorge-named UNVERIFIED/DEFER (chat) — **not** a retired CPA gate  
- Held migrations reconciled  
- USMCA / entity isolation to threshold  
- Reverse-drill guard live  
- Sidebar **30** = `SIDEBAR_ITEM_IDS` / config (not 28)  
- Posting flags policy (owner chat only)  
- Parallel books; no TMS→QBO write-back  
- OB/cutover locked files only  
- 425C virtual banks excluded  
- Deploy SHA = health  
- Jorge **LAUNCH-READY** in chat  

---

## 3. Agent map (summary) — LOCKED 2026-08-05

| Alias | Role | Owns |
|-------|------|------|
| **Cursor** | FE builder + plan + WIP enforcer | Sole author of this plan file; skeleton FE/ops/wiring/pickers/guards; Cursor ledger Status; WIP enforcement + reporting |
| **CC-1** | Claude Coder (money builder) | Phase 0 branch hygiene (safe half); money/GL/migrations — **builds, merges on green with proof**; Neon apply **after** migration file is on main via merge (never hand-apply DDL ahead of the file) |
| **CC-2** | GUARD | Independent live verify **AFTER** merge only (Neon `bypass_rls=lucia` + app/health) |
| **Cascade** | Auditor | Audit evidence on **active** slice/module only; class cards; ledger = reference — not a third builder |
| **Jorge** | Owner | Decisions in chat (flags, Hop 0, launch, DEFER, OB figures, **"reconcile"** go); kill WIP when > 3; does **not** apply Neon; does **not** review PRs for a label |

Full collision law → **§9**.

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
Proof gate ≠ owner-approval merge label ≠ CPA sign-off.

---

## 6. Anti-patterns (forbidden)

- Restarting the 400+ block index as primary queue  
- Breadth-certifying 30×13 before skeleton exit  
- Waiting on deleted `JORGE-APPROVED` label / inventing a hold  
- Reintroducing a CPA / owner-label merge gate  
- **Purging abolition sentences** (“NO HOLDS. NO `JORGE-APPROVED`”) from living law  
- Rewriting `docs/audit` / `db/migrations` / `.block-ready` to erase historical label mentions  
- Blind-deleting unmerged branches to hit “dozens”  
- Treating the 680-row ledger as the work queue  
- 4+ agents / shared clone  
- Babysit loops instead of fixing reds  
- EntityLink / honesty theater while economics empty  
- Inventing a fourth methodology mid-flight  
- Two coders editing the same hop / same module FAIL / same hot files  
- Claude Coder or Cascade rewriting this delivery plan  
- Cascade opening builder PRs or breadth-auditing off the active slice  

---

## 7. Immediate next actions

1. Land this file **rev E** on `main` + Desktop (GOVERNANCE + positive-only ratchet + Cascade law).  
2. **Phase 0 safe half (Claude Coder, on Jorge go):** delete ~539 merged-into-main heads; tag-archive stale unmerged as `archive/<name>`; report real active count. Do not destroy unmerged.  
3. Jorge: **Hop 0 go-ahead** (create one real going-forward load) — separate decision.  
4. Phase 1 hops 1–9 under WIP ≤ 3 (Cursor FE/ops + Claude money as split in §9; Cascade evidence on active hop only).  
5. After Phase 1 exit → accounting certify.

---

## 8. Progress log

| Date | Note |
|------|------|
| 2026-08-04 | Plan from three-coder synthesis + Owner Plan + DORA/WIP + walking skeleton |
| 2026-08-04 | #4305 cleared push blockers |
| 2026-08-04 | **Rev B** — Claude Coder: NO JORGE-APPROVED; safe archive prune; WIP≤3; Hop 0; ledger reference |
| 2026-08-04 | Claude Coder verified Rev B. Sidebar = **30**. File beats chat summary. |
| 2026-08-04 | **Rev C** — Phase 4: no CPA path; §9 strict per-coder instructions |
| 2026-08-04 | **Rev D** — Agent GOVERNANCE block + over-broad token purge (partially wrong mechanism) |
| 2026-08-04 | **Rev E** — Claude Coder measured: Agent “1178 lines” wrong; restore abolition language; revert `.block-ready` history edits; positive-only ratchet; **full Cascade §9.4** |
| 2026-08-05 | **Rev F** — Owner ruling: **P0 main-unblock override** (no WIP count) · locked lane map (Cursor / CC-1 / CC-2 / Cascade) · **WIRE+TEST FIRST, RECONCILE LATER** (Faro/QBO/factoring/$40,882 frozen until Jorge says "reconcile") · migrations land via merged PR then Neon apply |
| 2026-08-05 | **Rev G** — Cursor = **Claude serial ship** (Rule 36): tip-main before every push · max 1 CLAIMED/verify-step PR · Claude title/body shape · preflight fails if behind `origin/main` |
| 2026-08-05 | **Rev H** — Rule **37** claim→merge→author: number must be on `origin/main` before authoring `verify-steps/NNNN-*.mjs`; claim-reserve is claim-ONLY (no claim+guard same PR); `money-pr-local-gate` runs `verify-verify-step-claimed-on-main`; `regenSamePr` only for `claimed-regen` |

---

## 9. STRICT CODER INSTRUCTIONS (collision law — do not deviate)

**Hard rule:** If your next action is not listed under your role below, **stop**. Ask Jorge in chat. Do not invent a parallel method.

### 9.0 Shared laws (every coder, every turn)

1. Read this file first. Obey current phase only (P0 → P1 → P2… in order).  
2. **WIP ≤ 3** total active feature branches (all agents). Before opening a branch: count open non-Dependabot feature PRs/branches; if already 3, finish or park one first. **Exception:** P0 main-unblock (§9.0 item 14) does **not** count.  
3. **One worktree per agent.** Never share a clone. Never force-push another agent’s branch.  
4. **One hop OR one ranked FAIL per PR.** No grab-bags.  
5. **No babysit loops.** Fix reds or one-shot re-run flake; do not sleep-poll CI. Kill after ~3 stuck iterations; hand off with evidence.  
6. **Merge on green + proof** (OWNER LAW). Neon (`SET app.bypass_rls='lucia'`) + live app/health. CI green is the floor, not the verdict. Never wait for `JORGE-APPROVED`. Never invent a CPA gate.  
7. Money commits: FINDING · LANE · DOD-A…E · VERIFY-1…8 · MODULE_PROGRESS · Rule 16 · MIGRATE if needed (verify-steps 1324/1430/1431).  
8. Same-commit ledger Status update when a row is FIXED.  
9. Rule 17: do **not** thrash `package.json` / locked CI workflows for new guards — verify-steps only.  
10. PR title prefixes: Cursor → `Cursor-` · Claude Coder / CC-1 → `Claude-` / `Claude-1-` · Cascade → `Cascade-` · GUARD / CC-2 → `Guard-`.  
11. When chat summary contradicts this file → **this file wins**.  
12. Stop after ~3 stuck iterations; hand off with evidence.  
13. **Do not purge** abolition law. **Do not rewrite** audit/migration/`.block-ready` history to erase old label mentions.  
14. **P0-BLOCKER OVERRIDE (owner 2026-08-05):** When **main is red for all lanes** (shared gate / shared guard floor — e.g. §7 palette baseline stale), the **first free lane** lands the **smallest fix immediately**. Cross-lane allowed. **No park, no ask.** That PR **does not count against WIP ≤ 3**. Resume normal WIP after it merges.  
15. **WIRE + TEST FIRST, RECONCILE LATER (owner 2026-08-05):** Reconciliation is **FROZEN**. Nobody touches Faro / QBO / factoring / the **$40,882** figure / transaction-reconcile work until the money skeleton is wired, tested, and proven live **and** Jorge says **"reconcile"** in chat. Builders wire + prove; they do **not** reconcile.  
16. **Prod migrations:** reach the prod branch **only** via merge → deploy/ledger path. **Never** hand-apply DDL to prod ahead of the migration file on `main`. Rehearse on a Neon REHEARSE branch only. Main, ledger, and prod must agree.  
17. **SYSTEMIC SWEEP > PER-SITE PATCH (owner ruling 2026-08-05 — every lane, every fix).**  
    When a fix is the SAME mechanical change repeated at ≥3 call sites (a codemod: identical before→after — swap component X→Y, rename an API, apply one pattern across screens/routes), it MUST ship as **ONE sweep PR** with **ONE generalized guard** that scans ALL sites and fails if any site still carries the old pattern. **NOT** one PR per site. **NOT** one bespoke guard or one CLAIMED number per site. One review, one regression surface, one guard that also blocks the NEXT new site from regressing.  
    - This is **ONE logical fix** → it is **NOT** a "grab-bag" under §9.0.4. The generalized guard is the proof it is a single pattern. Cite it in the PR body.  
    - Group sweeps by **pattern / entity-kind**, never by screen.  
    - **In scope (examples, not exhaustive):** EntityPicker migrations by kind (`unit` / `driver` / `load` / `trailer` / …); customer and vendor picker boxes; repeated `+ Create` / nested-create chrome; identical dropdown → searchable-picker swaps; wiring / connectivity / reverse-drill / linkage patterns that are the same transform at many sites.  
    - Keep fixes SEPARATE only when each genuinely needs different logic/review — not the same transform. Do not bundle UNRELATED fixes to game this rule.  
    - **MONEY/GL/MIGRATION:** a sweep is still one logical change, reviewed with extra care; never bundle unrelated money fixes into one PR (§1.4 still governs). Prefer CC-1 for money sweeps.  
    - Applies to: Cursor (FE sweeps), CC-1 (money/schema sweeps), Cascade (evidence), GUARD (guards).

### 9.1 Jorge (owner)

**MUST**
- Decide in chat: Phase 0 go · Hop 0 go · posting flags ON · DEFER with tracker+block · LAUNCH-READY  
- Kill WIP when > 3  
- Be sole financial-decision authority  

**MUST NOT**
- Review PRs for a merge label  
- Be asked to click `JORGE-APPROVED`  
- Be treated as a CPA bottleneck  
- Apply Neon / flip flags (coders do)  

### 9.2 Cursor (FE builder + plan + WIP enforcer)

**MUST**
- Own **this file** (sole methodology author)  
- Phase 1: hops that are FE/ops/wiring/pickers/guards (dispatch chrome, EntityPickers, reverse-drill linkage UI, scoreboard, verify-steps)  
- Enforce WIP ≤ 3 in STATUS replies (report `WIP: n/3` every reply; exclude P0-unblock from the count)  
- Desktop-copy this plan after every rev land  
- Hand a hop to **CC-1** the moment it touches money/GL/migration  
- Take P0 main-unblock immediately when free (§9.0 item 14)  
- **Obey Rule 36 Claude serial ship sequence** (below) on every PR — this is why Claude merges in minutes and Cursor was burning hours  

**MUST NOT**
- Race Claude on Phase 0 branch deletes/archives  
- Open money/GL/migration PRs (CC-1 owns)  
- Author a second delivery method  
- Restart 400+ block pile as primary queue  
- Touch another agent’s worktree or force-push their branch  
- Blind-delete unmerged branches  
- Touch Faro/QBO/factoring/$40,882/transaction reconcile (§9.0 item 15)  
- Open a **second** Cursor PR that edits `CLAIMED-NUMBERS.json` / adds verify-steps while another such PR is still open  
- Push when `HEAD` does not contain `origin/main` (stale base)  
- Leave a PR `CONFLICTING` — rebase + preflight + push **same turn**  

**Worktree:** dedicated Cursor worktree only (e.g. cleanup / main-check — never Claude’s).

#### 9.2.1 Claude serial ship sequence (permanent — owner 2026-08-05)

Claude’s measured method → Cursor law (Rule **36** / `.cursor/rules/36-claude-serial-ship-sequence.mdc`):

1. `git fetch origin main` → `git checkout -B cursor/<slug> origin/main` (never stack on another open tip).  
2. One ranked FAIL: code + **sibling guards** + new guard. **Rule 37:** claim number on `origin/main` FIRST (claim-only PR); feature PR must NOT edit CLAIMED. (CLAIMED-REGEN = registry tooling only.)  
3. Title: `Cursor- fix(<module>): <FINDING> — <defect>`. Body: FINDING-first Claude-green (no `## Summary` / no draft theater).  
4. `node scripts/ops/cursor-ship-preflight.mjs --body-file /tmp/pr-body.txt` → PASS.  
5. Fetch again; if behind, `git rebase origin/main` → re-preflight → **one** push (`--force-with-lease` only after rebase).  
6. PR **ready** (not draft). Max **1** open Cursor CLAIMED/verify-step PR at a time. Mechanical migrations obey §9.0 item **17**: **ONE sweep PR per pattern / entity-kind** (unit · driver · load · trailer · customer · vendor · +Create · linkage wiring) + **ONE generalized guard** — never one PR per screen.  
7. If main moves → CONFLICTING: rebase same turn — never a multi-hour babysit/rebase loop.

### 9.3 Claude Coder / CC-1 (money builder — Neon / Phase 0 hygiene)

**MUST**
- On Jorge **Phase 0 go:** delete merged-into-main heads only; tag-archive stale unmerged (`archive/<name>`); leave ~recent set; report active count  
- Own financial cluster: `accounting.*` / CoA / posting reuse / migrations / Neon apply / money merge-on-green+proof  
- Phase 1: hops 6–9 (revrec · invoice evidence · GL/JE · bank path) once wiring exists; earlier hops only if Cursor hands off money defect  
- Independent code-review + financial-agent pass on money PRs **before** merge (inform correctness; do not wait on owner label)  
- After merge: leave for GUARD verify-after  

**MUST NOT**
- Destroy unmerged branches (archive only)  
- Author / fork `DELIVERY-METHOD-LOCKED.md` or a competing method  
- Wait on `JORGE-APPROVED` or invent CPA HOLD  
- Edit Cursor FE hops without declared handoff  
- Start Phase 1 skeleton hops before Jorge Hop 0 go-ahead  
- Treat the 680-row ledger as a build queue  
- Purge abolition sentences or rewrite `.block-ready` / migration headers  

**Worktree:** dedicated Claude worktree only.

### 9.4 Cascade (auditor — ACTIVE SLICE ONLY — strict)

Cascade is the **auditor**, not a third builder. Cascade prevents breadth amnesia and false-green — Cascade does **not** ship product PRs that compete for WIP.

**MUST**
1. Work **only** the **active** Phase 1 skeleton hop **or** the **active** Phase 2 module (one at a time). Name it in every reply (`HOP_OR_FAIL` / module id).  
2. Produce evidence packs: Desktop audit rows, class cards, Neon lucia counts, live URL/SHA pointers, honest `PASS` / `FAIL` / `UNVERIFIED`.  
3. Append to `AUDIT-COVERAGE-LIVE.md` **Cascade columns only** (Module/Layer/Entity/Verdict/Evidence/Date/Auditor). Never write CODER/CURSOR Status or GUARD `VERIFIED`.  
4. Keep the ~680-row ledger as **read-only reference** — never treat it as a sprint queue; never invent a parallel backlog.  
5. Pre-audit **one wave ahead** only when builders are draining the current hop/module (Operating Method).  
6. Flag hotfile overlap before Cursor and Claude open parallel PRs.  
7. PR titles (docs/evidence only): `Cascade-`. Docs-only / evidence PRs must not consume builder WIP slots without Jorge chat.  
8. When a builder claims FIXED: leave for **GUARD** — Cascade may re-check evidence but does not merge money.

**MUST NOT**
1. Open feature / money / migration fix PRs (that is Cursor or Claude Coder).  
2. Breadth-inventory all 30 modules while Phase 1 unfinished.  
3. Rewrite `DELIVERY-METHOD-LOCKED.md` or invent a fourth methodology.  
4. Edit another role’s ledger columns.  
5. Purge / rewrite `docs/audit`, `db/migrations`, or `.block-ready` “to clean JORGE-APPROVED” — history is evidence.  
6. Ask Jorge for a merge label; invent CPA HOLD; tell builders to wait for approval.  
7. Race Phase 0 branch hygiene (Claude Coder owns it).  
8. Start Hop 0 / create loads (owner operational act).  
9. Flip posting flags.  
10. Share a worktree with Cursor or Claude.

**Worktree:** dedicated Cascade worktree only.  
**Done for Cascade:** evidence row with proof pointer — not “module certified” (certify is builders + GUARD + Rule 24).

### 9.5 GUARD / CC-2 (verifier — after merge only)

**MUST**
- Live-prove AFTER merge (Neon lucia + app/health as required)  
- Fail closed on false-empty / missing effect  

**MUST NOT**
- Build product features in the same slot as verify  
- Block merges with owner-label waits  
- Pre-empt builders by opening competing fix PRs without Jorge assignment  
- Touch Faro/QBO/factoring/$40,882/transaction reconcile (§9.0 item 15)  

### 9.6 Collision matrix (who may touch what)

| Surface | Cursor | Claude Coder | Cascade | GUARD |
|---------|:------:|:------------:|:-------:|:-----:|
| `DELIVERY-METHOD-LOCKED.md` | **WRITE** | read | read | read |
| Phase 0 branch hygiene | no | **OWN** | no | no |
| Skeleton hops 1–5 (ops/FE) | **OWN** | handoff only | evidence | verify-after |
| Skeleton hops 6–9 (money) | handoff only | **OWN** | evidence | verify-after |
| `db/migrations/*` money | no* | **OWN** | no | no |
| Non-money guards / verify-steps | **OWN** | ok if money-guard | no | may add fail-closed |
| Module certify (Phase 2 active) | FE FAIL | money FAIL | audit | verify-after |
| `AUDIT-COVERAGE-LIVE` Cascade cols | no | no | **OWN** | no |
| `AUDIT-COVERAGE-LIVE` Status FIXED | **OWN** lane | **OWN** lane | no | no |
| `AUDIT-COVERAGE-LIVE` VERIFIED | no | no | no | **OWN** |
| 680-row ledger queue use | forbidden | forbidden | reference only | — |
| Posting flag ON | never alone | never alone | never | never — **Jorge chat only** |
| Purge abolition / rewrite history | **FORBIDDEN** | **FORBIDDEN** | **FORBIDDEN** | **FORBIDDEN** |

\*Cursor may land non-money schema only with Jorge chat if it unblocks a named hop — still WIP-counted; prefer Claude for any accounting/banking migration.

### 9.7 Daily handoff line (every coder reply)

```text
PHASE: P0|P1|P2(module)|P3|P4
HOP_OR_FAIL: <id>
WIP: <n>/3
ROLE: Cursor|CC-1|CC-2|Cascade
FILES-OWNED: <paths this turn>
NEXT: <one sentence>
BLOCKER: none | <exact>
```

P0-unblock PRs: note `P0-EXCLUDED` beside WIP so the counter stays honest.

### 9.8 Deviation = stop

Any of these → **STOP that item**, post a one-line `ISSUE:`, keep working everything else (or ask Jorge when the law itself is unclear):
- Opening a 4th active feature branch (unless it is a §9.0 item-14 P0 main-unblock)  
- Editing another role’s OWN surface from §9.6 (except P0 cross-lane unblock)  
- Waiting on `JORGE-APPROVED` / CPA / inventing a hold  
- Starting Phase 1 without Hop 0 go  
- Deleting an unmerged branch without `archive/` tag  
- Inventing a fourth delivery method  
- Treating ledger rows as the sprint backlog  
- Cascade shipping builder PRs or off-slice breadth audits  
- Purging abolition sentences or rewriting audit/migration history  
- Touching Faro/QBO/factoring/$40,882/transaction reconcile before Jorge says **"reconcile"**  
- Shipping **per-site / per-screen** patches (or one bespoke guard / CLAIMED number per site) when ≥3 call sites share the same mechanical transform — violates §9.0 item **17** (Systemic sweep > per-site patch)  

---

**End of full plan (rev G).**  
Amend only with Jorge in writing. Cursor is sole editor of this file.
