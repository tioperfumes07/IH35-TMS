# LEAD — 2026-10-02 — THE 7 UNBUILT ENGINES. BUILD THEM NOW. ASSIGNED.

VERIFIED AGAINST THE REPO TODAY, not the registry: of 36 engines, **24 have code on disk, 7 have
none, 5 are Cursor frontend screens I could not verify** (I searched only the backend tree — my
error, not a finding). The registry said 35 open; the repo says otherwise. **These 7 are the real
gap.**

Every one is built to the SAME standard, no exceptions, and the standard is the linkage law:
- posts whole or not at all — one transaction, or documented as running on the caller's
- writes its `accounting.transaction_source_links` row if it touches money — **a posting linked to
  nothing is not done**
- stamps operating_company_id, and every entity it touches: load, driver, unit, trailer, customer,
  vendor, settlement, invoice, journal entry, account, item
- names the engine that **reverses the document**, not just the journal entry
- idempotent if scheduled — ON CONFLICT or an idempotency key on the natural business key
- a header saying what it does, why, what it writes, what reverses it, what it must never do
- **tested through the harness: test transaction → record every stamp → void it → record the
  reverse → written to `docs/engine-verification/E-NN.md` AND the workbook.** Built without a
  harness result is not built.

---

## CC-2 — 2 ENGINES — fuel and the Samsara fuel/geo path is your lane

**E-07 — SAMSARA ADDRESS IMPORT + FENCE LINKING.** No file exists. The X.9 import was never run.
954 fences are unlinked. Import Samsara addresses, link each fence to its address, and stamp the
link both ways so a stop resolves to a fence and a fence resolves to its stops. Without this, E-04
geofence-odometer and E-08 geofence state are reading unlinked fences — **it is the root of two
engines that already have code.** Build it first.

**E-23 — SAMSARA FUEL PUSH + IFTA + EFFICIENCY REPORTS.** Declared pending, no code. POST
/fuel-purchase to Samsara, twice daily, behind a hard gate. Then the IFTA vehicle reports and fuel
efficiency. **IFTA is wrong money today** — both IFTA screens count each load's FULL miles once in
EVERY state it stops in, and a correct GPS-based apportionment engine exists that no screen uses.
Build the push, then point IFTA at the real engine. Overstated per-state fuel-tax liability is the
kind of thing that does not survive a state audit.

## CC-1 — 2 ENGINES — integrity and driver money is your lane

**E-17 — FLEET ROSTER INTEGRITY.** The registry says "no engine yet" in its own words. `mdata.units`
has no integrity engine. The owner said 40 trucks, the app shows 16. Build the engine that reports
the roster truthfully: active units, inactive, sample-flagged, and every unit that has a load, a
settlement or a fuel row but no active record. **Report the number. The owner decides what the fleet
is. Then guard it so it cannot drift again.** Do not deactivate or create a single unit on your own.

**E-28 — COMPLAINTS AGAINST A DRIVER.** Declared pending, no code. A complaint object linked to the
driver, the load, the unit and the customer who raised it, with a reason catalog (editable, per the
owner's standing pattern), a status lifecycle, and both-direction linkage so a driver profile shows
its complaints and a complaint resolves to its driver. **Complaints may feed driver scorecards but
must never auto-deduct from a settlement** — the company absorbs, the driver is not charged without
the owner's decision.

## CURSOR — 3 ENGINES — Samsara push paths and the screens are yours

**E-30 — DRIVER MESSAGING (SAMSARA).** POST /v1/fleet/messages. No code. Message linked to driver,
unit and load; delivery state recorded; both directions. Pair it with your E-43 messaging screen.

**E-31 — SAMSARA ROUTES PUSH.** POST /fleet/routes. Client stub only today. Push the dispatched
route; link the pushed route back to the load and the stops so a route resolves to its load.

**E-32 — DOCUMENTS / FORMS (BOL, POD).** /fleet/documents and document-types — 3 references, no
engine. BOL and POD captured from Samsara, linked to the load, the driver and the unit, and landing
in `docs.files` so the invoice can prove delivery. **This one blocks billing evidence** — a factored
invoice with no POD is a chargeback waiting to happen under the Faro agreement.

---

## WRITE IT DOWN OR IT GETS REDONE

The owner's instruction, and it is the reason this file exists: **every result is written to the repo
AND the workbook, without exception, so nothing is audited twice.**
- Repo: `docs/engine-verification/E-NN.md` — expected behaviour written BEFORE the run, then the real
  rows, then the void result.
- Workbook: `10-02-2026-IH35-ENGINE-AUDIT-632-ENGINES.xlsx` — fill CONFIRMED and Proof. They are
  empty on purpose; I would not fill them with a guess.
- The engine registry gets the closure written back. **35 "open" items against 24 built is what
  happens when nobody closes the loop — that is the defect that made this whole re-audit necessary.**

Report per engine, not at the end. NOBODY POSTS, SEEDS, FEEDS, MATCHES OR CATEGORIZES IN PRODUCTION
— the harness runs on a Neon branch forked from `br-fancy-credit-akjnd07a` and the branch is deleted
after.
