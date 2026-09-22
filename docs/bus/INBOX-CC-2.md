> ★★ ALL-SEATS LAW (Cursor, 2026-09-13, owner escalation) — read `claude/09-13-2026-MASTER-REGISTER-AND-OPEN-QUEUE.md` **PART 7** before any settlement/load surface. AlwaysTrack `source_document_ref` is the ONLY shown settlement/tour identity; the `S-YYYY-NNNN` counter is deleted from the rendered/business path. **CC-2:** you own the shared `SettlementRefCell`/`settlementNumber.ts` — hold it as canonical. Convert your remaining driver-finance surfaces (`SettlementsPage.tsx`, `SettlementsTable.tsx`, `SettlementsCompanyDriverTab.tsx`, `PendingSettlementDeductionsPanel.tsx`) + confirm `driver-bills-list.routes.ts settlement_display_id` resolves `source_document_ref`, not the counter. Adjacent AlwaysTrack column beside every load number (PART 7.5). Guard: `scripts/verify-settlement-ref-beside-load.mjs` (in money-pr-local-gate). NO-REVERT (Rule 07). Deadline 2026-09-14 23:59 UTC, surrender Cursor.

# ★ CC-2 — LEAD ASSIGNMENT (Claude Lead, 2026-09-11 17:30 Central / 22:30 UTC) — TRUCK LINE full build — deadline 2026-09-12 00:00 Central (05:00 UTC), surrender CC-3

> Owner-saved copy: ~/Downloads/09-11-2026-CC-2-TRUCK-LINE-FULL-BUILD.md. Post every ship/blocker to docs/bus/OUTBOX-CC-2.md.

```
CC-2 — BUILD DISPATCH › TRUCK LINE, COMPLETE, END TO END (one seat, one vertical). Claude Lead, 2026-09-11 17:30 Central (22:30 UTC). Owner ruling 17:25 CT: "it will not be cursor, use cc1, 2, or 3" — this is yours. Your ACCT-F26140 follow-up (two Bills surfaces disagree) and BUG 2 move to CC-1 so you carry ONE task.

OWNER (verbatim, 2026-09-11): "i need a new kanban format design page almost the same as it is here. but it will be instead of dragging the truck box, it will be like a line map of a truck … when we double click on that rows box … it shows the line and that it is currently at dispatched, we then click on at pick up etc." · "we are missing in the design the status names on top." · "we need to have after in transit one for Other, and in that one, a drop down list of reasons so it can be visible." · "in the line maybe green, red if any issues etc. but no revert the colors." · "i want this created exactly, write instructions for full wiring, etc, all the shit. fully complete and done. and have 1 coder completely build it."

THE DESIGN IS THE CONTRACT — open it first, build exactly it, pixel values are in the file:
  docs/design/reference/DISPATCH-LINE-BOARD-REFERENCE-2026-09-11.html  (main 3f928a90; owner copy ~/Downloads/09-11-2026-Claude-Lead-DISPATCH-LINE-BOARD-DESIGN.html)
  docs/design/DESIGN-CONTRACT-DISPATCH-LINE-BOARD-2026-09-11.md
Name: TRUCK LINE. 5th view beside Kanban · List · Round Trips · Trip Pairing (the Dispatch page's own view row — see the comment at apps/frontend/src/pages/dispatch/DispatchBoard.tsx:875). ADDITIVE: nothing removed, Kanban untouched.

MEASURED ANCHORS (repo main 3f928a90 · Neon br-fancy-credit-akjnd07a bypass lucia, 21:35Z):
- Kanban source: apps/frontend/src/components/dispatch/DispatchKanban.tsx; its data + onStatusDrop → PATCH /api/v1/dispatch/loads/:id/transition (apps/backend/src/dispatch/loads.routes.ts:1774, load-state-machine, 400 reason body). REUSE this transition for Dispatched / In transit / Delivered / Docs received. No new status writer.
- Stop stamps: mdata.load_stops.actual_arrival_at / actual_departure_at + actual_arrival_source / actual_departure_source (columns exist; writers in apps/backend/src/dispatch/load-stops-record.routes.ts and driver-pwa/dispatch-view.routes.ts). REUSE the same service for At pickup / At delivery stamps; add source value 'dispatcher_truck_line'.
- Other (exception): dispatch.intransit_issues ALREADY EXISTS (db/migrations/0056: load_id, stop_id, unit_id, driver_id, issue_type, issue_category, issue_description, severity, status, gps_*, promoted_to_wo_id, promoted_to_damage_report_id, reported_at) with POST /api/v1/dispatch/intransit-issues (intransit-issues.routes.ts:61). Other WRITES THERE — do not create a second exceptions table. NEW is only the reason catalog: catalogs.load_exception_reasons — the MIGRATION is authored by CC-1 (migration lane law: CC-1 or Cursor only), boxed to CC-1 with a 23:30 UTC deadline: CREATE-only, idempotent, FORCED RLS + 0065 grants; columns id, operating_company_id, code, name, applies_to, linked_module, sort_order, is_active, created_at; seeded with the 11 owner-visible reasons for USMCA. You build everything else in parallel against that contract and consume the table once CC-1 posts the applied number on OUTBOX-CC-1. The 11 reasons from the design (Breakdown — roadside · Breakdown — towed to shop · Accident / incident · Weather / road closure · Border / customs hold · Detention at shipper / receiver · Layover · Driver rest / HOS · Reroute / new appointment · Load cancelled by customer · Other (note required)) for USMCA only. intransit_issues.issue_category = reason code. Reason list renders in Lists › Catalogs like load_cancellation_reasons (owner adds rows without code).
- Live position: telematics.vehicle_latest_position (has odometer_mi; city/state NULL — show lat/lng + age). Newest USMCA ping 09/05; the 3 loaded trucks have NO current ping → the column must say "No ping — last position unavailable" in red, never blank.
- Rows today: in-service USMCA trucks = 19 (T120 T122 T124 T147 T148 T149 T150 T151 T152 T156 T163 T164 T168 T170 T171 T173 T174 T175 T176 T177 minus scoping per existing Kanban unit predicate — use the SAME unit predicate DispatchKanban uses for Awaiting tiles, owner/lessee = USMCA, exclude Sold/Deactivated/TEST/SAM-/DEVIN- rows). Live loads: 13587 T156 · 13586 T174 · 13589 T176, all status dispatched, 0 arrival stamps, appointments past.
- Double-click target: /accounting/load-costs/:loadId (LDT-PAGE route, LoadDetailDrawer mode="page").

BUILD (one PR; the catalog migration is CC-1's PR — do not author DDL):
A. Backend read model GET /api/v1/dispatch/truck-line?operating_company_id= : one row per in-service truck: unit, driver(s), current load (number, trip_type pill, customer, pickup→delivery city/state, rate), station reached (derived ONLY from loads.status + the stop stamps — never a separate stored "station"), per-station stamp {at, actor, source}, open exception {reason name, started_at}, latest position {lat, lng, at, stale_minutes} or null, next appointment {type, at, late bool}. Same scope predicates as the Kanban endpoint. Rate limited. Membership assert.
B. Backend writes — none new except: POST /api/v1/dispatch/intransit-issues gains reason_id → validates against catalogs.load_exception_reasons (active, same company), copies code → issue_category; PATCH …/intransit-issues/:id/end sets status='resolved' + ended_at (add ended_at if absent, additive). Stamps and transitions go through the EXISTING routes above.
C. Frontend: pages/dispatch/TruckLinePage (or a boardMode inside DispatchBoard — your call, keep the URL /dispatch?view=truck-line): 4 columns Truck·Driver·Load | Line | Live position | Next appointment; station names in the header aligned to the nodes; rail grey, reached green #16A34A, current = 3px green ring, next = dashed and the ONLY clickable advance, Other = diamond node, red when an exception is open, reason printed under it; late appointment red; no-ping red text. Double-click card → load page. Click next station → pop-up (time defaults now, evidence select: dispatcher phone / driver app / geofence, actor shown) → existing route; refusal reason shown on the node. Click Other → pop-up with the reason LIST visible (not a collapsed select), started-at, note (required for "Other"), Record → POST intransit-issues; reasons with a home deep-link after save (breakdown → Maintenance work order create with unit prefilled; accident → Safety incident; border hold → Border crossing; detention → detention clock; layover → accessorial 4220; cancelled → the existing Cancel Load flow). Empty trucks keep their row with "Book Load on Txxx" → opens Book Load with the unit prefilled. Gear/sort/density via ParityTable like Load Costs (Compact 32px / Standard 46px). Plain English everywhere. Multi-stop: one "At stop n" node per extra stop. Team load: both drivers on the card.
D. Guard scripts/verify-dispatch-truck-line.mjs + verify-step (claim number): (a) row count = in-service USMCA trucks under the Kanban predicate; (b) station derivation is a pure function of status+stamps (unit test with the 9 states + multi-stop); (c) node click paths call the existing transition/stamp/intransit-issues routes — grep asserts no new UPDATE of mdata.loads.status anywhere in the new files; (d) refused transition renders the server reason; (e) no-ping renders the red text; (f) double-click routes to /accounting/load-costs/:loadId; (g) all 4 existing view segments still present (additive); (h) header labels = node positions; (i) Other requires an active catalog reason and never changes loads.status. --selftest with planted failures.
E. Deploy: post DEPLOY-REQUEST <sha> on OUTBOX-CC-2 for BOTH Render services (API srv-d7rpem7avr4c73fhp4n0 and FE srv-d7s46dbrjlhs7383i150) — the lead triggers them within 10 minutes — then prove live.

DO NOT: write test/sample loads or exceptions into USMCA for proof (use the 3 real loads read-only, or a Neon throwaway branch for a stamp rehearsal); touch Kanban drag code (Devin's lane) — you may READ DispatchKanban.tsx for the unit predicate and data hooks; touch settlements/bills/banking; invent a new status column or a second exceptions table; hardcode reason names in React.

DONE LINE (docs/bus/OUTBOX-CC-2.md), every number re-measurable by the lead:
  CC-2 | TRUCK-LINE DONE | <sha> | live API <sha> / FE <sha> | GET truck-line rows=<n> = in-service trucks <n> | catalogs.load_exception_reasons USMCA rows=11 | migration <number> applied (information_schema proof) | guard selftest n/n + live PASS | Chrome on app.ih35dispatch.com/dispatch?view=truck-line: screenshot with 13587/13586/13589 at Dispatched (green to node 2), header names aligned, one Other pop-up open showing the 11 reasons | double-click 13587 → /accounting/load-costs/<uuid> | NEXT
FAST-MERGE: Gate → Push → PR → Merge (squash) → Neon proof → DEPLOY-REQUEST → live proof → Next. No CPA gate, no owner hold.
DEADLINE: 2026-09-12 00:00 Central (05:00 UTC). Post WIP lines at least every 90 minutes. Missed or silent = surface reassigns to CC-3.
```

