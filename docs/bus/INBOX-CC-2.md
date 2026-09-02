# INBOX-CC-2 · GO-26/27 GATE 1 · OWNER UNLOCK 2026-09-02

`git pull --ff-only origin/main`

## ⚡ FAST-MERGE + DEPLOY (ALL SEATS · OWNER 2026-09-02)

**Loop (~4–5 min):** `node scripts/money-pr-local-gate.mjs` (Cursor: `node scripts/cursor-ship-preflight.mjs --body-file …`) → **exit 0 FIRST** (that is merge proof) → `git push` → `gh pr create` → **immediately** `gh pr merge N --squash --delete-branch --admin` (or `gh api --method PUT repos/tioperfumes07/IH35-TMS/pulls/N/merge -f merge_method=squash`). **NEVER** `gh pr checks --watch`. **NEVER** ask Jorge to merge. **NEVER** idle after merge. `git push --no-verify` **only AFTER gate PASS** and **only** for ENV-VERIFY-STATIC class (~54+ main env reds) — **never** for your own red guard.

**Deploy:** batch every **5–10** merges; never per-merge prod deploy; CC seats **never** `trigger_deploy`; Cursor lead batches.

**Law:** USMCA only · Never POST Book Load · Never seat financial fixtures · Cursor PR titles **`Cursor-`** prefix.

Canonical: `docs/bus/FAST-MERGE-4MIN-LAW.md` · `docs/bus/FAST-MERGE-REMINDER-2026-09-02.md`

You own the verified flag.

## ⚠ MILES-INVERT-01 — Book Load UX (LOCKED · CC-2 owns chrome)

**Two meanings — do NOT confuse:**
1. **Column inversion:** same lane where `short > practical` (66% History). NOT wrong direction.
2. **Direction pair:** opposite lanes (A→B vs B→A) should have same loaded miles; wild divergence = catalog defect — flag in finding.

**Do NOT verify "short includes empty" copy — it is wrong.** Driver pay = short miles always.

Indy→Laredo: practical 1319.7 + empty 207.6 = 1527.3 ≠ short 1478.1. **2,142/3,237 lanes (66.2%)** have short>practical. CC-1 owns root-cause (ingest script, no mass-swap).

**Owner cost model (LOCKED):** Customer RPM = rate/practical · Company CPM = cost/(practical+empty).

**Book Load wizard UX — exact bullets (you own popup on `BookLoadModalV4`):**
1. **Still autofill** all three fields: practical / short / empty.
2. **Flag** inversion inline when `short > practical` (and pair mismatch if detected).
3. **Popup** explains the issue; operator must press **OK** — cannot dismiss without OK (no outside click, no Esc, no X-only close).
4. After **OK**, booking continues with those values — operator may still edit any field.

Chrome-prove 13508 (Gate 1.3): show autofill + flag + popup flow on Indianapolis→Laredo.

Canonical: `docs/bus/MILES-INVERT-01-STOP-BEFORE-PAY-2026-09-02.md`

## NOW

```
CC-2 — GO-26 CONSOLIDATION GUARD, TODAY — THEN PICKERS + GO-27 GATE 1

Jorge UNLOCKED full capacity. WAIT is over.

Jorge ruled: consolidate so every screen gets fixed at once.

STEP 1 — THE GUARD SHIPS FIRST. Today. Before one conversion.
Ratchet pattern, same as verify-ui-design-system-ratchet.mjs — fails only when
a count goes UP. Fail the build on any NEW:
  - import of components/shared/SelectCombobox
  - import of components/parity/EntityPicker
  - import of components/shared/Combobox
  - import of components/DataTable
  - import of components/shared/ResizableTable
  - import of components/shared/MobileOptimizedTable
  - raw <table> outside the 6 infrastructure files
  - raw text-[Npx] off the locked scale (11 / 12 / 22)
Commit today's counts as the baseline. NEVER raise a baseline to pass.

WHY FIRST: you are about to change 277 files. Without the guard, new violations
get written the whole time you work and the count never reaches zero. That is
exactly how 2,213 hardcoded sizes and 277 trapping pickers accumulated.

STEP 2 — PICKERS TO ZERO (GO-27 Gate 1.1 — K2 wizard).
  KEEP    components/Combobox.tsx        43 files   dismisses on outside click
  RETIRE  shared/SelectCombobox         158 files   no handler
  RETIRE  parity/EntityPicker           111 files   no handler
  RETIRE  shared/Combobox                 8 files   no handler
  TOTAL TRAPPING: 277 — UP from 268 while this row sat assigned.

Ship in batches BY DIRECTORY, one PR each. Book Load wizard is highest priority.
Report after every batch: "K2: 277 -> N".
Delete a retired component only when its import count reaches ZERO.

This also closes B9 (pickup/delivery State is a plain input, not a filter-combo).

STEP 3 — GO-27 Gate 1.3: CHROME-PROVE load 13508.
  Re-open load 13508 in Chrome. Prove miles fill (Indianapolis→Laredo:
  practical 1319.7, short 1478.1, empty 207.6) and location picker on stops.
  Paste screenshot + row proof. Set verified flag.

STEP 4 — J1 to zero. 1,015 off-scale across 331 files. Wizard first (162 files).
docs/specs/GLOBAL-TYPE-SIZE-BASELINE.md is LOCKED — transcribe it, never propose a scale.

STEP 5 (Gate 3) — Proof trail click-to-ledger. Queued after Gate 1 ships.
```

ACK `CC-2 | ACK | GO-26 guard · K2 wizard · 13508 Chrome · NEVER POST | GO`
