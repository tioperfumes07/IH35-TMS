# INBOX-CURSOR · GO-26/27 LEAD · OWNER UNLOCK 2026-09-02

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

## NOW

```
CURSOR — GO-26 LEAD + GO-27 GATES 1–4 OVERFLOW

Jorge UNLOCKED full capacity. WAIT is over. Reconciliation with Claude is CLOSED.

1. LANE CONTROL. CC-1 owns GO-26 purge + Gate 0 (migration lane 00:00–11:59 UTC).
   Cursor holds 12:00–23:59. Stay off purge schemas while CC-1 works.
   Cursor does NOT personally run Neon purge of money tables — CC-1 owns purge.

2. DEPLOY in batches of 5–10 merges. Never per-merge. autoDeploy stays OFF.
   After deploying: report deploy ID, SHA, ONE live Chrome screen confirmed.

3. GO-27 CURSOR LANES (after Gate 0 settles; do not block purge):
   Gate 1.5 — GO-06 manual numbers UI (shared number field on remaining create screens).
   Gate 2.1 — accounting.bills.driver_uuid (data + backend + bill creator). BLOCKS Costs tab.
   Gate 2.3 — Proforma mint at first pickup, not at book (book-load.service.ts:1938).
   Gate 4.2 — Company settlement table (blocked on 2.1).
   GO-07 KPI drill-through: DispatchOverview.tsx:277 double-counts atRisk+late.

4. MILES LAW FINAL — bus fan-out landed. CC-1 catalog remediation (no mass-swap). CC-2 Book Load
   chrome: autofill + flag + OK popup (>100mi reverse trigger). Docs-only this PR; FE separate.

5. FINDING queued for CC-1 after Gate 0: cancel-load cascade — default pre-checked,
   list each record by number with checkbox, typed reason if unchecked.

Canonical docs: docs/bus/GO-26-*.md · docs/bus/GO-27-DISPATCH-ACCOUNTING-CRITICAL-PATH.md
```

ACK `CURSOR | ACK | GO-26/27 lead · hold purge lane · GO-06/proforma/settlement after Gate 0 · NEVER POST | GO`
