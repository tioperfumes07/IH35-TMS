# ROUND 297.5 — Road-service chain and test-survivor audit

CODEX | 2026-09-30 2:11 PM CT (19:11Z) | X-17 / X-18 | READ-ONLY AUDIT

## Scope and evidence

Audited source: main `caf3bf2ee8`. GitHub independently confirms #23417 MERGED at
2026-09-30 1:22 PM CT, squash `e6fb124606ff069b131e791947f9f7fc1b003daf`;
there is no conflicting open #23417 to rebase. This PR changes documentation only.
No application code, migration, financial data, status, or survivor row changed.

Live metadata and row reads: Neon project `tiny-field-89581227`, branch
`br-fancy-credit-akjnd07a`, database `neondb`, USMCA
`5c854333-6ea5-4faa-af31-67cb272fef80` only. Each connector transaction began with
`SET TRANSACTION READ ONLY`, then `SET LOCAL app.bypass_rls='lucia'` and
`SET LOCAL app.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80'`.
The server reported read_only=on. Counts were read independently after the row inventory:
2026-09-30 **2:11:23 PM CT (19:11:23.474Z)**. These reads address the expressly authorized
survivor population, not a reopening of closed-period financial reconciliation.

The connector reported ih35_app on the metadata transaction and neondb_owner on the
count transaction. A subsequent attempt to require **ih35_ci_readonly** returned
`NeonDbError: permission denied to set role "ih35_ci_readonly"`.
No alternative privilege path was attempted after that refusal. The existing audit results
are not a successful read-only-role guard execution. X-19 live execution remains separately
unverified until the configured connector/credential permits that role.

## X-17: every requested chain link

### 1. Driver app → roadside ticket: MISSING

EXISTS: driver issue submission, photos, optional load and GPS:
`apps/frontend/src/pages/driver/ReportIssueModal.tsx:60` prepares media/GPS and
line 87 calls submitDriverReport. `apps/frontend/src/api/driver.ts:94` is that caller.
`apps/backend/src/driver/reports.routes.ts:29` accepts the driver-session POST;
line 72 inserts **maintenance.driver_reports**, not road_service_tickets.

MISSING: conversion from this report to road_service_tickets. The maintenance review
handler only updates report status/review notes
(`apps/backend/src/maintenance/driver-reports.routes.ts:96`, update at 107).
Repo search across backend/frontend found the only non-test ticket INSERT at
`apps/backend/src/maintenance/road-service/tickets.routes.ts:198`.
It belongs to the separate authenticated maintenance POST (159), requiring company,
ticket number, vendor and unit (17–34), consumed by
`apps/frontend/src/pages/maintenance/RoadServiceTicketModal.tsx:64`.
No driver-report bridge or dedicated driver-ticket caller was found. This does not
claim the generic authenticated route categorically rejects a driver who independently
has permissions; it establishes the missing driver-app workflow.

EXISTS: route mounting at `apps/backend/src/index.ts:1213`.

### 2. Event timestamps: EXISTS partially; two different shapes

Ticket schema: `db/migrations/202606281020_road_service_tickets.sql:13` has
call_time, on_scene_time, completed_time; lines 33–35 have created_at, completed_at,
updated_at. Live information_schema confirms those fields and **no**
reported_at, dispatched_at, arrived_at, departed_at or odometer field.

Ticket open defaults call_time to server/application now
(`tickets.routes.ts:230`). Completion accepts on_scene_time/completed_time
(`tickets.routes.ts:49`) and writes completed_at=now
(`tickets.routes.ts:279`). No dispatch/depart event endpoint was found.

WO has roadside_callout_at, roadside_arrived_at, roadside_response_minutes, confirmed
live; the response calculation is defined at
`db/migrations/0098_p5_f1_roadservice_bucket.sql:29`.
The bridge maps ticket call_time/on_scene_time into WO callout/arrival at
`apps/backend/src/maintenance/road-service/wo-integration.ts:114`.
Thus **two shapes exist**, with a partial conversion—not a unified four-event timeline.
Completion time is not evidence of departure. The frontend completion mutation does
not even send the optional on-scene/completion timestamps:
`apps/frontend/src/hooks/useRoadServiceTickets.ts:77`.

### 3. Odometer captured when the ticket opens: MISSING

