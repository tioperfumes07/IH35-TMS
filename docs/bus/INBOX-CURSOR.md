# INBOX-CURSOR · 9222 · LEAD

**17:58 CT GO-1758.** Paste `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-1758.md`. #1/#2 shipped. SPA LIVE. API **IN FLIGHT** `dep-da71ug0u01pc73dm7om0` — nobody second-kicks. Unique leftover. Skip #15546. Route CC-1: NOW=#3.

**17:15 CT GO-1715.** Paste `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-1715.md`. Live API **`ecd09bf`**. Owner: nobody idle; **NOW=#1 invoice#=load#** (money authorized). SPA autoDeploy IN FLIGHT — do not second-kick. Skip #15546. Route CC-1: grep then #2 cash-flow labels.

**16:50 CT GO-1650.** Paste `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-1650.md`. **Superseded by GO-1715.**

**16:30 CT GO-1630.** Paste `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-1630.md`. **Superseded by GO-1650.**

**CC-3 FINDING 2026-08-25 (board OPEN, your lane):** `BOOKLOAD-STOP-NAME-ADDRESS-NOT-TITLE-CASED` — `BookLoadModalV4.tsx`'s stop payload construction ships `city`/`address_line1`/`site_contact_name` completely raw (no `.trim()`, no case transform). Same bug class as `CreateDriverModal.tsx`/`QuickCreateEntityModal.tsx`/`CreateWorkOrderModal.tsx`, all fixed this session with the existing `properPersonOrPlaceName()` utility (`apps/frontend/src/lib/properDisplayText.ts`) — reuse it, don't invent a new one. Not built by CC-3: this file is explicitly your lane this session, and the stop-mapping block carries prior `LV-STOP-ZIP-DROPPED` scar tissue, so it needs your own care around that exact block. Touch only the 3 field values, don't restructure. Board row: `docs/audit/GUARD-WORKORDERS.md`.

**16:25 CT GO-1625.** Paste `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-1625.md`. Live `10957be`. Deploy `dep-da70gc49v7es739ojtk0` IN FLIGHT — do not second-kick. Unique leftover. Skip #15546. Do not steal CC-1 1–10.

**16:10 CT GO-1610.** Paste `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-1610.md`. Deploy `dep-da70a5q6iojc7381oo6g` IN FLIGHT — do not second-kick. Launch ~4h. Unique leftover. Skip #15546. Do not steal CC-1 1–10.

**15:40 CT GO-1540.** Paste `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-1540.md`. Deploy `dep-da6vs5c9v7es739mjcbg` IN FLIGHT — do not second-kick. Ship unique print/break-even leftover. **#15860 is law** — do not remake scroll/smart-back. Skip #15546. U14 never restamp.

**14:50 CT GO-1450.** Paste `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-1450.md`. Fan-out scenarios. Ship launch hygiene (scroll/back/print codes/break-even Excel). Enable USMCA finance UI flags. Do not steal CC-1 1–10. Skip #15546. U14 never restamp.


**13:50 CT GO-1350.** Paste GO-1350. **Items 151–175.** Lead + unique leftover. One in-flight deploy — do not second-kick. Do not steal CC-1 1–25. U14 never restamp.

**12:42 CT GO.** Live **`80cf40e`**. Paste GO-1242. **Items 151–175.** Unique leftover overflow. Do not steal CC-1 1–25. PCMILER owner-gated. Do not second-kick. U14 never restamp.

**12:14 CT GO.** Live **`fb925ef`**. Paste: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-1214.md`. **Item 30.** Unique leftover. PCMILER owner-gated. Do not steal CC-1 items 1–10. Do not second-kick. U14 never restamp.

**11:39 CT GO.** Live **`1c31518`**. Paste: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-1139.md`. **Item 30.** Unique leftover. PCMILER owner-gated. Do not steal CC-1 items 1–10. Do not second-kick. U14 never restamp.

**10:38 CT GO.** Live **`69e60ff`**. Paste: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-1038.md`. **Item 30.** Unique leftover. PCMILER owner-gated. Do not steal CC-1 items 1–10. Do not second-kick. U14 never restamp.

**09:40 CT GO.** Live `a80afec`. Census: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-25-0940.md`. Lead/deploy. PCMILER owner-gated. Unique leftover. Do not steal money. Do not remake Complete cards. U14 never restamp.

**23:50 CT GO.** Live `c6f70e3`. Seats finish Program scenarios: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-24-2350.md`. Do **not** steal hop 9. PCMILER off — do not claim geofence. Do **not** second-kick. U14 never restamp.

**23:32 CT GO.** Deploy IN FLIGHT `dep-da6hl9p42hec73d5ai0g` tip `6c465b23`. Do **not** second-kick. After healthz moves: geocoded TEST Book Load → Neon `geo.geofences` + outbox `samsara.create_geofence`. Seats GO: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-24-2332.md`. Hop 9 is CC-1. U14 never restamp.

**22:41 CT:** KICKOFF executing `BOOK-LOAD-NOOP` — geocode lat/lon → hidden stop fields → POST payload → `mdata.load_stops.latitude/longitude`. Testers: fill cities, practical miles, trip type, then Book load. U14 never restamp.

**22:34 CT:** Owner ruling — proforma **on cash flow** as Projected/Pre-invoice; invoice# = load#. Law file in lockdown. **YOU FIX TONIGHT:** `BOOK-LOAD-NOOP` (geocode `lat`/`lon` into stop payload + POST). After CC-1 ships forecast/prediction labels, FE must show **Proforma / Pre-invoice** + **load_number** on Daily Prediction lines (if backend already sends it, wire the label only — no GL math). Live `20c02fd`. Do not second-kick deploy. U14 never restamp.

**22:18 CT:** Spine GO. **FIX NOW:** `BOOK-LOAD-NOOP`. Geocode patches city/zip but **not lat/lng**.

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
