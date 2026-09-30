CODEX | 2026-09-30 2:16 PM CT | R297.5 X-19 — guard proof, not a purge.

ROOT CAUSE: six maintenance/catalog tables have no sample flag. Four estimates
have no direct marker but point to WOs explicitly marked test in cancellation notes.

FIX: scripts/verify-no-test-markers-in-live-tables.mjs scans the six explicit
USMCA tables, including cancelled/draft rows; emits table/id/field/marker and parent
FK provenance. No unit-name inference, hardcoded expected count, baseline, date
exemption, fixture insert, deletion, update, or application-code modification.

GUARD: --selftest PASS 25/25, including every requested marker, mixed case,
field variants, clean row, entity isolation, absent parent, linked-parent evidence,
null text, and deliberately suppressed detector (assertion must fail).
Required runner tests PASS 12/12. Local gate runs selftest; required live CI runs
the real guard through PROD_READONLY_DATABASE_URL. Missing DB fails, never skips.

LIVE PROOF: audit transaction at 2:11:23 PM CT counted 15 WOs, 14 estimates,
5 parts, 2 tickets, 1 interval, 1 schedule. Detector separately evaluated the
captured audit rows: flagged=38, direct=34, inherited=4. This is snapshot
evaluation, NOT a fresh live guard execution. The connector refused
SET LOCAL ROLE ih35_ci_readonly; no privilege workaround was attempted.
The live CLI intentionally insists on that role and BEGIN READ ONLY, then rolls
back/releases in finally. Zero populations are read twice, not silently skipped.

REMAINING: actual live guard run via authorized readonly credential. With these
survivors still present it must exit 1 and list the real IDs, not pass. Purge is
separately authorized; this PR does not request or perform it. X-19 is not DONE.

LANE-CROSS: user Round297.5 explicitly assigns X-19 to Codex. Minimal required
wiring touches shared money-pr-local-gate.mjs, local-db-guard-routing.mjs and ci.yml;
coordination/authority is in the separate documentation PR's R297.5 bus ruling.