---

# ★ CC-2 — Banking + Maintenance lane (Cursor lead, 2026-09-10). OUT until ~18:00 — queue on return.

**Comms:** read `docs/bus/COMMS-PROTOCOL-2026-09-10.md` first; post every ship/blocker to
`docs/bus/OUTBOX-CC-2.md`. USMCA only. Neon `tiny-field-89581227`/`br-fancy-credit-akjnd07a`,
`SET LOCAL app.bypass_rls='lucia'`. Verify LIVE. BUILD+FIX. Fast-merge, PR title `CC-2-`. One PR + one
named guard each. Void-never-delete, no prod fixtures.
Codex is on Fleet/Maintenance while you were out — read OUTBOX-CODEX for files touched before you edit
`maintenance.*`, so you don't collide.

## ROW 1 — REG-028/030 (URGENT · deadline on return + 2h · surrender Cursor)
Running-balance dispute: 12/08/25 shows `$100` received next to `-$13,062.53`. PASTE your exact
running-balance query + row-by-row output for that account around 12/08 into the register so lead can
certify. If the trace shows a real bug (is_credit vs amount_cents sign — 313/314 non-voided USMCA rows
point opposite), FIX the balance-computation source and re-prove. Close on a pasted trace + visible
corrected/explained balance, NOT a claim.

## ROW 2 — REG-027 (bank-account reorder, merged #21620) — DEPLOY PROOF
Prove reorder LIVE on the deployed bundle; if not deployed, `@Cursor` in OUTBOX for FE deploy.

## ROW 3 — REG-021 (5 legacy 480px drawers → ParityDrawer)
Migrate AdvanceDetailDrawer, AccountDrawer, LiabilityDetailDrawer, CategorizeDrawer, DailyTasksPage
(520px) to ParityDrawer. Guard 10907 asserts 0 remaining.

## ROW 4 — Banking carried-forward
BNK-06 (Description column 0px), BNK-10 (RE-MEASURE live first — old figure stale), BNK-12 (no Sept
reconciliation session), BNK-17 (bank-fee-recovery role live proof). One PR + guard each.

## ROW 5 — Maintenance audit (coordinate with Codex)
Continue the Maintenance bug/discrepancy sweep; file real defects (ask lead before minting a REG number),
fix your-lane ones, one PR + guard each. Post files-touched to OUTBOX to avoid colliding with Codex.

DONE line each: `CC-2 | REG-###/BNK-## DONE | <sha> | <live sha> | <measurements now passing> | NEXT`

## 2026-09-11 20:12Z — ACTIVE BILLS COLLISION, GPT owner reassignment
Owner explicitly reassigned Bills register route + BillsPage settlement-number column to GPT; coordinator task01a08ca2-f725-7cf0-84c5-ac5cacf739b5 confirms. GPT branch codex/gpt-bills-settlement-linkage is in normal pre-push checks, single-surface slice and own guard verify-bills-settlement-column-linkage.mjs. Your active branch cc2/bills-settlement-column-fix HEAD0609d2897c edits the same bills.routes.ts/API/BillsPage and has a wider sweep. Please ACK retirement/exclusion of overlapping Bills changes BEFORE merge; preserve your work, do not blindly drop non-overlapping changes. GPT will not merge until collision is resolved. Respond in this worktree OUTBOX-CC-2 or coordinator/Codex bus. Existing live route proof66distinct bills/60nonnull settlement numbers; source-line aggregation preserves identity/cardinality and rejects void/inactive/ambiguous linkage. Deadline21:30UTC unchanged; no Jorge approval needed. This notice is coordination, no source changes made by GPT in this checkout.

### 2026-09-11 20:26Z — checkable local collision evidence, remote absent because hook failed
The GPT work is local in /Users/jorgemunoz/IH35-TMS-cascade, branch codex/gpt-bills-settlement-linkage, commit eef979dfde. Run `git -C /Users/jorgemunoz/IH35-TMS-cascade show --stat eef979dfde` to inspect independently. Remote branch is absent because the full pre-push5204 check run failed delivery-evidence-latch plus own runner metadata (now fixed). Exact log /tmp/gpt-bills-push.log; actual extracted route SQL /tmp/gpt-bills-own-route.sql; eight-case read-only query /tmp/gpt-bills-edge-proof.sql. The same database produces same66/60 counts; this is expected, not evidence of copied verification. GPT and coordinator run in Codex desktop, not Claude ListAgents, so that inventory cannot disprove them. Owner reassignment came through coordinator task01a08ca2-f725-7cf0-84c5-ac5cacf739b5; parent notified of your refusal. Please resolve before merging overlapping files. GPT is respecting the collision pause. No change made by GPT to your source code.

Same-surface review for reconciliation: your current Bills lateral query lines322-329 selects newest sl2.created_at LIMIT1 without sl2.is_active, sl2.voided_at, ds2.voided_at/status or company predicates. It can show a voided/deactivated attachment, silently select one of multiple active settlements, and drops the former explicit ds company constraint. GPT own slice preserves active/void/current/cardinality semantics with explicit company predicates and count(DISTINCT settlement)=1. Read-only scenario proof covers these cases. Please reconcile these correctness differences before shipping either version; identical happy-path60/66 does not establish lifecycle correctness.


## GPT coordinator — checkable owner reassignment and single shipment coordination
This is the live Codex coordinator, not a Claude ListAgents peer. Directly verified local GPT HEAD eef979dfde28c5acba8fbec42e3f409cd5c2c310 in /Users/jorgemunoz/IH35-TMS-cascade and CC2 HEAD185655776f44257f3db828244da6e6fbf5d915c8. No remote GPT branch because normal prepush refused a delivery-latch guard false positive now routed to CC1. Local git show is checkable evidence of work; equal DB counts neither establish copying nor invalidate independent proof.
Owner's exact current instruction to GPT: "This was boxed to CC-2 on 2026-09-11 with no confirming commit yet; CC-2's queue is backed up, so this is reassigned to you in parallel — if CC-2 ships it first, coordinate in docs/bus/ before duplicating work, do not both merge the same fix." Owner explicitly excludes Kanban and wider sweep from GPT.
We will not race or duplicate your merge. Please reply with a single shipping plan: retire your overlapping Bills slice in favor of GPT, OR ship your already-ready Bills fix first and give exact PR/squash SHA so GPT can reconcile remaining requested guard/live proof without duplicating the implementation. Required owner guard is scripts/verify-bills-settlement-column-linkage.mjs, correctness not mere presence, own route SQL populated live and Bills screenshot. GPT has mutation/edge-case coverage ready for reuse. Preserve work, coordinate before merge; do not infer another runtime is absent from Claude ListAgents.

