# Module completion — System (Owner)

**PROGRESS: 1 of 6** · complete: `false` · as_of: 2026-08-02 · live_sha: `—`

| Status | Count |
|---|---:|
| PASS | 1 |
| HOLD | 0 |
| OPEN | 5 |
| FAIL | 0 |
| UNVERIFIED | 0 |

| ID | Status | Title | Evidence | PR |
|---|---|---|---|---|
| `SYS-S01` | **OPEN** | /system dashboard renders QBO reconciliation + sync status honestly | scaffold — auditor PASS: 17 unresolved recon alerts, QBO CONNECTED pull-only honest | — |
| `SYS-S02` | **OPEN** | Software/Build health reflects live probe results (not false green) | scaffold — auditor PASS honesty: DEGRADED due to background_jobs.stale DOWN Aug 1 | — |
| `SYS-S03` | **OPEN** | Program tracker mirror counts match /program board | scaffold — auditor PASS: 1029/497/266 consistent with Program module | — |
| `SYS-S04` | **OPEN** | Open Health & Deploys drill-in lists failing checks with reason | scaffold — auditor: postgres/redis OK; background_jobs.stale DOWN named | — |
| `SYS-S05` | **PASS** | QuickBooks Sync panel documents write-back OFF by design | SystemModulePage.tsx calls getQboSyncHealth, surfaces a QBO write-back row, labels it 'OFF (by design)', and includes explanatory pull-only / no write-back text; guard verify-sys-s05-qbo-sync-writeback-off.mjs selftests. | #5341 |
| `SYS-VERIFY-01` | **OPEN** | System module VERIFY-1..8 (Owner role) | scaffold — infra alert surfaced honestly; app-layer fixes out of scope | — |

Desktop audit: ~/Desktop/IH35-CURSOR-AUDIT/AUDITOR-RUN-2026-07-31/modules/program-system-help-2026-08-01.md
