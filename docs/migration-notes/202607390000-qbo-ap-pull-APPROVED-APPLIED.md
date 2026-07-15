# APPROVED-APPLIED note — `202607390000_qbo_ap_pull_dbflag_and_enable.sql`

**Status: APPLIED ON PROD, owner-approved. This note reconciles the stale in-file header.** (B-A6, 2026-07-15)

## Why this note exists
The migration file's own header still reads **`[HOLD-FOR-JORGE — TIER 1] … NEVER self-merge`**. That header is
now **out of date** — the migration is applied on prod and its effect is the **desired** state. The SQL body is
**checksum-frozen in the prod migration ledger** (`_system._schema_migrations`); editing even a comment would
change the file's sha256, diverge from the frozen checksum, and freeze future prod deploys (the
"never-edit-applied-migration" landmine). So the header is left byte-for-byte intact and **this companion note is
the authoritative reconciliation** instead.

## What the migration does
Registers the two inbound QBO A/P pull flags in `lib.feature_flags` and turns them **ON per-entity** for
**TRANSP + TRK** (the QBO-realm carriers), so the daily QBO→TMS A/P clone runs:
- `QBO_AP_MIRROR_PULL_ENABLED`
- `QBO_AP_BILLS_PROJECTION_ENABLED`

It writes the `accounting.bills` subledger with `source_system='qbo'` (a clone-in of QBO A/P). **No GL/journal
is posted** — it is not a posting path, it is a mirror/projection of QuickBooks' own A/P.

## Owner ruling (GUARD → CODER, 2026-07-15, "D1")
> **LEAVE IT APPLIED. Do NOT revert.** Verified live on prod `br-fancy-credit-akjnd07a`: the migration is in the
> prod ledger, both A/P flags are registered, and 4 overrides are ON (TRANSP + TRK). The A/P pull being ON is
> exactly what the owner wants (it fills the Expenses/A-P tab). Reverting would turn A/P off — wrong.

Therefore: **no revert, no re-run, no edit to the SQL.** The A/P clone-in is the intended behavior.

## Provenance (correctly approved — no process hole)
This migration entered `main` through PR **#2449**
(`feat(qbo-ap): [HOLD-FOR-JORGE] wire QBO A/P pull to DB feature flag (P0 — A/P shows $0)`), which **merged
2026-07-14 with the `JORGE-APPROVED` label and a passing hold-merge-gate** — i.e. the correct owner-approved
Tier-1 path. There was **no gate bypass and no un-approved "rider"**.

An earlier report claimed the migration "rode into main via squash #2472 (a non-financial inventory PR) outside
the gated diff." **That was wrong** — a `git log --diff-filter=A` misattribution: after later squash-rebases the
current linear history attributes the file's *add* to a carry-forward commit (#2472 / #2504), but PRs #2470 and
#2472 did **not** contain this migration in their diffs (verified 2026-07-15, `gh pr diff --name-only` = 0). The
hold-merge-gate already inspects every file in a PR's diff and would flag any financial migration; it did its job
here. Consequently no new "squash-inspection" guard is warranted for this event.

## Do / do not
- ✅ Treat this migration as **approved + applied**. The A/P flags stay ON for TRANSP + TRK.
- ⛔ Do **not** edit `202607390000_qbo_ap_pull_dbflag_and_enable.sql` (checksum-frozen — an edit freezes prod deploys).
- ⛔ Do **not** revert or re-run it.
- Note: A/P bills reading `$0` in the UI despite the flags being ON is a **separate execution-path defect** (the
  QBO sync scheduler lacks per-step/per-company error isolation) — tracked as **B-A2**, not a problem with this
  migration.
