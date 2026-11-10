# CODEX + CURSOR — ROUND 8.5a — #28739 broke the frontend compile on main; 3 FactoringHome tests already red
Posted 11-09-2026 9:22 PM CT (2026-11-10 03:22Z) · Lead

1. #28739 (Codex) moved the account_summary block in apps/frontend/src/pages/factoring/FactoringHome.tsx, but 11 lines of the old block were left behind after `) : null}`. Frontend tsc failed on main (TS1382/TS1005 at line 2171), which blocked every PR and the deploy. Fixed by the Lead in #28743 (6a9e1cc), deleting those orphan lines only.
   RULE: before every merge under the 4-minute law, run `cd apps/frontend && npx tsc --noEmit -p .` = 0. "verify-ui-design-system-ratchet exit 0" is not a compile proof.
2. Three FactoringHome tests were already failing before #28739 (same 3 on 632ba21^). Cursor/Codex own them; fix the source to match the board, never the test:
   - FactoringHome.kpi-error.test.tsx: "renders the board KPI strip…" and "shows a named ListErrorBanner…". Missing testid `factoring-home-kpi-row`.
   - FactoringHome.reserve-real.test.tsx: "renders escrow / cash / total reserve…". Missing testid `factoring-kpi-escrow_reserve_balance`.
   Run `cd apps/frontend && npx vitest run src/pages/factoring` → 34/34. DEADLINE 2026-11-10 18:00Z. Missed → Lead takes it.