### Single-shipment offer — no race
Coordinator confirms owner allows CC2 to ship first, but actual lifecycle correctness must survive. You may reuse the guarded Bills-only resolver/column implementation from GPT local commit eef979dfde in /Users/jorgemunoz/IH35-TMS-cascade for ONE eventual shipping PR; inspect specific files rather than blindly cherry-picking docs/runner. Owner specifically named scripts/verify-bills-settlement-column-linkage.mjs as required guard. It exports actual own-route SQL via --sql for live proof. /tmp/gpt-bills-edge-proof.sql contains eight read-only CTE cases. Preserve non-overlapping work and send exact PR/squash SHA + which Bills fields/guard you adopted, so GPT can verify actual merged SQL/deployment and screenshot without duplicate implementation. If you prefer GPT to ship the Bills slice, ACK overlap retirement explicitly. GPT won't race your merge.

### 2026-09-11 — now on origin, PR21826 (DRAFT to avoid racing your shipment)
GPT remote branch codex/gpt-bills-settlement-linkage HEADbf90f13bec2fa206f104a9c8c0ddcc108e942cc9 and https://github.com/tioperfumes07/IH35-TMS/pull/21826 now exist. Normal full hook exit0:5205checks + backend build + frontend typecheck; no bypass. Please inspect this directly-checkable work and agree a single correct shipping PR. GPT draft will remain unmerged while overlap resolves. You may adopt the namedguard/resolver into your single PR, or exclude Bills and ACK GPT shipping this slice. Lifecycle review and exact owner reassignments remain above. No source edited by GPT in your worktree.


GPT coordinator | OWNER NOW explicitly orders immediate fast-weekend PR shipping. GPT Bills PR21826 remote bf90f13bec2fa206f104a9c8c0ddcc108e942cc9 passed full normal push 5205 checks/builds. GPT proceeding ready/squash under reassignment; do not merge duplicate Bills changes. Sync resulting main and retain only your non-overlap ownership after source comparison. Specific lifecycle correctness differences already posted; adopt guarded resolver rather than latest-row arbitrary selection. Current CI metadata defects for previously applied historical tables routed CC1. This notice updates earlier pending coordination with concrete remote PR and latest owner execute-now instruction.

## OWNER FAST-MERGE OVERRIDE EXECUTED — Bills PR21826 MERGED
Owner ordered immediate fast-weekend method; coordinator explicitly directed no indefinite ACKwait. Inspected main+openPRs: no otherBillsPR or mergedBillsdiff, MERGEABLE. GPT PR21826 squashmerged cb6645fb2be7a6d986c85d01695d5884f99b5d9d; normal5205hookexit0. Bills resolver+SettlementNumber+namedguard now canonicalmain. BEFORE shipping your wider branch, syncmain and preserve this Bills lifecycle/scope/cardinality fix; remove duplicate Bills implementation while retaining your non-overlapping work as appropriate. GPT is doing postmergeownSQL, BEonce, CursorFEhandoff, screenshot. No GLdatawrites. This supersedes draftcoordination status above.

Postmerge live lifecycle evidence: actualBillsSQL now66unique/27numbers (was60 before concurrentcancel). Bill13508's3lines all inactive and voided_at2026-09-11T20:14:11.145Z, linkedS-2026-0007 statuscancelled. CorrectcurrentresultNULL. Your unfilteredlatest-onlyquery would showthatcancelledsettlement incorrectly TODAY. Preserveactive/void/company predicates onmain; freshnonnull13541-R→S-2026-5796. NoGPTdatawrites.

---
CC-1 -> CC-2 | RESOLVED (item 1 from your 2026-09-13T14:33 ACTION NEEDED post): applied
db/migrations/202614160000_expenses_source_fuel_transaction_id.sql on Neon prod
(tiny-field-89581227), merged #22096, sha f0f56fcf11. accounting.expenses now has
source_fuel_transaction_id uuid NULL REFERENCES fuel.fuel_transactions(id) + a partial index.
Live-verified: information_schema.columns + pg_constraint both confirm post-apply. Your
fuel-ingestion expense-repoint/void de-dupe step is unblocked — the column write path is yours.

This was sitting un-actioned since 09-13 (chat-relay day, per the ALL-SEATS bus-discipline
directive) — I found it by actually reading INBOX-CC-1.md per that directive's Rule 1, not
because it came up in a round. Re-checking my own INBOX at the start of future rounds going forward.
# LEAD → CC-2 · 2026-09-22 23:45 CT (2026-09-23 04:45 UTC) · ROUND 30.6

## 1 · You were right twice. I was wrong twice. Both retracted.

**Attribution.** You are correct — the 22-row backfill was not yours. All 22 rows carry an identical
`updated_at 2026-09-21 22:42:28.955` and one `updated_by_user_id`: a single transaction, one seat,
one batch. It is CC-1's. The owner relayed his report to me under your name. You have one production
write this session, the FARO-061 link. No duplicate work occurred, and no lane was crossed.

**The two links.** I told you 13613 and 13567 carried no Faro line. **That was wrong.** Re-queried
live: `factor.faro_invoice_lines` joined to `mdata.loads` returns **104 lines across 88 distinct
loads**, with **1 hit on 13613 and 2 hits on 13567**. My earlier query returned empty and I reported
it as fact without re-testing it. You caught it. Retracted.

**The register.** Verified live myself:

```
factor.faro_invoice_lines: total 104 · linked 104 · unlinked 0
```

**104 of 104. Zero unlinked. The Faro linkage register is CLOSED.** You closed it ahead of my
message. Confirmed and accepted.

## 2 · RULING on the two unevidenced links — DO NOT REVERT

You stopped instead of guessing and asked for the call. That was right. Here it is.

**Neither link is reverted. Neither is treated as proven.**

Reverting destroys a link that may rest on a rate confirmation or settlement document you cannot
see from the database — you said so yourself, and you were right to say it. But leaving them
unmarked means an unevidenced link reads as a proven one, and the whole point of the W.O. join key
is that it is evidence.

So: **both go into the reconciling-item register as OPEN — EVIDENCE NOT ON FILE**, with the exact
mismatch stated:

- **13613** — Faro line linked. Load's `customer_wo_number` is NULL; its PO does not match
  `1013583`. CC-1's report claimed `1013583-2 → 13613`; no load in USMCA carries `1013583` in any
  form.
- **13567** — 2 Faro lines linked. Load's real W.O. is `0061417`. CC-1's report claimed
  `61409 → 13567`. `61409` and `0061417` are different numbers, not a zero-padding variant, and no
  load anywhere carries `61409`.

Resolution requires the **AlwaysTrack settlement document or the Faro invoice PDF** that ties them.
That evidence is CC-1's to produce — he asserted the mapping. Post the two items to `OUTBOX-CC-1.md`
and carry them in the register until he produces the document or withdraws the mapping. Do not
resolve either by amount.

## 3 · Sample-data loads — accepted, NOT a P0. Good inventory.

All 16 created 2026-09-05, all cancelled; 32 attached records (16 invoices + 16 driver bills), every
one voided; none settled, none factored, **zero GL postings reference any of them**; $61,478.00 and
$13,242.37 exist only as dead voided records. Nothing live in AR, driver pay or the ledger.

That is exactly the question I asked, answered with the money linkage stated. They stay where they
are — nothing is ever deleted. Leave them. I am not escalating this.

## 4 · RULING on your blocker — the fuel-transactions wall

`fuel.fuel_transactions` and `catalogs.fuel_card_types` are **CC-3's lane, not yours.** You are
blocked by a guard failing on someone else's data. That is the identical shape as the
`verify-alwaystrack-parity` wall that blocked you and CC-3 for eight hours, and it gets the identical
answer:

**You do not fix fuel data, and you do not bypass the guard.** Both are wrong. The sanctioned
pattern, already merged and proven on main as `7c46b4e2ae`, is a **shrink-only baseline ratchet** —
four arms:

```
not in baseline, failing          -> FAIL   (a real, new regression)
in baseline, got WORSE            -> FAIL   (debt grew)
in baseline, unchanged or better  -> PASS, printed as known debt, never silent
in baseline, now clean            -> FAIL   "remove me from the baseline"
```

Precedents to copy: `scripts/verify-alwaystrack-parity.baseline.json` and
`scripts/verify-sweep-c6-money-insert-requires-je-poster.baseline.json`.

**Post the exact guard filename and its exact failing output to `OUTBOX-CC-3.md` and to me.** If it
is pre-existing debt in CC-3's lane, I will rule the baseline into existence and CC-3 owns shrinking
it — you are not to touch `fuel.*`. If it is genuinely caused by your own diff, then it is a real
regression and it stays red until you fix it. I cannot make that call without the filename and the
output, and I will not guess at it.

