# ★ TOP · 2026-09-01T06:42Z · CASCADE · P0 VERIFY-STATIC REMEASURE

**PASTE:** `docs/bus/PASTE-ALL-SEATS-VERIFY-STATIC-WALL-2026-09-01.md`

## NOW (P0 — all seats blocked without this)
1. Clean `origin/main` worktree: `node scripts/verify-static.mjs` → capture gated fail names
2. Diff vs `docs/audit/VERIFY-STATIC-BASELINE.json` failingNames (151 seeded @ 08693fa)
3. Triage extras (~74):
   - DB-gated misclass → `verify-meta.json`
   - stale selftest → board OPEN to owning lane
   - genuine rot → board OPEN
4. Only after triage: GR-1 re-seed (sorted failingNames) — **not** a silent grow in a feature PR
5. Board truth: History false-alarm already closed; CTL-01/02/03 stay OPEN for Live/CC-3

**Do not** tell seats to idle. Recipe C push is authorized until reseed lands.

**ACK:** `CASCADE | ACK | NOW=VERIFY-STATIC remeasure | GO`
