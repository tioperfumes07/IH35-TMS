# IH35-TMS — MASTER ISSUE REGISTER · NUMBERED · SEQUENTIAL · PER SEAT
Compiled by Claude Lead 2026-09-29, Laredo CT. Every issue raised by the owner across this session,
numbered and assigned. **Each seat works its list IN ORDER, top to bottom.** A new job given mid-list
is completed, then the seat RETURNS to its next open number. Nothing is skipped, nothing is handed
off, nothing is patched. Mechanical, economic, money, linkage — each seat builds its item COMPLETELY.

STATUS KEYS: OPEN · IN PROGRESS · BLOCKED · DONE-VERIFIED (Lead measured it live) · CLOSED

---
# CC-1 — ACCOUNTING / AP / AR / POSTING
| # | Issue | Round | Status |
|---|---|---|---|
| 1 | **Bill-payment coverage fallback** — `verify-no-document-without-a-ledger` must recognise postings whose `source_transaction_type='driver_settlement'` where the settlement JE is named in the bill's `adopted_from_payrun_gl_run` memo. Mirror the existing `BILL_CLOSED_SETTLEMENT()` pattern on `driver_finance.driver_bills`. **THIS UNBLOCKS CC-2 AND CC-3. IT JUMPS AHEAD OF EVERYTHING ELSE.** | 249 | **OPEN — P0 NOW** |
| 2 | AUTH-089 reinstatement — 10 documented voids with no surviving live row on that document. Start `13549-19`, doc 6232741, $15.25. Then 77 undocumented rows to `expenses_review_queue`, never auto-reinstated, never purged. | 236 | OPEN |
| 3 | **Fix the void/dedupe engine properly** — identity is `(operating_company_id, vendor_uuid, vendor_document_number, transaction_date, total_amount_cents)` **plus unit_id and load_id as reported attributes**. Owner ruling: the void engine must check DATE, VENDOR, UNIT, LOAD and amount — many variables, not two. NULL document number = not comparable = human review. Never key on (load, amount). | 236/248 | OPEN |
| 4 | Post the clean drafts, one `posting_batch_id`, idempotency key per row. **LEAD RULING: use TODAY'S live re-verified set (257 / $14,315.36), not the stale 249 / $15,235.14.** | 248 | **AUTHORISED — PROCEED** |
| 5 | Archive → reinstate → dedupe-fix → resolve dupes → post → purge → prove balances. Steps 0-6 in order. Archive tables must exist and match counts before any delete. | 248 | OPEN |
| 6 | Purge all voided expenses and invoices + their JE pairs. 790 pairs verified PERFECTLY OFFSETTING, $0.00 movement. Exempt: anything reinstated in #2, and the 77 review-queue rows. | 248 | OPEN |
| 7 | Prove nothing moved — trial balance, P&L, balance sheet, A/R and A/P aging, bank balances, BEFORE and AFTER, identical. | 248 | OPEN |
| 8 | **Replace the 7-day rolling window** with a fixed ratcheted population count. NEW STANDING LAW: no blocking guard may derive its verdict from wall-clock time. Plus scanner guard `verify-no-money-gate-depends-on-wall-clock-time.mjs`. | 249 | OPEN |
| 9 | Load **13525** — invoice `total_cents = 0`, status `sent`, issued 2026-08-10, load status `invoiced`. Zero-rate move or a rate that failed to copy? Find out live. Do not delete it; it is not voided. | 249 | OPEN |
| 10 | **The 20 unfactored invoices, $69,685.** MEASURED: all 20 are USMCA loads, ZERO belong to another entity, ZERO are cancelled, ZERO are unlinked. The owner's hypothesis is disproved — these are genuinely delivered, invoiced USMCA loads never sent to Faro. Oldest 2026-08-05. Find why the submission never fired and wire it permanently. | RETRACTED | CLOSED — owner 09-29: these are IH 35 TRANSPORTATION loads, not USMCA. Nothing to send. |
| 11 | Settlement 5787 non-diesel expense total must read **140.20** live after #2. | 236 | OPEN |

---
# CC-2 — BANKING / CHECKS / BILL PAYMENTS
| # | Issue | Round | Status |
|---|---|---|---|
| 1 | P0 code complete (5/5, `58e5356b11`) is blocked on the same ledger guard. **Push the moment CC-1 #1 lands.** Do NOT `--no-verify`, do NOT force-post the 130. | 245 | BLOCKED on CC-1 #1 |
| 2 | **Check-number reconciliation.** 1001-1005 consumed by $1.00 proof checks; next real check is 1006. Report what `check_stock_settings` says, build an AUDITED one-time starting-number reset, guard against reuse. | 245 | OPEN |
| 3 | **Bill payment engine, QBO parity** — `banking.bill_payments` + `bill_payment_applications`. Select payee → open bills panel → tick → applies → becomes Bill Payment (Check). Partial payments, vendor credits, over-apply blocked in the DATABASE. | 245 | OPEN |
| 4 | GL: Dr A/P, Cr bank, one balanced JE per payment, every application traced to its bill. **Double-booking guard is mandatory.** | 245 | OPEN |
| 5 | The 130 adopted bill_payments — **DO NOT POST THEM.** Your P2 finding was correct and it corrected the Lead. They are covered by the settlement JE. CC-1 #1 fixes the guard. | 245 | **CLOSED — you were right** |
| 6 | Re-measure your own held stack: which of B5 / B8 / R218 / R224 actually depended on CC-1 and which was assumed. Push everything that did not. | 242 | OPEN |
| 7 | ROUND 140.3 measurement — due 2026-09-24, now **five days late**. | 225 | OPEN |
| 8 | Loves fuel statement object · two-surface split · materiality threshold distribution — measured options, recommend one each. | 225 | OPEN |

