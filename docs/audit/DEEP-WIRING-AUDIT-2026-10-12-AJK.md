# Deep wiring audit — A / J / K supporting evidence

CODEX | 2026-10-12 CT | Read-only source review at `3cad5d74d3e750005c988f531315e61a026c1c59`. Exact measurement timestamps belong to the parent audit's production evidence. No application code or production row changed. Paths below are repository-relative. **Production counts pending parent execution; no zero is inferred from source.**

## Confirmed code findings

| ID | Severity | Evidence | Failure scenario / root cause | Required fix | In-flight coverage |
|---|---|---|---|---|---|
| AJK-01 | P0 | `apps/backend/src/dispatch/quick-assign.service.ts:277,327`; `apps/backend/src/dispatch/book-load.service.ts:930,1146,1152` | Quick-assign changes a load from driver A to B and invokes the shared bill helper. The helper returns `already_exists` when recalculated gross equals old gross, before updating `driver_id`. The existing-bill SELECT does not fetch driver identity. A and B at the same pay leave an open bill belonging to A on B's load. This is an executable branch, not a regex candidate. | Compare identity and pay components as well as total; enforce authorized repricing/reassignment of open unclosed bills and refuse immutable ones. | G9 unit/trailer does not cover identity short-circuit. |
| AJK-02 | P0 | `apps/backend/src/maintenance/road-service/tickets.routes.ts:15,32,214,238`; `apps/backend/src/maintenance/road-service/wo-integration.ts:61,112,129` | Ticket API accepts and persists `vendor_bill`, `driver_advance`, or `cc`; create-WO does not even SELECT payment_method and always sets vendor_invoice then creates an unpaid A/P bill. A card/advance-paid repair can create a vendor liability irrespective of its actual payment source. Current modal defaults to vendor_bill; other API consumers can exercise all declared values. | Route by actual source through existing bill/expense/advance engines; never reinterpret paid service as unpaid. | Not named G1–G15. |
| AJK-03 | P1 | `apps/backend/src/dispatch/book-load.service.ts:3364,1720`; `apps/backend/src/dispatch/geofences/load-geofence-binding.service.ts:52,65,130`; `apps/backend/src/dispatch/load-transition.service.ts:77,97` | Booking discards fence result; missing coordinates produce no selected stop, low precision skips fencing; geocoding is post-commit fire-and-forget. Status transition validates graph and reefer lumper fields but does not require fence readiness before changing status. Cron repair is eventual, not a booking/status fence. | Make required operational transitions depend on resolved stop/fence readiness, with explicit historical exceptions rather than silent best-effort success. | G11 remains incomplete in pinned code; G1/G2 trailer fixes do not cover it. |
| AJK-04 | P1 | `apps/backend/src/mdata/ensure-driver-vendor.shared.ts:139–152`; caller `apps/backend/src/mdata/drivers.routes.ts:1077` | If driver has no linked vendor but another active vendor shares the name, helper returns `already_present` without attaching or creating a driver_id-linked payee. Caller ignores outcome. Name similarity is correctly not used to merge identity, but is incorrectly treated as successful existence. | Return a distinct unresolved-identity result and require explicit review/hard identity resolution before reporting linkage complete. | Not named G1–G15. |
| AJK-05 | P1 | `apps/backend/src/mdata/driver-merge.routes.ts:47,57`; `apps/backend/src/mdata/driver-merge.service.ts:192,200,84–89` | GET merge-preview calls dry-run repointAll, which executes actual UPDATEs and then rolls back each savepoint. GET acquires write locks and runs update triggers; transaction rollback is not a read-only implementation. Audit must not call this GET. | Use SELECT/catalog conflict simulation for preview or explicit isolated execution; keep GET genuinely read-only. | Not named G1–G15. |
| AJK-06 | P1 | `apps/backend/src/maintenance/road-service/tickets.routes.ts:17–34,200`; `apps/backend/src/maintenance/road-service/wo-integration.ts:99–117`; `apps/backend/src/maintenance/two-section-service.ts:247,757` | Ticket contract does not capture load/trailer; conversion omits load_id and roadside_breakdown_load_id despite WO fields supporting them. Thus a roadside repair on a load reaches the WO/bill path with NULL load rather than proven attribution. Unit/vendor do carry through. | Resolve and persist actual event load/trailer at ticket creation; pass links to WO and accounting writer, explicit N/A only when supported. | Generic G8 posting propagation cannot recreate source linkage absent here. |
| AJK-07 | P1 | `apps/backend/src/maintenance/road-service/wo-integration.ts:14–35,91,124`; `apps/backend/src/maintenance/two-section-service.ts:603–647` | Category lookup chooses oldest matching road/repair, otherwise oldest arbitrary company category. This is confirmed silent category selection. **Do not infer wrong GL from this alone:** bill account is independently resolved using category_kind maintenance. | Require mapped service item/category rather than arbitrary oldest category. | Not named G1–G15. |
| AJK-08 | P1 | `apps/backend/src/maintenance/two-section-service.ts:802–834`; `apps/backend/src/maintenance/road-service/wo-integration.ts:145–154` | Bill GL is feature-gated; PostingEngineError is audited but swallowed; ticket then becomes `invoiced` regardless of posting completion. Local guard explicitly requires this non-fatal behavior. | Distinguish created/unposted from posted and expose durable retry/failure; prove GL separately before financial completion. | Verify flag/live unposted count before quantifying impact. |
| AJK-09 | P1 | `apps/backend/src/legal/legal-money.service.ts:113,204–216,325–338`; `apps/backend/src/accounting/bills.service.ts:2920,3175` | Legal matter loader reads its load_id, but both reserve and fee/retainer createBill calls omit loadId while passing unit/driver/matter. Shared bill engine stamps load only when input.loadId exists; matter linkage is a separate pointer, not propagation. | Pass and validate the source matter's actual load into bill header/lines or explicit legitimate exemption. | Not named G1–G15; G8 cannot propagate a missing source load. |

