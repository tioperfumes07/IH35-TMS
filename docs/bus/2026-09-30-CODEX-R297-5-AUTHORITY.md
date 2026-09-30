CODEX | 2026-09-30 2:15 PM CT | Recorded user-delivered Lead Round 297.5, issued 2:05 PM CT.

LANE-CROSS: Round 297.5 assigns Codex the documentation-only road-service audit at
claude/09-30-2026-CODEX-ROAD-SERVICE-CHAIN-MEASURED.md, including the exact
USMCA survivor inventory for the six named maintenance/catalogs tables.

The same order assigns a SEPARATE guard PR:
scripts/verify-no-test-markers-in-live-tables.mjs plus --selftest.
Required execution wiring uses the existing X-16 split: local selftest through
scripts/money-pr-local-gate.mjs and live read-only execution in .github/workflows/ci.yml,
registered in scripts/lib/local-db-guard-routing.mjs. These shared gate files
remain CC-1/shared ownership; this is the minimal task wiring, not a lane transfer.

No application logic changes. No deletion, production fixtures, status changes or
financial writes. Purge requires its own owner AUTH. Applied migrations immutable.
Marker evidence includes notes and actual parent-WO FKs where a child has no own marker;
unit names alone are not proof. Permission errors remain failures, never skips or passes.
