# Module completion — Home — acceptance checklist

**PROGRESS: 0 of 1** · complete: `false` · as_of: 2026-08-29T16:40:00Z · live_sha: `8d2f67b`

| Status | Count |
|---|---:|
| PASS | 0 |
| HOLD | 0 |
| OPEN | 0 |
| FAIL | 0 |
| UNVERIFIED | 1 |

| ID | Status | Title | Evidence | PR |
|---|---|---|---|---|
| `HOME-S01` | **UNVERIFIED** | Surface /home renders real entity-scoped data with no dead end | REOPEN 2026-08-29 OWNER: unbound prose evidence is not a live proof (no Neon/HTTP/browser artifact). prod_verified false until GUARD packet + live_verified_sha. Prior: VERIFIED LIVE on prod 2026-07-29 in BOTH entities, authenticated. TRANSP: cash position $4,718, 2 open loads, WOS OPEN 2, fleet 50 trucks, QBO vendors 910/910, 101 filings overdue+due-soon. USMCA: cash position $93, 0 loads, WOS OPEN 0, trucks 0, QBO vendors 0/0, attention 'No attention items'. Entity scoping proven by the two reads differing on every figure. Footer reads 'Backend version: 4de9adb' — a real backend sha, confirming PR #3751 deployed and working. Honest-empty and honest-error states present rather than silent zeros (USMCA factoring reads 'Unverifiable: faro_contract_entity_mismatch'). | — |

Desktop audit: —
