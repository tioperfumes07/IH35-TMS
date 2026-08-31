# RULING — THE 2026 ROSTER IS ALREADY RECONCILED · BILLS MUST AUTO-CREATE ON EVERY PATH
2026-09-01 02:45Z. Owner: *"we create accounts for drivers from 2026 only… you reconciled yesterday
with Cursor, check the history."* **Found it. No question needed. Here is the answer.**

## 1 · WHY `hire_date` CANNOT DEFINE "2026" — do not use it
```
drivers with hire_date >= 2026-01-01 ......  5   (2 Active, 2 Inactive, 1 Terminated)
drivers with NO hire_date at all .......... 170  (84 Active, 7 Probation, 79 Inactive)
```
**`hire_date` is empty on 170 of 175 drivers.** Filtering on it would create accounts for **2 people**
and miss the entire working roster. **Nobody uses `hire_date` to scope this.**

## 2 · THE ANSWER — the roster we reconciled from the owner's own August files
Union of distinct drivers across `CC-1-DRIVER-SETTLEMENTS` · `-DEDUCTIONS` · `-EXPENSES` ·
`-ADD-PAYMENTS`: **15 real drivers** (plus two non-driver artifact rows, "Driver Pay" and "No",
which are excluded).

**THE 2026 ROSTER — this is the scope, and nothing wider:**
```
 1 ALFONSO HIDALGO CHAVEZ            9 Jorge Luis Infante Corona
 2 Angel Alfonso Sosa Perez         10 LUIS ARMANDO SOSA PEREZ
 3 Concepcion Cordova Dominguez     11 Leonel Antonio Morales
 4 Genaro Guerrero Chavez           12 Neftali Coronado Urbano
 5 HUGO GAYTAN SARABIA              13 PEDRO ABRAHAM LOPEZ COLLADO
 6 JORGE FLORES VALADEZ             14 Rafael Rogelio Rivero Reynoso
 7 JOSE ANTONIO VICENTE MARTINEZ    15 Ruben Pedro Perez Garcia
 8 JOSE MIGUEL DE SANTIAGO PALACIOS
```
**Independent cross-check:** querying Neon for drivers with any 2026 settlement or driver-bill
activity returns **16** — the same population. The two methods agree. **Of those, 13 are missing an
escrow (liability) account and 6 are missing an advance (asset) account.**

**SCOPE RULING: create the account PAIR for these 15 only. NOT 73. NOT 94.**
The remaining historical drivers are **deferred** — the owner will backfill later, after verifying
no escrow is owed. **Nobody touches them.**

**Match them by the CANONICAL person key, not raw name.** These are exactly the names that broke
exact-string matching earlier (`Leonel / Antonio Morales Noguez`, `HUGO / GAYTAN`,
`ANGEL / ALFONSO SOSA`). Resolve each to one canonical driver row. **If a name resolves to two
Active rows, STOP and report — do not create accounts against a duplicate identity.**

## 3 · RULING — the driver bill must AUTO-CREATE on EVERY path
Owner: *"the bills should have been created automatically if they were done by hand or manual through
Chrome process."*

**This is the real defect and it is bigger than the 39 loads.** Bill creation is currently
**path-dependent** — it fires on one booking route and not on others. That is why:
- **39 loads** reached delivered/completed with **zero driver bills**
- **16 of them are REAL, not test, carrying $14,789.50 of revenue** with no driver pay recorded
- 19 had a valid rate and still got no bill · 20 had no rate at book time

**THE FIX — CC-1 owns:**
1. **Bill minting moves to a single shared path that EVERY route calls** — Chrome UI, manual/hand
   entry, import, API, any future route. **One minting function. No route may create a load without
   passing through it.**
2. **It must not silently skip.** If it cannot mint — no rate, missing driver — it **fails loud** and
   the load carries a visible "driver bill missing" state. **A silent skip is what created all 39.**
3. **A repair path a HUMAN can reach.** Today there is no screen that can re-create a missing bill,
   which is why 39 loads sit unfixable. Under the permissions law: owner and accountant can mint a
   missing bill from the load, **confirmed and logged** — actor, timestamp, load, driver, rate, reason.
4. **Then repair the 39** through that path. **Real ones first — the 16 carrying $14,789.50.**
5. **Guard + selftest, NAMED IN A WORKFLOW:** no load may reach `delivered_pending_docs` or beyond
   without either a driver bill or an explicit, logged reason recorded for its absence.

## 4 · UNCHANGED
Nothing is voided yet — the 421-row list is published and held. Backfill for pre-2026 drivers is
**deferred by the owner**. Reconciliation comes later.
