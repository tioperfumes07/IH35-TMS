# EVERY PR — Claude-consolidated checklist (git-enforced)

**As of:** 2026-07-24 17:56 CDT (Claude coder consolidation)  
**Repo law:** `docs/specs/DEFINITION-OF-DONE.md` §10  
**CI:** verify-step **1430** (`verify-no-money-theater`) + **1324** (Rule 16)  
**Local:** `.husky/commit-msg` → `check-commit-evidence.mjs`  
**PR:** https://github.com/tioperfumes07/IH35-TMS/pull/3430

This is **everything that applies to every money PR** — Cursor and Claude same list.

---

## 0 · Before writing a line

- `git fetch` + checkout/pull `main` ff-only — local lags routinely  
- Fresh branch per block; **never** `git add -A`  
- Read the spec / approved screen first — never build from a defect list alone  
- Classify the lane: financial cluster → **build-and-HOLD**, never self-merge  

**Git key:** `LANE: HOLD | FINANCIAL-HOLD | NON-FINANCIAL | DOCS`

---

## 1 · Five DONE layers → `DOD-A` … `DOD-E`

| Key | Layer |
|---|---|
| **DOD-A** | Active path — real route, registered, mounted, nav leaf. No `DUAL_PATH_OLD_ACTIVE`, no ComingSoon twin, no archived twin mounted |
| **DOD-B** | Wizard depth — every rendered field controlled **AND** in the submit payload |
| **DOD-C** | Law §9 F+R — canonical FKs both ways. Memo / uuid-in-name / jsonb id arrays = FAIL |
| **DOD-D** | Purpose → economics — purpose decides money object; never silent default |
| **DOD-E** | Evidence — live proof or `UNVERIFIED — needs live check` + named blocker |

Chrome-only / nested-+Create-only / docs-only **never** closes a module.

---

## 2 · Audit layers on the surface you touched → `VERIFY-1` … `VERIFY-8`

| Key | Layer |
|---|---|
| **VERIFY-1** | Visual / QBO chrome — ParityDrawer, no box-in-box, QBO calendar, Due auto, + Create/+ Book, drawer-on-drawer |
| **VERIFY-2** | Universal picker law — all **7** clauses (scoped catalog · inline + Add new first row · wizard · same chrome · write=read table · selected after save · current company) |
| **VERIFY-3** | Connectivity / wiring — nav → route → UI → API → **canonical** Neon tables (never RETIRE) → same R/W → entity-scoped → flags honest |
| **VERIFY-4** | Deep linkage chains — claim · driver-at-fault · WO · expense · bill+payment — every hop F+R + Neon FK proof |
| **VERIFY-5** | Catalogs / entity scope — TRANSP **and** USMCA; drivers-as-vendors; units by owner/lease; no cross-entity leak |
| **VERIFY-6** | Economics CPA-grade — header+lines · balanced JE when ON · control roles · flags honest · no TMS→QBO write-back |
| **VERIFY-7** | Tab / design law (Rule 05) — every approved leaf; no silent missing; no invented tabs |
| **VERIFY-8** | Security / entity / RLS — FORCE RLS · correct GUC · security_invoker · grants |

---

## 3 · Evidence block (Rule 16)

```
ROOT CAUSE: …
FIX: …
GUARD: scripts/verify-*.mjs + scripts/verify-steps/NNNN-*.mjs
LIVE PROOF: … OR UNVERIFIED — <blocker>
REMAINING: …
```

Also: **FINDING:** `ACCT-F##` / `BANK-F##` / `LST-F##` from Desktop module audit.

---

## 4 · Guard rules

- Every bug fix ships a static CI guard — no guard = not done  
- Guard FAIL on bug / PASS on fix (prove vs main)  
- `--selftest` must be able to fail (mutate real source)  
- Selftest must not false-positive the corrected shape  
- Wiring: **verify-steps only** — no `package.json` / `locked-guards.yml` / `ci.yml` thrash  
- Never weaken a guard to go green  

---

## 5 · Verification traps

- Prod wins (Neon) · 0 is not absence (re-run + lucia) · 200 ≠ success (content-type)  
- No string-grep systemic claims · pipes mask exit codes · baseline main first · deploy by ancestry  

---

## 6 · Merge gates

- Merge = deploy · financial / migration / catalogs / mdata → **your OK** · no self-merge money  
- Flag flips + opening balances = owner only  

---

## 7 · Migration PRs → `MIGRATE:`

Number above main max · idempotent · dynamic `org.companies` (no hardcoded UUID) · FORCE RLS ·
REVOKE DELETE · grants · void-not-delete · append-only audit · validate on **local throwaway** only ·
checksum override same PR or forward · baselines as needed.

---

## 8 · Honest reporting

Skipped/failed named · UNVERIFIED + blocker · “8 of 12” not “complete” · correct prior claims.

---

## Git fail closed

Missing any of: `FINDING` · `LANE` · `DOD-A`…`E` · `VERIFY-1`…`8` · Rule 16 · (`MIGRATE` if migration)  
→ **commit-msg reject** and/or **CI 1430 FAIL**.  
`--no-verify` does **not** skip CI.