---
# CC-3 — SAFETY / COMPLIANCE / TELEMATICS / GEOCODING
| # | Issue | Round | Status |
|---|---|---|---|
| 1 | **Load 13628 geocode blocker. RULING: NO BYPASS.** You do not push past `verify-stops-are-geocoded.mjs`. The guard is correct and the gap is real. FIX THE DATA: geocode `1 County Rd, Secaucus, NJ` and write the coordinates. If you have no key locally, the Lead supplies the coordinates — ask for them. A bypass here becomes the precedent that lets the next one through. | 247 | **OPEN — NO BYPASS** |
| 2 | Rewrite `verify-cash-flow-reads-delivery-date.mjs` to `due_date = delivery_date + COALESCE(payment_terms_days, 0)`. Guard-fix authorisation granted (ROUND 247). No data write, no special-casing 13624-13639, no report-only. | 247 | OPEN |
| 3 | Push ROUND 234 samsara RLS fix. Ratchet **129 unique locations**, counting LOCATIONS not raw occurrences. | 234.1 | READY |
| 4 | **The 349 ungeocoded stops.** 349 of 382 have no coordinates. This blocks geofencing, deadhead measurement and the downtime engine's location accuracy. Build the geocode path so it runs to completion, not one stop at a time. | NEW | OPEN |
| 5 | ROUND 235 truck line — answer the measured question: does the Net $X / overlap fix require ANY edit to `TruckLineBoard.tsx`? Paste the file list. Split the commit if not. `verify-truck-line-board.mjs` is NOT demoted. | 235 | OPEN |

---
# CURSOR — DISPATCH / LOAD BOARDS / FRONTEND
| # | Issue | Round | Status |
|---|---|---|---|
| 1 | **Load-board linkage defect.** 14−2 money-finished−1 AUTH-061=11; extras T124+T163; canonical=12. | 250/259 | **DONE-VERIFIED** |
| 2 | ONE canonical active-load definition shared by truck line, dispatch and tour views. Truck line aliases `canonicalActiveLoadWhereClause`. Guard LIVE PASS board===canonical=12. | 250/255/259 | **DONE-VERIFIED** |
| 3 | A unit MAY appear twice — when row 2's PU date equals row 1's DELIVERY date, that is the RETURN TRIP. Do not de-duplicate, do not collapse. Chain row 2 visually to row 1. | 250 | OPEN |
| 4 | Unit after **176** renders with no unit shown. Same grouping logic swallowing a row. | 250 | OPEN |
| 5 | Column order, exactly: **UNIT · PRE-SETTLEMENT/TOUR · LOAD · PU DATE · DELIVERY DATE · [TRANSIT LINE]**. The transit line BEGINS under the LOAD column. | 250 | OPEN |
| 6 | Transit line regressions: truck was **GREEN** · truck **ANIMATES and throws smoke** · line **CENTRED** · truck **DRAGGABLE** to change status in transit → on time → at delivery → delivered · **CURRENT LOCATION** renders after the line. Find the commit where this worked and diff; do not reinvent. | 250 | OPEN |
| 7 | Row height too tall. Target: full active fleet visible without scrolling on a standard laptop. | 250 | OPEN |
| 8 | Status dropdown opens **under that load's row**, in place. Not a modal, not a side panel. | 250 | OPEN |
| 9 | **Universal dropdown combo filter box** — one control filtering unit, driver, customer, status, tour number and date range together. Requested before, still absent. | 250 | OPEN |
| 10 | **Responsive width — global.** Pages do not reflow when the window is not maximised. No horizontal page scroll at any width; tables get their own `overflow-x:auto`; text wraps. Fix dispatch first, then report which pages outside your lane still fail. | 250 | OPEN |
| 11 | Account for the 3 allocated check numbers and 4 junk records — answered live (1001-1003 + Smithfield $25 + three $1, all void, live=0). | 240 | **DONE-VERIFIED** |
| 12 | Gate loosenings filed and fenced — `#23123` `acd16f325e`, baseline link1=1 link2=2 accounting-skip=2, guard PASS, GATE-SCOPE = exact-file allowlist of 2. | 240 | **DONE-VERIFIED** |

