# Escrow forfeiture — findings handover, Lists+Safety coder → Cursor (2026-07-25)

**Owner standdown 2026-07-25.** The escrow trigger/service fix is **Cursor's lane**, stacking on merged
**#3533** (ACCT-R-01 escrow canonical write-path sync). The Lists+Safety coder must NOT touch:

- `accounting.apply_escrow_posting_delta`
- any `accounting.escrow_*` object
- `accounting/escrow/service.ts`

This file exists so the findings below survive in git rather than only in chat. Nothing here is a
recommendation about *how* to fix the trigger — that is Cursor's call.

---

## The feature is TRIPLE-GATED and latent — no live-money risk while it is repaired

Three independent gates each block a forfeiture today. All three were verified live on prod
(`tiny-field-89581227`, branch `br-fancy-credit-akjnd07a`, under `app.bypass_rls='lucia'`) on 2026-07-25.

| # | gate | live state | consequence |
|---|---|---|---|
| 1 | `DRIVER_ESCROW_FORFEIT_GL_POSTING_ENABLED` | **0 rows** in `lib.feature_flags` | 409 `escrow_forfeit_gl_posting_flag_off` on every call |
| 2 | signed driver contract required | **0 rows** in `legal.contract_instances` matching | clause-blocked regardless of the flag |
| 3 | flag default | off | no posting even once a row exists |

---

## (a) The forfeit sign bug — `ELSE` yields a POSITIVE delta

`db/migrations/0234_block_23_escrow_posting_flow.sql:63-69` maps `deposit → +` and `release → −`, then
falls through:

```
ELSE v_delta := NEW.amount_cents;
```

`'forfeiture'` is not matched, so it takes the `ELSE` branch and lands **positive** — a forfeiture would
INCREASE the driver's escrow. No later `CREATE OR REPLACE` was found for that function.

Two things worth carrying into the fix:

1. **The `ELSE` should RAISE, not default.** A silent positive for an unrecognised posting type is how
   this shipped unnoticed; any future posting type would inherit the same wrong sign.
2. **A guard currently forbids `'forfeiture'`** in that function and will need reconciling, or the fix
   trips it.

## (b) The flag has no enable path at all — worse than OFF

`lib.feature_flags` has **zero rows** for `DRIVER_ESCROW_FORFEIT_GL_POSTING_ENABLED`. Columns are
`{flag_key, description, default_enabled, rollout_pct, created_at}`. `feature-flags/service.ts:277-279`
resolves an **unknown key to false**, so this is not "the flag is off" — there is no row to turn on.

The route is otherwise complete and correctly wired: `escrow-forfeit.routes.ts:41`, registered at
`index.ts:887`; the service has the over-draw guard, the flag gate, the JE via
`createJournalEntryOnClient`, and writes `escrow_postings` with `source_type='forfeit'`. Prereq
migration `202607800000` is applied on prod. **The endpoint is not broken — it is unreachable.**

Seed `default_enabled=false` so an enable path exists. The **owner** enables it after the
money-direction fix lands. No agent flips it.

## (c) Zero signed driver contracts — forfeits are clause-blocked anyway

`escrow-target.service.ts:74-82` gates on:

```sql
EXISTS (SELECT 1 FROM legal.contract_instances
         WHERE signer_type = 'driver'
           AND status = 'signed_electronically'
           AND voided_at IS NULL)
```

That count is **0** on prod. Every forfeit is clause-blocked until drivers actually sign, independent of
gates 1 and 3.

Also note a **declared deviation** already in the code (`escrow-target.service.ts:31-38`): the predicate
matches *any* signed driver contract, not an escrow-specific clause, because prod has no escrow-clause
column. That deferral is recorded in-file; it is not a new finding.

---

## (d) A split-brain that the trigger fix alone will not close

Escrow is modelled **twice**, and the driver-facing balance reads the half the forfeit never touches:

| surface | table | written by the forfeit? |
|---|---|---|
| accounting subledger | `accounting.escrow_postings` | yes |
| driver-facing balance | `driver_finance.escrow_balances` / `escrow_ledger` | **no** |

So even with the sign corrected, the driver's visible balance does not move. Acceptance should be a
**delta proof** on a throwaway branch — post a real forfeiture, assert subledger delta == JE delta AND
both negative — not "the trigger text changed".

Related, already fixed and merged separately by this coder (read path only, no accounting objects
touched): `driver_finance.escrow_ledger` has **no `posted_at`** column — it has `created_at` — and an
`ORDER BY posted_at` was returning Postgres 42703 on the escrow-timeline endpoint. See the
escrow-ledger phantom-column PR. `posted_at` does exist on `accounting.escrow_postings`
(`0234:29`), which is how the wrong name looked plausible: the two halves of the split-brain use
different timestamp columns.

---

## What the Lists+Safety coder retains

The **Forfeit UI and route** only, both already verified correct against `origin/main` (= the deployed
prod SHA):

- **SAF-B01** route registered and wired — blocked solely by gate 1.
- **SAF-B09** drawer, liability picker and validation verified: `EscrowForfeitModal.tsx:91` ParityDrawer,
  `:104-109` MoneyInput dollars seam, `:137-143` liability picker, `:83-88` submit disabled on
  clause-blocked / amount ≤ 0 / over-balance / reason too short, mirrored server-side. Needs an
  authenticated click-through, no new code.

**SAF-B22** (escrow tab drill-through to settlement / GL JE / bank txn) is **held as adjacent** — it would
be frontend-only EntityLinks with no writes, but it reads `accounting.escrow_*`, so it awaits owner
routing rather than a coder's judgement call.
