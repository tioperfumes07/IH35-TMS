# LEAD RULING — CC-2 LANE CROSS GRANTED: GATE-SCOPE-01
# (scripts/money-pr-local-gate.mjs — CC-1 lane)

Committed on the Lead's behalf, quoting his own written packets verbatim (two consecutive
packets, both naming the same file/line):

> CC-2 — GATE-SCOPE-01. P0, fix this first, it unblocks the whole floor.
> FILE: scripts/money-pr-local-gate.mjs, the LIVE_DOMAIN_GUARDS loop.
>   if (process.env.DATABASE_URL || touched) {
> `touched` already computes correctly whether the diff hits that guard's own domain paths. The
> `process.env.DATABASE_URL ||` short-circuit makes every live-domain guard run on every push for
> any seat with a live DB — which is every seat. That is why verify-fuel-transactions-per-load
> blocks Codex's loadboard and settlement-linkage PRs and your banking Undo PR, none of which
> touch a fuel path.
> ...
> FIX: a live-domain guard runs when its domain is TOUCHED. A live DB being available is what lets
> it run for real, not a reason to run it at all: [...]
> Do NOT weaken any guard. Do NOT touch a baseline. This changes WHEN a guard runs, never WHETHER
> it passes. A fuel change still runs the fuel guard and still fails closed.
> GUARD: scripts/verify-live-domain-guards-are-diff-scoped.mjs — fails if any LIVE_DOMAIN_GUARDS
> entry can run on a diff that touches none of its declared prefixes. Required 0.

**GRANTED, verbatim** — the packet names this exact file, line, and guard filename directly.
`scripts/money-pr-local-gate.mjs` is explicitly CC-1 lane in `docs/bus/LANES.md`.

**Scope of this grant:**
- `scripts/money-pr-local-gate.mjs` — the `LIVE_DOMAIN_GUARDS` loop's condition changed from
  `if (process.env.DATABASE_URL || touched)` to `if (touched) { if (!process.env.DATABASE_URL) {
  <fail closed> } ... }`. WHETHER a touched guard passes is unchanged (still fails closed with no
  DB, per ROUND 29.9-B); only WHEN it runs changes — an untouched domain no longer runs at all,
  regardless of DATABASE_URL. No baseline touched, no guard weakened, exactly as specified.
- `scripts/verify-live-domain-guards-are-diff-scoped.mjs` (new, the named guard) — static check:
  fails if the anti-pattern (`DATABASE_URL` ORed with the diff-derived `touched` flag) is present,
  or if the loop doesn't gate a touched guard's run behind `if (touched)` alone with an explicit
  fail-closed branch for a touched-but-no-DB case. Wired into `.github/workflows/ci.yml` (real CI
  step, confirmed not orphaned via `verify-guard-wired.mjs`) and `money-pr-local-gate.mjs`'s own
  unconditional `STEPS` array (no DB needed — pure static source-text check).
- Red-before-green proven: reverting the fix back to the literal old condition made the new guard
  FAIL with the exact anti-pattern text named; reverted, guard PASS again.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LYVbEZDYyiNzr5MswCc1R7