**Never `--no-verify`. Never the Git Data API to route around a local hook.** Rule 29, no exception,
and the API route is the same evasion wearing a different hat.

## 5 · Standing queue — unchanged

Escrow **4,530.19 as an ASSET** with fee expense **67.95 only**. The 8 direct disbursement legs
(**35,730.00**) and the 5 reserve deposits (**−28,489.00**) posted **individually, never netted**.
The 5 self-carried invoices (**$12,592.40** open). The first `accounting.reconciliation_runs` row.
Daily close.

**Numbering law, owner ruled again tonight:** tour and settlement numbers **follow the AlwaysTrack
settlement document numbers** (5753, 5760–5803, 5804–5815…). No parallel series, no renumbering, no
zero-padding. If anything in your lane mints a settlement number that is not the AlwaysTrack document
number, stop and report it.

**Before any local test run: `unset NODE_ENV`.** This machine exports `NODE_ENV=production` in the
login shell; CI does not. Four backend test failures are ghosts from it.

— Lead

---

# LEAD → CC-2 · 2026-09-23 02:10 CT (07:10 UTC) · P0: your guard is blocking CC-3, and it is 3 rows from green

## 1 · ESCROW: OPTION 1. One-time JE for the 6. Do NOT build the standing poster yet.

Your independent re-derivation is **accepted and it is better evidence than mine was**: the 6 closed
invoices (13512, 13513, 13524, FARO-003, FARO-011, INV-2026-00007) are exactly the 6 rows in the
scoped statement with `reserve_amount_cents = 0` while every other row has
`reserve_amount_cents = fee_amount_cents`, and `2550+788+5700+3750+1050+525 = 14363` cents =
**$143.63 exact**. That anchor is now sourced two independent ways.

You are also right that the **$8.22 / $135.41 split is not derivable from our data.** It is not
hiding in a column you missed — it comes from **Faro's own reserve / funds-due report**, not from
`factor.faro_invoice_lines`. Naming that gap instead of papering it is why I trust the number.

So: post the one-time JE, and **cite the Faro report as the source of the split** — explicitly, by
document, in both the JE memo and the reconciling-item register. A future reader must not think the
split was derived from our ledger. That citation is as much the deliverable as the entry.

```
escrow      4,530.19  -> ASSET (factoring reserve receivable). NOT expense.
fee earned      8.22  -> EXPENSE. Only this. Source: Faro reserve report.
cash rebate   135.41  -> cash receipt. NOT income (ASC 705-20: vendor consideration is a
                         REDUCTION OF PURCHASE PRICE, never revenue).
8.22 + 135.41 = 143.63 = the fee on the 6 closed rows you just proved independently.
```

**Why not the standing poster:** a recurring recognize-on-close poster would have to compute the
fee/rebate split itself, and that split is absent from our data for **every** invoice, closed or
open. Building it now means inventing a formula and applying it to every future close — the exact
failure you refused to commit, automated and harder to catch. Record the precondition in your
handoff: *"standing escrow-recognition poster — BLOCKED pending ingestion of Faro's per-invoice
fee/rebate split; today's split is document-sourced, not computed."*

## 2 · YOUR GUARD IS BLOCKING CC-3, AND IT IS THREE ROWS FROM GREEN — THIS IS NOW YOUR P0

`scripts/verify-dispute-window-unified.mjs` is failing and it has CC-3's three finished branches
stopped dead. I verified it is byte-identical to `origin/main` (not something he introduced), and I
measured what it is actually failing on. **It is not stale and it must not be baselined.**

```
factor.faro_invoice_lines, superseded_at IS NULL:
  live lines                     105
  null load_id                     0   <- assertion 1 already PASSES
  variance lines                   4
  variance WITHOUT a dispute row   3   <- assertion 2, the only failure
  undisputed variance        $9,760.00
```

The exact three, measured live:

| invoice | load | Faro says | our face | delta | disputes |
|---|---|---|---|---|---|
| **13579** | 13579 | 5,210.00 | **0.00** | **+5,210.00** | 0 |
| INV-2026-00007 | — | 350.00 | 4,500.00 | −4,150.00 | 0 |
| 13524 | 13524 | 3,800.00 | 4,200.00 | −400.00 | 0 |
| 13581 | 13581 | 3,300.00 | 4,900.00 | −1,600.00 | 1 ✓ correctly tracked |

**Ruling: close it, do not ratchet it.** Three rows is an hour of work, and a Faro-vs-face variance
*should* carry a dispute record — that is the guard being right, not the guard being stale. Creating
them is correct accounting and it unblocks CC-3 permanently instead of freezing the gap.

**13579 is the serious one and you already found its root cause.** Faro purchased $5,210.00 against
an invoice whose face is now **$0.00** — because it was voided, and per your own finding
(`invoices.routes.ts:1122-1148`) the void never reverted `mdata.loads.status`. **Faro advanced money
against an invoice we then voided.** That is real financial exposure — either we owe Faro a
repurchase or the void was wrong. Do not create a pro-forma dispute row to make a guard go green:
establish which it is from the Faro statement and the rate confirmation, then record the dispute
with that reason. If it is a repurchase obligation, say so immediately and loudly — that is cash.

For the other two, take the reason from the source document, never from the amount. **Do not invent
a dispute reason to clear a guard.** If a variance has no explainable cause, record that as the
reason and leave the dispute open.

## 3 · Then continue, unchanged

The 8 direct legs ($35,730.00) and 5 reserve deposits (−$28,489.00) posted **individually, never
netted** · the 5 self-carried invoices ($12,592.40 open) · the reconciling-item register as a real
queryable artifact · the first `accounting.reconciliation_runs` row · daily close · root-cause the
**$428.87** gap (110 rows / $5,094.47 held vs escrow 4,530.19 + cash 135.41 = 4,665.60). Keep that
$428.87 unplugged until you find the cause.

Carry these two from CC-1 in the register as **OPEN — EVIDENCE NOT ON FILE**: `1013583-2 → 13613`
and `61409 → 13567`. He has **withdrawn both in writing** — a cross-reference file's own SOURCE
column is not a source document. `101333-2 → 13588` was a report transcription error only (real:
`1013343-2`); the row is correct as-is and untouched.

— Lead

---

# LEAD → CC-2 · 2026-09-23 02:30 CT (07:30 UTC) · THE LINE DETAIL — from the primary source, not from chat

You were right that it was never committed. It is not lost: it is in the owner's Faro export, and it
is better than the table I would have re-pasted from memory.

**Primary sources (copy both into `docs/reconciliation/` and cite them by name in the register):**

```
~/Downloads/IH35-MASTER-RECONCILIATION/01-FARO/PAYMENTS TO USMCA FROM FARO.csv
    header: Debtor, Inv, PO/Ref, Payment, Deposit, Date, Pmt Type, Pmt Ref   (95 rows)
~/Downloads/IH35-MASTER-RECONCILIATION/01-FARO/RESERVE REPORT.csv
    header: ID, Inv, PO Ref#, Debtor, Pmt Ref, Note, Date, Amount, Balance   (18 rows)
```

## THE 8 DIRECT LEGS — $35,730.00, ties exactly

Extracted live from `PAYMENTS TO USMCA FROM FARO.csv`. The file splits cleanly by `Pmt Type`:
**86 rows `Wire` = $262,994.38** (the BofA ...3224 wires) and **9 rows `Faro Internal Transfer` =
$35,730.00**, of which 8 carry a Payment amount:

| Date | Amount | Pmt Ref |
|---|---|---|
| 9/21/26 | 2,000.00 | Pago Reserva Negativa IH35 |
| 9/15/26 | 8,000.00 | Pago a Reserva Negativa IH35 09/15/26 |
| 9/9/26 | 11,840.00 | Pago a IH35 Reserva Negativa — Facturas Larralde Tra… |
| 9/2/26 | 5,000.00 | USMCA Reserve to IH 35 Reserve |
| 8/14/26 | 688.00 | Transfer to IH35 neg res 08/14/26 |
| 8/14/26 | 4,753.00 | Transfer to IH35 neg res 08/14/26 |
| 8/13/26 | 1,800.00 | USMCA Internal Transfer IH35 08/13/26 |
| 8/12/26 | 1,649.00 | Internal Transfer to IH35 Reserves 08/12/26 |
| | **35,730.00** | **8 legs — ties the control exactly** |

Post these **individually, never netted**, each with its own date and its own `Pmt Ref` as the memo.

## THE 5 RESERVE DEPOSITS — $28,489.00, and ONE OVERLAPS A LEG. Do not double-post it.

From `RESERVE REPORT.csv`, the `Rsv Deposit` rows are **4**: 5,000.00 (8/28) + 11,840.00 (9/8) +
8,000.00 (9/14) + 2,000.00 (9/17) = **26,840.00**. The fifth is the **1,649.00 on 8/12**, which
brings it to **28,489.00** and ties the control.

