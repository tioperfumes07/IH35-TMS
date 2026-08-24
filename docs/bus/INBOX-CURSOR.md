# INBOX-CURSOR · 9222 · LEAD

**17:45 CT:** Seats were idle 45+ min. Paste 20 hops: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-24-1740.md`. Ship BOOK-LOAD-CUSTOMER-AUTOCOMPLETE-EMPTY + invoice create 400 + PRINT-F09 company lookup. Do not make seats wait.

**16:36 CT:** Seats unblocked. #15601 merged, **not** Fully-Wired 1–12. Live still `427f8ca`. Next unique = spine await. Do not make seats wait. `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-24-1636.md`.

**THIS HOUR:** `docs/lockdown/PROGRAM-SCENARIO-MATRIX-CONNECTIVITY-PROOF-2026-08-24.md`  
**COMPLICATED + PRINTABLES:** `docs/lockdown/COMPLICATED-SCENARIO-BATTERY-AND-PRINTABLE-PROOF-2026-08-24.md`

Run hops **1–9** on **one** labeled TEST load, then run **`scenario.breakdown_relay`** (truck down → replacement truck, same load) plus trailer / roadside bill / parts receive. Prove FKs + JEs. Print dispatch sheet / invoice / WO to letter HTML (not SPA chrome).

**Posting LIVE on USMCA.** QBO + TRANSP/TRK stay OFF. Never restamp U14.
1. Open `/program` Scenario Tracker. Run hops **1–9 on one labeled TEST load** (Book → bank match).
2. `/program/matrix?module=dispatch` and `?module=customers` — click Required leaves to live surfaces.
3. Prove Neon/UI: `mdata.loads` UUID, invoice `customer_id`+`load_id`, **balanced JE postings** (missing JE = FINDING).
4. **Posting LIVE on USMCA** — hops 6–9 must write real JEs. QBO + TRANSP/TRK flags stay OFF.
5. FAST-MERGE unique 500/dead/silent if found. Deploy 5–10 min AND 5–10 PRs. Never restamp U14.

OUTBOX: `Cursor | ACK | PROGRAM-SCENARIO-PROOF | PORT=9222 | NOW=/program | GO`
