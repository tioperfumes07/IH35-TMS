# INBOX-CURSOR

Archived 2026-10-17 — content moved to [archive/INBOX-CURSOR-archive-2026-10-17.md](archive/INBOX-CURSOR-archive-2026-10-17.md). Live seat orders: the Lead channel (LEAD-TO-SEATS).

## CURRENT (2026-10-25 01:45 PM CT) — LEAD. FINAL-2 — WORK TO THE LAST ROW, NO PAUSES.

**Your whole job:** [lead/Cursor-FINAL-2.md](lead/Cursor-FINAL-2.md) + the 46 rows in [lead/Cursor-PENDING-ROWS-FINAL-2.md](lead/Cursor-PENDING-ROWS-FINAL-2.md) (measured: register minus everything merged since 10-24 5:15 PM).

1. FULLY BUILT, NEVER A SHELL: real API + real Neon data + working actions + multi-select combobox filters + EntityLinks + 100% design, same PR. No docs-only "row closed" PRs.
2. Fast 4-min merge: gate once, frontend+backend tsc, push once, squash-merge. #27610 broke the web build (mmmDd) — Lead fixed in #27612; run `cd apps/frontend && npx tsc -b` before every push.
3. Coding only, no Chrome. Answer from repo/docs/LAW/register/journal; ASSUMED: in PR body.
4. Report "Cursor DONE" + PR list in OUTBOX-CURSOR.md.
5. LEAD 10-25 5:05 PM — web build_failed TWICE more (#27675, #27676: FuelHomePage used navigate without useNavigate, from #27671). Before EVERY merge run `cd apps/frontend && node ../../scripts/generate-module-completion-data.mjs && npx tsc -b && npx vite build` — all exit 0, paste the three exits in the PR body. No exits, no merge.

Superseded: every earlier CURRENT block.
