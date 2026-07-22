# Claude coder merge sequence (permanent until owner revises)

**As-of:** 2026-07-21 late evening · refreshed after CI babysit + §1.2/§1.4 correction  
**Owner law:** Cursor builds; **Claude coder merges + Neon apply**. Docs-only STALE ≠ progress.  
**Supersedes:** WAVE verify theater PRs; optional skip of #3164 when this file lands.  
**Living scoreboard:** #3182 `TRUE-CONNECTIVITY-MASTER` (12/12 economic FAIL + ops matrix + dual-path class) — prefer over WAVE STALE audits.  
**Owner ruling 2026-07-21 (wiring waiver):** For **Law §9 wiring** — reverse drills, dual-path active mounts, enrich/read APIs, reuse of existing posters/helpers, linkage guards — **do not wait for per-PR chat OK / manual label theater**. Ship on full CI green. Cursor/coder may apply `JORGE-APPROVED` only when `hold-merge-gate` requires the label to unblock a true wiring PR (same owner authority).

**Still STOP (not waived):** held-migration **Neon apply** (owner hand), posting-flag flips ON, new GL math / new accounts, mass data heal (e.g. 16k header-only bills), escrow canonical-store product pick, true-merge CoA.

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

**Also leave closed / do not merge as progress:**

- Any future WAVE-N verify PR (Cursor forbidden from opening more).
- **#3116**, **#3145**, **#3155**, **#3162**, **#3120** — builder-tagged “DO NOT MERGE” until ON-MISSION §9 proof.
- **Audit FAIL evidence PRs** (#3166, #3167, #3168, #3176, #3177, #3178) — scoreboard only; **do not** squash-merge unless Jorge explicitly wants docs on main. Prefer this sequence file + TRUE-connectivity master as the living scoreboard.

---

## Self-merge gate (owner wiring waiver + residual STOP)

| Self-merge on full CI green (no chat OK) | Still STOP |
|---|---|
| **Wiring class:** reverse drill FE/API, dual-path mounts, enrich reads, reuse existing settlement/accounting helpers, linkage/CI guards, docs scoreboards | Held mig Neon-apply · flag ON · new GL math/accounts · mass heal · product HOLDs (#3156/#3159/#3178/…) |
| Examples: #3183 Safety active-path, #3188 invoice reverse, #3184 weekly-close bookended parity, #3179 claim/legal UI, #3170 expense reverse, #3171 pay-run FE (after #3149) | Neon hand for `202607710000` after #3149 merge; fuel designate #3178 |

`hold-merge-gate`: do **not** weaken the workflow. For wiring PRs it trips, apply `JORGE-APPROVED` under this owner waiver and merge — do not ping Jorge per PR.

---

## Lane A — self-merge when fully green (ONE AT A TIME)

Squash → delete branch → `git fetch origin main` → rebase next.

| Order | PR | Why | Status notes (late eve) |
|---|---|---|---|
| 1 | **This PR (#3181)** | Permanent handoff | **Skip #3164** if this lands first |
| 2 | **#3169** | `verify-no-dead-schema` + linkage edges — schema reachability only; **not** §9 money proof | Wait pending `build-typecheck` / CodeQL |
| 3 | **#3165** | ItemEditor `+ Add new account` → account create chrome | ✅ was green |
| 4 | **#3183** | Safety dual-path: ComingSoon group bookmarks → V6.4 Live redirects; orphans `@archived`; `verify-safety-active-path` | FE mount only; browser UNVERIFIED post-deploy |
| 5 | **#3179** | Claim/legal **UI** linkage (no money mig) — only if re-read confirms no `accounting.*` INSERT/UPDATE | CI babysit pushed; wait full green |
| 6 | **#3148** / **#3151** | Optional PARTIAL UX (CoA name picker / dispatcher invoice status) — merge as UX only, **not** “accounting fixed” | Optional |
| 7 | Tracker chores **#3160** / **#3150** / **#3130** | Optional noise | Skip if noisy |

---

## Lane B — owner-gated money / Neon (coder)

| Order | PR | Gate | Notes |
|---|---|---|---|
| 1 | **#3123** | Neon apply held mig (already JORGE-APPROVED design) | Confirm column live |
| 2 | **#3149** | CI green + Neon `202607710000` + owner CoA role designations | **Before #3171**. CI babysit fixed shared-coa-role test isolation |
| 3 | **#3171** | After **#3149** on main + CI green | Pay-run FE must not ship ahead of resolver |
| 4 | **#3170** | Jorge OK + CI green | Reverse drill; `hold-merge-gate` may be false-positive on SELECT — still need label; LIVE reverse proof or UNVERIFIED |
| 5 | **#3172** | **JORGE-APPROVED** + CI (hold red is legitimate — writes `bill_lines`) | LIVE: new bills get `bill_lines`>0; 16k header-only heal = separate plan |
| 6 | **#3180** | **JORGE-APPROVED** + CI (hold red is legitimate — stamps bill/expense `unit_id`) | LIVE: WO→bill/expense `unit_id IS NOT NULL` |

Already on main (no merge action): **#3141**, **#3124** (confirm Neon apply for #3124).

---

## HOLD until Jorge answers (do not merge as “fixed”)

| PR | Topic |
|---|---|
| **#3114** | Governance owner rulings |
| **#3129** | Pre-invoice on book → official on deliver |
| **#3156** | Escrow split-brain — pick canonical store |
| **#3159** | Vendor FK · DIP AP · flow2 chargeback |
| **#3178** | Fuel GL flush — designate diesel\|def\|reefer\|oil\|misc maps |

Merged design holds on main stay HOLD (do not reopen as fake fixes): #3127 CoA true-merge, #3128/#3153 settlement approval mount, #3135 CONN-1, #3140 auto-apply, #3142 CONN-3, #3143 expense dup, #3144 parts→GL.

**#3133** docs HOLD superseded by code **#3165**.

---

## Permanent law for every future merge

Every **money** PR MUST include:

1. **ACCEPTANCE** (`docs/templates/ACCEPTANCE-EVIDENCE-BLOCK.md`)
2. **Law §9 LINKAGE** (forward + reverse)
3. **LIVE PROOF** (deploy SHA, Neon RLS-bypass, endpoint, browser) **OR** explicit **UNVERIFIED**

**Forbidden:** STALE verify as progress · UI chrome as accounting done · Cursor self-merge money · citing schema guards (#3169 class) as books-wired proof · shipping #3171 before #3149.

**Roles:** Cursor builds + dual-path/orphan fixes · Claude coder merges + Neon + post-merge forensic.

**Bar:** QuickBooks / NetSuite / McLeod / Alvys grade — not minimum shippable.

---

## Quick reference — CI babysit (late eve 2026-07-21)

| PR | Action |
|---|---|
| #3179 | typecheck/entity-link baseline fix pushed — merge Lane A when green |
| #3171 | nested-box + §7 palette fix pushed — merge Lane B **after #3149** |
| #3149 | shared CoA role test isolation pushed — Neon then merge |
| #3170 | typecheck fix pushed; hold stays until Jorge labels |
| #3172 / #3180 | legitimate financial HOLD — Jorge label required |

*Refresh when `origin/main` advances or PR CI changes.*
