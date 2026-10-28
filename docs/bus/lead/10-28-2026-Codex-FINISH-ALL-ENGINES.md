# CODEX — FINISH ALL YOUR ENGINES — 10-28-2026 ~4:05 PM CT (Cursor Lead)

**Law:** [HONEST-BUILT-LAUNCH-LAW-2026-08-14](../lockdown/HONEST-BUILT-LAUNCH-LAW-2026-08-14.md) · USMCA only · never stash · never fake-green · `SEAT=CODEX node scripts/fast-merge.mjs`

**Lead rulings you already have:** [10-27-2026-Codex-Lead-Answers-ENG28-13595-ENG17.md](./10-27-2026-Codex-Lead-Answers-ENG28-13595-ENG17.md)

```bash
export DATABASE_URL="$(head -1 ~/Downloads/lead-tmp/.prod)"
```

---

## YOUR QUEUE (do in order — do not idle)

### 1. ENG-18 — DONE if tip proves it (measure-close first)
- Guards: `node scripts/prepare-commit-kind.mjs --selftest` · `node scripts/verify-money-pr-local-gate.mjs --selftest`
- If both PASS on tip: flip ENGINE-REGISTER → **DONE**, PR docs only. Do not rebuild.

### 2. ENG-28 — YES ruling already issued — finish or measure-close
- Lead: **all specialized paths through full posting-engine validation**; preserve accounting behavior; test each path; **code ≠ money rewrite**.
- Guard already on tip: `node scripts/verify-only-the-posting-engine-writes-postings.mjs` must PASS (“one engine writer… all N specialized paths call the validated batch door”).
- If PASS: flip **DONE-LIVE** with live guard output. If FAIL: fold remaining importers into the engine door; shrink `IMPORT_BASELINE`; plant selftest; no balancing JE.

### 3. ENG-17 — Faro / 1090 / 2510 — document work ONLY
- Source pack: `~/Desktop/IH35-KEEP-Reconciliations-and-Settlements/IH35-RECONCILIATION-AND-FEED/03-SOURCE-DOCUMENTS/` (PAYMENTS TO USMCA FROM FARO.csv, PURCHASE REPORT ALL.csv, …).
- Bank wires: live `banking.bank_transactions` via **existing** deposit / owner purchase match. **14 unmatched stay unmatched until owner selects.**
- Dreamline statement `USMCA FREIGHT SOLUTIONS_data_truck_both_2026-10-16.xlsx` **MISSING** — 2510 doc-clear BLOCKED until owner re-drops.
- **NO balancing JE. NO silent match. NO AUTH-453.**

### 4. After 18/28/17 — take these CC-2 leftovers (Claude seats idle; you own them now)
| ID | Done = |
|---|---|
| **ENG-48** | Fuel↔expense one-to-one; same-day duplicate fills named; writer refuses double; guard |
| **ENG-49** | Settlement **5787** non-diesel $235.01 vs signed $140.20 — document-first correction through engine |
| **ENG-50** | Invoice `amount_paid` vs applications (named invoices) — fix writer or apply path; guard |
| **ENG-51** | 944 composite-memo backfill **or** explain; Creator miles source required |
| **ENG-13** residual | Only **13595** — Settlement 5816 Trailer **445**; fleet has no 445 → list BLOCKED, do not invent equipment |

### 5. Help CC-3 / Lead if you finish early (code, not owner)
| ID | Done = |
|---|---|
| **ENG-26** | Rule per source at writer so new postings carry load; back-fill from documents; remainder listed with why; guard |
| **ENG-27** | Explain or back-fill 458 pre-10-17 bank-cat postings; never auto-match |
| **ENG-23** | Oldest-customer fallback audit vs documents; correct through engine; remove fallback |
| **ENG-24** | Creator Edit **amends** (not post+void); every Creator line has load; guard |
| **ENG-29** | Miles from fence events going forward; live already **45/194** — keep filling, no fake |

---

## DO NOT TOUCH
- OWNER: ENG-38 periods · ENG-54 truck ownership · AUTH-453 · inventing Dreamline statement · inventing trailer 445
- Dependabot / non-USMCA
- Balancing JEs for 1090/2510/2170/ENG-36 negatives

---

## REPORT FORMAT (every PR)
`CODEX | ENG-XX | PR # | sha | guard PASS | live count`

Body must include: ROOT CAUSE / FIX / GUARD / LIVE PROOF or UNVERIFIED / REMAINING + Claude-green DOD/VERIFY block + `FINDING: ACCT-F…` + `MODULE_PROGRESS`.

**When your queue is empty:** paste `CODEX DONE` + PR list to Lead.
