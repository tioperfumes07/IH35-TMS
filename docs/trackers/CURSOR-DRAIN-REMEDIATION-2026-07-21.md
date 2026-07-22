# CURSOR DRAIN REMEDIATION — 2026-07-21 (owner: stop STALE theater)

**Owner ruling:** The point of this work was **missing linkage and wiring**. Cursor repeated the Claude-coder failure mode — pile STALE / DESIGN docs without proving Law of the Land §9 total connectivity. That burned trust. This file is the remediation ledger.

**Law:** `docs/specs/ARCHITECTURE-BLUEPRINT-2026-07-05.md` §9 + Rule 14 + Rule 16.  
**Done =** code wired + guard + **LIVE** forward/reverse proof (or explicit UNVERIFIED). Docs-only STALE is **not** done.

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

**Action:** Coder may close as superseded by this remediation ledger. Cursor opens **no more WAVE-N verify PRs**.

---

## B. HOLD-OK — honest gates (keep; do not pretend wired)

| PR | Gap (linkage terms) | Owner/coder next |
|---|---|---|
| #3114 | Governance rulings | Merge as law text when ready |
| #3127 | CoA true-merge | No merge accounts until design + CPA |
| #3128 / #3153 | Settlement approval mount | **Unwired** + G1–3 IDOR — must not mount until safe |
| #3129 | Pre-invoice / official invoice | Product design; auto-TONU forbidden |
| #3133 | ItemEditor “+ Add new” wrong create kind | **HOLD docs only — CODE NOT FIXED** → promote to REAL FIX |
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
| **#3124** | Bank tx capture fields persist | Neon `202607690000` (coder); live categorize round-trip; both-way bank↔GL where applicable |
| **#3123** | Driver default expense account | Neon apply; recommendation path uses column; entity-scoped |
| **#3141** | Append-only grants | Already applied on prod — merge for repo truth (coder) |
| **#3133 → code** | Wrong account create kind | **Implement** correct create chrome for account vs category — not docs-only |

---

## E. Remediation order (Cursor build / coder merge)

1. **Stop** all WAVE STALE PRs / agents.
2. **Fix #3149** typecheck + PR LINKAGE section (Cursor).
3. **Promote #3133** from docs HOLD → code fix PR (correct `+ Add new` kind) with linkage to CoA create.
4. **Audit posters** still on `catalogs.account_role_bindings` direct `FROM` — repoint or document intentional JOIN-only bridges.
5. **Escrow / vendor / chargeback** (#3156/#3159) — only after owner answers; then code+mig with §9.
6. Every new PR: ACCEPTANCE template + §9 checklist; LIVE PROOF or UNVERIFIED named.

---

## F. Apology / process change

Cursor will not open another “WAVE N verify / all STALE” PR.  
Progress = **wiring that makes money and records appear in the correct modules, tabs, GL accounts, and reverse drills** — proven or explicitly UNVERIFIED.