Neither the live ticket columns nor create payload/INSERT include odometer.
The complete create writer is `tickets.routes.ts:167` through 254; its data reads
validate vendor/unit/driver membership, not telemetry. GPS coordinates are optional
manual input, not odometer capture. The WO bridge header at `wo-integration.ts:99`
also supplies no odometer.

### 4. Driver receipt → docs.files → ticket → bill: MISSING end-to-end

EXISTS: driver photos are uploaded with putObjectBytes to
org/{company}/driver-reports/{report}/photo-N paths at
`apps/backend/src/driver/reports.routes.ts:92`; those strings are stored in
driver_reports.photo_r2_paths at line 113.

MISSING: this handler does not INSERT docs.files or link the upload to a ticket.
EXISTS only as a separate capacity: ticket attached_doc_ids uuid[] accepted at
`tickets.routes.ts:33`, inserted at 213/237; original DDL line 29 is an array,
not a docs.files FK. The ticket UI's complete submission at
`RoadServiceTicketModal.tsx:64` includes no upload or attached_doc_ids.
The full modal at lines 80–171 contains no file input.
The bridge SELECT at `wo-integration.ts:61` does not fetch attached_doc_ids and
the bill call at 129 does not forward attachments. The bill creator at
`apps/backend/src/maintenance/two-section-service.ts:679` copies accounting
lines (753), not these receipt documents.

Breaks: driver upload → docs.files; report → ticket; ticket attachments → WO/bill.

### 5. Closed ticket → cost document → GL: EXISTS conditionally, not automatic

MISSING on completion alone: PATCH complete updates the ticket only
(`tickets.routes.ts:268`–307).
EXISTS as an additional operator action: POST create-wo at line 310 calls
createWorkOrderFromRoadServiceTicket. The list's Create WO button calls it at
`apps/frontend/src/pages/maintenance/RoadServiceList.tsx:110`.

The bridge locks the ticket (wo-integration.ts:77–81), returns its existing link
at 87, builds a complete repair WO (99), calls createWorkOrderWithLines (128)
and autoCreateBillFromWO (129), then links ticket→WO/bill at 145.
Bill INSERT is `two-section-service.ts:700`; status unpaid at 721;
line copy at 753. **GL path exists**: BILL_GL_POSTING_ENABLED (constant at 15,
flag read 765) gates postSourceTransactionInClientTx with source type bill (771).
PostingEngineError is audited as gl_post_failed, not propagated (784–796).
Therefore source does **not** guarantee every completed ticket posts a JE.

Additional evidenced gaps, not changes:
- Ticket payment_method supports vendor_bill/driver_advance/cc (tickets.routes.ts:15),
  but bridge SELECT/header never branches on it; it always creates a vendor bill.
- Expense category resolution falls back to the company's oldest category
  (`wo-integration.ts:31`), not a proven road-service account mapping.
- Ticket has no load field; bridge header (99–117) supplies no load, trailer or
  receipt IDs. The bill SELECT reads WO.load_id (two-section-service.ts:720),
  which this bridge did not supply.
- The two live tickets are open, with null wo_id/bill_id/attached_doc_ids;
  no live completed-ticket posting claim can be made from them. No fixture was created.

### 6. Driver Hub reader: EXISTS

`apps/frontend/src/pages/home/DriverHubOverview.tsx:41` queries open
road_service_tickets; lines 97–102 render a Road service alert linking maintenance.
It is review-role gated at 46/61, not a driver submission form.
A driver's profile Maintenance tab also renders a driver-filtered
RoadServiceReverseSection at
`apps/frontend/src/pages/drivers/DriverProfilePage.tsx:683`.
That component fetches through the hook (RoadServiceReverseSection.tsx:22);
it exposes ticket/unit/vendor/WO/bill links at 37–55.
This is real read-side wiring despite the missing driver-side writer bridge.

### 7. Small tire change at Love's: EXISTS for office; MISSING as complete driver flow

Tire change is an explicit supported service type (`tickets.routes.ts:13`) and
the maintenance modal's default (`RoadServiceTicketModal.tsx:15`,31).
There is no tow/full-breakdown requirement. An office user can choose the real
vendor, unit and optional driver and record that service.
A driver can report a maintenance issue/photos, but the chain to the ticket,
event odometer, arrival/departure, receipt-linked cost and GL remains incomplete
for the same reasons above. It is not correct to say “only full breakdowns work,”
nor to say the requested driver tire-service workflow is complete.

