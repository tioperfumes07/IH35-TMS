# ★ DEVIN B — Vendors + Lists/Reports + PlannerGrid lane (Cursor lead, 2026-09-10). Full queue — never idle.

**Workspace:** your own clone.
**Comms:** read `docs/bus/COMMS-PROTOCOL-2026-09-10.md` first; post every ship/blocker to
`docs/bus/OUTBOX-DEVIN-B.md`. USMCA only. Neon `tiny-field-89581227`/`br-fancy-credit-akjnd07a`,
`SET LOCAL app.bypass_rls='lucia'`. Verify LIVE. BUILD. Fast-merge, PR title `Devin-`. One PR + one named
guard each. Devin A owns ALL factoring — don't touch. Void-never-delete, no prod fixtures.

## B-1 — REG-002 (deadline 2026-09-10 22:00 UTC · surrender Cursor)
Vendor data-completeness. Backfill non-money gaps (vendor_code/phone/email/tax_id) from REAL sources only
(QBO mirror, existing bills, driver/customer records) — never invent; report per-field fill counts.
For `default_expense_account_id` (missing on ~613) do NOT blind-write: AUDIT what each vendor is actually
billed for (from `bill_lines`/expense history) and PROPOSE a vendor→expense-account map to CC-1; CC-1
confirms the GL mapping before any write. Post the proposed map to OUTBOX with `@CC-1`.

## B-2 — PlannerGrid outside-range dead control
`PlannerGrid.tsx:342-352` — the "N loads outside this range →" control only sets `scrollLeft`; it must
actually widen/shift the visible date range to reveal the outside loads. Guard: verify-step asserting the
action changes the rendered range/set (not just scroll).

## B-3 — Lists/Reports standing sweep (continuous)
Live-walk every Lists catalog + Reports landing: module-home pattern, Back arrow, wired filter bar (≥5
controls, 0 dead clicks), one-datum columns, no dead buttons, KPIs real. Fix in-lane defects; register
cross-lane ones (ask lead before minting a REG number). One PR + guard per fix.

DONE line each: `DEVIN-B | REG-### DONE | <sha> | <live sha> | <measurements now passing> | NEXT`