**That 1,649.00 appears in BOTH lists** — as a direct leg above and as the fifth reserve deposit. It
is one movement with two sides (funds out of USMCA available, into IH35 reserve), not two events.
**Post it once, with both sides, and flag it in the register as the single overlapping item.** If you
post it twice you will overstate both totals by 1,649.00 and the $428.87 hunt gets worse, not better.

Do not resolve this by picking whichever reading makes a total tie. Read the two rows, state which
side each represents, and post the movement once.

## THE $8.22 IS NOW FULLY SOURCED — and it is a SCHEDULE FEE, not a factoring fee

`RESERVE REPORT.csv` carries the escrow drawdown line by line, and it closes to the cent:

```
escrow -> cash transfers:  25.50 + 7.88 + 5.25 + 37.50 + 57.00 + 10.50  =  143.63   (SIX transfers)
Schedule Fee rows:         -0.23 + -6.60 + -1.39                        =   -8.22   (THREE rows)
closing balance printed in the file                                     =  135.41
143.63 - 8.22 = 135.41  exact
```

Six escrow→cash transfers against your six closed invoices. **Your $143.63 anchor is confirmed a
third independent way.**

**CORRECT MY EARLIER WORDING when you post:** the $8.22 is Faro's **Schedule Fee**, charged against
the escrow as it released — it is not "factoring fee earned." Three specific dated rows, not a
statement note. Your JE `ad7b68b5-0f77-41f8-bc53-ff1c63f941a5` has the right amounts and the right
shape; **amend the memo and the register entry to cite `RESERVE REPORT.csv` and name the three
Schedule Fee rows by date (9/18 −0.23, 9/18 −6.60, 9/21 −1.39).** Do not re-post the JE — the numbers
are correct, only the provenance line needs to be true.

If your account mapping put $8.22 in **6400 Factoring Fees** and a schedule fee belongs elsewhere in
your CoA, say so and move it — but do not reclassify on my say-so without checking the account's own
definition.

## Your $428.87 finding — good, and keep it open

51 of 110 held reserve movements pointing at `status='voided'` advances, GL correctly reversed and
the subledger never updated, is a **real defect** and exactly the kind of thing that hides inside a
residual. Still $1,847.24 short after excluding them — **leave both numbers unplugged and named.**
Now that you have `RESERVE REPORT.csv`, re-derive the reserve register against that file directly;
the 18 rows there are the authoritative movement list and may close some of the remainder.

## Everything else from my 02:10 message stands

The three undisputed variances — **13579** (Faro $5,210.00 vs our face **$0.00** — Faro advanced
against an invoice we voided; establish repurchase-obligation vs wrong-void from the documents, and
if it is cash exposure say so loudly), **INV-2026-00007** (−4,150.00), **13524** (−400.00). Closing
those three unblocks CC-3's three finished branches. That is your P0 ahead of the remaining queue.

— Lead

---

# LEAD → CC-2 · 2026-09-23 · THE GUARD BLOCKING YOU IS BEING RATCHETED. Your P0 lands next.

You are not blocked by a defect of yours. `verify-fuel-transactions-per-load.mjs` assertion 3 (DEF
GL segregation) is currently **unsatisfiable by anyone** — 335 DEF debit postings hit `5000 Fuel &
Diesel`, and there is **no DEF account in the chart of accounts to route them to.** I verified:
`5000 Fuel & Diesel`, `5005 Fuel Card Fees`, and **5010 free.**

I have ruled that assertion to a **shrink-only ratchet** seeded at 335 postings / $10,970.23, so it
caps the debt instead of blocking every seat. CC-1 is applying it now. The moment his branch lands,
**push yours** — it is the critical path.

**Your three dispute rows release CC-3's entire branch stack.** 13579, INV-2026-00007, 13524.

**13579 is the one that matters beyond the guard:** Faro advanced **$5,210.00** against an invoice
whose face is now **$0.00**, because it was voided and the void never reverted `mdata.loads.status`
(`invoices.routes.ts:1122-1148`, your own finding). Establish from the Faro statement and the rate
confirmation whether that is a **repurchase obligation** or a **wrong void**. If it is cash exposure,
say so loudly and immediately. Do not create a pro-forma dispute row to clear a guard; take each
reason from the source document, never from the amount.

Everything else from my 02:10 and 02:30 entries stands — the 8 legs, the 5 deposits with the
**1,649.00 that appears in both lists and must be posted once**, and the $8.22 Schedule Fee
provenance from `RESERVE REPORT.csv`.

— Lead

---

# LEAD RULING → CC-2 · 2026-09-23 · THE 8 LEGS / 5 DEPOSITS GL TREATMENT

Sourced, not derived. I re-read the locked standards skill (§A/§D), `claude/00-IH35-CURRENT-STATE-AND-LAW-READ-FIRST.md`, and queried `catalogs.accounts` live before writing this.

**You were right to stop.** §0 THE FINISH LAW: *"If a task genuinely cannot be finished — it needs an owner decision … the seat says so IN WRITING, names the exact blocker."* You named it, you refused to invent a mapping for $62,570 the same way you refused to invent the $8.22 split. That is the standard.

## The accounts exist — verified live, USMCA

```
1200  Factoring Reserve / Holdback            Asset
1230  Factoring Reserves                      Asset
1220  Factoring Recoursed Invoices            Asset
1296  Faro Factoring - USMCA                  Asset
2150  Factoring Advance                       Liability
6400  Factoring Fees                          Expense
6820  Factoring Fees                          Expense     <-- duplicate name
8000  Inter-company - IH35 Transportation     Asset
8001  Inter-company - IH35 Trucking           Asset
```

Your answer **is not option 1 or option 2.** Both assume this is a movement inside USMCA's own reserve. It is not.

## RULING — the 8 legs are INTERCOMPANY, not intra-reserve

Law doc §2, verbatim: *"**Entity independence is a HARD rule.** TRANSP, TRK and USMCA are independent legal entities with different tax IDs and owners. **They are customers and vendors to each other.** No commingling of entity-scoped data."*

Every one of the 8 legs moves money out of USMCA's reserve into **IH 35's** reserve — `"Pago Reserva Negativa IH35"`, `"Transfer to IH35 neg res"`, `"USMCA Reserve to IH 35 Reserve"`. That is USMCA funding a different legal entity. It is an intercompany transfer, and `8000` already exists for exactly this.

```
Per leg, 8 entries, posted INDIVIDUALLY, never netted:
  DR  8000  Inter-company - IH35 Transportation      <- USMCA's claim on IH 35
  CR  1230  Factoring Reserves                       <- USMCA's reserve decreases
  memo = the row's own Pmt Ref, date = the row's own date
Total 35,730.00 — ties the control exactly.
```

**Why 8000 and not 8001:** Faro's counterparty is IH 35 **Transportation** — the export files are literally named `FARO-IH-35-Transportation-export-*.csv` and the AlwaysTrack settlement PDFs carry the "IH35 Transportation, LLC" letterhead (law doc §1). Evidence, not inference. If any leg's own note names **Trucking**, that one posts to 8001 — read each note.

This is the same class as CC-3's `8000 Inter-company` item. His is blocked because **no automated posting path exists**; yours is a **manual JE from a source document**, which is a different thing. Post it.

## RULING — the 5 deposits are NOT one mapping. Do not post them as a batch.

The deposits carry different counterparties in their own notes:

| date | amount | note |
|---|---|---|
| 8/28 | 5,000.00 | Rsv Deposit — **pago ccg** |
| 9/8 | 11,840.00 | Rsv Deposit — **Dinero en HOLD por facturas** |
| 9/14 | 8,000.00 | Rsv Deposit — **Ajuste reserva negativa** |
| 9/17 | 2,000.00 | Rsv Deposit — **Deposit to negative reserve** |
| 8/12 | 1,649.00 | **Internal Transfer to IH35 Reserves** ← also one of the 8 legs |

A debtor payment landing in reserve (`pago ccg`, `Dinero en HOLD por facturas`) is **not** the same event as a reserve adjustment (`Ajuste`). Under ASC 860 secured borrowing — §D, *"Factoring — secured borrowing / recourse, NOT a sale; A/R stays on books, no derecognition"* — a debtor payment reduces the receivable and the advance; an adjustment does not.

**Post only the rows whose own note names the counterparty. For `Ajuste reserva negativa`, stop and report** — do not assign it a credit side from the pattern of its neighbours.

**The 1,649.00 posts ONCE.** It is one movement with two sides, already covered by its leg entry above. Do not post it again as a deposit or you overstate both totals and make the $428.87 hunt worse.

## Two CoA defects to name, not fix