## X-18: exact survivor evidence — no deletion authorization exercised

Confirmed counts: work_orders **15** (all cancelled); severe_repair_estimates
**14** (all draft); parts_inventory **5**; road_service_tickets **2** (both open);
pm_intervals **1**; pm_schedules **1**. Total **38**.
All six live table column inventories lack is_sample_data.

**34 rows have a marker in their own text; 4 estimates inherit evidence through
trigger_wo_id to a WO whose cancel_notes explicitly says test WO.**
Some direct evidence is in notes/cancel_notes rather than name/description.
A strict name/code/label/description-only scanner cannot truthfully claim all 38.
The guard must report the actual field and FK provenance, not label an unrelated
row test merely because it has the same unit.

Query pattern (six explicit tables above, no cross-entity UNION/read):
```sql
SET TRANSACTION READ ONLY;
SET LOCAL app.bypass_rls='lucia';
SET LOCAL app.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80';
SELECT id, to_jsonb(t)
FROM maintenance.work_orders t
WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80'
ORDER BY id;
-- Repeated for each of the six named tables.
SELECT count(*) FROM maintenance.work_orders
WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80';
-- Independent count repeated for each table; 15/14/5/2/1/1.
```

### maintenance.work_orders — 15 rows

| ID | Marker evidence (field = literal value) |
|---|---|
| `12a6f233-b0f2-4380-81a9-a5f8dd03ac6c` | description = TEST-CC3-LIVEVERIFY-20260824 -- WO-Bill FK live-verify (void after proof); cancel_notes = OWNER-WIPE-2026-09-01 test WO; external_vendor_invoice_number = TEST-CC3-LIVEVERIFY-INV-001 |
| `16225997-23bf-47ec-9da3-c8e04e12056e` | description = TEST-CC3-SCENARIO-MAINT-20260825-B -- scenario.maintenance parts+labor via Section B (void after proof); cancel_notes = OWNER-WIPE-2026-09-01 test WO; external_vendor_invoice_number = TEST-CC3-SCENARIO-MAINT-INV-002 |
| `1babcbae-eca2-4ac5-9760-5811255cd12e` | description = TEST-CC3-WOBILL-DEPLOY-PROOF2-20260825 (void after proof); cancel_notes = OWNER-WIPE-2026-09-01 test WO; external_vendor_invoice_number = TEST-CC3-DEPLOY-PROOF2-INV-001 |
| `4b809614-a486-4d27-8f14-6acc19b80b85` | description = WAVE3_TEST_DATA_2026-08-21 -- CC-1 maintenance WO paid-same-day expense proof-of-path (ACCT-F5699 live proof, unit T151, vendor LOVES TRAVEL STOPS); cancel_notes = OWNER-WIPE-2026-09-01 test WO; repair_location = In-house shop -- TEST DATA (WAVE3 proof-of-path) |
| `5950272e-0793-4bc0-a092-224b6bcaf0a8` | cancel_notes = OWNER-WIPE-2026-09-01 test WO |
| `759a16c1-8b4a-466d-b966-fae2050c0530` | description = TEST-CC3-SCENARIO-MAINT-20260825 -- scenario.maintenance closed/parts/labor/A-P proof (void after proof); cancel_notes = OWNER-WIPE-2026-09-01 test WO; external_vendor_invoice_number = TEST-CC3-SCENARIO-MAINT-INV-001 |
| `771e44ae-77ba-4122-a2b0-a255f29cb5fa` | description = CODEX LIVE TEST 2026-08-15 — maintenance triage and convert-to-WO verification GPS: ,; cancel_notes = OWNER-WIPE-2026-09-01 test WO |
| `7ca85f1b-5c32-4558-8b2d-305202e490b3` | description = LIVE-GATE-PROVE trailer WO reverse test (CC-2, going-forward only); cancel_notes = OWNER-WIPE-2026-09-01 test WO |
| `850e2cc4-1578-40c2-b38d-a528f7ea821d` | description = TEST-CC3-BATTERY-20260824 -- in-transit issue promote-to-WO print chain proof (void after proof) GPS: ,; cancel_notes = OWNER-WIPE-2026-09-01 test WO; external_vendor_invoice_number = TEST-CC3-WO-INV-001 |
| `9bfd126b-7b89-49d6-847b-705e1f789e1e` | description = TEST-CC3-GO0032 maintenance WO create-flow proof, safe to leave; cancel_notes = OWNER-WIPE-2026-09-01 test WO |
| `9d1c21f3-3de4-4ab7-b7a0-0265be7a1083` | cancel_notes = OWNER-WIPE-2026-09-01 test WO; repair_complaint = CURSOR U6 TEST-DATA 20260823 in-house repair |
| `a236b27a-fe1b-46eb-aada-005908139666` | cancel_notes = OWNER-WIPE-2026-09-01 test WO |
| `ad7c6b47-68fb-4d4d-a533-161110630348` | description = SAMPLE_BREAKDOWN_RESCUE_JULY · T120 tow to Baytown repair · TEST $860; cancel_notes = OWNER-WIPE-2026-09-01 test WO |
| `cf886b9f-7397-4bb5-a42a-7596f9902277` | cancel_notes = OWNER-WIPE-2026-09-01 test WO |
| `df93878c-6fb3-463a-9cfe-e481d88e14f6` | description = SAMPLE_BREAKDOWN_RESCUE_JULY · T120 breakdown repair near Baytown · TEST $1,210; cancel_notes = OWNER-WIPE-2026-09-01 test WO |