### Additional risks requiring live-schema or policy confirmation

- G9 `driver_finance.driver_bills` physical snapshot is not present in either booking INSERT (`book-load.service.ts:1249,1335`). `202615781200_document_links_refused_at_db.sql:74` guards **accounting.bills**, not driver_finance.driver_bills; `202615770910_driver_bill_non_owned_trailer.sql:9` also alters accounting.bills. A claim entry alone is not applied schema. Live columns/triggers must decide whether another backstop fills these fields.
- `quick-assign.service.ts:327` mints/reprices before writing incoming trailer assignment history at 341: a new bill snapshot resolver reading history at mint would see the previous trailer. G9 must cover this order as well as adding fields.
- Active-unit exclusion helper performs SELECT then load UPDATE without locking a shared unit (`dispatch/unit-active-load-guard.ts:65`). Different-load concurrent assignments can both pass unless an actual live unique/exclusion/locking trigger prevents it. No matching constraint found in inspected migration searches; do not claim production race reproduced.
- Driver merge dynamically updates every discovered reference by driver UUID, without an operating-company predicate (`driver-merge.service.ts:84,88`). Parent driver lookup is scoped; child mutation is not. Shared-authorized drivers make this a cross-company-capable writer. Do not query frozen-company rows to investigate it.
- Merge preview/execute do not compare a hard identifier (`driver-merge.service.ts:163–225,244`); route permits any two scoped IDs and optional override reason (`driver-merge.routes.ts:15,66`). Owner-only is enforced. Determine whether current Owner merge approval is the explicit ruling exception before labeling a law violation; no automatic merge was executed.

## A. Per-writer map (read, not exercised)