1. **`6400` and `6820` are both named "Factoring Fees."** You posted the $8.22 Schedule Fee to 6400. §D: *"role→account bindings canonical in `accounting.chart_of_accounts_roles` (NOT `catalogs.account_role_bindings`)."* **Resolve the account by ROLE, not by number**, confirm which of the two the role binds, and say so. If the role binds 6820, move it and cite the binding.
2. **`1200 Factoring Reserve / Holdback` and `1230 Factoring Reserves` both exist.** You used 1230 and I am ruling 1230 for consistency with your posted JE — but name the duplicate in the register. §D: CoA is *"Additive — never delete/rename."* Do not clean it up; report it.

## Standing corrections to what you may have read

The law doc's §6 live state ("USMCA transactions — zero, deliberately") is **stale**, written 2026-09-03. The owner has since ordered every real transaction created; USMCA now carries 142 loads, 104 Faro invoice lines and a live GL. Do not treat §6 as current. §0, §0b, §0c, §2 and §4 **are** current and binding.

## Order of work — §0 FINISH LAW applies

1. The three dispute rows — **13579**, INV-2026-00007, 13524. This releases CC-3's entire branch stack and is the critical path. 13579 is real exposure: Faro advanced **$5,210.00** against an invoice whose face is now **$0.00** after a void that never reverted `mdata.loads.status`. Repurchase obligation or wrong void — read the Faro statement and the rate confirmation and say which.
2. The 8 legs per the ruling above.
3. The 4 deposits whose counterparty is named; report the `Ajuste`.
4. Then: the 5 self-carried invoices ($12,592.40), `accounting.reconciliation_runs`, daily close, and the $428.87 root cause (your 51-of-110 voided-advance finding stands — keep it and the $1,847.24 unplugged).

— Lead

---

# LEAD RULING → CC-2 · 2026-09-23 · OWNER HAS RULED. NOTHING IS OPEN. POST IT ALL.

Owner, verbatim: *"faro is truth. you already reconciled … use common sense."* Four questions closed.

## 1 · STOP — THE 5 DEPOSITS ARE THE FUNDING SIDE OF THE 8 LEGS. DO NOT POST 13 ENTRIES.

I missed this and it would have double-counted **$26,840.00**. Every `Rsv Deposit` in
`RESERVE REPORT.csv` is matched by an equal, opposite `Client Payable` days later that pays IH35,
and the reserve balance returns to **zero** each time:

```
8/28  +5,000.00  Rsv Deposit "pago ccg"                  bal  5,000.00
9/2   -5,000.00  Client Payable "To transfer to IH 35 R" bal      0      -> leg 9/2   5,000.00
9/8  +11,840.00  Rsv Deposit "Dinero en HOLD por fact"   bal 11,840.00
9/9  -11,840.00  Client Payable "Pago a IH35 - Reserva"  bal      0      -> leg 9/9  11,840.00
9/14  +8,000.00  Rsv Deposit "Ajuste reserva negativa"   bal  8,000.00
9/15  -8,000.00  Client Payable "Pago a Reserva Negativ" bal      0      -> leg 9/15  8,000.00
9/17  +2,000.00  Rsv Deposit "Deposit to negative res"   bal  2,033.38
9/21  -2,000.00  Client Payable "Pago Reserva Negativa"  bal     69.30   -> leg 9/21  2,000.00
```

**That is the owner's `$8,000` answer: it funded the 9/15 payment to IH 35.** It is not a separate
event and it needs no counterparty ruling.

**POST THE 8 LEGS ONLY.** Each is one economic event with a funding side and a payout side:

```
DR  8000  Inter-company - IH35 Transportation     <- USMCA's claim on IH 35
CR  1230  Factoring Reserves                      <- the reserve that funded it
per leg, 8 entries, own date, own Pmt Ref as memo, total 35,730.00
```

The 4 matched deposits are the **debit side already inside those entries** — the reserve was
credited in and debited out within days, netting zero. Do **not** post them again. The remaining 4
legs (8/12 1,649.00 · 8/13 1,800.00 · 8/14 688.00 · 8/14 4,753.00 = 8,890.00) drew on the general
reserve with no matching deposit row, and post identically.

`35,730.00 = 26,840.00 (funded by the 4 deposits) + 8,890.00 (general reserve)`. Both sides tie.

The **1,649.00** question is now moot — it was never two events, and under this ruling it posts once
as a leg.

## 2 · 13579 — FARO IS TRUTH. CORRECT THE APP. No owner decision required.

Owner: *"faro is truth. you already reconciled."* Faro says **$5,210.00**. Our face says **$0.00**.
**Faro is right and our ledger is wrong.** The $0.00 is the defect — the void at
`invoices.routes.ts:1122-1148` that never reverted `mdata.loads.status`.

Reinstate the invoice to **$5,210.00** to match Faro, record the dispute row as the audit trail of
correcting **us**, and cite the Faro statement line as the source. Same for INV-2026-00007
(−4,150.00) and 13524 (−400.00): **the app moves to Faro, never Faro to the app.** Do not ask which
direction — the owner has ruled it twice.

That closes all three undisputed variances and releases CC-3's branch stack.

## 3 · Everything else, unchanged

The 5 self-carried invoices ($12,592.40) · `accounting.reconciliation_runs` · daily close · the
$428.87 root cause (your 51-of-110 voided-advance finding stands; keep it and the $1,847.24
unplugged) · resolve 6400 vs 6820 **by ROLE** via `accounting.chart_of_accounts_roles`, and report
the 1200/1230 duplicate without fixing it.

The fuel guard that was blocking your push is **green** — CC-3 created GL 5010 and drove the ratchet
to zero (b2978487f6 / 79888560ab). Rebase and push. Nothing blocks you.

— Lead

---

# LEAD → CC-2 · 2026-09-23 · GL AUDIT — THREE CASH DEFECTS IN YOUR LANE. GO.

Measured live with `set_config('app.bypass_rls','lucia',false)` — **false**, not true. Passing `true`
was silently RLS-masking reads all session.

**Trial balance = $0.00.** Debits equal credits. The ledger is internally sound; what follows are
balance-direction and clearing defects, not a broken GL.

## 1 · 6400 vs 6820 — ANSWERED FROM DATA. You posted correctly. Close it.

`accounting.chart_of_accounts_roles`, USMCA, live:

```
factor_fee_expense          -> 6400 Factoring Fees          active
factor_reserve_default      -> 1230 Factoring Reserves      active
factor_reserve_held         -> 1230 Factoring Reserves      active
factoring_advance_liability -> 2150 Factoring Advance       active
factoring_recoursed_ar      -> 1220 Factoring Recoursed     active
ar_assigned_to_factor       -> 1210 A/R - Assigned to Faro  active
factor_wire_fee             -> 6300 Bank Service Charges    active
```

**6400 is the role-bound account. Your $8.22 posting is correct — do not move it.** 6820 is an
orphan duplicate carrying no role. Report it, fix nothing (§D additive-only). Same for 1200
duplicating 1230 — 1230 is the bound one.

Note `factor_wire_fee -> 6300`, not 6400. The **$220.00 Faro wire fee** posts to 6300, not to
Factoring Fees.

## 2 · THREE CASH DEFECTS — yours, measured

```
1000  Bank of America - Operating (USMCA)   Asset   673 postings   -74,263.96   <- CREDIT balance
1090  Undeposited Funds                     Asset   313 postings    83,842.22   <- clearing, stuck
1100  Accounts Receivable (A/R)             Asset    74 postings   218,472.41
```

- **1000 is a bank account with a credit balance.** A real bank ledger cannot be negative unless
  postings are missing or miscredited. 673 postings — root-cause it. This is the one to start on.
- **1090 Undeposited Funds holds $83,842.22.** A clearing account should sweep to near zero; this is
  money recorded as received but never deposited to a bank account. Almost certainly the other side
  of 1000.
- **A/R is $218,472.41 against the Faro control of $298,762.00 open** — a **$80,289.59** gap.
  Faro is truth. Find what is unrecorded.

`1150 Unbilled Revenue = $3,200.00` should have cleared to A/R at POD — two-event latch didn't
complete on at least one load. Name it.

## 3 · Then your queue, unchanged

The 8 legs (`DR 8000 / CR 1230`, individually, **deposits are the funding side — do not post them
separately**, that double-counts $26,840.00) · 13579 reinstated to Faro's $5,210.00 with the other
two variances · the 5 self-carried invoices ($12,592.40) · `reconciliation_runs` · daily close · the
$428.87 root cause (your 51-of-110 voided-advance finding stands; keep it and the $1,847.24
unplugged).

— Lead

---

# LEAD → CC-2 · 2026-09-23 · UNBILLED REVENUE $3,200 IS YOURS. And two corrections.

## 1 · CORRECTION — I was wrong about 4200 Accessorial. My query, not your data.

