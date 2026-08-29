# GO-TURBO OVERLAY — load this FIRST, then your seat doc
**Issued:** 2026-08-29 ~20:27Z · **LIVE_SHA=`ecd3afd`** · **Deploy `dep-da9jrs142hec7384pt1g` LIVE**

This overlay **supersedes** contradictions in `00-MASTER-SEQUENCE.md` and `GO-TURBO-*.md`. Seat docs stay for IDs and recipes. Where they conflict, **this file wins**.

**READY by tomorrow = every Urgent 6 + U14 item is BOUND or a dated FINDING with owner. Not all-green by 9am.**

---

## 0. T0 IS DONE. DO NOT WAIT FOR DEPLOY.

| | |
|---|---|
| Live API | `GET https://api.ih35dispatch.com/api/v1/healthz/shallow` → **`ecd3afd`** |
| Deploy | `dep-da9jrs142hec7384pt1g` live |
| Matrix | `[matrix] worker last-good ready` **20:23:02Z**. Zero `worker projection failed` after 20:20. Boxes 2/3/4 computable. Morning #1 (dead matrix) is **CLOSED**. |
| `origin/main` | May be **1+ commits** ahead of `ecd3afd`. Stamps bind only if `git merge-base --is-ancestor <evidence_sha> ecd3afd` (full SHA). If NOT-BINDABLE → OUTBOX ask Cursor to deploy. Do not stamp undeployed code. |

Cursor: hold **5–10 PR** deploy cadence. Do not second-kick this deploy.

Broadcast (already true): `LIVE_SHA=ecd3afd AT=2026-08-29T20:20:08Z`

---

## 1. WHO WRITES THE STAMP (kills double-assignment)

**Hard rule 4 stands:** only **CC-2 (GUARD)** writes `prod_verified` / `live_verified_sha` / `live_verified_at` and shrinks `PROD-VERIFIED-BINDING-BASELINE.json`.

| Seat | Does | Does not |
|---|---|---|
| CC-1, Codex, CC-3, Devin, Cascade, Cursor | Recipe B/A **evidence packet** in OUTBOX + board: query/HTTP/Chrome paste, `LIVE_SHA`, `je_control`, BINDABLE proof | Edit `docs/module-completion/*.json` `prod_verified` on money **or** on the 78 unbound-claim list |
| **CC-2** | Reads packet, re-runs or accepts, **then** JSON stamp + baseline shrink | Blind-stamp without a live query |

Master T1 “CC-1 stamps 31” and CC-2 “certify all 78” are **void**. Same 78 IDs, one writer.

---

## 2. THE 78 ARE UNVERIFIED CLAIMS, NOT FREE GREENS

Do **not** treat them as “no code, just stamp.” Run the live query **first**. If it does not match the claim → **REOPEN** (dated FINDING, owner). Expect some reopen. That is success, not a miss.

A blind 34→112 is the same defect class as the 78 unbound claims.

---

## 3. CUSTOMERS = DEVIN ONLY. CC-3 DROPS CUSTOMERS.

Devin is **active** (commits on main today). Devin-A remains **VOID**.

- **Devin:** CUST-S01…S03, CUST-CHROME-*, CUST-LINK-*, CUST-VERIFY-01, LV-001 (read #17652 / #17658 — do not re-file wrong-URL FAILs).
- **CC-3:** do **not** take customers. Chrome wave = lists, legal, compliance, eld, insurance, help, home, docs. Wait for GR-1 before 97 selftest repair.

---

## 4. VENDORS IS NOT DONE

7/7 **bound** ≠ subscription-done. CC-2 Wave 2: PATCH → `audit.audit_events` before/after + Live Chrome on **`ecd3afd`**. `complete:false` stays until that. Master T3 “vendors DONE / 0 remaining” is **void**.

---

## 5. DO NOT REBUILD FINISHED WORK

| Item | Status |
|---|---|
| MATRIX-01 FIX-3 workerState / RED banner | **Shipped** `#17675`. Verify live; do not re-author. |
| `u.operating_company_id` on arriving-soon | **Gone.** File uses `COALESCE(u.currently_leased_to_company_id, u.owner_company_id)`. Codex: re-run guard; do not “fix” it. |
| Cursor FIX-2 ledger parse in scoreboard | `#17675` already fail-closes corrupt rows. Extra PR-blocking via **verify-step**, not `ci.yml`. |

---

## 6. GR-1 RATCHET — Rule 17 (speed)

**Forbidden:** new `verify:*` in `package.json`, new lines in `.github/workflows/ci.yml` / `locked-guards.yml`.

**Required:** claim **EVEN** `NNNN` on `CLAIMED-NUMBERS.json` (CLAIM-RESERVE PR, merge first) → then `scripts/verify-static-ratchet.mjs` + `scripts/verify-steps/NNNN-verify-static-ratchet.mjs`. Baseline = failing guard **names**, shrink-only. Cursor owns GR-1 **before** CC-3/Codex repair the 97.

---

## 7. BINDABLE EXAMPLE (method correction)

`#17604` squash **`0387d3a21`** is on deployed ancestry and **binds**. Do not use a PR branch tip as the evidence SHA. Use the squash on `main`.

---

## 8. CHROME — own port, MCP on that port

Load **after this overlay:** `GO-TURBO-CHROME-PORTS.md` / `docs/lockdown/GO-TURBO-CHROME-PORTS-2026-08-29.md`.

Cursor 9222 · CC-1 9223 · CC-2 9224 · CC-3 9225 · Codex 9226 · Cascade 9227 · Devin 9228. Separate `--user-data-dir`. Live Chrome not required for Neon/HTTP stamps.

---

## 9. T2 / T3 HONESTY

- **Period close** (CC-1): start tonight. Full EDIT-01 on all 8 document types is **not** promised by 9am — FINDING the remainder.
- **T3 ~71 Urgent 6 real items:** aggressive. Accounted-for, not all PASS.
- **T4 ~195:** FINDING or skip; do not fake `complete:true`.
- **Never recertify U14.** Unique leftover + stamps only.

---

## 10. LOAD ORDER FOR EACH CODER

1. This overlay  
2. `GO-TURBO-CHROME-PORTS.md`  
3. Your `GO-TURBO-<SEAT>.md`  
4. Recipes A/B/C in the seat doc (still valid)  
5. `LIVE_SHA=ecd3afd` until Cursor broadcasts a newer one  

OUTBOX ACK: `SEAT | ACK | TURBO-OVERLAY | LIVE_SHA=ecd3afd | STAMP_WRITER=CC-2 | CUSTOMERS=DEVIN | GO`
