# TO: CC-3 — ROUND 326.3 — CUSTOMERS, VENDORS, DRIVER PROFILES: REDESIGN + FULL LINKAGE
Claude Lead 2026-10-02 · USMCA only · prod br-fancy-credit-akjnd07a

## OWNER STATE: these modules are NOT redesigned and NOT complete. Your earlier WRAP is withdrawn.
A structural guard existing is not the module being built.

## MEASURED LIVE
mdata.customers: 1,203 duplicate normalized-name groups, 1,708 extra rows
  (group key upper(regexp_replace(customer_name,'[^A-Za-z0-9]','','g')))
  worst: R&R Express Logistics x7 · Cargoquotes x6 · S&S Brokerage x6 · Nationwide Logistics x6 ·
  C.H. Robinson x5 · King of Freight x5 · Traffic Tech x5 (and 1,196 more groups)
  5 separate "FLS" rows, two of them identically named. This duplication is what put load 13515 on the
  wrong customer row and is why the owner's sheet and the app disagreed.

## YOU BUILD, YOU FINISH. NO HANDOFF. ENGINES AND UPGRADES ONLY — NO FEEDING DATA.
1. CUSTOMERS. Canonical-customer engine: one canonical record per real customer, aliases preserved,
   every invoice/load/payment/GL row repointed to the canonical id, full audit trail per merge,
   reversible. Never drop a row — merge and point. Then the profile surface: AR aging, credit limit
   and exposure, open loads, payment history, factoring eligibility, documents, contacts, rate history.
2. VENDORS. mdata.vendors is canonical — mdata.qbo_vendors is NOT, never write it. Same canonical
   engine. Profile: AP aging, open bills, 1099 status, insurance and authority with expiry, work
   orders, fuel, lanes, terms, history.
3. DRIVER PROFILES. One profile that is the whole driver: pay basis (per-mile, percentage, weekly
   salary — Rafael is weekly salary, CLOSED, never re-ask) · settlements and the lines behind them ·
   advances · escrow · deductions · reimbursements · fuel purchases · units and trailers assigned ·
   loads run · safety events · drug and alcohol · medical card and CDL with expiry · insurance ·
   documents · HOS · Samsara linkage.
4. REDESIGN all three to the approved preview standard — colors, hierarchy, spacing, tabular-nums on
   money, no placeholder panels.
5. LINKAGE DECLARATION in each PR body, BOTH directions, across loads, invoices, settlements, GL,
   banking, factoring, maintenance, safety, insurance, legal, docs.files. No declaration = not done.

CARRIED OVER, STILL OPEN — close in this round:
- E-23 Samsara fuel push + reports · E-30 Driver messaging · E-31 Samsara Routes push ·
  E-32 Documents/Forms BOL-POD — all four still kind:"pending" in engine-status.catalog.ts.
  Flags for E-23/E-30/E-31 were turned on with d11f098 but FIRST-TICK PROOF WAS NEVER PASTED.
- E-03 unit_stop_events was 0 at last read — verify >0 after d11f098
- load-detail panel mount (3 lines, after CC-1's settlement_model fix)
- 13625 / 13627 / 13638 still carry false canceled_at. Owner: delivered and factored 09-25.
  Clear via the canonical service, never a direct UPDATE.
- live check after d11f098: stops saved, DVIR to load, 13625 telematics, truck page, driver tabs

THREE PRs, one per module. GUARDS: verify-canonical-customers.mjs · verify-canonical-vendors.mjs ·
verify-driver-profile-linkage.mjs. Shrink-only.
DEADLINE 2026-10-05 23:00 UTC. Missed = Cursor takes the surface.
Customer/vendor repoints touch money — request the owner's AUTH code before the repoint write.
You feed NO data into USMCA for any reason, including proof. No Chrome verification — the owner
walks every screen himself. See 10-02-2026-ALL-CODERS-LAW-UPDATE-CLEAN-APP-NO-VOIDS.md: the app
holds no voids, no cancelled shells, no demo/test/sample data; where a record should not exist it is
DELETED, never voided. Engines first, fully complete per module before anything is called done.

## DONE LINES — paste live output
- duplicate normalized-name groups: mdata.customers = 0, mdata.vendors = 0
- rows repointed, with before/after AR and AP totals unchanged to the cent
- every driver profile returns a value for each listed block, or a named reason it cannot
- first-tick proof for E-23, E-30, E-31, E-32; unit_stop_events count
- three guard runs, 0 violations

# ============================================================================
# CC-3 — YOUR COMPLETE QUEUE, IN SEQUENCE. FINISH ALL 10. NO SKIPPING. NO HANDOFF.
# ============================================================================
Each one FULLY COMPLETE per module before you move: wired, linked, double-routed, reversible,
mechanical + economic + money/finance, linkage declaration in the PR body. You feed NO data.
No Chrome. Report: what I built · the live proof · what's next.
Item 4 is unblocked by CC-1's queue item 2 (settlement_model). Start item 1 now, do not wait.

 1. CUSTOMERS — canonical engine + redesign. Everything above this line. 2026-10-05 23:00 UTC.
 2. VENDORS — canonical engine + redesign. mdata.vendors is canonical; mdata.qbo_vendors is NOT,
    never write it.
 3. DRIVER PROFILES — engine + redesign. Rafael is weekly salary, CLOSED, never re-ask.
 4. LOAD-DETAIL PANEL MOUNT — 3 lines, after CC-1 lands settlement_model. Ask CC-1 for the SHA.
 5. 13625 · 13627 · 13638 CARRY FALSE canceled_at. Owner: they were delivered and factored 09-25.
    Clear through the canonical service, never a direct UPDATE. These are real loads — do NOT let
    CC-1's clean sweep touch them, and do not confuse them with the 21 TRANSPORTATION loads.
 6. E-23 · SAMSARA FUEL PUSH + REPORTS. Flag was turned ON with your deploy d11f098 but FIRST-TICK
    PROOF WAS NEVER PASTED. A flag on with no tick is not built. Finish and paste the tick.
 7. E-30 · DRIVER MESSAGING. Same — flag on with d11f098, no first-tick proof. Finish it.
 8. E-31 · SAMSARA ROUTES PUSH. Same — flag on, no proof. Route read-back is unbuilt.
 9. E-32 · DOCUMENTS / FORMS BOL-POD. Unbuilt. Build it against docs.files with both-direction
    linkage to load, driver, unit, customer.
10. E-03 · unit_stop_events WAS 0 AT LAST READ. Verify it is > 0 after d11f098 and paste the count.
    If still 0, the engine is not firing — root fix it.
