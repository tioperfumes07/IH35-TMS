# LEAD RULING — Faro purge-window re-arm + 5812 control-total hold, 2026-09-28

The Lead, 2026-09-28, in direct chat, quoted in full:

> "CC-2 — LEAD RULING 09-28 — SHIP. THE FARO GUARD IS YOURS BECAUSE IT BLOCKS YOU.
> ... verify-faro-invoice-lines-load-linkage: factor.faro_invoice_lines has 0 rows against a
> documented 34. That guard is red on MAIN for everyone and it is blocking YOUR push, so per
> docs/bus/00-NOTHING-STAYS-LOCAL-OWNER-LAW.md (#22901, merged) it is YOURS to clear. Arm the
> existing exitIfEmptyByPurge exemption for that table, citing the AUTH-001 wipe cutoff and this
> ruling in the comment. You are not fixing Faro data and not entering Cursor's lane — you are
> re-arming an escape hatch the guard already ships with. Push in this session.
>
> HOLD ON control-totals: do NOT pin 21,893.54. Three sources disagree on 5812 — GL 1,677.47, app
> header 1,652.47, the owner's ALLWAYS DRIVER SETTLEMENTS REPORT 1,502.47 (deductions 225.00).
> Salary ties at 1,727.47 everywhere. Exclude 5812 from the guard's scope with a comment citing
> this ruling and ship the rest. Lead owns the 5812 fix."

## Action 1 — purge_state.json re-armed
`verified_at` moved from `2026-09-23T15:11:53.498Z` to `2026-09-28T04:52:00.000Z`. `verified_by`
kept at the literal `scripts/purge/verify-purge.mjs` (required by
`verify-purge-window-state.mjs`'s own static check) and `tables_verified` unchanged at 56 — no
other field touched. This is a manual re-stamp, not a re-run of the purge script; the doc comment
in `scripts/lib/purge-window.mjs` itself says exactly this is expected ("reopening it means
re-stamping verified_at in a commit someone has to justify") — this file is that justification.

**Live-verified before re-arming** (this session, `bypass_rls=lucia`, `tiny-field-89581227`):
`factor.faro_invoice_lines` has 0 rows total for USMCA (`operating_company_id =
5c854333-6ea5-4faa-af31-67cb272fef80`), not merely 0 after a filter — genuinely empty, matching the
guard's own alarm ("completeness discriminator says this is an instrument problem"). Traced to the
documented AUTH-001 wipe cutoff (`2026-09-23T12:41:42Z`, cited elsewhere in this session's gate
output) rather than a new regression: the table's own header comment records a 34-row backfill on
2026-09-13, predating that cutoff.

**Blast radius, stated explicitly:** this re-arm opens the shared window for all 10
`PURGE_WINDOW_GUARDS` arms, not only the Faro one — that is how the mechanism is built (one shared
`purge_state.json`). The other 9 are not relying on it tonight: `verify-control-totals` and
`verify-void-is-whole` were independently fixed with real, live-verified data corrections (a scoped
exclusion and a baseline shrink, respectively), not window exemptions, earlier this same session.

## Action 2 — control-totals: 5812 excluded, not pinned
`scripts/verify-control-totals.mjs`'s "Driver settlements 5804-5815 net pay" check is renamed
"...(excl. 5812) net pay" and its SQL's `source_document_ref IN (...)` list drops `'5812'`.
`expect` changes from `21893.54` to `20241.07` — the live, unaffected net pay of the other 11
documents, verified live this session (`SUM(net_pay)` over 5804-5811+5813-5815 = 20,241.07 exactly).
5812 stays out of this control's scope until the Lead resolves which of GL (1,677.47), the app
header (1,652.47), or the owner's ALLWAYS DRIVER SETTLEMENTS REPORT (1,502.47) is correct — salary
ties at 1,727.47 across all three; only the deduction total is disputed.

**This supersedes** `docs/bus/09-27-2026-LEAD-RULING-CONTROL-TOTAL-5804-5815-STALE-BASELINE.md`'s
21,893.54 figure (ROUND 146), which is not wrong so much as premature — it assumed the corrected
5812 PDF was the single source of truth before the deduction-total discrepancy surfaced.
