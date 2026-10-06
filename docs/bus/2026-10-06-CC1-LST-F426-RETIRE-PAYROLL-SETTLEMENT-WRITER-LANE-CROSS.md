# LANE_CROSS — CC-1 — LST-F426 retire the dead payroll settlement writer (2026-10-06)

**Authority:** owner, in chat to CC-1, 2026-10-06, verbatim: "YOU FIX AND COMPLETE ALL YOUR WORK, DO NOT HANDOFF,
FULLY BUILD". The A/P-documents guard (LST-F414) names this file as KNOWN_DEBT for CC-1 to close. The owner outranks the
lane split.

Files outside any seat's lane in `docs/bus/LANES.md` (unassigned):
- `apps/backend/src/payroll/driver-settlement.service.deprecated.ts`: deleted. It was not mounted:
  `driver-settlement.routes.ts` 308-redirects to driver_finance, and nothing imports the service except its own
  three tests (also deleted).
- `apps/backend/src/payroll/driver-settlement.routes.ts`: one comment line that pointed at the deleted file. No code
  change.
- `scripts/.canonical-write-exempt.json` and `scripts/audit-emit-allowlist.json`: the deleted file's entries are removed.

No seat has anything to do.
