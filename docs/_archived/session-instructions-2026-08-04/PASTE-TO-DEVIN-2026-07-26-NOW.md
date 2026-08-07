# PASTE TO DEVIN — 2026-07-26 (current)

ACK first line: `DEVIN ACK | no Neon re-apply | no JORGE-APPROVED | rebase then squash`

## Hard rules
1. **No `JORGE-APPROVED` label** — gate change **#3604 already merged**.
2. **Do NOT re-apply Neon** for anything already ledgered (see below).
3. Squash merge, **one commit per PR**.
4. PR body must carry **Rule 16 evidence** + Neon checksum/timestamp when money/schema.
5. Merge only when: **rebase clean on `origin/main`**, guards green, **`build-typecheck` SUCCESS** on the pushed commit.
6. **One held-registry PR at a time.**

## Neon — already done (CITE, do not re-run)

| Migration | Ledger `applied_at` (UTC) | `applied_by` |
|---|---|---|
| `202609050000` … `202609140000` (batch of 7) | `2026-07-26T17:31:50Z` | `cursor-owner-batch-2026-07-26` |
| `202609020010` BANK-DOM-01 | `2026-07-26T17:43:04Z` | same |
| `202609150000` BANK-DOM-06 | `~2026-07-26T19:04:34Z` | `cursor-owner-bank-dom-06-2026-07-26` · checksum `3992d5e30e04224c75470fe2562d09568af6f3858377fd71a6358658a40060f5` |

## Merge order (rebase each onto main first)

Skip if already merged: #3604, #3603, #3588, #3589, #3591 (check).

1. **#3595** MNT-LINK-04 — Neon already applied `202609100000`
2. **#3596** BANK-DOM-04 — Neon already applied `202609110000`
3. **#3593** escrow signed-on-paper — Neon already applied `202609140000`
4. **#3602** BANK-DOM-06 — Neon already applied + stamped; cite checksum above · may need Cursor rebase if CONFLICTING
5. **#3601** ACCT-DOM-02 — rebase (was CONFLICTING) · no Neon re-apply if none
6. **#3605** ACCT-DOM-01 docs — docs only, anytime after rebase

## Entity law (do not invent policy)
USMCA = full posting/test · TRK = lease/test · TRANSP = ops+test now.  
TMS posts; sync FROM QBO + daily reconcile; **never write to QBO**.

## Out of scope for Devin
- Do not flip feature flags
- Do not invent owner answers
- Do not apply SQL on Neon
- Do not touch BANK-DOM-05 if Claude owns it
