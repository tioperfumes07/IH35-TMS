# WIZ-49d — Driver Instruction Sheet: proposed field list for OWNER SIGN-OFF

**Status:** RESEARCH COMPLETE — awaiting owner sign-off on the field list **before** the document body is built. Nothing built yet. "Book and send" stays DISABLED until this list is signed off and the document exists.

**Owner ruling (2026-09-04, verbatim):** "THERE IS THE DRIVER INSTRUCTION SHEET, IT SHOWS ALL INSTRUCTIONS RELATED TO THE LOAD. IT WILL BE IN THE APP BUT WE MIGHT STILL SEND PDF ETC."
- Primary delivery is IN THE APP; PDF stays a send option.
- Carries all load-related instructions; **does NOT carry the customer rate** (that is the rate confirmation — a customer-facing document).

## §7 research (fresh, 2026-09-04 — not from memory)

- **McLeod Driver Sidekick** (LoadMaster driver app): per-load tabs **Stops / Map / Freight / Images**. Stops tab = each stop's key info + appointment + dock + total/next-stop miles. Freight tab = weight, measures, commodity (+ per-commodity safety links). Images tab = required documents with a missing-doc badge. **Pay/settlement is a separate screen, not on the trip card.** RowStop carries per-stop arrival-call / call-before-leaving / dock / seal / temp / detention flags.
- **Alvys Driver Companion + "Load Manifest"**: per-stop pickup/delivery location, scheduled times, **specific instructions**; **schedule type FCFS vs APPT** (window vs single appointment). References: BOL#, seal#, PO, trailer#, commodity, weight, pieces, driver notes. Lumper = accessorial; driver uploads the lumper receipt. Alvys puts schedule times on the **Load Manifest + driver mobile app** and keeps the **Rate Con** as the only rate-bearing (customer-facing) doc — the exact split the owner drew.

Conclusion: both references ship a stop- and instruction-centric driver document that **omits the customer rate**. The Driver Instruction Sheet is that document for IH35.

## Proposed field list (grouped; every field already exists on the load — no new capture)

### 1. Header / trip identity
- Load number (plain digits)
- Trip type (OTR / NB / SB) + total loaded miles + deadhead miles
- Assigned driver name (+ co-driver/team if any)
- Unit (tractor unit #) and trailer (unit # or non-owned trailer ref)
- Trailer type / equipment (dry van, reefer, flatbed, etc.)
- Dispatcher name + dispatch phone (office contact)

### 2. Per stop (in sequence — pickup, border, delivery)
- Sequence #, stop type (Pickup / Border / Delivery)
- Facility name + full address
- Scheduled date/time **and** schedule kind (Appointment vs FCFS window) — mirrors Alvys FCFS/APPT
- Appointment/confirmation number (if any)
- Site contact name + phone
- Dock / gate / door instructions
- Reference numbers at that stop: shipper/consignee ref, PO, pickup#/PRO
- Per-stop notes / special instructions (driver-facing)

### 3. Freight
- Commodity description
- Weight (lbs) and piece count
- Hazmat flag (+ any placarding note) — already captured on the load
- Temperature / reefer set point + mode + pre-cool (reefer loads)
- Tarp requirement + tarp type/size (flatbed) and other equipment chips (straps, load locks, locking jacks, pulp probe, reefer fuel)

### 4. Border / customs (only when a border crossing exists on the load)
- Port of entry (name + CBP port code)
- Customs broker + broker contact (if recorded)
- Border/crossing instructions

### 5. Special handling / general
- Driver instructions text (free-form, already on the load)
- Detention / lumper policy note (informational; lumper amount is Load-Costs data, receipt uploaded by driver)
- Required documents checklist (BOL, POD, scale ticket, lumper receipt) — what the driver must return

### 6. Driver pay basis (driver's own numbers — NOT the customer rate)
- Pay basis lines the owner named: loaded miles × rate_loaded + deadhead miles × rate_empty (the two settlement lines already computed for the driver bill)
- Any per-load pay-rate override + its logged reason (already captured, GO-21 B5)
- **EXCLUDED, hard line:** customer linehaul, fuel surcharge, accessorials billed to customer, total customer rate, factoring — none appear. That is the rate confirmation, a customer document.

## Open questions for the owner (answer before body build)
1. **Sign off / edit this field list?** Add or remove any group.
2. **Pay basis on the PDF too, or app-only?** McLeod keeps pay on a separate screen. The owner listed "the driver's own pay basis lines" as included — confirm it prints on the PDF, or only shows in-app.
3. **Document name shown to the operator:** "Driver Instruction Sheet" (proposed) — confirm.
4. **Delivery route/map** on the PDF, or app-only (McLeod shows a Map tab in-app)?

## After sign-off (build plan — NOT started)
- New endpoint `GET /api/v1/dispatch/loads/:id/driver-instruction-sheet.html` (parallel to the existing `dispatch-sheet.html`), reusing the same render pipeline; the sheet reads only load/stop/driver-bill data, never invoice/rate.
- In-app view + PDF; a guard asserting the customer rate never appears on it.
- Wire "Book and send" to this document (enable the currently-disabled caret item), send-to-driver via the existing driver notification path.

— Cursor, 2026-09-04
