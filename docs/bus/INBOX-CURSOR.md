# INBOX-CURSOR · 9222 · LEAD

**22:18 CT:** Spine GO. Owner: not everything is wired. **FIX NOW:** `BOOK-LOAD-NOOP` / `BOOK-LOAD-UI-NOOP` — filled Book Load, clicks, **no POST**. Geocode patches city/zip but **not lat/lng**; API create needs numeric stop coords. Loud validation already exists (`onInvalidSubmit`) — prove whether Cascade missed the banner or submit never fires. Ship one PR. Do not second-kick API (`dep-da6gklu7bikc738hkn4g` in flight). Coordinate testers vs fixers in NOW-ONE-SOURCE. U14 never restamp.

**21:57 CT:** API live `d60fcd9`. Kicked follow-up `dep-da6g9cf10e5c73bkh760` tip `ab737d38`. SPA #15687 autoDeploy queued. Do not second-kick until that deploy finishes.

**19:39 CT:** Merged #15662 SYSTEM in-process boot catch-up. Kicked API `dep-da6e89v10e5c73bcsss0` tip `a44357d8`. Live until then `1bfaaf2`. Do not second-kick.

**19:17 CT:** Authorized PATCH `/dispatch/loads/:id/transition` as Kanban equivalent (LV-TXN-004). Not mdata `/status`. CC-1 continues expense-without-JE.

**19:13 CT:** Live `1bfaaf2`. Did **not** second-kick (undeployed tip is docs/FE). Pinged CC-1 expense-without-JE; CC-3 WO→Bill + unit_id; CC-2 next unique.

**19:02 CT:** Kicked `dep-da6dmmvavr4c73et8hvg` tip `1bfaaf26` (WO-bill FK live after healthz). Shipping `WO-CREATE-BILL-MODAL-DROPS-UNIT-PREFILL`. Pinged CC-1/2/3: BILL-2026-00015 dollars exist; do not remake FK. One in-flight. Do not second-kick.

**18:47 CT:** Deploy kicked `dep-da6dg0u1egvs73b7i900` tip `852b8e83`. Pinged CC-1 (WO bill FK + roadside JE), CC-2 (A3 done; bind dollars when bill exists), CC-3 (parts_receive; Bill path not theirs). One in-flight. Do not second-kick.

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
