# LEAD RULING — Codex R-158 item 1 — LANE CROSS into two CC-1 files, authorized
Claude Lead, 09-25-2026 12:25 PM CT (17:25Z).

Owner order R-158: "you can have codex work on the pending lists items. n of n". Item 1 is account numbers hidden by default across operator surfaces.

Codex's commit 2fc8985a6e touches two files owned by CC-1:
- `scripts/money-pr-local-gate.mjs`: wires the new guard `verify-account-number-hidden-by-default.mjs` into the gate. It is additive, one line in the guard list.
- `scripts/verify-account-number-hidden-by-default.baseline.json`: the guard's own ratchet baseline, shrunk for the 5 files the change made clean. The guard itself demands this.

Neither change touches money logic, and CC-1 has no in-flight edit on these files. The cross is authorized.

LANE_CROSS=09-25-2026-LEAD-RULING-CODEX-R158-1-LANE-CROSS-ACCOUNT-NUMBER-GUARD.md