---
# DEVIN-A — SETTLEMENT DOCUMENTS / FUEL + DOWNTIME ENGINES
| # | Issue | Round | Status |
|---|---|---|---|
| 1 | Fabricated downtime row flagged `is_sample_data=TRUE`, real 2026-09-26 T168 COMSTOCK PARK MI event built with 3 day-reasons. **Lead verified live: 1 real event.** | 246 | **DONE-VERIFIED** |
| 2 | 450-row fuel reconciliation, buckets sum to 450. Root cause named: backfill filtered `archived_at` instead of `voided_at AND gallons > 0`. **Lead verified: 114 tank_events.** | 246 | **DONE-VERIFIED** |
| 3 | `driven_miles` NULL + `confidence='unavailable'` where no odometer. **Lead verified: 149 rows, all unavailable.** | 246 | **DONE-VERIFIED** |
| 4 | `load_fuel_cost` all 149 loads · `unit_mpg` 21 rows. **Lead verified.** | 246 | **DONE-VERIFIED** |
| 5 | 9 guards passing incl. statistical-account exclusion. | 243/246 | **DONE-VERIFIED** |
| 6 | 6 settlement PDFs + 2 invoice PDFs in `docs.files`. **Lead verified.** | 244 | **DONE-VERIFIED** |
| 7 | **Burns are 0. The fuel engine cannot compute consumption without odometers.** Purchases load, burns do not. The engine is built but INERT until CC-3 #4 delivers coordinates and odometer capture starts. Wire the Samsara geofence→odometer capture path now so it populates the moment data flows. | NEW | OPEN |
| 8 | Rebuild the settlement/invoice templates IDENTICAL to the locked design, then regenerate the 6+2 PDFs from the final templates. | 244 | OPEN |
| 9 | Draft expenses appear on settlements, included in margin, FLAGGED unposted; excluded from anything tying to the GL. | 244 | OPEN |
| 10 | Hold guard at **973.53**. Do not relax. It fails for the right reason until CC-1 #2 lands. | 237 | OPEN |

---
# DEVIN-B — AUDIT / INVENTORY / ROUTE SWEEP
| # | Issue | Round | Status |
|---|---|---|---|
| 1 | 129 unguarded casts, tiered, load-to-cash first. Fail-closed, not fail-open. | 233/238 | **DONE-VERIFIED** |
| 2 | Route sweep: 228 exports, 224 mounted, 4 unmounted all explained, 204 frontend-consumed. | 238 | **DONE-VERIFIED** |
| 3 | Push held branch `devin-b/readonly-gate-bypass-defect` once CC-3 #3 lands. | 233 | READY |
| 4 | **NEW — FULL LINKAGE AUDIT, owner order.** Verify every transaction against the LOAD it came from. Audit and wire correctly: cash flow · load boards · pre-settlements · invoices → loads → settlements → GL. Produce the canonical linkage map and every break in it. FIND IT AND FILE IT; the owning seat fixes. | NEW | OPEN |

---
# CODEX — COMPARISON / RECONCILIATION (IDLE — TAKE #1 NOW)
| # | Issue | Round | Status |
|---|---|---|---|
| 1 | **Rebuild the COMPANY tab as a CONCEPT comparison, not a text comparison.** Owner: *"I DIDNT MEAN LITERALLY COMPARE THE TEXT, I MEAN THE TRANSACTIONS — that we recorded or created the document for the same concept for the same quantity."* Compare NORMALISED AMOUNTS BY CONCEPT: line haul total, driver pay total, fuel total, expense total, margin — per load and per settlement. Ignore wording, ordering, `$`, and sign convention. Green when the CONCEPT and the QUANTITY match. | NEW | **OPEN — P0** |
| 2 | **Shared settlements with TRANSPORTATION.** Owner: ours shows 1 load with $2K expenses while AlwaysTrack shows 2 loads with $2K. Our settlement shows ALL expenses and income but NOT Transportation's load. Handle this as a defined class: match on the USMCA subset, report the AlwaysTrack-only load separately, and do NOT mark it red. | NEW | OPEN |
| 3 | The DRIVER tab is accepted — 47 of 48 NET PAY tie to the cent; only 5812 differs and that is the known header-vs-GL defect. Do not rework it. | 239 | **CLOSED** |
| 4 | Report per tab: GREEN count, RED count, discrepancies grouped BY TYPE ranked by count and dollars, total absolute variance, plus separate counts for the AUTH-089 class and the wrong-load-split class. | 239 | OPEN |
| 5 | Provenance of the flat Downloads copy used for company 5782. | 239 | OPEN |

---
# STANDING LAWS ADDED TONIGHT
1. **No blocking guard may derive its verdict from wall-clock time.** Cost is bounded by a ratcheted population, never a rolling window. (CC-1's analysis, adopted.)
2. **When a guard and the database disagree, neither wins automatically.** Establish which is true from the source — the vendor document, the customer's own history — before anybody writes anything. Tonight it went both ways.
3. **Where no odometer exists, `driven_miles` is NULL and confidence is `unavailable`.** Never substitute another mileage number. PRACTICAL is billed, SHORT is paid, DRIVEN burns the diesel.
4. **Never write test, sample or demo records into USMCA — including for proof.** Two seats broke this tonight; both are reconciling it.
5. **The void engine checks date, vendor, unit, load and amount** — many variables, never two.
6. **A false red is the same defect class as a fake green.** Four occurred tonight; all four were shape-comparisons standing in for substance.