| Entry / route | Service and SQL | Canonical tables / links / DB evidence | Posting and flags | Guard evidence / production |
|---|---|---|---|---|
| Load Wizard via frontend `api/dispatch.ts`; POST `/api/v1/dispatch/loads`, `dispatch/loads.routes.ts:1722,1779` | `bookLoad:1682` -> `bookLoadOnClient:1659` -> `createLoadWithFullSideEffects`; INSERT `book-load.service.ts:2852`; history3125/3157; bills1249/1335 | mdata.loads, load_stops, dispatch.load_charge_lines/load_assignment_history, driver_finance.driver_bills, presettlement links, audit/outbox. Company/body membership; unit owner/lease lookup1909; trailer choice resolve1789. Core migration `0034_loads_schema.sql`, history`0100_p5_f3_quicksave_assignments.sql`. Trailer_choice required for live_feed1635; historical only validates if supplied. | Booking not a new GL implementation; shared driver-bill/settlement machinery. Later delivery invokes existing posting hooks. Flag state PROD CHECK PENDING. | Geofence-service-layer local PASS; no end-to-end writer executed. |
| Edit PATCH `/api/v1/dispatch/loads/:id`, `loads.routes.ts:1857` | `update-load.service.ts`; fence rebind1013 | Canonical loads/stops; separate writer intentionally updates existing records. Per-field edit semantics not exhaustively reviewed. | Posting/repricing side effects need runtime proof. | NOT fully audited. |
| Quick-assign / quicksave, `quicksave.routes.ts` | `quick-assign.service.ts:59`; loadUPDATE277; presettlement309; bill327; history341; draft completeUPDATE533 | Shared bill linker, but assignment writes separately. Company membership68; load locked83; history canonical; incoming trailer-history occurs after mint. | AJK-01 money-identity defect; no GL at assignment itself. | PROD CHECK PENDING; see SQL below. |
| PATCH `/api/v1/dispatch/loads/:id/transition`, `loads.routes.ts:1991` | `load-transition.service.ts:28`; scoped FOR UPDATE46; CAS UPDATE97 | Graph, reverse reason73, reefer lumper85, stop stamp/posting side effects later. No fence readiness check. | Existing after-commit money hooks; no new math. | G11 NOT proven fixed. |
| Bulk `/api/v1/dispatch/loads/bulk-update`, `loads-bulk.routes.ts:372`; reassign `/api/v1/loads/:loadId/reassign`, `dispatch-refinements.routes.ts:157` | Separate bulk status logic `loads-bulk.routes.ts:140–238`; shared cancellation for cancel; deliverystamp183 and moneyhook197 | Additional paths named, not assumed identical merely because helpers overlap. | Review each forward/reverse edge still outstanding. | UNVERIFIED full branch coverage. |
| After-book and scheduled geofence sync | `book-load.service.ts:1720`; `telematics/load-stop-geofence-sync.service.ts:56,84,98`; cron registered index502 | geo.geofences INSERT binder116; coordinate-precision skip65; retire UPDATEsync101; load links encoded in fence labels; stops join scoped parent. | No JE. External Samsara outbox is a write; not exercised. | `10407-verify-book-load-geofence-service-layer` wired; guard PASS locally but not ready-at-booking assertion. |

G2 is present in source: `settlement-creator-seed-loads.ts:326–330` resolves trailer and type before looping/book; passes `trailer_choice`427 and equipment type428. Transaction-safe caller path `bookLoadOnClient` exists. No production claim without parent evidence.

## J. Hubs / lifecycle map

| Writer | Route / SQL anchors | Links / constraint / outstanding proof |
|---|---|---|
| Driver create | `mdata/drivers.routes.ts:914` INSERT; subaccounts1036/1044; ensureDriverVendor1077 | Canonical drivers -> identity user, operating company. Dedicated driver-vendor FK resolution `ensure-driver-vendor.shared.ts:68`; INSERT183 stamps driver_id/type/category. Name collision AJK-04; best-effort provisioning catch1051/1085. Live active drivers without linked vendor query supplied. |
| Driver merge | `mdata/driver-merge.routes.ts:66` Owner-only POST; execute service236; repointAll88; retire353 | Dynamic FKs/UUID columns; escrow via createJournalEntryOnClient275 + escrow service290,294; vendors fold309; advance link retirement317. Broad child scope and GET writes noted. No merge executed. |
| Vendors | `mdata/vendors.routes.ts:590` create, SQL692; PATCH815 SQL943; deactivate983; reactivate1061 | Canonical mdata.vendors; driver vendor special writer also exists. All field-level and unique constraint behavior NOT fully audited. |
| Customers | `mdata/customers.routes.ts:753` create SQL885; PATCH1158; deactivate1533; reactivate1592 | Canonical mdata.customers; base migration0008; other bulk/reclassify paths found. No claim every duplicate route verified. |
| Trailers | `mdata/equipment.routes.ts:252` createSQL278; status417 SQL449; edit481 SQL597; deactivate658 SQL698 | Canonical mdata.equipment, owner/lease scope rather than assumed operating_company_id. Load trailer lives in assignment history/source/non_owned fields, not invented loads.trailer_id. |
| Locations | `mdata/locations.routes.ts:282` createSQL311; edit502 SQL591; deactivate933 SQL965; contacts686/755/840/879 | Canonical mdata.locations; contact and geofence reverse links require additional end-to-end tests. |

