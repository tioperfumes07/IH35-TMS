# CURSOR DRAIN REMEDIATION — 2026-07-21 (owner: stop STALE theater)

**Owner ruling:** The point of this work was **missing linkage and wiring**. Cursor repeated the Claude-coder failure mode — pile STALE / DESIGN docs without proving Law of the Land §9 total connectivity. That burned trust. This file is the remediation ledger.

**Law:** `docs/specs/ARCHITECTURE-BLUEPRINT-2026-07-05.md` §9 + Rule 14 + Rule 16.  
**Done =** code wired + guard + **LIVE** forward/reverse proof (or explicit UNVERIFIED). Docs-only STALE is **not** done.

**Merge authority:** See **`docs/trackers/CLAUDE-CODER-MERGE-SEQUENCE-2026-07-21.md`** (permanent handoff — supersedes ad-hoc ordering below when they differ).

## Verdict key

| Tag | Meaning |
|---|---|
| **THEATER** | Docs verify / STALE report — no wiring fix. Close or supersede; do not count as progress. |
| **HOLD-OK** | Honest design/owner gate — keep, but must list §9 gaps; not shippable as “fixed”. |
| **PARTIAL** | Real code but **missing** linkage checklist / live proof / wrong layer (UI chrome ≠ GL linkage). |
| **ON-MISSION** | Actual wiring toward CoA/resolver/linkage — finish CI + Neon + §9 evidence. |
| **CODER** | Claude/coder merge+Neon lane — Cursor does not merge. |

---

## A. THEATER — do not treat as progress (close when coder ready)

| PR | Title class | Why theater |
|---|---|---|
| #3152 | WAVE 3 verify | STALE table only |
| #3154 | WAVE 4 verify | STALE / NEEDS-OWNER table only |
| #3158 | WAVE 5 verify | STALE / ACTION-ONLY table only |
| #3161 | WAVE 6 verify | Explicit “0 REAL FIX” |
| #3163 | WAVE 7 verify | Mostly STALE + one picker (picker is separate #3162) |
| #3113 | Neon handoff rewrite | Ops doc; useful for apply order but **not** linkage repair |

**Action:** Coder closes as superseded by **`CLAUDE-CODER-MERGE-SEQUENCE-2026-07-21.md`**. Cursor opens **no more WAVE-N verify PRs**.

---

## B. HOLD-OK — honest gates (keep; do not pretend wired)

| PR | Gap (linkage terms) | Owner/coder next |
|---|---|---|
| #3114 | Governance rulings | Merge as law text when Jorge finalizes |
| #3127 | CoA true-merge | No merge accounts until design + CPA |
| #3128 / #3153 | Settlement approval mount | **Unwired** + G1–3 IDOR — must not mount until safe |
| #3129 | Pre-invoice / official invoice | Product design; auto-TONU forbidden |
| #3133 | ItemEditor “+ Add new” wrong create kind | **HOLD docs only — CODE NOT FIXED** → see **#3165** |
| #3135 | CONN-1 plaid reconcile | PENDING(GATED) honesty |
| #3140 | Auto-apply payments | No FIFO apply until owner |
| #3142 | CONN-3 Relay bank | Apply-order + total_cash decision |
| #3143 | Expense duplicate detection | Policy + poster reuse |
| #3144 | Parts inventory → GL | Periodic vs perpetual owner/CPA |
| #3156 | Escrow split-brain | Two stores — pick canonical before live money |
| #3159 | Vendor FK / DIP AP / flow2 chargeback GL | Real linkage HOLDs — need migrations+posts after owner |

---

## C. PARTIAL — code shipped without §9 proof (must remediate)

| PR | What it did | What’s missing for linkage law |
|---|---|---|
| #3116 | Home KPI date range | Not money linkage |
| #3145 | Period Comparison → ParityTable | Grid chrome ≠ GL connectivity |
| #3148 | CoA Roles picker shows **name** | UX only — does not designate/post; needs live designate proof |
| #3151 | Dispatcher Home invoice status | Reverse link surface — needs live load↔invoice proof |
| #3162 | Expense category map name picker | Same as #3148 — UX; map rows must resolve to real `catalogs.accounts` on post |
| #3146 | `bill_lines` scope-inheritance guard | Guard tracks gap; **FK still not enforced** — not fixed |
| #3155 | CHAIN-04 verify-steps wire | Guard wire only — tie-out live money still HOLD |
| #3120 | no-accounting-qbo-writes guard wire | Guard only |

**Action:** Each PARTIAL PR body must gain ACCEPTANCE + LINKAGE §9 section; either (a) add the missing wiring, or (b) retitle as UI/guard-only and stop claiming accounting drain progress.

---

## D. ON-MISSION — finish properly (priority fix queue)

| PR | Why on-mission | Required to be “done” |
|---|---|---|
| **#3149** | Pay-run close → `chart_of_accounts_roles` resolver | `build-typecheck` green; held mig `202607710000` Neon-applied (coder); owner designates roles; live pay-run preview posts to designated accounts; §9 block |
| **#3124** | Bank tx capture fields persist | **Merged** — confirm Neon `202607690000` applied |
| **#3123** | Driver default expense account | Neon apply; recommendation path uses column; entity-scoped |
| **#3141** | Append-only grants | **Merged** — already applied on prod |
| **#3165** | ItemEditor correct create chrome | Merge NOW; linkage to CoA create path |
| **#3169** | verify-no-dead-schema guard | Merge NOW; §10a enforcement |
| **#3172** / **#3170** | bill_lines + expense reverse drill | After CI green + Neon/live proof |

---

## E. Remediation order (Cursor build / coder merge)

**Authoritative sequence:** **`docs/trackers/CLAUDE-CODER-MERGE-SEQUENCE-2026-07-21.md`** — use that file for merge order, CI gates, and Neon apply. This section is the classification ledger only.

Summary pointer:

1. **Close** WAVE STALE theater (#3152/#3154/#3158/#3161/#3163) — do not merge.
2. **Merge NOW** (one at a time, rebase after each): #3169 guard → #3165 ItemEditor → optional tracker chores → #3148/#3151 PARTIAL UX → audit evidence #3173/#3175/#3176.
3. **Merge AFTER Neon** (coder): #3123 → #3149 → #3172 → #3170 → #3171 → #3180 → #3179.
4. **HOLD** until Jorge: #3114, #3129, #3156, #3159, #3178 (+ merged design holds on main).
5. Every new PR: ACCEPTANCE + §9 checklist; LIVE PROOF or UNVERIFIED named.

---

## F. Apology / process change

Cursor will not open another “WAVE N verify / all STALE” PR.  
Progress = **wiring that makes money and records appear in the correct modules, tabs, GL accounts, and reverse drills** — proven or explicitly UNVERIFIED.
