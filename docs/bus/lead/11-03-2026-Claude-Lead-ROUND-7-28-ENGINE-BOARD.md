# ROUND 7.28 — ENGINE BOARD — 11-03-2026 9:40 AM CT (15:40Z) — measured live on prod (read-only, bypass)
Owner 9:23 AM CT (verbatim): "get current, read repo. finish all pending engines now. list all items pending."
Owner law 11-02 6:04 PM CT: "only finall permanent fixes, no patches." · Owner 11-02 4:41 PM CT: fast merge, full permissions.

**RULE FOR EVERY SEAT TODAY: you run the production repair yourself** (Neon fork rehearsal → prod), with the audit trail, and paste the live after-number. "LIVE PROOF: UNVERIFIED — owner runs the script" is NOT DONE (#28167, #28239 both shipped that way — reopened below).

| # | Engine | Live now (11-03 15:30Z) | Seat | DONE = | Deadline (UTC) |
|---|---|---|---|---|---|
| E1 | Relay fills with no driver (row 162) | **262 of 281** fills no driver; **0** drivers carry a Relay id; #28237 shipped the single-id writer | CC-3 | relay_driver_links table (MANY Relay ids → one driver: Angel Sosa holds 2 cards …1314 + …3916; Vicente Santos Contreras 2 cards …2649 + …0417), matcher reads the table, the 18-id mapping below applied, unmatched-with-link = 0, fills with driver ≥ 280/281 | 18:00 |
| E2 | ENG-65 Relay fill expenses without fuel row | **90 / $38,717.03** unlinked (unchanged; #28167 fixed the writer only) | CC-1 | 18 linked, 48 imported then linked, 24 deduped then linked → 0 | 18:00 |
| E3 | Diesel dedupe | live Diesel expenses **316** vs ceiling 272; duplicate fill pairs > 4 | CC-1 | doubled_with_live_fuel_twin 0, pairs ≤ 4, ceiling honest; required-live-load-guard green | 18:00 |
| E4 | Stale Plaid PENDING bank lines (rows 154/156) | **53 lines > 7 days = $51,296.34**, 3 booked; 17 PURCHASE/CHECKCARD pairs $7,614.84 | CC-2 | removed→void, multi-pending retirement, sweep vs Plaid, 3 booked reversed via unmatch → 0; BofA drift re-measured | 18:00 |
| E5 | Edison deliveries (row 260) | 13692/13695 **dispatched**, 13693 **assigned_not_dispatched**; $14,700 not invoiced; **13** open stops not rooftop; #28239 merged with "owner runs repair script" | CC-2 | YOU run the repair: re-geocode 980 New Durham Rd to the dock, replay stop-arrival-from-fence-history → 3 loads delivered_pending_docs; not-rooftop open stops 0 | 17:00 |
| E6 | Samsara phantom units (row 258) | **6 SAM-** units (+3 gateway-serial G… units), 0 references | CC-2 | purged via AUTH purge route, guard 0 | 17:00 |
| E7 | Duplicate drivers (row 263) | **165 rows / 93 people / 72 extra** | CC-1 | 0 exact-name groups; owner queue for Juan Pablo Hernandez Estrada (CDL …0697 vs …0637) + near-duplicate sets; importers resolve-before-insert; unique hard-id indexes | 20:00 |
| E8 | Cash Flow projected expenses (row 261) | AvP projected expenses **$0.00** every day | CC-1 | snapshot projected_expense_cents + AvP reads the daily engine | 20:00 |
| E9 | ENG-64 fuel outside trip window | **110 rows / $38,937.29 / 41 loads** | CC-3 | each row re-attached to the load whose window holds its fill moment (or none) → 0 | 20:00 |
| E10 | Backend tests red on main (row 257) | 35 files / 46 tests (11-02 baseline) | CC-1 / CC-2 / CC-3 per INBOX | 0 failed | 20:00 |
| E11 | ENG-29 real driven miles | **46 of 198** loads have miles_driven_actual | CC-3 | every delivered load with GPS has real miles | 22:00 |
| E12 | ENG-38 periods | 24 of 24 open — owner 11-03: not categorizing yet → no month is final; stays open by design until bookkeeping starts | — | NOT AN ENGINE TODAY | — |
| E13 | Fuel card assignments (row 161) | **0** assignments | CC-2 | cards ↔ units/drivers from Relay card data | 22:00 |

### E1 — Relay id → driver mapping (Lead recommendation; owner 11-02: "on data actions i follow your recomendation")
Evidence = Relay's own name + the truck's load driver at fill time (hits / fills).
| Relay name | id …4 | fills | → driver (Active/Probation survivor row) | load evidence |
|---|---|---|---|---|
| JOSE ANTONIO VICENTE | 2937 | 29 | Jose Antonio Vicente Martinez | 24/26 |
| Jorge Corona | 7497 | 23 | Jorge Luis Infante Corona | 22/22 |
| ANGEL SOSA | 1314 | 21 | Angel Alfonso Sosa Perez | 28/29 |
| ANGEL ALFONSO SOSA | 3916 | 10 | Angel Alfonso Sosa Perez | 9/9 |
| LUIS SOSA | 0990 | 21 | Luis Armando Sosa Perez | 19/19 |
| FERNANDO MECOR | 5431 | 20 | Fernando Mecor Hernandez | 22/22 |
| Neftali Urbano | 7391 | 19 | Neftali Coronado Urbano | 23/23 |
| PEDRO PEREZ | 4404 | 19 | Ruben Pedro Perez Garcia | 18/18 |
| CARLOS MAURICIO | 0522 | 16 | Carlos Mauricio Pena Carvallo | 5/5 |
| (no name) | 2689 | 15 | Genaro Guerrero Chavez | 18/18 |
| Rafael Reynoso | 8768 | 14 | Rafael Rogelio Rivero Reynoso | name (load 4/7 Luis Sosa — shared truck) |
| Leonel Morales | 3301 | 13 | Leonel Antonio Morales | 9/9 |
| EDUARDO AZAEL | 8345 | 13 | Eduardo Azael Flores Ortiz | 12/12 |
| HUGO GAYTAN | 5121 | 12 | Hugo Gaytan (Active row) | 11/12 |
| Vicente Contreras | 2649 | 9 | Vicente Santos Contreras | 2/5 + name |
| VICENTE SANTOS | 0417 | 3 | Vicente Santos Contreras | name |
| PEDRO LOPEZ | 1861 | 4 | Pedro Abraham Lopez Collado | 2/2 |
| ANGEL SOSA | (no id) | 1 | Angel Alfonso Sosa Perez — fill-level only | — |
Apply after E7 merges pick the survivor rows (link to the survivor id). Each link row records evidence + confirmed_by = Lead recommendation 11-03.

### Not engines (counts, 11-03): 230 numbered rows pending of 262 — A 36 · B 33 (board design) · C 7 · E 21 · ENG 31 · F 18 · G 5 · H 74 (screen labels) · NEW 5. By seat: CURSOR 72 · CC-3 54 · CC-2 40 · CC-1 37 · LEAD 10 · OWNER 6 · unassigned 9.
CODEX: ROUND 7.26 / 7.27 audit not delivered (OUTBOX-CODEX last entry 11-02 22:01 CT). Deliver Part 1 (8 verdicts) by 17:00Z and the first 40 rows by 19:00Z.

### LEAD re-measure 11-03 16:40Z (prod, bypass, USMCA)
- E5 DONE-LIVE: 13692 / 13693 / 13695 = delivered_pending_docs; open stops on those loads = 0.
- E6 DONE-LIVE: SAM- units 0, gateway-serial G… units 0 (owned or leased to USMCA, non-sample).
- E7 PARTIAL: 165 rows → 85 unmerged (80 merged into survivors); exact-name groups 0. Open: owner queue (Juan Pablo Hernandez Estrada CDL …0697/…0637), importer resolve-before-insert (CC-1), unique hard-id indexes.
- E10 PARTIAL: main 26 failed / 7934 (repo-root canonical run) → Lead patches in #28272 take it to 15; the 15 left need Postgres. CC-1 + CC-2 apply. #28274 (merged) cleared the stale derived artifacts that turned required-live-load-guard red on every PR.
