# Module completion — Eld — acceptance checklist

**PROGRESS: 1 of 5** · complete: `false` · as_of: 2026-08-29T16:40:00Z · live_sha: `—`

| Status | Count |
|---|---:|
| PASS | 1 |
| HOLD | 0 |
| OPEN | 0 |
| FAIL | 0 |
| UNVERIFIED | 4 |

| ID | Status | Title | Evidence | PR |
|---|---|---|---|---|
| `ELD-S01` | **PASS** | Surface /eld renders real entity-scoped data with no dead end | VERIFIED LIVE on prod 2026-07-29 in BOTH entities. 5 tabs (Live Duty Status, HOS Violations, Unidentified Driving, Driver Certifications, ELD Settings). TRANSP: 6 drivers on the canonical roster from GET /api/v1/telematics/hos/daily-roster with real duty status, drive-left and shift-left values (e.g. T176 Sleeper Berth 10h54m / 3h51m). USMCA: 0 rows with an explicit honest-empty message, 'No HOS duty events for this company today (honest empty — ingest may be quiet)' — an honest empty, not a silent blank. | — |
| `ELD-T01` | **UNVERIFIED** | Tab "HOS Violations" opens and renders real entity-scoped data | REOPEN 2026-08-29 OWNER: unbound prose evidence is not a live proof (no Neon/HTTP/browser artifact). prod_verified false until GUARD packet + live_verified_sha. Prior: 2026-08-03 Cursor: ViolationsTab useQuery→fetchEldHosViolations (listHosViolations). data-testid=eld-violations-tab. Neon lucia safety.hos_violations count=0 → honest empty path. Guard verify-eld-tabs-live-data + step 2246. | — |
| `ELD-T02` | **UNVERIFIED** | Tab "Unidentified Driving" opens and renders real entity-scoped data | REOPEN 2026-08-29 OWNER: unbound prose evidence is not a live proof (no Neon/HTTP/browser artifact). prod_verified false until GUARD packet + live_verified_sha. Prior: 2026-08-03 Cursor: UnidentifiedTab useQuery→fetchEldUnidentifiedDriving (getFleetLocationHos). data-testid=eld-unidentified-tab. Guard step 2246. Honest empty when no unassigned moving units. | — |
| `ELD-T03` | **UNVERIFIED** | Tab "Driver Certifications" opens and renders real entity-scoped data | REOPEN 2026-08-29 OWNER: unbound prose evidence is not a live proof (no Neon/HTTP/browser artifact). prod_verified false until GUARD packet + live_verified_sha. Prior: 2026-08-03 Cursor: certifications tab renders HonestEmptyTab (data-testid=eld-certifications-honest-empty, data-eld-honest-empty) — ELD_TABS_CONFIG documents no backend yet; no fake rows. Guard step 2246. | — |
| `ELD-T04` | **UNVERIFIED** | Tab "ELD Settings" opens and renders real entity-scoped data | REOPEN 2026-08-29 OWNER: unbound prose evidence is not a live proof (no Neon/HTTP/browser artifact). prod_verified false until GUARD packet + live_verified_sha. Prior: 2026-08-03 Cursor: settings tab renders HonestEmptyTab (data-testid=eld-settings-honest-empty) — no ELD settings API yet; honest empty locked. Guard step 2246. | — |

Desktop audit: —
