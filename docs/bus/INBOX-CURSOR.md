# INBOX-CURSOR · GO-26/27 LEAD · OWNER UNLOCK 2026-09-02

`git pull --ff-only origin/main`

## ⚡ FAST-MERGE + DEPLOY (ALL SEATS · OWNER 2026-09-02)

**Loop (~4–5 min):** `node scripts/money-pr-local-gate.mjs` (Cursor: `node scripts/cursor-ship-preflight.mjs --body-file …`) → **exit 0 FIRST** (that is merge proof) → `git push` → `gh pr create` → **immediately** `gh pr merge N --squash --delete-branch --admin` (or `gh api --method PUT repos/tioperfumes07/IH35-TMS/pulls/N/merge -f merge_method=squash`). **NEVER** `gh pr checks --watch`. **NEVER** ask Jorge to merge. **NEVER** idle after merge. `git push --no-verify` **only AFTER gate PASS** and **only** for ENV-VERIFY-STATIC class (~54+ main env reds) — **never** for your own red guard.

**Deploy:** batch every **5–10** merges; never per-merge prod deploy; CC seats **never** `trigger_deploy`; Cursor lead batches.

**Law:** USMCA only · Never POST Book Load · Never seat financial fixtures · Cursor PR titles **`Cursor-`** prefix.

Canonical: `docs/bus/FAST-MERGE-4MIN-LAW.md` · `docs/bus/FAST-MERGE-REMINDER-2026-09-02.md`

## ⚠ MILES-INVERT-01 — STOP-BEFORE-PAY (2026-09-02)

**Cursor correction acknowledged:** MilesStrip "short includes empty" copy was **wrong**. Indy→Laredo inverted (2,142/3,237 lanes short>practical).

**Owner law (LOCKED):** Driver pay = **short miles always**. NEVER practical. Customer RPM = rate/practical · Company CPM = cost/(practical+empty).

**STOP-BEFORE-PAY:** Do not autofill/trust corrupted catalog short without OK popup. CC-1 remediates catalog so short = shortest. Book Load: autofill + flag + OK-only popup landed this PR.

CC-1 owns ingest remediation (no mass-swap). Gate 0 unaffected.

Canonical: `docs/bus/MILES-INVERT-01-STOP-BEFORE-PAY-2026-09-02.md`

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

4. MILES-INVERT-01: driver pay = short always. Book Load autofill + flag + OK popup shipped. CC-1 catalog remediation continues.

5. FINDING queued for CC-1 after Gate 0: cancel-load cascade — default pre-checked,
   list each record by number with checkbox, typed reason if unchecked.

Canonical docs: docs/bus/GO-26-*.md · docs/bus/GO-27-DISPATCH-ACCOUNTING-CRITICAL-PATH.md
```

ACK `CURSOR | ACK | GO-26/27 lead · hold purge lane · GO-06/proforma/settlement after Gate 0 · NEVER POST | GO`