Base hub schema: `db/migrations/0008_mdata_init.sql:42,98,126,154,186`. Later applied constraints and trigger definitions must be read live; initial migration alone is not actual current schema. org.companies, identity.users, catalogs CRUD are inventoried by parent/global audit, not fully reviewed in this slice.

## K. Roadside and maintenance map

| Entry | Route/service/SQL | Links / ledger / guard |
|---|---|---|
| `pages/maintenance/RoadServiceTicketModal.tsx:59` submit -> `hooks/useRoadServiceTickets.ts:71` | POST tickets.routes160; entity validation170; INSERT200; audit244 | Requires vendor/unit, optional driver. Tickets schema `202606281020_road_service_tickets.sql:4` and WO roadside fields`0098_p5_f1_roadservice_bucket.sql:22`. No load/trailer in request. |
| Complete hook80 | PATCH tickets/:id/complete route270; UPDATE281 | on_scene/completed time, work/parts/cost; open-only WHERE292. Does not create bill automatically. |
| Create-WO hook94 | POST tickets/:id/create-wo route312 -> wo-integration38 -> createWorkOrderWithLines128 -> autoCreateBillFromWO129 -> ticket backlink145 | Locks ticket81; repeat idempotency88; CAS backlink152. Unit/vendor/driver survive to WO; load absent. Bill poster two-section-service808, flag BILL_GL_POSTING_ENABLED. Category and source defects above. |
| Bill-line copy | two-section-service603 account resolution -> INSERT625 | Account mapped separately from category; bill lines lack selected actual product item in this path. Category fallback does not alone establish wrong GL. |
| Driver reverse UI | `pages/drivers/DriverProfilePage.tsx:729`; `pages/home/DriverHubOverview.tsx:44`; vendor `VendorDetail.tsx:911` | Road-service reverse readers exist. Do not repeat old claim 'no driver hub surface'. Driver issue report -> roadside ticket conversion not fully re-audited. |

`autoCreateBillFromWO` dates every auto bill CURRENT_DATE and +30 days (`two-section-service.ts:759`), not ticket event/invoice date. Historical roadside conversion can therefore use conversion date; document-date policy needs explicit confirmation.

## Guard measurements (local static only, not CI or prod)

### Additional K chains read (bounded)

| Engine | Entry / shared writer / DB / links | Verdict |
|---|---|---|
| Monthly lease bills | POST `leases/lease.routes.ts:203` -> generateLeaseBills `lease-bill-engine.service.ts:154` -> shared createBill178; line account/unit/equipment/class/lease refs193–201; explicit `LEASE_RENT_NOT_LOAD_COST` exemption196; unique live key `202615190000_lease_engine_contract_bill_linkage.sql:78`. Existing bill branch retries ASC842 period posting167; error exposed as refused148. | Canonical bill reuse and per-asset links present; live schedules, flags and posted ties pending. No assertion of code defect from intentional load exemption. |
| Insurance scheduled bills | `insurance/policy-bill-schedule.service.ts:235` -> shared createBill with mapped insurance expense account243 -> INSERT insurance.payment_schedule260 with opco/policy/bill. Compensating void of already committed bills280 on schedule failure. | Existing document engine, not new handwritten JE. All policy routes/transaction interleavings and asset cost allocation unverified. |
| Legal reserves/fees | POST `/api/v1/legal/matters/:id/reserve` `legal/matters.routes.ts:299`; `/legal-fee`334 -> legal-money204/325 shared createBill; reserve reductions voidBill231. `202612130000_bills_legal_matter_linkage.sql:32` FK; reverse costs reader bills.service4186 combines bills/expenses. | Matter/vendor/unit/driver wired; source load omitted AJK-09. |

Additional AJK-09 production query (read-only and USMCA):

