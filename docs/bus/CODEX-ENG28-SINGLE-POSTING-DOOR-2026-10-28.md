# ENG-28 — single validated posting door

Authority: `lead/10-27-2026-Codex-Lead-Answers-ENG28-13595-ENG17.md`.

This is a code/control change. No production records, bank matches, balancing journals, or historical amounts were changed.

## Contract

The posting engine accepts complete balanced batches in the caller's transaction. It validates the scoped journal header and date, open period, scoped postable accounts, safe integer cents, unique sequences, and exact reversal provenance. A savepoint rolls back all posting and spine writes when any line fails. Individual zero-value legs remain supported in positive balanced batches.

Exact same-header complete replays require identical explicit line semantics and existing primary source links. Partial or conflicting replays refuse. An inactive original account can be reversed only by its exact opposite original leg; this does not authorize ordinary new postings to that account.

Nine specialized callers now submit their complete batches: manual journals, voids, retained earnings close, bank variance, amortization, lease, settlements, fuel, and expense correction. Source-engine posting and reversal use the same batch door. Account selection, amounts, signs, source IDs, dimensions and supplementary links remain in their existing workflows.

The low-level line INSERT is private to the engine. The remaining posting-line-writer module contains read-only source resolution/types. Reversal context helpers are extracted to avoid an engine/void import cycle.

## Evidence

- Combined targeted test pack after syncing main: 24 files, 114 tests passed, no skipped tests, exit 0.
- Includes real PostgreSQL settlement, lease, prepaid, amortization, expense correction, source-link and batch atomicity tests on an isolated loopback database. Never production fixtures.
- Atomicity test: invalid second source leaves zero posting/spine rows; transaction remains usable; valid retry balances to zero; exact replay creates no duplicates.
- Canonical single-writer guard: 12/12 selftests, including all nine missing-call plants and an external INSERT plant.
- Existing guard selftests preserve source/spine/load/party/reversal assertions; no live SQL or ceilings relaxed.
- Independent financial review found no remaining confirmed implementation blocker. Supplementary public bank-split caller tests prove four paired legs, receipt/class/source keys, bank lineage, opposite-sign refusal and closed-period refusal.
- Backend build (`npm run -s build`) and backend TypeScript check exit 0. Dependency-cycle guard passes without allowlist growth after extracting the unchanged standing-latch predicate.

Production runtime proof is intentionally not created by writing financial transactions. Deployment and release checks are reported separately.
