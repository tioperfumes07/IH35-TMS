# Claude coder merge sequence (permanent until owner revises)

**As-of:** 2026-07-21 evening · `origin/main` @ `e64fc4c6b` · 39 open PRs in #3100–#3200 band  
**Owner law:** Cursor builds; **Claude coder merges + Neon apply**. Docs-only STALE ≠ progress.  
**Supersedes:** WAVE verify theater PRs; optional skip of #3164 when this file lands.

---

## NEVER merge (close as theater / DO NOT MERGE)

Close without merge — they repeat STALE tables and burn trust (see `CURSOR-DRAIN-REMEDIATION-2026-07-21.md` §A).

| PR | Title | Evidence |
|---|---|---|
| **#3152** | WAVE 3 verify 12 residual pending | OPEN · docs-only · CI green · **0 wiring** |
| **#3154** | WAVE 4 verify NEEDS-OWNER/PROD | OPEN · docs-only · CI green · **0 wiring** |
| **#3158** | WAVE 5 verify final 8 NEEDS-OWNER | OPEN · docs-only · CI green · **0 wiring** |
| **#3161** | WAVE 6 verify priority batch | OPEN · docs-only · explicit “0 REAL FIX” |
| **#3163** | WAVE 7 verify priority GAP batch | OPEN · docs-only · STALE table only |
| **#3113** | Neon-apply handoff CORRECTED — DO NOT MERGE | OPEN · ops doc · superseded by this sequence + coder Neon lane |

**Also close (docs-only STALE / builder theater — not in merge queue):**

- Any future WAVE-N verify PR (Cursor forbidden from opening more).
- **#3116**, **#3145**, **#3155**, **#3162**, **#3120** — builder-tagged “DO NOT MERGE”; real fixes belong in ON-MISSION PRs with §9 evidence, not orphan builder branches.

**Do not merge #3176 as “fixed”** — merge only as **FAIL evidence** (batch3 audit doc); title says DO NOT MERGE for good reason.

---

## Merge NOW if CI green (repo-truth / non-money / real UI wiring)

**Rule:** ONE AT A TIME · squash merge · rebase next PR onto fresh `origin/main` after each.

| Order | PR | Why safe now | CI (2026-07-21 eve) | Caveat |
|---|---|---|---|---|
| 1 | **This PR** (`CLAUDE-CODER-MERGE-SEQUENCE` + updated drain §E) | Permanent handoff | — | **Skip #3164** if this lands first (same intent, richer) |
| 2 | **#3169** | `verify-no-dead-schema` guard — §10a linkage enforcement | ✅ green | Repo truth; no Neon |
| 3 | **#3165** | ItemEditor `+ Add new account` → account create chrome (fixes #3133 gap) | ✅ green | UX wiring only; not GL/posting proof |
| 4 | **#3160** / **#3150** / **#3130** | Tracker auto-refresh chores | ✅ green each | **Optional** — pick one or skip if noisy |
| 5 | **#3148** | CoA Roles picker shows account **name** not uuid | ✅ green | **PARTIAL** — UX only; not “accounting fixed” |
| 6 | **#3151** | Dispatcher Home invoice status column | ✅ green | **PARTIAL** — reverse surface; title says DO NOT MERGE (builder) but owner queue says merge as UX |
| 7 | **#3173** | Law §9 FULL linkage master ledger | ✅ green | Evidence doc only |
| 8 | **#3175** | claim→legal→expense E2E FAIL audit | ✅ green | Evidence doc only |
| 9 | **#3176** | batch3 WO/fine/advance/escrow FAIL audit | ✅ green | Evidence doc only — **not** a fix claim |

After each merge: `git fetch origin main` before rebasing the next branch.

---

## Merge AFTER Neon apply (coder owns Neon) — financial / migration

**Rule:** Migration on Neon prod first (or confirm already applied) → then merge for repo truth → LIVE PROOF or UNVERIFIED in PR body.