```sql
SELECT count(*) AS legal_bills_not_carrying_matter_load
FROM accounting.bills b JOIN legal.matters m
ON m.id=b.legal_matter_id AND m.operating_company_id=b.operating_company_id
WHERE b.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80'
AND b.voided_at IS NULL AND m.load_id IS NOT NULL
AND b.load_id IS DISTINCT FROM m.load_id;
```

Executed on pinned tree with no DB connection:

```text
verify-driver-merge-engine SELFTEST OK — 5/5
verify-driver-merge-engine OK
verify-wo-auto-bill-posts-gl --selftest PASS — 4/4 offenders caught, baseline clean
verify-wo-auto-bill-posts-gl OK
verify-book-load-geofence-service-layer OK
exit 0
```

Wired steps:18357 driver-merge,9780 WO-bill-GL,10407 booking-geofence. Static green does NOT refute findings: driver-merge guard explicitly checks savepoints but not GET-read-only; WO guard explicitly checks non-fatal posting catch. Main CI execution state NOT measured in this subaudit.

## Read-only SQL for parent execution

Run on production **inside BEGIN READ ONLY; SET LOCAL app.bypass_rls='lucia'; ... ROLLBACK**. No frozen-entity data. Inspect live columns before using pending fields. Do not call merge-preview GET.

```sql
-- AJK-01 solo open bill / assigned-driver mismatch. Does not infer team allocation error.
SELECT count(*) AS mismatched_solo_open_driver_bills
FROM driver_finance.driver_bills b JOIN mdata.loads l ON l.id=b.load_id
AND l.operating_company_id=b.operating_company_id
WHERE b.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80'
AND b.status='open' AND b.voided_at IS NULL AND l.soft_deleted_at IS NULL
AND b.team_driver_id IS NULL AND l.team_id IS NULL
AND b.driver_id IS DISTINCT FROM l.assigned_primary_driver_id;

-- AJK-02 actual paid-source ticket with a bill link (inspect bill status before final dollar claim).
SELECT payment_method, count(*) AS tickets, count(bill_id) AS with_bill
FROM maintenance.road_service_tickets
WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80'
AND payment_method IN ('cc','driver_advance') GROUP BY payment_method;

-- AJK-04 active-driver payee links, no names or other companies read.
SELECT count(*) AS active_drivers_without_linked_active_vendor
FROM mdata.drivers d WHERE d.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80'
AND d.deactivated_at IS NULL AND NOT EXISTS (
 SELECT 1 FROM mdata.vendors v WHERE v.operating_company_id=d.operating_company_id
 AND v.driver_id=d.id AND v.deactivated_at IS NULL);

-- AJK-06 created WO from ticket missing load.
SELECT count(*) AS linked_roadside_wos_missing_load
FROM maintenance.road_service_tickets t JOIN maintenance.work_orders w
ON w.id=t.wo_id AND w.operating_company_id=t.operating_company_id
WHERE t.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80' AND w.load_id IS NULL;

-- G11 coordinate population; not proof absence of every type of location fence.
SELECT count(*) AS operational_stops_missing_coordinates
FROM mdata.load_stops s JOIN mdata.loads l ON l.id=s.load_id
WHERE l.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80'
AND l.soft_deleted_at IS NULL AND s.soft_deleted_at IS NULL
AND l.status::text IN ('assigned','assigned_not_dispatched','dispatched','at_pickup','in_transit','at_delivery')
AND (s.latitude IS NULL OR s.longitude IS NULL);

-- Read structure only; do not confuse accounting.bills with driver_finance.driver_bills.
SELECT table_schema,table_name,column_name,is_nullable FROM information_schema.columns
WHERE (table_schema,table_name) IN (('driver_finance','driver_bills'),('maintenance','road_service_tickets'))
ORDER BY 1,2,ordinal_position;
SELECT t.tgname,pg_get_triggerdef(t.oid) FROM pg_trigger t
WHERE t.tgrelid='driver_finance.driver_bills'::regclass AND NOT t.tgisinternal;
```

## Explicit coverage limits

### Parent production evidence received during this review

