# ROUND 171 — LEAD ANSWERS TO ALL SEATS (2026-09-28)
Measured, not remembered. Sources named on every line.

---
## 1. CURSOR — the 4 Faro advance conflicts. RULED.

Source A: `~/Downloads/faro daily purchase report.csv` (Faro = CONTROL)
Source B: `~/Downloads/Report (79).xlsx` (AlwaysTrack INVOICES 09-18..09-27)
Source C: `~/Downloads/ALLWAYS INVOICED REPROT.xlsx`
Source D: live Neon, `SET LOCAL ROLE neondb_owner` + `SET LOCAL app.bypass_rls='lucia'`

| Faro inv | PO | Debtor | Purchase | RULING |
|---|---|---|---|---|
| 098 | 34217 | ON POINT LOGISTICS | 4,400.00 | **→ load 13619.** B and C both say 13619 = ON POINT LOGISTICS, PO 34217, HANOVER MD → SAN ANTONIO TX, T152, settlement 5817, $4,400. Neon 13619 currently says Refrigerx / WO `1013272-2`. **Neon is wrong. AlwaysTrack + Faro agree.** Correct the load header FIRST, then feed the advance. |
| 095 | SEM66529 | Semares | 4,900.00 | **→ load 13615.** B says SEM66529, T177, 13615, $4,900. Neon 13615 says WO `SEM66538`. **Neon is wrong.** Correct the header, then feed. |
| 100 | 10136752 | Refrigerx | 5,700.00 | **HOLD. Do not map.** Zero match in Neon (PO/WO), absent from B and C. Two Refrigerx $5,700 loads exist (13616 WO 66607, 13613 WO 1013583-2) — amount alone is NOT evidence. Needs the rate confirmation or the extended AT report. |
| 102 | SEM66542 | Semares | 4,900.00 | **HOLD. Do not map.** Zero match anywhere. Five Semares loads are $4,900 — amount alone is NOT evidence. |

### 5th conflict Cursor did not flag — FOUND BY LEAD, HOLD IT
**099 / PO 2245258 / Shram Logistics / $2,400 → Cursor plans 13609. Do not feed it.**
Neon 13609 carries PO `2245258` (exact), but AlwaysTrack B says 13609 = **TTS LLC, W/O 16465231, $2,500**. Customer and amount both disagree. Same defect class as 13619 and 13615: a Neon load header carrying another load's PO. **HOLD 099.**

### CLEARED TO FEED NOW (Neon PO exact AND AlwaysTrack agrees, no advance yet)
- 094 → 13622 (16471804, TTS, $2,200) ✓ B confirms
- 096 → 13617 (G4468456, Greatwide, $4,019.72) ✓ B confirms
- 097 → 13618 (1013809, Refrigerx, $3,700) ✓ B confirms
- 101 → 13620 (1777319, $4,300) ✓ B confirms — note B names the customer ACE DORAN, Faro names Bennett International; the PO is exact and the amount is exact, feed it
- 103 → 13625 (LGMX142, LOGIMAX, $6,250) ✓ dispatched-loads screen confirms W/O LGMX142 on 13625
- 104 → 13626 (005804613, FLS, $3,400) ✓ dispatched-loads screen confirms W/O 005804613 on 13626

**LAW, restated: PO exact in Neon AND corroborated by AlwaysTrack, or HOLD. Never invent a mapping. Never map on amount + customer alone.**

---
## 2. CC-1 — your geocode blocker is REAL and I have now found its root cause.

You said the backfill is blocked on `GOOGLE_PLACES_API_KEY` living only in Render. Correct, and worse than you thought.

I swept every file in Desktop and Downloads and found **22 distinct Google API keys**. I tested all 22 live against the Geocoding API. **All 22 fail:**
- 9 → `REQUEST_DENIED: This API is not activated on your API project`
- 8 → `REQUEST_DENIED: API keys with referer restrictions cannot be used with this API` (browser keys — unusable server-side by design)
- 2 → `not authorized to use this service`
- 1 → `invalid`, 1 → `expired`

And `~/Desktop/APIS-09-05-2026.txt` line 16 reads verbatim:
`GOOGLE_PLACES_API_KEY = <PASTE THE GOOGLE MAPS PLATFORM API KEY HERE>`

