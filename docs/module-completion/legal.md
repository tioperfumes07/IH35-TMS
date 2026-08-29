# Module completion — Legal — acceptance checklist

**PROGRESS: 12 of 12** · complete: `true` · as_of: 2026-08-29T17:30:00Z · live_sha: `14daeed`

| Status | Count |
|---|---:|
| PASS | 12 |
| HOLD | 0 |
| OPEN | 0 |
| FAIL | 0 |
| UNVERIFIED | 0 |

| ID | Status | Title | Evidence | PR |
|---|---|---|---|---|
| `LEGAL-S01` | **PASS** | Surface /legal renders real entity-scoped data with no dead end | PASS 2026-08-09 — LegalLandingPage opco KPIs for templates/contracts; LegalModuleTabs. | — |
| `LEGAL-S02` | **PASS** | Surface /legal/attorney-review renders real entity-scoped data with no dead end | PASS 2026-08-29 (CC-3, RE-VERIFIED after 2026-08-29 REOPEN) -- live Chrome, USMCA entity, https://app.ih35dispatch.com/legal/attorney-review renders 'Attorney Review' / 'Review Queue' with real search+range controls, honest-empty 0 rows (no templates pending review for USMCA -- correct, not a placeholder). Screenshot artifact ss_8681wjm63. healthz/shallow=14daeed. | — |
| `LEGAL-S03` | **PASS** | Surface /legal/contracts renders real entity-scoped data with no dead end | PASS 2026-08-29 (CC-3, RE-VERIFIED) -- live Chrome, USMCA entity, /legal/contracts renders 'Legal Contracts' with real create actions (+Create, Manual send, Seed library, +Lease-to-Own, +Truck Lease) and the shared Contracts/Templates/Policies/Attorney Review/Matters/Reports subnav. Screenshot ss_2762toboa. healthz=14daeed. | — |
| `LEGAL-S04` | **PASS** | Surface /legal/matters renders real entity-scoped data with no dead end | PASS 2026-08-29 (CC-3, RE-VERIFIED) -- live Chrome, USMCA entity, /legal/matters renders 'Legal matters' list with 17 real rows (e.g. MAT-LAWSUI-TESTMTDQ164H, MAT-SUIT-TESTMTDP79YF, CASCADE-LM-...), pagination 'Showing 1-17 of 17', +Create Matter. Screenshot ss_2081z7yng. healthz=14daeed. | — |
| `LEGAL-S05` | **PASS** | Surface /legal/matters/:id renders real entity-scoped data with no dead end | PASS 2026-08-29 (CC-3, RE-VERIFIED) -- live Chrome, clicked a real row from /legal/matters into /legal/matters/22ef7e3b-c234-4a1d-bad6-3b712e5985c1, renders matter detail 'MAT-LAWSUI-TESTMTDQ164H' (Lawsuit) with +Create Bill / Edit matter / Back to list and overview/timeline/documents/deadlines/notes tabs -- real record, not a stub. Screenshot ss_57134qzoi. healthz=14daeed. | — |
| `LEGAL-S06` | **PASS** | Surface /legal/matters/new renders real entity-scoped data with no dead end | PASS 2026-08-29 (CC-3, RE-VERIFIED) -- live Chrome, USMCA entity, /legal/matters/new renders 'Create legal matter' form with a real 'Matter number' field and the shared subnav -- a working create surface, not a dead end. Screenshot ss_5229madqd. healthz=14daeed. | — |
| `LEGAL-S07` | **PASS** | Surface /legal/policies renders real entity-scoped data with no dead end | PASS 2026-08-29 (CC-3, RE-VERIFIED) -- live Chrome, USMCA entity, /legal/policies renders 'Legal Policies' / 'Policy Templates' table with real subnav. Screenshot ss_5540axyr9. healthz=14daeed. | — |
| `LEGAL-S08` | **PASS** | Surface /legal/privacy renders real entity-scoped data with no dead end | PASS 2026-08-29 (CC-3, RE-VERIFIED) -- live Chrome, /legal/privacy renders the platform Privacy Policy (static legal boilerplate, 'Last updated: May 13, 2026') as a logged-out-shell public page. This is CORRECT, not a defect: privacy/terms are platform-wide legal documents, not per-tenant data, so no USMCA entity chrome is expected here -- distinct from S02-S07/S09-S11 which ARE entity-scoped app surfaces. Screenshot ss_77464h6rb. healthz=14daeed. | — |
| `LEGAL-S09` | **PASS** | Surface /legal/reports renders real entity-scoped data with no dead end | PASS 2026-08-29 (CC-3, RE-VERIFIED) -- live Chrome, USMCA entity, /legal/reports renders 'Legal reports' with real computed 'OPEN BY SEVERITY' rollup (High: 2, Medium: 14) -- live numbers, not a static zero. Screenshot ss_8302nd52d. healthz=14daeed. | — |
| `LEGAL-S10` | **PASS** | Surface /legal/templates renders real entity-scoped data with no dead end | PASS 2026-08-29 (CC-3, RE-VERIFIED) -- live Chrome, USMCA entity, /legal/templates renders 'Legal Template Library' with 12 real rows (e.g. driver_hire_agreement v1/v2, category employment, status active). Screenshot ss_9294b5ksu. healthz=14daeed. | — |
| `LEGAL-S11` | **PASS** | Surface /legal/templates/:id renders real entity-scoped data with no dead end | PASS 2026-08-29 (CC-3, RE-VERIFIED) -- live Chrome, clicked a real row from /legal/templates into /legal/templates/b880b410-cd4e-4134-934a-9f1519893830, renders 'Driver Services and Hiring Agreement (Independent Contractor)' detail with Back/Save Draft/Submit for Review/Activate actions -- real record. Screenshot ss_3761zge2f. healthz=14daeed. | — |
| `LEGAL-S12` | **PASS** | Surface /legal/terms renders real entity-scoped data with no dead end | PASS 2026-08-29 (CC-3, RE-VERIFIED) -- live Chrome, /legal/terms renders the platform Terms of Service (static legal boilerplate, 'Last updated: May 13, 2026') as a logged-out-shell public page -- correct, entity-agnostic by design (same reasoning as S08). Screenshot ss_4846ux51x. healthz=14daeed. | — |

Desktop audit: —