Parent audit reports deployed backend SHA `90398860f5d63ae4ac887d462d894a775c8ef69f`, different from this source pin. Its Q007 measured zero roadside tickets (repeat pending at message time); its open-solo driver-bill eligibility population was zero, therefore mismatch zero is **no exercised population**, not proof AJK-01 is fixed. Parent's live column read confirmed `driver_finance.driver_bills` has no unit/trailer columns. Its Q003 measured 148 loads and three without a nonvoid driver bill: 13530,13532 (no history),13595 (only void history). This slice does not infer why those documents are absent. Refer to parent saved query outputs for exact timestamps and repeated-zero checks.

### Additional database / reverse-reader anchors

- Driver bills base `db/migrations/0141_p6_t11172_driver_finance_driver_bills.sql:12` has NOT NULL entity/load/driver, load FK ON DELETE RESTRICT, driver FK, unique bill_number; settlement lines source_driver_bill_id FK at70 and unique partial source index89. These enforce existence, not bill driver matching assigned driver.
- `db/migrations/202607750000_guard_holds_driver_vendor_billable_credit_idempotency.sql:48` unique index `uq_vendors_driver_active_per_company` only constrains linked active vendors; it does not require every driver to have one.
- Ticket vendor originally referenced retired qbo_vendors, but **was corrected** by `db/migrations/202609100000_mnt_link_04_maintenance_vendor_ap_link.sql:114–121` to `fk_road_service_tickets_vendor_mdata`. Do not report the original migration's retired FK as current defect. RLS FORCE migration `202606282300_force_rls_orphaned_relocated_tables.sql:29`.
- Trailer source CHECK `db/migrations/202615790910_load_trailer_source_none.sql:17–23` permits NULL or company/customer/none; explicit-none forbids non_owned ID. This is not a database NOT NULL trailer-choice fence.
- Driver bill detail reader `apps/backend/src/driver-finance/driver-bills.routes.ts:335–353` returns bill/load/driver with same-company joins and role-based driver-load access at361. Load Cost board reads canonical expense and driver-bill families (`accounting/load-costs-board.routes.ts:97,177,239,265`) and assignment-history trailer at364. Separate rollup reader `accounting/load-cost-rollup.sql.ts:104,120` reads expenses and driver bills. A wrong bill-driver link therefore reaches reports; it is not isolated metadata.
- Actual merge preview is invoked by `apps/frontend/src/pages/drivers/DriverDuplicatesPage.tsx:41`; merge execution49; API `apps/frontend/src/api/driverMerge.ts:21`. The GET-writing observation is reachable from the screen, not an unused helper.

This slice deeply traces booking/bill mint/quick-assign, fence lifecycle, driver-vendor/merge, and roadside-WO-bill paths. It is **not an assertion that every A/J/K route was audited**. Cancellation reversal details, load-number reservations, all mileage calculators, stops/geocoding precision algorithms, planner variant writers, safety/legal/insurance/lease money chains, IFTA aggregation, dashboards/KPIs, fixed monthly cost writers, identity/company/catalog CRUD and every QBO mirror reader still need dedicated end-to-end review. Files for these families were discovered, not mislabeled passed. No unknown count is presented as zero and no repository comment's historic measurement is reused as current evidence.

## Supplemental A/K review

CODEX | 2026-10-12 10:47 AM CT (2026-10-12 15:47Z) | Same pinned source, no writes or mutation calls. The following extends, rather than retroactively claiming completeness for, the coverage above.

### Additional confirmed source failures

