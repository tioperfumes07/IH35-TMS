# INBOX-CASCADE · GO-26 VERIFY · OWNER UNLOCK 2026-09-02

`git pull --ff-only origin/main`

## ★ MILES LAW FINAL — ALL SEATS — 2026-09-02

**SUPERSEDES #19740.** That bus said pay from practical + empty and forbade short miles. Owner overruled — **STRUCK**. Any INBOX still carrying it is stale.

**PAY LAW — NOT NEGOTIABLE:**
- Driver pay = **SHORT MILES, ALWAYS.** Never practical.
- Customer rate/RPM = **PRACTICAL only** (loaded lane).
- Company cost = **PRACTICAL + EMPTY** (deadhead is real cost).
- Extra miles beyond short = **driver's problem**.
- **NEVER** fold empty into practical.

**MILES-INVERT-01** — catalog short untrustworthy (live: **2,142/3,237** inverted; directional test 352 pairs practical avg gap **29.4** vs short **174.8**). Root cause **NOT swap** — `seed-lane-mileage.mjs` 1:1, `source=History`. **No mass-swap.**

**UX — OWNER:** Autofill practical/short/empty as normal · Flag when untrustworthy · Popup → OK → continue · Operator can edit · **DO NOT BLOCK BOOKING.** Trigger when **short > practical** OR reverse-lane short differs by **> 100 miles**.

**CC-1** owns catalog fix — no mass-swap; PC*MILER not live; untrustworthy surfaces rather than quiet settlement feed.

**URGENT:** GO-22 settlements will use short — must **not** quietly pay on broken catalog.

Canonical: `docs/bus/MILES-LAW-FINAL-2026-09-02.md`


## ⚡ FAST-MERGE + DEPLOY (ALL SEATS · OWNER 2026-09-02)

**Loop (~4–5 min):** `node scripts/money-pr-local-gate.mjs` (Cursor: `node scripts/cursor-ship-preflight.mjs --body-file …`) → **exit 0 FIRST** (that is merge proof) → `git push` → `gh pr create` → **immediately** `gh pr merge N --squash --delete-branch --admin`. **NEVER** `gh pr checks --watch`. **NEVER** ask Jorge to merge. **NEVER** idle after merge. `git push --no-verify` **only AFTER gate PASS** and **only** for ENV-VERIFY-STATIC class — **never** for your own red guard.

**Deploy:** batch every **5–10** merges; never per-merge prod deploy; CC seats **never** `trigger_deploy`; Cursor lead batches.

**Law:** USMCA only · Never POST Book Load · Never seat financial fixtures · Cursor PR titles **`Cursor-`** prefix.

Canonical: `docs/bus/FAST-MERGE-4MIN-LAW.md` · `docs/bus/FAST-MERGE-REMINDER-2026-09-02.md`


**FINDINGS only. Never build.**

## ★ LEAD RULING — there is no “28 accounting defects” file

That number was an **old owner paste** (“33 tables without is_sample_data · 24 never-run health checks · 28 accounting defects post-purge”). It is **not** a register on disk. Current INBOX is GO-26 done-gate only.

Do **not** invent a 28-row list. A defect not on GO-23 / INBOX does not exist. TXH 24-check work already landed (#19776, #19793). Accounting module completion is `docs/module-completion/accounting.md` (N of M), not a 28-row hunt.

## NOW

```
CASCADE — GO-26 VERIFY THE PURGE. LIVE QUERY ONLY.

Jorge UNLOCKED full capacity. CC-1 purge is GO NOW.

Reconciliation is CLOSED. Do not open a new register or re-derive counts.

YOUR ONE JOB: after each CC-1 purge PR merges, run the GO-26 done-gate query
against live production under SET LOCAL app.bypass_rls = 'lucia' and publish
the delta. Which tables reached zero, which did not, what remains.

Also verify after dispatch purge PR:
  - lib.trace_counters: doc_type = 'LOAD' only (no 'LD'), last_trace_no = 13556
  - Load 13508 still present
  - banking.bank_transactions still 395

LIVE QUERY ONLY. Migration grep is a hypothesis. The database is the finding.

State the count you swept and the count that exists, every time.
```

ACK `CASCADE | ACK | GO-26 done-gate · seed 13557 verify · live query only · NEVER BUILD | GO`