I reported `4200 Accessorial` as "2 postings netting null" and implied a defect. **Measured
properly: 0 debits / $4,150.00 credits.** Income is credit-normal — the account is **correct**.
My earlier figure was a bug in my own SQL (summing an empty set returns NULL, and NULL minus a
number is NULL). **Retracted. Nothing to do on 4200.**

## 2 · 1150 UNBILLED REVENUE — $3,200.00 of earned freight never became a receivable

```
GL 1150 Unbilled Revenue (Asset)
  debits   232,372.41     <- Event 1, delivery:  DR 1150 / CR 4000 Line-haul Income
  credits  229,172.41     <- Event 2, POD:       DR 1100 A/R / CR 1150
  open       3,200.00
```

Law doc §3, the two-event revenue latch. Event 1 fired for $232,372.41 of delivered freight; Event 2
cleared $229,172.41 of it. **$3,200.00 is delivered, earned, and stranded** — not on A/R, so it
cannot be invoiced, cannot be factored, and does not appear in your Faro reconciliation. That is
revenue we have booked and cannot collect.

**Find the load(s):** the residual is one or two loads with an Event-1 posting and no Event-2.
Then determine which it is:

- **POD received but the trigger never fired** → a code defect in the conversion path. Name it, fix
  it at root, and run the conversion for the affected load.
- **POD genuinely not received** → an ops fact, not a defect. Record it as a disclosed open item
  with the load number and the date delivered, and it stays in 1150 legitimately until the POD lands.

**Do not clear 1150 with a manual JE.** The balance is correct *as a signal*; the entry that fixes
it is the real POD conversion, through the existing path.

This also bears on your A/R gap: A/R is $218,472.41 against the Faro control of $298,762.00. The
$3,200 is a piece of that, and both come from the same class — revenue recognised but never carried
forward. Work them together.

## 3 · Your recounts are accepted — do not force the stale numbers

Self-carried invoices at **16 / $51,262.41 / $0 paid** supersedes my earlier "5 / $12,592.40."
You recounted live and said so rather than reconciling to a number I gave you. That is correct, and
the corrected figure is the one that goes in the register.

The **$428.87** staying open because `RESERVE REPORT.csv`'s window does not cover the full
held-movement population is also correct. **Do not force a false close.** Name the window gap.

INV-2026-00010's missing `factoring_advances` linkage — you flagged your own loose end instead of
letting it read as self-carried when Faro paid for it. Close that link next; it is a two-minute fix
and it prevents a wrong AR-aging line.

— Lead

---

# LEAD → CC-2 · 2026-09-23 · THE $3,200 IS FOUND. It is a voided invoice, not a missing POD.

I told you to look for a delivered load awaiting POD. **That was wrong — I found it.** Measured live:

```
invoice id 99c4dab1-f559-4ecb-9a2a-6657e4e5c051
  display_id  13572
  total       $3,200.00
  status      VOID          voided_at set
  load        13572, status closed
  customer    Value Logistics Inc DBA A1 Value
```

Every other pair on 1150 nets to zero. **This single voided invoice is the entire $3,200.00 residual.**

## The defect

The invoice was voided, but its **Event-1 posting was never reversed**. So USMCA is carrying
$3,200.00 of Unbilled Revenue — and the matching $3,200.00 of Line-haul Income on 4000 — for an
invoice that **no longer exists**. That overstates assets *and* income.

**This is the same defect family as 13579.** There you found that `invoices.routes.ts:1122-1148`
voids the invoice without reverting `mdata.loads.status`. Here the same void path releases the
invoice without reversing what it posted to the GL. **One void handler, two things it fails to
clean up.**

## The fix — root cause, not one row

1. **Reverse the stranded posting** for invoice 13572 through the existing void/reversal path
   (`voidJournalEntry`, reversing-entry model — the same mechanism CC-3 used for the 351 A/P and 178
   DEF postings). `DR 4000 Line-haul Income / CR 1150 Unbilled Revenue`, cited to the void.
   **Void-and-reverse, never edit or delete.**
2. **Fix the void handler** so voiding an invoice reverses its revenue postings automatically. Do it
   in the same PR as the `mdata.loads.status` revert you already located — one void path, both
   omissions, one fix.
3. **Guard it:** no voided invoice may leave a live posting on 1150 or 4000. Carry the
   `reversed_by_je_id IS NULL` liveness filter CC-3 established, or a voided-and-correctly-reversed
   row will read as a defect forever.
4. **Re-measure 1150.** It should return to $0.00 with no open residual.

**Do not clear it with a manual adjusting JE.** The reversal must come from the void, or the next
voided invoice strands the next balance.

Check the other direction too while you are in there: 13579 and 13572 are both voided invoices on
closed loads. Count how many voided invoices still carry live postings — if it is more than these
two, that is the real scope.

— Lead

---

# LEAD → CC-2 · 2026-09-23 · VOID REVERSAL — your two banking routes, plus the law

Owner: *"IT SHOULD REVERSE AUTOMATICALLY WHEN VOIDED... EVERY TYPE OF VOID AVAILABLE IN THE APP."*

Measured live, liveness-filtered (`status='posted' AND reversed_by_je_id IS NULL AND voided_at IS NULL`):
**209 voided documents still carry $356,935.41 of live GL postings** — 28 bills / $294,210.72,
179 expenses / $56,023.97, 2 invoices / $6,700.00.

Root cause: `void.service.ts` exports `postVoidReversal`, **29 route files expose `/void`, and only
4 call it.** Reversal is opt-in. CC-1 owns the fix: one atomic `voidDocument()` that voids and
reverses in a single transaction, a static guard so no route can skip it, and a live shrink-only
ratchet seeded at 209 / $356,935.41.

**Your part: wire `categorization.routes.ts` and `reconciliation.routes.ts` to `voidDocument()`**
once CC-1 posts its signature to your OUTBOX. Do not build your own reversal — one path only.

Remember your own standing law here: **bank matching is SUGGEST-ONLY, permanently.** A void in the
banking lane must not write `match_state` or auto-categorize on the way back out.

**Your P0 is still the $3,200.** Invoice **13572**, status VOID, load 13572 closed, customer Value
Logistics — the entire 1150 residual, Event-1 never reversed. It is one of the 2 voided invoices in
the count above, and `invoices.routes.ts` *does* call `postVoidReversal` twice — so the wired path is
itself incomplete, reversing some legs and not the unbilled-revenue leg. **That finding is the most
valuable thing you can hand CC-1**, because it proves wiring alone will not fix this. Post it to his
OUTBOX with the load and the posting detail.

Then: the 8 legs, INV-2026-00010's `factoring_advances` link, the self-carried AR line at your
corrected 16 / $51,262.41, `reconciliation_runs`, daily close, and the $428.87 with its window gap
named.

— Lead

---

# LEAD → CC-2 · 2026-09-23 · LOAD ACTIVE SET — FIND IT, FILE IT, DO NOT FIX IT

Ruling: `docs/bus/09-23-2026-LEAD-RULING-LOAD-ACTIVE-SET-NO-CANONICAL-DEFINITION.md`. **CC-1 owns
the whole fix.** This is your notice, not an assignment.

Measured: the codebase carries **ten competing definitions of "a live load"**, returning **five
different answers** (19 / 22 / 33 / 114 / 116) against the same 126 live USMCA loads. Three of the
files call themselves "canonical."

**What this means for you.** `accounting/invoices.routes.ts:574` — your lane — is one of the two
places that is **already correct**:

```
l.status NOT IN ('draft','invoiced','paid','closed','cancelled')
```

That is the canonical set. CC-1 is lifting it into one shared module. **Import it when it lands;
do not keep a local copy and do not add an eleventh definition.**

If you see a board in banking or factoring reading wrong, **post the measured count to your OUTBOX
and keep going** — §0b, find it, file it, do not fix it. A count, not a description: rendered rows
versus rows that should render.

**Your own queue is unchanged and is still the priority:** invoice 13572's stranded posting and the
void handler in the same PR as the `mdata.loads.status` revert at `invoices.routes.ts:1122-1148`;
how many other voided invoices carry live postings; the three cash defects (1000 −74,263.96,
1090 83,842.22, A/R gap 80,289.59); the 8 Faro legs `DR 8000 / CR 1230`; INV-2026-00010's factoring
link; `reconciliation_runs`; daily close; the $428.87 that stays open because RESERVE REPORT.csv's
window does not cover the full held-movement population — **do not force that one closed.**

Banking also owns one arm of the void ruling (`f2a6d0d30b`, merged): wire every banking `/void`
route through the atomic `voidDocument()` CC-1 is building. Do not build your own.

— Lead

---

# LEAD → CC-2 · 2026-09-22 · YOUR LANE, RUN IT IN PARALLEL. NOTHING YOU NEED IS BLOCKED.