| ID | Severity | Trace and precise failure | Live impact / proposed correction |
|---|---|---|---|
| AJK-10 | P0 | `dispatch/cancellation.routes.ts:173` calls `approveCancellation`; mounted `index.ts:1021`. The initial request skips the whole document cascade while pending owner approval (`dispatch/cancellation.service.ts:294`). Approval at890–951 updates cancellation and load, calls **only** `settleRevrecOnCancel`929, audits and returns. That helper (`accounting/revrec-delivery-posting/poster.service.ts:788–811`) handles revenue-recognition latch entries only. It cannot perform the driver bill/settlement/expense/fuel/vendor-bill/invoice cascade present in the direct-approved branch. `202615180900_load_cancellation_reversal.sql:34–72` metadata trigger likewise only stamps load cancellation metadata. | Parent Q024 at15:46:10Z and Q025 at15:46:25Z found **0 USMCA cancellation records twice**; latent code failure, not claimed live loss. Share one finalization transaction between immediate approval and later approval, including billable charge and paid-document refusal. Test approval after request against the same artifact graph as immediate cancellation. |
| AJK-11 | P0 | Direct billable approved cancellation first creates a TONU invoice (`cancellation.service.ts:203–214`), linked to this load and status draft (`cancellation-tonu-invoice.ts:134–153`), then the same transaction selects **every** load invoice whose status is not void (`cancellation.service.ts:635–637`) and voids each (`:673–693`). There is no exclusion for the just-created charge invoice or invoice_type cancellation_tonu. | Same repeated cancellation population0; TONU feature flag gates exposure. Newly earned cancellation charge is immediately selected for cancellation. Exclude explicitly retained cancellation-charge documents by canonical identity and exercise create+cancel transaction in isolated DB. No production test requested. |
| AJK-12 | P1 | Civil fine conversion creates driver liability (`safety/fines.routes.ts:508`), posts through existing poster549 and creates settlement deduction554, then writes backlink569. The **dismiss** route649–677 changes source fine to dismissed with no converted-liability refusal or unwind. In contrast, reduce698–762 explicitly blocks converted fines to prevent the exact stale-receivable problem. UI `pages/safety/components/FineLifecycleActions.tsx:79–90` blocks status actions only for voided records; conversion blocks reduce only. | Dismissed fine can remain a posted/collectible driver receivable and deduction. Live count not measured by this agent. Refuse dismissal until dependent recovery is properly reversed, or invoke existing approved reversal workflow atomically. Do not merely change the fine label. |
| AJK-13 | P1 | UI `pages/reports/tax-regulatory/IftaPreparer.tsx:58` → API `api/reports-ifta.ts:48` → POST `/api/v1/reports/ifta/prepare` (`reports/ifta/routes.ts:44–56`) → `prepareFiling` (`reports/ifta/quarterly-preparer.service.ts:104`). Its UPSERT116–129 unconditionally resets any existing same-quarter filing to draft and clears approved_by/approved_at/filed_at/confirmation_number. No existing-status gate in route/service. Table has unique company/quarter (`202606080205_ifta_filings.sql:6`). | Re-preparing a filed quarter destroys its current approval/filing evidence in place. No filing was prepared here. Refuse or create a versioned amendment preserving filed record; prove database lifecycle fences before deciding whether deployed database blocks source defect. |

### Remaining dispatch and reporting paths traced

