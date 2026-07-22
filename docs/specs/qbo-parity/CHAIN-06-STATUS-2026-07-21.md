# CHAIN-06 status note — 2026-07-21 (governance)

> **STATUS 2026-07-21 — CODE FIXED + GUARDS WIRED (verify-steps 920–922); live money path still requires owner flag/ops proof.**
> Docs-only refresh. Does **not** claim LIVE-VERIFIED with money.

## Verdict

| Layer | State |
| --- | --- |
| AR-subledger code gap (§5 / §7-A) | **FIXED** — `applyCustomerPaymentSubledgerRelief` / `applyChargebackSubledgerRelief` in `poster.service.ts` |
| Static + chain guards | **WIRED** — verify-steps **920** (invoice-ar-chain-proof), **921** (ar-subledger-fix), **922** (factoring-ar-tieout) |
| `FACTORING_GL_POSTING_ENABLED` | Still **owner-gated** (default OFF) |
| Live customer-payment → AR-aging money proof | **UNVERIFIED** until owner flag/ops ceremony |

## Accounting law unchanged

- Faro = secured borrowing (ASC 860); A/R closes when the **customer pays Faro**, never at funding.
- No TMS→QBO write-back. Parallel books stand.

## Stale OPEN/GAP language corrected (this PR)

Additive dated notes (history retained) in:

- `docs/LOCKED-DECISIONS-2026-07-05-ENTERPRISE.md` (latent-bug section)
- `docs/specs/qbo-parity/CHAIN-06-FACTORING-AR-TIEOUT-PROOF.md` (§5 / §7-A)
- `docs/trackers/backlog-verify/accounting.md` (CHAIN-06 row)
- `scripts/verify-chain-06-factoring-ar-tieout.mjs` (header comments only)

## Evidence cross-link

Builder evidence map: **PR #3121** — `docs/trackers/TOP10-BUILDER-EVIDENCE-2026-07-21.md`
(CHAIN-06 row: BUILT in code; guards 920/921/922; nothing left to build for the subledger bug).
