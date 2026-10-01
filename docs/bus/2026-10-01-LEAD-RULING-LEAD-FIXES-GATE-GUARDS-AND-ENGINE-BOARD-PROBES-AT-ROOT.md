# LEAD RULING 2026-10-01 — THE LEAD FIXES GATE GUARDS, THE ENGINE BOARD CATALOG AND PURGE-WINDOW STATE AT THE ROOT

Owner, verbatim, 2026-10-01: "fix all issues at root, we do not patch, nor defer, we fix permanently."

LANE_CROSS for the Lead on these CC-1-owned files, this PR only:
- scripts/money-pr-local-gate.mjs — wires one new live guard.
- scripts/verify-engine-catalog-probes-exist.mjs (new) — every engine-status probe must name a live relation + columns.
- apps/backend/src/system/engine-status.catalog.ts — five probes corrected to the live schema (information_schema, pasted in OUTBOX-LEAD.md).
- scripts/lib/purge-window.mjs, scripts/verify-purge-window-exemption.mjs, purge_state.json — the owner's seeding freeze keeps the
  purge window open until he seeds; the 72-hour clock expired 2026-10-01T04:52Z and every seat's gate started failing on
  legitimately-empty tables (factor.faro_invoice_lines: 104 rows at the 09-23 PRE-PURGE snapshot, 0 since the owner-ordered wipe).
- .gitignore — the self-written bank-match baseline is never committed.

Why the Lead and not CC-1: these are cross-seat gate blockers; CC-1 is building E-15/E-17. Same pattern as
2026-10-01-LEAD-RULING-LEAD-RECONSTRUCTED-A-LOST-MIGRATION-FILE.md.