| Path | Source evidence and observed contract | Limit of evidence |
|---|---|---|
| Reservation → load number | `dispatch/loads.routes.ts:812` reserve endpoint; frontend `api/dispatch.ts:294`; `load-id-reservation.service.ts:272` scoped/user-owned reservation renewal; :445–454 row-lock checks ownership/status/expiry; :493–509 consumes with same company/user/status predicate; atomic allocator uses `lib.next_trace_no`153 and checks occupied load numbers161. | No concurrent reservation executed. No gap-free-number promise inferred. |
| Pre-settlement suggestion → confirmation → tour | `dispatch/presettlement-link.service.ts:332–383` locks current load and suggestion and refuses changed driver. :456 inserts load-bookended settlement with first load/driver/period; :483–535 locks existing target, verifies driver/unit and reopens continuation through existing service. :541 writes both load.presettlement_link_id and tour_id. Booking entry618; assignment entry689. | No production assignment or continuation executed. Remaining alternate writers and every cron not exhaustively traced. |
| Fence detector → stop evidence | `telematics/geofence-detector.service.ts:159` event INSERT; :210–245 scoped load/unit/geofence-label join and compare-and-set arrival/departure timestamps, preserving already-set stamps; :198 suppressOperationalSideEffects stops writes beyond event. | Event → every stop and stale-state eligibility needs runtime fixtures. Source does not prove every observed GPS point reaches detector. |
| Final stop → automatic delivered status | `dispatch/geofence-auto-delivery.service.ts:29–44` picks final delivery with departure evidence and eld_geofence arrival provenance; :51–65 canonical transition dispatched→in_transit→delivered_pending_docs. `cron/geofence-auto-delivery.cron.ts:27–44` one transaction per load; :49 schedules every15min; mounted `index.ts:1636`. Only writes when AUTO_DELIVERY_FROM_GEOFENCE_APPLY=true. | Live flag not inspected. Candidate pickup_departed and arrival-versus-departure provenance deserve isolated tests; not declared defect from variable presence alone. |
| Fence → Samsara | `outbox/handlers/samsara-create-geofence.handler.ts:20` handler; external address creation around71 uses unique externalIds.ih35Site, then scoped `geo.geofences` projection88, throws if not persisted. | No external API POST was made. End-to-end retry/external-id recovery not exercised. |
| Miles/lane learning | `dispatch/load-lane-learning.service.ts:235` first-stop deadhead; :296/:373 writes stop leg miles; :390 learns lanes; :583/:595 scoped lane aggregate; :639/:648 customer lane; :690 relearns only module-owned legs. `cron/real-driven-miles-segments.cron.ts:20` mounted index1634. | Source writes identified, not a proof of numerical accuracy or no double counting. Routing provider calls not made. |
| Deadhead rollup | `reports/deadhead-refresh.job.ts:18` scoped refresh; :25 schedule Monday03:00 CT; scheduler/jobs.index.ts:10 mounts. Header identifies unique company/unit/week DB key migration202615300900; queries active company list before separate scoped transactions. | We did not execute cron or inspect frozen entities. Runtime activation and all report readers unverified. |
| Safety receipts/fines/recovery | `safety/fines.routes.ts:282/328` creates civil fine; convert447→liability508→poster549→deduction554→backlink569. `safety/safety-v5.routes.ts:260/292` creates internal fine;315 liability;343 poster;348 deduction;366 backlink. Accidents `safety.routes.ts:1116/1212/1248/1258` same document-backed recovery chain. | No blanket assertion of missing posting: these source paths **do post** through existing engine. Dismiss gap above is distinct. Citation attachments and all decline/void branches remain unreviewed. |
| IFTA fuel/miles → filing | `reports/ifta/mileage-aggregator.service.ts:15` delegates canonical state miles; fuel aggregator12 delegates state gallons; quarterly-preparer108–110 joins calculated jurisdictions,116 persists filing. Mounted reports/index.ts:54. `ifta/ifta-state-gallons-aggregator.ts:65–70` filters archived_at and taxable fuel types diesel/gas, excluding DEF. | Gallons query lacks explicit voided_at filter. **Pending DB lifecycle verification**, not yet a confirmed count defect: archived_at may co-vary with voiding. Parent requested relevant readonly schema/current-population check. |

Guard wiring inspected: cancellation identity verify-step16177 and approver/billable3813 assert writes/actor/backlink, not both full approval branches; safety lifecycle step1502 checks wiring, not dismissed-converted recovery; IFTA `verify-ifta-quarterly-preparer.mjs:51` presence checks persistence. No mutation tests for AJK-10..13 were run and no passing guard is claimed for them.

Readonly follow-up shapes (parent owns safe execution; actual columns/triggers must be checked first): USMCA civil_fines where status=dismissed and converted_to_liability_id nonnull joined to current liability/deduction; reports.ifta_filings grouped by status plus triggers on that table; taxable fuel rows voided_at nonnull and archived_at null; cancellation charge_invoice_id joined invoice_type/status. No historical closed-period re-derivation and no non-USMCA population inspection.

Still unreviewed in this slice: all alternative planner/load writers; every dashboard/KPI; stop precision/provider fallback under failures; every geofence worker/outbox retry; all mileage numerical cases; company/identity/catalog CRUD; every attachment chain; all safety contest/void/payment variants; all fixed/monthly allocation writers and QBO mirror readers. Insurance duplicate-bank-row investigation belongs to parent. This supplement supplies additional source failures, not an exhaustive clean bill of health.

CODEX | 2026-10-12 10:47 AM CT | Parent live evidence update: Q026 at15:47:14Z and Q027 at15:47:47Z found USMCA civil fines **0 twice** and voided-but-unarchived fuel **0 twice**. IFTA filings **1, draft**, not filed. AJK-12 and13 therefore remain source failure scenarios, not observed financial/compliance incidents. Missing void predicate in IFTA fuel reader has zero measured exposed rows; no historical amount or actual overstatement is claimed.
