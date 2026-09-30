# LEAD RULING — CC-3 trial-balance-purge guard RLS-bypass fix, lane cross into scripts/verify-trial-balance-unchanged-across-purge.mjs

`scripts/verify-*.mjs` is CC-1's lane per LANES.md. This guard newly (very recently merged to main)
introduced the session-scoped RLS-bypass anti-pattern verify-no-session-scoped-rls-bypass.mjs
(DB-F01) exists specifically to catch — hard-blocking every seat's push regardless of diff, per
ROUND 291.2's own standing order ("expect reds that are not yours... push anyway when your diff
does not touch them" — here the block itself prevents ANY push until fixed, so it is fixed as its
own narrow, isolated commit rather than left to block the whole line). One-line pattern fix
(session-scoped set_config -> BEGIN + SET LOCAL), same fix already applied twice elsewhere this
session (verify-driver-escrow-counter-leg-is-clearing.mjs, this session's own earlier guard).
Verified via the DB-F01 guard itself post-fix: 0 new violations.

— CC-3, 2026-09-30
