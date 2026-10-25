# CC-3 — 45 pending rows (measured 10-25 1:40 PM CT: register minus everything merged to main since 10-24 5:15 PM)

Work top to bottom. When a row is merged, change nothing here — the Lead re-measures from main.

| # | Area | Item | Round |
|---|---|---|---|
| 5 | All | Names proper-case automatically (people), org casing kept (ACME) | 443.266-A |
| 18 | Design | Every board implemented exactly (no layering) | 443.280 |
| 19 | Data | One canonical source per entity across all views of the same type | 443.270-B |
| 40 | Reports | Reports › Home — board verdict LAYERED | 443.280 |
| 41 | Reports | Reports › Trial balance viewer — board verdict PARTIAL | 443.280 |
| 42 | Customers | Customers › Home — board verdict CHROME-ONLY | 443.280 |
| 43 | Vendors | Vendors › Home — board verdict CHROME-ONLY | 443.280 |
| 80 | Dispatch | Load 13699 Bradley IL delivery stop city-only (no street/ZIP) | 443.278 |
| 122 | Home › Overview › Driver day summary | D003: Names render all-uppercase | 443.257-D |
| 137 | Fuel › Cards › Assign card drawer | D018: Six input controls measured 38px high | 443.257-D |
| 141 | Dispatch › Home › Return / idle / missing-bill tables | D022: Driver names all-uppercase | 443.257-D |
| 145 | Dispatch › Load Costs › Driver names | D026: All-uppercase names | 443.257-D |
| 147 | Tasks › Create Task › Inputs | D028: Eleven single-line inputs measured 38px high; textarea excluded | 443.257-D |
| 150 | Driver Hub › Driver Scheduler › Driver cells | D031: All-uppercase and inconsistent surname casing | 443.257-D |
| 151 | Driver Hub › Driver Scheduler › Assign Temp Cover | D032: Five single-line inputs measured 38px high; pickers about 2,477px wide and dates about 1,203px | 443.257-D |
| 153 | Maintenance › Create Work Order › Drawer inputs | D034: Visible single-line inputs measured 38px; customer picker about 2,408px wide, open-date input about 766px | 443.257-D |
| 155 | Safety › Hours & Fatigue › Driver roster | D036: Mixed proper-case and all-uppercase driver names | 443.257-D |
| 156 | Safety › Hours & Fatigue › Create HOS Violation | D037: Seven visible inputs measured 38px high | 443.257-D |
| 157 | Compliance › Filings / Overview › Driver labels | D038: Mixed proper-case and uppercase driver labels in populated tables | 443.257-D |
| 158 | Driver Profile › Create Driver › Identity step | D039: Fifteen visible inputs measured 38px; CDL state about 199px wide | 443.257-D |
| 159 | Fleet › Create Trailer › Identity drawer | D040: Seven visible inputs measured 38px high | 443.257-D |
| 160 | Insurance › Policies › Create policy step 1 | D041: Eight visible inputs measured 38px high | 443.257-D |
| 163 | Accounting › Home › Settlement / transaction links | D044: Driver/vendor names still all-uppercase | 443.257-D |
| 166 | Factoring › Home › Ready-to-factor customers | D047: All-uppercase customer names displayed | 443.257-D |
| 167 | Customers › Create Customer › Billing address | D048: State and ZIP each measure 38px high and 209.33px wide | 443.257-D |
| 168 | Customers › Directory › Customer display names | D049: Mixed uppercase and proper-case customer labels | 443.257-D |
| 169 | Inventory › Create part › Unit cost | D050: Money input measures 28px high | 443.257-D |
| 170 | 425C › Profiles & Defaults › Company Name | D051: Input measures 30.67px high | 443.257-D |
| 172 | Lists › Names Master › Name column | D053: Mixed uppercase and proper-case customer names | 443.257-D |
| 173 | Reports › Custom report builder › Report name | D054: Input measures 26.67px high and 1156.38px wide | 443.257-D |
| 174 | Docs › All Entities › Entity names | D055: Mixed uppercase and proper-case driver names | 443.257-D |
| 175 | Docs › Upload Document › Category/entity/date inputs | D056: Four visible inputs 38px; date fields about 1201px wide | 443.257-D |
| 176 | Users › Master-detail › User labels | D057: Repeated generic User labels and mixed name capitalization | 443.257-D |
| 177 | Users › Create User › Name/email/role | D058: Three visible inputs 38px high | 443.257-D |
| 182 | Reports › Scheduled subscriptions › Add subscription timezone | D063: Input measures 30.67px high | 443.257-D |
| 193 | Dispatch › Truck Line › Initial data requests | D074: Network capture: truck-line 11,425 ms; units-without-load 4,810 / 8,819 ms; positions/latest 4,193 ms; detention/board 3,217 ms | 443.257-D |
| 197 | Maintenance › Road Service / Create Roadside WO › Ticket # and Location inputs | D078: Two single-line dialog text inputs measure 38 CSS px high | 443.257-D |
| 221 | All modules | Override: one reasons catalog + one button app-wide; owner/accountant confirm only; others dropdown; no typing | 443.294 |
| 257 | Dispatch | ENG-22 G2: 195 of 198 loads on one trailer type id that does not resolve in catalogs.equipment_types — verify reefer vs dry van | ENG |
| 258 | Dispatch | ENG-23 G3: audit loads booked under the old oldest-customer fallback against their documents | ENG |
| 259 | Settlements | ENG-24 G4/G5/G13: prod checks — Creator owed bills posted + voided on Edit; 1 Creator line without a load; Creator expenses carry load links | ENG |
| 261 | Accounting | ENG-26 G8: 991 of 8,057 postings without a load — factoring 155, settlement 105 (rule per load), fuel 27 / expense 24 / invoice 4 documents with no load | ENG |
| 262 | Banking | ENG-27 G6: 458 bank-categorization postings before 10-17 without a load — back-fill or explain | ENG |
| 263 | Engine | ENG-28 posting single door: posting-line-writer.ts still inserts postings beside the engine — fold in or rule | ENG |
| 264 | Settlements | ENG-29 real driven miles: 12 of 198 loads have miles_driven_actual — fill from fence events | ENG |