### maintenance.severe_repair_estimates — 14 rows

| ID | Marker evidence (field = literal value) |
|---|---|
| `01e00100-6270-44ef-90c9-85fd0b50ba08` | description = TEST-CC3-LIVEVERIFY-20260824 -- WO-Bill FK live-verify (void after proof) |
| `0c479e44-4ad5-47fe-8a00-3359ffc0e078` | trigger_wo_id = 9d1c21f3-3de4-4ab7-b7a0-0265be7a1083; parent cancel_notes = OWNER-WIPE-2026-09-01 test WO |
| `1e7f4f83-e9aa-4dda-b369-4817d71fc71f` | description = TEST-CC3-SCENARIO-MAINT-20260825 -- scenario.maintenance closed/parts/labor/A-P proof (void after proof) |
| `3372933e-55c5-48e8-8a48-2656dbc51f62` | description = TEST-CC3-SCENARIO-MAINT-20260825-B -- scenario.maintenance parts+labor via Section B (void after proof) |
| `420604f8-e848-462b-b30b-263b3741f883` | trigger_wo_id = 5950272e-0793-4bc0-a092-224b6bcaf0a8; parent cancel_notes = OWNER-WIPE-2026-09-01 test WO |
| `49aded3b-1f71-4dfe-8cd6-3176ea4c9120` | description = LIVE-GATE-PROVE trailer WO reverse test (CC-2, going-forward only) |
| `6be0e6fd-7e90-40cf-8cba-b4f7e558fdd0` | description = WAVE3_TEST_DATA_2026-08-21 -- CC-1 maintenance WO paid-same-day expense proof-of-path (ACCT-F5699 live proof, unit T151, vendor LOVES TRAVEL STOPS); estimate_location = In-house shop -- TEST DATA (WAVE3 proof-of-path) |
| `73c449ae-c3d7-4432-b424-2893856a6208` | description = CODEX LIVE TEST 2026-08-15 — maintenance triage and convert-to-WO verification GPS: , |
| `8b06ae3c-b48d-4049-bf62-5ebf2ed3a2d3` | description = TEST-CC3-BATTERY-20260824 -- in-transit issue promote-to-WO print chain proof (void after proof) GPS: , |
| `8fb2dbe9-0e6f-4790-868a-98e1d5c87732` | description = SAMPLE_BREAKDOWN_RESCUE_JULY · T120 breakdown repair near Baytown · TEST $1,210 |
| `ae8e1992-1bae-4187-9f8a-c92857b6c13e` | trigger_wo_id = a236b27a-fe1b-46eb-aada-005908139666; parent cancel_notes = OWNER-WIPE-2026-09-01 test WO |
| `e2304bfb-d4a2-4fe5-b791-fc2c4b7ac75b` | description = TEST-CC3-WOBILL-DEPLOY-PROOF2-20260825 (void after proof) |
| `f46b8cdf-e8b3-4bad-92f8-e913abf03622` | description = SAMPLE_BREAKDOWN_RESCUE_JULY · T120 tow to Baytown repair · TEST $860 |
| `fbe5fee4-14a8-4a43-a49b-7132b2e4d3d9` | trigger_wo_id = cf886b9f-7397-4bb5-a42a-7596f9902277; parent cancel_notes = OWNER-WIPE-2026-09-01 test WO |

