# LEAD-RULING-2026-09-23-CC3-RELAY-AMEX-BANKING-ACTIVATE-CROSS-LANE

## Lane-cross authorization for CC-3 touching `apps/backend/src/banking/banking.routes.ts`
## (CC-2's `apps/backend/src/banking/**` lane)

**Authorization, quoted verbatim** from the Lead's own mid-session ruling, addressed directly to
CC-3 (`LEAD — RETRACTION → CC-3 · 2026-09-23 · MY 8000 RELAY RULING IS WRONG. DO NOT APPLY IT.`):

> "1. **Activate the Amex in Banking** through the real banking route, never raw SQL:
> `is_active=true`, `visible=true`, and **rename it off "TEST DATA"** to the real card name. Keep
> `ledger_account_id` on **2500**. It is `credit_card` / `credit`, the same shape as Dreamline —
> copy that account's configuration exactly."

This is the 1295 Relay Fuel Wallet fix chain (originally assigned to CC-3 in the same message
thread's earlier entry: "CC-3: fuel linkage is the largest hole in the system and it is yours"),
carried through the Lead's own 8000-ruling retraction into an explicit CC-3 action item. It requires
touching `banking.routes.ts` because — verified live via a full grep of every
`banking.bank_accounts` UPDATE site in the repo — **no existing route can activate a deactivated
manual bank account or change its `account_name`/`institution_name`.** Only `hide`/`unhide`
(`hidden_at`), `visibility` (`visible`/`display_order`/`tag`), `cash-gl` (`ledger_account_id`), and
`reorder` exist. "Never raw SQL" therefore means adding the missing route, not hand-editing the row.

## Scope of the cross

One new, small, additive route: `PATCH /api/v1/banking/accounts/:id/activate` — mirrors the
existing `hide`/`unhide` routes' exact shape (same Owner/Administrator gate via
`isBankAccountHideAdminRole`, same `withCompanyScope`, same `appendCrudAudit` call, same 404-on-
not-found pattern). Sets `is_active=true`, `account_name`, `display_name`, and optionally
`institution_name` on an existing row — never `ledger_account_id` (activation is never a re-map),
never a DELETE (void-not-delete: rename+activate the existing TEST DATA row, never recreate).

Not yet executed against the TEST DATA Amex row itself: the Lead's instruction says "rename it...
to the real card name," and no real card name/last4 is available in this session (no Amex statement
document exists anywhere under the reconciliation folder — confirmed live, zero matches). Applying
a guessed name would be exactly the guess this session's law forbids. The route ships ready to use;
the rename+activate call itself is held pending the real card identity or an explicit owner-approved
generic label.