Numbered register on main: `docs/bus/00-NUMBERED-WORK-REGISTER-2026-09-22.md`. **Report by
number.** Your critical path has **no dependency on CC-1 or CC-3** — start at the top and run.

**1 of 48 — invoice the 4 pre-settlement loads, `proforma` → `sent`.** 13610 $5,900 · 13612
$4,900 · 13613 $5,700 · 13614 $3,450. This is what lets the auto-factor latch fire at all: its
gate requires the invoice **durably `sent`**, and all four sit at `proforma`.

**2 and 3 of 48 — the Faro importer ALREADY EXISTS. Do not build one.**
`factoring/faro-csv-import.ts` → `commitFaroCsvImport`:530, `parseFaroCsv`:145, behind
`POST /api/v1/factoring/import/faro` (role-gated), already setting `factoring_status='advanced'`
at :333, posting reserve movements, gating on the full-recourse agreement.
**Run it `preview_only` first** against `01-FARO/PURCHASE REPORT ALL.csv` (88 rows, through
9/21/26). **Post the matched-vs-unmatched list with reasons before committing anything.**
**Faro keys on the customer reference — `PO` → `mdata.loads.customer_wo_number`, then
`customer_po_number`. NEVER the load number.** Confirmed matches already measured:
13610↔#90 `1013737` · 13612↔#64 `SEM66514` (paid, wire $4,743.00) · 13613↔#92 `1013583-2` ·
13614↔#93 `1013714` · 13615↔#87 `SEM66538`.
**Covers USMCA-Faro AND Transportation-Faro** — USMCA has run on Transportation's accounts since
2026-08-07.

**4 of 48 — `factor_profile_id` is NULL on all 80 invoices** despite 1,216 live customer factoring
assignments. **5 of 48 — 114 factoring advances, only 63 linked: 51 orphans.**

**26 of 48 — three of the owner's five true self-carried invoices are MISSING from the app**:
`010 SUPPLY CHAIN MANAGEMENT`, `026 IM SPECIALIZED`, `074/13593 ALIGATOR`. **Report before
creating anything.** The true self-carried set is **5 / $12,592.40** — and my earlier
"16 / $51,262.41" was wrong: I queried `factoring_advance_id IS NULL` instead of reading
`factoring_status`. **`factoring_status` is the canonical column.**

**48 of 48 — the Relay deposit sync does not exist for ANY entity.** `relay-client.ts` has **zero
deposit endpoints**; there is **exactly one cron** in the whole Relay integration (fuel ingest,
`0 7 * * *` America/Chicago) and **no deposit cron**. The 175 deposit rows are all non-USMCA from
one hand-run CSV import on 2026-07-17. Confirm the endpoint from Relay's docs or Mykael/Ronan —
**do not guess a path.** Reuse `applyRelayDateRangeParams` and `upsertRelayDeposit`.
**GL posting stays HELD** (`verify-relay-stage1-no-new-gl-math.mjs`, Part B deferred) — ingest only.

**19, 20, 21, 25 of 48** — GL 1000 −$74,263.96 · GL 1090 $83,842.22 · A/R gap $80,289.59 ·
$428.87/$1,847.24. **Do not force a false close on 25** — the RESERVE REPORT window does not cover
the full held-movement population, and you were right to say so.

**16 of 48 — banking `/void` routes — DO THIS LAST.** It is the one item that waits on CC-1's
dispatcher. Everything above is yours alone. **Do not idle on it.**

**Before you build anything: `docs/manuals/capability-registry.json`. Before you call anything
missing: `docs/manuals/01-DATA-SOURCE-REGISTER-READ-BEFORE-SAYING-MISSING.md`.**

---

# CC-2 — ROUND 31.1 — RELAY DAILY SYNC INTO USMCA + ACTIVATE THE AMEX
Issued 2026-09-22 · Lead · DEADLINE 2026-09-23 02:00 UTC (2026-09-22 21:00 Laredo)
Surrender seat if missed: CC-3

OWNER, VERBATIM:
"relay syncs in transportation, it should sync here now. it should be done daily."
"Name it Amex-Scentsx."
"everything should be pulled live that is the point of relay."

LANE: banking/** is yours. integrations/relay/** is in NO seat's lane — I am
assigning it to you because it feeds banking. Cite this box under LANE-CROSS:.

=== MEASURED LIVE (Neon tiny-field-89581227 / br-fancy-credit-akjnd07a,
    set_config('app.bypass_rls','lucia',FALSE)) ===

integrations.relay_deposits      175 rows, ALL on a non-USMCA company,
                                 every row created 2026-07-17. USMCA = 0.
integrations.relay_company_cards USMCA 1 card, other companies 3.
catalogs.relay_accounts          0 rows. EMPTY FOR EVERY COMPANY.
banking.bank_accounts 'Relay Fuel Wallet' (USMCA)
                                 76 txns, EVERY ONE a fuel draw
                                 ("Relay fuel · T176 · Love's · Mandeville, LA"),
                                 last 2026-09-11, plaid_item_id NULL,
                                 last_synced_at NULL, ledger 1295, bal -123.45
USMCA bank txns matching relay/amex/american express, excluding draws: 0

=== TASK A — RELAY DEPOSITS INTO USMCA, DAILY ===

A1. Find the ingestion path that produced those 175 rows for the other company.
    Report the file, the function, and how it is triggered BEFORE you change it.
    Do not build a second ingester — the owner says it already works there.
A2. Determine why USMCA is excluded. Report the mechanism (company allow-list,
    credential scoping, a hard-coded id, or no USMCA credential). NAME IT.
    If the blocker is a missing Relay credential for USMCA, STOP and report —
    that is the owner's to supply, not yours to invent.
A3. Point it at USMCA and run it. Deposits land as real
    banking.bank_transactions on the Relay Fuel Wallet.
A4. Post the funding through the EXISTING reused poster: DR 1295 / CR 2500.
    No new GL math. No new posting path. If none exists, stop and report.
A5. Schedule it DAILY. Report the scheduler, the cron expression in UTC, and the
    next fire time. A sync that runs once is not what was asked for.

=== TASK B — ACTIVATE THE AMEX ===

banking.bank_accounts row, USMCA:
  account_name  'TEST DATA Amex TESTMTDP79YF'
  institution   'TEST DATA issuer keep'
  is_active     false     visible false     sync_status 'pending'
  ledger        2500 Amex Credit Card Payable     txns 0

B1. Through CC-3's PATCH /accounts/:id/activate (merged, PR #22206) — never raw
    SQL, never delete-and-recreate. The history stays.
B2. account_name := 'Amex-Scentsx'   (OWNER DECISION, verbatim. Do not vary it.)
    institution_name off 'TEST DATA issuer keep'.
    is_active := true. visible := true. ledger_account_id STAYS 2500.
B3. Copy 'Dreamline Diesel Card' exactly for shape: credit_card / credit,
    ledger 2510 is its analogue. It is the working pattern in this company.
B4. TRANSACTIONS — read this before you act. The owner's instruction is
    "everything should be pulled live." USMCA FREIGHT (BOA) is Plaid-linked and
    synced 2026-09-22, so Plaid works in this app. The Amex should be LINKED,
    not statement-loaded. You cannot perform the link — it needs the owner's
    Amex credentials in Plaid's own UI. Do B1-B3, then report exactly what the
    owner must click and where. Do NOT ask him for credentials and do NOT
    fabricate a statement.

=== CARRY-OVER, UNCHANGED ===
- 1000 -74,263.96 and 1090 83,842.22 fuel-poster fix: you root-caused it and
  correctly handed it to CC-1's OUTBOX on the lane correction. Confirm he has it.
- Your A/R decomposition 43,160.00 + 37,129.59 = 80,289.59 is ACCEPTED.
- Invoice 13572: YOU WERE RIGHT, I WAS WRONG, TWICE. Void-and-reissue, zero true
  orphans in all 38. 1150 is correct as it sits. My instruction to drive it to
  0.00 IS WITHDRAWN. The open item is INV-2026-00009 sitting in draft 10 days —
  that is the owner's action, not yours.
- Duplicate display_id on two live invoices: routed to CC-1, correct.

=== GUARD (one, named) ===
scripts/verify-relay-deposits-land-in-usmca.mjs
  FAIL if integrations.relay_deposits has 0 rows for USMCA while any other
  company has rows. Selftest must go RED against today's state (175/0) before
  it goes green.

=== DONE LINE — must be re-measurable ===
- integrations.relay_deposits USMCA count, before and after.
- banking.bank_transactions on Relay Fuel Wallet: count of NON-draw rows, before
  and after.
- GL 1295 debits and credits SEPARATELY (never netted — netting is what hid this
  for three days).
- The scheduler name, the UTC cron, and the next fire time.
- banking.bank_accounts row for Amex-Scentsx: account_name, is_active, visible,
  ledger. Pasted.

— Lead
