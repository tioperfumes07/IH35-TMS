# LEAD RETRACTION — THE MILES WERE ALWAYS IN THE APP. I DRIFTED.
# ALL SEATS. Read before touching anything mileage, MPG, fuel or settlement related.

Owner, verbatim: "This is a different engine than the one from August. Or the previous
engine. You drifted, all that data is in the app and company and driver settlements.
Get them done."

He is right and I was wrong. I spent hours chasing Samsara odometer as though MPG were
blocked on it. It was not. **MEASURED LIVE 2026-09-30, USMCA, past 50 days:**

    mdata.loads                    151 loads
      miles_practical present      148  (98%)
      mileage_source present       148  — History 136 · Routing engine 11 · Manual 1
      loaded_miles present         102
      empty_miles present           16
      SUM(miles_practical)     216,035 mi

    fuel.fuel_transactions         380 transactions · 13 units · 29,646 gallons

    MPG = 216,035 / 29,646 = **7.287**

That is computable RIGHT NOW, from data that has been sitting in the app the whole time,
with its source LABELLED on 148 of 151 loads. No odometer required. No Samsara required.

## THE RULING, so nobody repeats my mistake

There are TWO mileage engines and they are not the same thing:

  **ENGINE A — BILLED/PAID MILES.** `mdata.loads.miles_practical` /
  `loaded_miles` / `empty_miles`, with `mileage_source` naming where each came from.
  This is what customers are billed on and drivers are paid on. It is ALIVE, it is 98%
  populated, and it is what the company and driver settlements already use. **This is
  the engine for MPG, for settlements, and for every report the owner is asking for.**

  **ENGINE B — REAL DRIVEN MILES.** Odometer at geofence crossings
  (`telematics.load_odometer_segments`, 40 rows, dead 2026-08-26 → now refed). This is
  the VERIFICATION engine — it tells you whether the billed miles match the road. It is
  valuable and we are building it, but nothing waits on it.

I treated B as a prerequisite for A. It never was. Build A now, finish B alongside.

## THE 50-DAY / ONE-UNIT / LOVE'S PROBE THE OWNER ASKED FOR — RESULT

`geo.geofences` holds **604 Love's fuel-stop geofences**, all active.
Love's enter/exit events, past 50 days, by unit:
    T175 88 · T168 82 · T152 77 · T176 72 · T164 65 · T171 54 · T177 52 · T173 36

T175's trail reads cleanly — real store numbers, real cities, clean enter/exit pairs:
    2026-09-17 04:15:05  Love's #706 — Staunton, VA      entered
    2026-09-17 04:19:46  Love's #706 — Staunton, VA      exited
    2026-09-17 09:10:04  Love's #787 — Mosheim, TN       entered
    2026-09-17 09:45:01  Love's #787 — Mosheim, TN       exited
    2026-09-18 06:00:07  Love's #227 — Lake View, AL     entered
    ...

**But the odometer next to EVERY one of those events is NULL** — they all fall inside the
2026-08-26 → 2026-09-30 blackout. So real driven miles CANNOT be reconstructed for the
past 50 days from odometer. It starts accruing from today forward, now that the feed is
fixed.

That is the honest answer to the probe: the geofence spine is excellent and the fuel
stops are all there; the odometer for that window is simply gone and will not be invented.

## WHAT EACH SEAT DOES WITH THIS

**CC-3** — T-21 changes shape. Capture odometer at every Love's / DOT / pickup /
delivery / yard crossing GOING FORWARD, source always labelled. Do NOT attempt to
reconstruct the blackout. Also measure whether GPS-trail distance between two geofence
crossings is accurate enough to stand in where odometer is absent — if it is, it is a
labelled source (`gps_trail`), never presented as an OBD read. T-01 still first.

**CC-2** — B-25's fuel recommendation engine now has everything it needs TODAY: 604
Love's geofences, live enter/exit events per unit, and 380 fuel transactions to
reconcile against. Build it against ENGINE A. Do not wait on odometer.

**CC-1** — MPG and driven miles on the company settlement come from ENGINE A with
`mileage_source` carried through to the document, so every printed MPG can say what its
miles were based on. `mpg_method` already exists for exactly this. Never print an MPG
whose miles cannot name their source.

**CURSOR** — unchanged: C-20 driver profile, C-21 maintenance, C-22 tabs and KPIs,
C-23 Kanban drag, C-24 QuickBooks parity tail. Where a screen shows MPG or miles, show
the source label beside it.

**CODEX** — unchanged: X-16 → X-18 → X-19 → X-17 → X-20.

## STANDING
Owner freeze holds: no seat writes money, accounting or load data. Everything above is
code and measurement. USMCA only. Never a test row, including for proof.