### maintenance.parts_inventory — 5 rows

| ID | Marker evidence (field = literal value) |
|---|---|
| `4eb6dad2-c2f3-4192-91cf-0726cad6d80a` | location = CC3-TEST-BIN-01; part_description = CC3-TEST-PART-CREATE-01 |
| `780c71a9-3469-4b8a-b6eb-6958f7a6c4ae` | part_number = CODEX-LIVE-0815-1300; part_description = CODEX LIVE PART 20260815 1300 |
| `7d66c099-4fc7-454d-855d-b54abc93a6ca` | notes = WAVE3_TEST_DATA_2026-08-21 -- CC-1 inventory WAVE3 proof-of-path (ACCT-F5704). Header+lines + GL-posting both complete live now that the ON CONFLICT predicate mismatch blocking every real parts purchase is fixed.; location = TEST-DATA-shelf; part_number = WAVE3-TEST-PART-20260821; part_description = WAVE3_TEST_DATA_2026-08-21 -- CC-1 inventory proof-of-path (brake pad set, TEST DATA); last_purchase_invoice_number = WAVE3-TEST-INV-0001 |
| `8b351f2e-5648-44c5-abb6-14353f397832` | notes = USMCA post-deploy reorder threshold proof 2026-08-15; part_description = CODEX LIVE REORDER 20260815 1324 |
| `c5c36f4a-d849-4b3a-b5ec-d99eda1cc60a` | part_number = TEST-CC3-BATTERY-PART-20260824 -- PARTS RECEIVE ONTO WO-USMCA-001-IT-08-24-2026-0001-PEND0 (VOID AFTER PROOF); part_description = TEST-CC3-BATTERY-PART-20260824 -- parts receive onto WO-USMCA-001-IT-08-24-2026-0001-PEND0 (void after proof); last_purchase_invoice_number = TEST-CC3-PARTS-INV-001 |

### maintenance.road_service_tickets — 2 rows

| ID | Marker evidence (field = literal value) |
|---|---|
| `3a1bde38-4ab5-4548-9de8-d100161f87e5` | vendor_name = TEST CODEX ONBOARD 20260824; ticket_number = RST-TEST-BREAKDOWN-RELAY-001; initial_complaint = TEST-BREAKDOWN-RELAY: tractor lost power on I-35, possible fuel filter clog |
| `3c22c99d-c1af-4334-a212-4af34903a926` | vendor_name = CURSOR U6 TEST-DATA 20260823; ticket_number = CC3-TEST-RS-01 |

### catalogs.pm_intervals — 1 rows

| ID | Marker evidence (field = literal value) |
|---|---|
| `d1b1b60b-f100-4b35-9a5e-e5cb1e327358` | code = CC3-TEST-PMINTERVAL-20260822; display_name = CC3 TEST PM Interval 20260822-1140 |

### maintenance.pm_schedules — 1 rows

| ID | Marker evidence (field = literal value) |
|---|---|
| `756b5701-9ed2-4402-b6d6-086fd133af98` | label = TEST DATA keep |

### Unit references (separate from the 38)

The USMCA-owner/lease-scoped unit join resolved the referenced WO units:
T120 = 395352db-7b51-4f07-8dc7-f1e2f1a321bc;
T149 = 1a3c98da-1fb1-4302-8ca8-87e276a1aaa9;
T150 = bf353dfc-0cfb-4a85-bb51-72869d558b57;
T151 = 6eb57e6d-9b0a-4a6a-9c12-6532b320d7cf;
USMCA-001 = bb1e77ab-f052-4d1c-961c-d2cc1289e643.
These are FK context, not a name-only deletion decision. The owner's Round297.5
identifies them as not his fleet; this audit does not archive or delete them.

## Remaining / authorization boundary

X-17/X-18 source and inventory evidence above are collected. No business-logic fix
is authorized by this audit. X-19 is a separate guard PR with in-memory selftests;
its required live-role execution is blocked by the explicit role permission denial
above. Purge requires a separate owner AUTH; none was used. No production mutation,
closed-period financial reconciliation, or recommendation to alter values occurred.

