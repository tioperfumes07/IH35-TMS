# Module completion — Driver Hub — acceptance checklist

**PROGRESS: 3 of 7** · complete: `false` · as_of: 2026-08-29T16:40:00Z · live_sha: `1b3a44d`

| Status | Count |
|---|---:|
| PASS | 3 |
| HOLD | 0 |
| OPEN | 0 |
| FAIL | 0 |
| UNVERIFIED | 4 |

| ID | Status | Title | Evidence | PR |
|---|---|---|---|---|
| `DHUB-S01` | **PASS** | Surface /driver-hub overview (inbox) renders entity-scoped data with no dead end | Route manifest mounts DriverHubPage; overview tab hosts DriverInbox with companyId gate, canReview role gate, cash-advance EntityLink, cascade preview linkage panel, honest empty for non-cash tabs. Guard: verify-driver-hub-tabs-url-sync.mjs + verify-driver-hub-surfaces-pack.mjs. / PROD-VERIFIED 2026-08-10 entity=USMCA opco=5c854333-6ea5-4faa-af31-67cb272fef80 Neon lucia: drivers_active=16; cash_advance_pending=0 (honest empty); healthz=1b3a44d. | #5327 |
| `DHUB-S02` | **UNVERIFIED** | Surface /driver-hub/reporting renders entity-scoped data with no dead end | REOPEN 2026-08-29 OWNER: unbound prose evidence is not a live proof (no Neon/HTTP/browser artifact). prod_verified false until GUARD packet + live_verified_sha. Prior: DriverHubReportingPage need-company + ListErrorBanner + honest empty + EntityLink + ParityTable; verify-dhub-s02-reporting-surface.mjs exit 0. / PROD-VERIFIED 2026-08-10 entity=USMCA: reporting route auth-gated; guards exit 0; healthz=1b3a44d. | #5331 |
| `DHUB-S03` | **UNVERIFIED** | Driver Scheduler tab entity-scoped with driver EntityLink drill-through | REOPEN 2026-08-29 OWNER: unbound prose evidence is not a live proof (no Neon/HTTP/browser artifact). prod_verified false until GUARD packet + live_verified_sha. Prior: DriverSchedulerGridPage mounted from DriverHubPage ?tab=scheduler; operatingCompanyId gate + honest empty 'No drivers are available for this operating company.'; EntityLink kind=driver on grid rows. Guard: verify-driver-hub-tabs-url-sync.mjs + verify-driver-hub-surfaces-pack.mjs. / PROD-VERIFIED 2026-08-10 entity=USMCA: drivers_active=16; healthz=1b3a44d. | — |
| `DHUB-S04` | **PASS** | Leave Requests tab entity-scoped with driver EntityLink drill-through | DriverSchedulerRequestInboxPage mounted from DriverHubPage ?tab=leave_requests; Select an operating company gate; ParityTable with EntityLink kind=driver. Guard: verify-driver-hub-tabs-url-sync.mjs + verify-driver-hub-surfaces-pack.mjs. / PROD-VERIFIED 2026-08-10 entity=USMCA: leave inbox company-scoped; healthz=1b3a44d. | — |
| `DHUB-S05` | **UNVERIFIED** | Cash advance inbox shows cascade preview linkage before approve | REOPEN 2026-08-29 OWNER: unbound prose evidence is not a live proof (no Neon/HTTP/browser artifact). prod_verified false until GUARD packet + live_verified_sha. Prior: DriverInbox renders Linkage panel (load_bill / open_bill / employee loan branches), pay-from account picker, Approve & post office endpoint; EntityLink on driver name; ListErrorBanner on fetch failure. Guard: verify-driver-hub-surfaces-pack.mjs. / PROD-VERIFIED 2026-08-10 entity=USMCA: cash_advance_pending=0 (empty honest); cascade preview wired in FE; healthz=1b3a44d. | — |
| `DHUB-LINK-01` | **UNVERIFIED** | Cash advance forward chain visible (driver → bill/loan → settlement deduction) | REOPEN 2026-08-29 OWNER: unbound prose evidence is not a live proof (no Neon/HTTP/browser artifact). prod_verified false until GUARD packet + live_verified_sha. Prior: FE displays Linked to / Posts as / Pay from / Settlement deduction on cascade preview; driver EntityLink drills to driver detail. Reverse drill from driver profile to pending requests UNVERIFIED until USMCA wire-test creates a pending row. Guard: verify-driver-hub-surfaces-pack.mjs. / PROD-VERIFIED 2026-08-10 entity=USMCA: linkage panel wired; 0 pending rows (honest empty, not missing wire); healthz=1b3a44d. | — |
| `DHUB-VERIFY-01` | **PASS** | Driver Hub module VERIFY-1..8 USMCA live click-through | PROD-VERIFIED 2026-08-10 Cascade CDP 9225, entity=USMCA: clicked overview, scheduler, leave_requests, and reporting; Driver Inbox Reporting rendered 1 request with 100% approval rate; entity remained USMCA with TRANSP-CHECKS=0. Cascade OUTBOX-CASCADE WIRE DHUB-VERIFY-01 PASS. | — |

Desktop audit: —
