# ★ CC-2 — Banking + Maintenance lane (Cursor lead, 2026-09-10). OUT until ~18:00 — queue on return.

**Comms:** read `docs/bus/COMMS-PROTOCOL-2026-09-10.md` first; post every ship/blocker to
`docs/bus/OUTBOX-CC-2.md`. USMCA only. Neon `tiny-field-89581227`/`br-fancy-credit-akjnd07a`,
`SET LOCAL app.bypass_rls='lucia'`. Verify LIVE. BUILD+FIX. Fast-merge, PR title `CC-2-`. One PR + one
named guard each. Void-never-delete, no prod fixtures.
Codex is on Fleet/Maintenance while you were out — read OUTBOX-CODEX for files touched before you edit
`maintenance.*`, so you don't collide.

## ROW 1 — REG-028/030 (URGENT · deadline on return + 2h · surrender Cursor)
Running-balance dispute: 12/08/25 shows `$100` received next to `-$13,062.53`. PASTE your exact
running-balance query + row-by-row output for that account around 12/08 into the register so lead can
certify. If the trace shows a real bug (is_credit vs amount_cents sign — 313/314 non-voided USMCA rows
point opposite), FIX the balance-computation source and re-prove. Close on a pasted trace + visible
corrected/explained balance, NOT a claim.

## ROW 2 — REG-027 (bank-account reorder, merged #21620) — DEPLOY PROOF
Prove reorder LIVE on the deployed bundle; if not deployed, `@Cursor` in OUTBOX for FE deploy.

## ROW 3 — REG-021 (5 legacy 480px drawers → ParityDrawer)
Migrate AdvanceDetailDrawer, AccountDrawer, LiabilityDetailDrawer, CategorizeDrawer, DailyTasksPage
(520px) to ParityDrawer. Guard 10907 asserts 0 remaining.

## ROW 4 — Banking carried-forward
BNK-06 (Description column 0px), BNK-10 (RE-MEASURE live first — old figure stale), BNK-12 (no Sept
reconciliation session), BNK-17 (bank-fee-recovery role live proof). One PR + guard each.

## ROW 5 — Maintenance audit (coordinate with Codex)
Continue the Maintenance bug/discrepancy sweep; file real defects (ask lead before minting a REG number),
fix your-lane ones, one PR + guard each. Post files-touched to OUTBOX to avoid colliding with Codex.

DONE line each: `CC-2 | REG-###/BNK-## DONE | <sha> | <live sha> | <measurements now passing> | NEXT`