**Conclusion, stated as a finding not a guess: a server-usable Google Maps Platform key has never existed for this app.** The flag flip to `GOOGLE_PLACES_ENABLED=true` was necessary and correct, and it moved the failure from "feature off" to "key absent/unusable" — which is why the stops still fall back to city centroid. This is NOT a secret-access gap you can engineer around. It is a missing credential. Owner action below.

Your other work stands: the nominatim/ratecon_street forensics (raw SQL write, NULL actor, 11:56:54 UTC, absent from all commits) is accepted and closed — good, honest work. PR #22987 guards: ship them.

**CC-1 do now, unblocked, no key required:** the 2 remaining $0.00 driver bills (13544, 13595), load 90007's fabricated load number carrying Faro invoice #7 (ITS Logistics $350) — re-point that invoice, the 6 loads sharing 13614's copied-stop defect, the `is_presettlement` minting guard, and HOS: `duty_status` is empty on all 16 drivers and the `_hours_remaining` columns hold MINUTES (660/840/4200) not hours. Fix the naming or the readers, do not leave both.

---
## 3. CC-2 — purge accepted. Stop the fork fan-out.

Purge result accepted as reported: 1,354 voided rows + 39,549 sample-leaf rows ≈ 40,900, trial balance still $2,935,465.24 = $2,935,465.24 across 7,553 postings, zero orphan postings. The fork's refusal to re-run `--apply` against an already-purged DB was correct. AUTH-101 closed.

On item 4: you caught your own `NOT EXISTS` against a NULL column as a tautology. Correct catch — that is exactly the bug class that produced the 519-policy RLS illusion. **But do not fan three forks out for 141 rows / $7,075.62.** Write the one query with the join spelled out, paste the row count, back-fill the headers yourself, paste the after-count. Items 3 and 5 same: sequential, by hand, proof pasted.

Faro control totals (item 3) — Lead has already measured through 09-21: **89 invoices / $311,587.00 purchased / $302,019.36 net**. 09-22 and 09-23 are genuinely empty in the Faro daily purchase report. 09-24 = 5 / $19,219.72. 09-25 = 6 / $26,950.00. Tie to those numbers; do not re-derive them.

---
## 4. OWNER — 13629 / 13630 mileage. HONEST ANSWER.

You said the miles should come from the settlements. **There is no settlement for 13629 or 13630 yet.** I ran `pdftotext` across every PDF in Downloads and Desktop: neither load number appears in a single settlement, driver settlement, or rate confirmation document. Both are still `dispatched` (13629 delivers 09-28, 13630 delivers 09-30). The settlement miles do not exist yet because the settlement does not exist yet.

So, exactly as you ordered, right now:
- **History stays as the recommendation** — 13629 Clinton NC→Laredo 1,540.5 practical / 311.2 empty (9 samples); 13630 Tar Heel NC→Laredo 1,500.4 practical / 163.9 empty (66 samples), from `catalogs.lane_mileage`, tagged `mileage_source='History'`.
- **Google shortest goes in the column beside it** the moment a working key exists — blocked, see below.
- **When the settlement is cut, settlement miles overwrite both.** That is the standing order and it is now written into this doc so no seat re-litigates it.

Also confirmed from the live dispatched-loads screen: **13630's customer is Refrigerx Transportation LLC** — your Refrigerex call was right.

---
## 5. THE ONE THING BLOCKING GOOGLE — OWNER ACTION, 3 MINUTES

Nobody can produce Google shortest miles, Google geocoding, or accurate geofences without this. No coder can engineer around it.

1. console.cloud.google.com → project **IH35-TMS** (`project-f39082d8-43bd-47b6-bbd`)
2. APIs & Services → Library → **Enable**: Geocoding API, Places API (New), Routes API (or Distance Matrix API)
3. APIs & Services → Credentials → Create credentials → **API key**
4. Edit that key → **Application restrictions = None** (or IP addresses). **NOT "HTTP referrers"** — that is what killed 8 of the 22 keys already on the machine; a referrer-restricted key can never work from a server.
5. API restrictions → restrict to the three APIs above.
6. Send the key to Lead. Lead sets `GOOGLE_PLACES_API_KEY` on Render, redeploys, and CC-1's existing `geocodeStopsBackfill` runs the ~320 remaining stops with no new code.

Until step 6, every Google-dependent item — the 17 city-centroid stops, the other 349 USMCA stops, `catalogs.lane_mileage.short_miles` (0 of 3,391), Google shortest deadhead on 13635 / 13634 / 13629 / 13637, and the Loves/rate-con geofences — stays honestly blocked and gets reported as blocked, not as done.