| Order | PR | Neon / gate | CI (2026-07-21 eve) | Blocker |
|---|---|---|---|---|
| — | **#3141** append-only grants | **Already MERGED** to main | was merged | Prod apply done — no action |
| — | **#3124** bank tx capture fields | **Already MERGED** to main | was merged | Confirm Neon `202607690000` applied |
| 1 | **#3123** driver `default_expense_account_id` | Held mig · owner JORGE-APPROVED design | ✅ green | Coder Neon apply → live column proof |
| 2 | **#3149** pay-run → CoA roles resolver | Mig `202607710000` + owner role designations | ❌ `build-typecheck` | Fix typecheck → Neon → live designate proof |
| 3 | **#3172** bill_lines persist on Bill create | Verify Neon `bill_lines` populate | ❌ `hold-merge-gate` | CI green + Neon row proof required |
| 4 | **#3170** expense reverse drill-through | Law §9 E2E top-3 | ❌ `hold-merge-gate` | CI green + reverse drill LIVE PROOF |
| 5 | **#3171** pay-run preview/close FE | After **#3149** lands | ❌ `locked-guards`, `build-typecheck` | Depends on #3149 + #3168 audit context |
| 6 | **#3180** WO `unit_id` stamp on auto bill/expense | After hold-merge-gate understood | ❌ `hold-merge-gate` | CI green; no money mig |
| 7 | **#3179** claim/legal UI linkage | No money migrations | ❌ `build-typecheck` | CI green + UI drill-through proof |

---

## HOLD forever until Jorge answers (do not merge as “fixed”)

These are honest design/owner gates. Merging ≠ wiring. Already-merged design holds on main stay **HOLD** — do not reopen as fix PRs.

| PR | Topic | State (2026-07-21 eve) |
|---|---|---|
| **#3114** | Governance owner rulings §20 | OPEN — merge only when Jorge says law text is final |
| **#3127** | CoA true-merge accounts | **MERGED** design hold — deactivate-only today |
| **#3128** / **#3153** | Settlement approval mount (G1–3 IDOR) | **MERGED** design holds — routes stay unwired |
| **#3129** | Pre-invoice on book → official on deliver | OPEN |
| **#3135** | CONN-1 Plaid reconcile-commit | **MERGED** PENDING(GATED) honesty |
| **#3140** | Auto-apply customer payments FIFO | **MERGED** design hold |
| **#3142** | CONN-3 Relay internal bank | **MERGED** design hold |
| **#3143** | Expense duplicate detection | **MERGED** design hold |
| **#3144** | Parts inventory → GL | **MERGED** design hold |
| **#3156** | Escrow split-brain — pick canonical store | OPEN |
| **#3159** | Vendor FK · DIP AP split · flow2 chargeback | OPEN |
| **#3178** | Fuel GL flush — diesel\|def\|reefer\|oil\|misc maps | OPEN |

**#3133** docs HOLD is superseded by code fix **#3165** (merge in “Merge NOW” queue).

---

## Permanent law for every future merge

Every **money** PR MUST include in the PR body:

1. **ACCEPTANCE** block (`docs/templates/ACCEPTANCE-EVIDENCE-BLOCK.md`)
2. **Law §9 LINKAGE** checklist (forward + reverse)
3. **LIVE PROOF** (deploy SHA, Neon row, endpoint, browser drill) **OR** explicit **UNVERIFIED** with named blocker

**Forbidden:**

- Docs-only STALE verify PRs as “drain progress”
- Merging UI chrome and claiming accounting/linkage fixed
- Cursor self-merge on money or migration lanes

**Roles:** Cursor builds + opens PR · Claude coder merges + Neon apply + post-merge forensic proof.

---

## Quick reference — open PR CI snapshot (eve 2026-07-21)

| Bucket | PRs | Notes |
|---|---|---|
| THEATER (close) | 3152, 3154, 3158, 3161, 3163, 3113 | |
| Merge NOW (green) | 3169, 3165, 3148, 3151, 3173, 3175, 3176 | optional 3160/3150/3130 |
| Neon / money (blocked CI) | 3123✅, 3149❌, 3172❌, 3170❌, 3171❌, 3179❌, 3180❌ | |
| Already merged (repo truth done) | 3141, 3124 | verify Neon apply |
| HOLD Jorge | 3114, 3129, 3156, 3159, 3178 | + merged design holds 3127/3128/3153/3135/3140/3142/3143/3144 |

*Refresh this table when `origin/main` advances or PR CI changes.*
