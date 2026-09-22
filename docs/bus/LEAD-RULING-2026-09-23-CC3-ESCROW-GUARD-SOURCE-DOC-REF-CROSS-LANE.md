# LEAD-RULING-2026-09-23-CC3-ESCROW-GUARD-SOURCE-DOC-REF-CROSS-LANE

## Lane-cross authorization for CC-3 touching `scripts/verify-banking-escrow-register-settlement-je-link.mjs`
## (CC-1's `scripts/verify-*.mjs` lane)

**Authorization basis:** the P0-B settlement numbering law, ruled directly by the Lead this
session and already the basis for CC-3's own `allocateSettlementDisplayId` fix
(`settlement-display-id.ts`, merged PR #22177/#22190):

> "NUMBERING CLOSED — the next number is 5817... AlwaysTrack is a CONTINUING SEQUENCE... Land
> `allocateSettlementDisplayId` on that basis."

and the underlying instruction that the AlwaysTrack settlement document number
(`driver_finance.driver_settlements.source_document_ref`) **is** the user-facing settlement
number, not the retired synthetic `S-YYYY-NNNN` counter (`display_id`).

## What was found and why it required touching this guard

Pushing an unrelated, real fix (`apps/backend/src/banking/banking.routes.ts`, the new
`activate` account route, docs/bus/LEAD-RULING-2026-09-23-CC3-RELAY-AMEX-BANKING-ACTIVATE-
CROSS-LANE.md) failed the pre-push gate on `verify-banking-escrow-register-settlement-je-link.mjs`
— confirmed, via a clean `main` worktree, to be **pre-existing and unrelated to that change**: it
already fails on `main` at commit `1f0ef0db56`, independent of any CC-3 branch.

Root cause: the guard's regex hard-checks for the literal string `ds.display_id AS
settlement_display_id` in the register endpoint's escrow branch. The real code (already correctly
migrated to the numbering law, by whom/when not established by this pass) now selects
`ds.source_document_ref AS settlement_display_id` — the numbering-law-correct column. The guard is
stale, not the code; it never priced in the P0-B fix and started false-failing.

## Scope of the cross

One-line widening: the regex now accepts EITHER `ds.display_id` OR `ds.source_document_ref`
feeding the `settlement_display_id` alias, with a citation comment. The guard's actual intent — a
human settlement label must be selected and threaded to the frontend — is unchanged and still
fully enforced (selftest re-run: 8/8 regression mutations still detected; live PASS confirmed
against the real, unmodified `banking.routes.ts` escrow branch).

Not a data-numbering ruling in itself — this is a static-analysis regex fix following the already-
ruled numbering law, the same class of guard-catch-up as EXP-CLOSED-TOUR-VOCAB/-2 earlier this
session.
