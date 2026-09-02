# PASTE — GO-21 (49) + GO-22 · 2026-09-02

Jorge: paste **only your seat box** into that coder. Registers on main after this PR:  
`claude/GO-21-DISPATCH-DEFECT-REGISTER-2026-09-02.md` · `claude/GO-22-PRESETTLEMENT-REGISTER-2026-09-02.md`

**All seats:** `git pull --ff-only origin main` · USMCA only · **NEVER POST Book Load** · FAST-MERGE · never `trigger_deploy` · never `gh pr checks --watch`.

---

## CC-1 — paste this entire box

```
CC-1 · GO-21 + GO-22 · YOU ARE MONEY ONLY
git pull --ff-only origin main
Law: claude/GO-21-DISPATCH-DEFECT-REGISTER-2026-09-02.md
     claude/GO-22-PRESETTLEMENT-REGISTER-2026-09-02.md
HH 00–11 UTC · claim then author · reuse poster · no new GL math · no TMS→QBO

VOID: POST Book Load · remake A1 SQL (#19567 already on main: dispatch.non_owned_trailers
      + dispatch.trailer_interchanges) · J1 CSS · BookLoadModalV4 chrome (CC-3) ·
      putting broker trailers in mdata.units · $7,500 (LOCKED $7,000) · K rows · A2

NOW (serial, one PR at a time):
1. B5 — driver pay rate FROM driver profile. Typed override only if logged.
2. B8 — cash/fuel advance: Comchek/EFTPS/wire number, linkage, receipt → docs.files,
   pending deduction. Fully wired, not a label.
3. GO-22 PS1–PS5 API: write the missing presettlement QUERY (book-load.service.ts ~2264
   currently logs presettlement_link_deferred). Settlement NUMBER using existing
   lib.trace_counters — do NOT invent a third doc_type (LOAD vs LD already two).
   NB opens tour + pre-settlement. Recommend remaining TR/SB via trip_link_queue
   shape (suggested_* + human confirm, never auto-commit). Manual add/remove now.
   Empty driver_settlements is expected. No seat fixtures.
4. Then GO-20 tail: A screen → 20 settlement 5753 → F7334 remainder.
   GO-19-09 / GO-20-B / F7334 ledger-file catch-up stays at INBOX bottom — gap only.

ACK: CC-1 | ACK | GO-21+22 | NOW=B5 pay-from-profile | NEVER POST | GO
```

---

## CC-2 — paste this entire box

```
CC-2 · GO-21 J1 + VERIFY-LIVE (Devin-A RETIRED)
git pull --ff-only origin main
Law: claude/GO-21-DISPATCH-DEFECT-REGISTER-2026-09-02.md  J1 + K2 + C/D/E2/E3/F2/F4/H3/I1 + B10/B11

VOID: POST Book Load · migrations · money tables · A2 customer picker · A1 FE ·
      Codex B6/B12 · page-by-page size patches instead of tokens

NOW:
1. K2 / J1 first hop — ONE combobox. Four copies exist; only components/Combobox.tsx
   dismisses on outside click. EntityPicker + SelectCombobox (what Book Load uses)
   do not. Fix the shared component(s) so click-away closes. Do not leave three broken.
2. Then J1 tokens: type scale, QBO money input, column header, grouping. Rebuild
   BookLoadValidationSection (same size L/R, smaller boxes). CI guard on raw sizes.
   Children that close WITH tokens (do not ask CC-3 to one-off): C1–C3, D1–D5,
   E2, E3, F2, F4, H3, I1, B10, B11.
3. VERIFY-LIVE (was Devin): after a seat PR deploys, walk the screen on
   app.ih35dispatch.com at healthz SHA. OUTBOX PASS/FAIL + URL. Merge ≠ fixed.
4. Standing: /maintenance/predictive-alerts (#19541). Hand CC-3 the adoption list.

ACK: CC-2 | ACK | GO-21 | NOW=J1 K2 one combobox · verify-live · NEVER POST | GO
```

---

## CC-3 — paste this entire box

```
CC-3 · GO-21 DISPATCH UI · NO SQL · NO MIGRATIONS
git pull --ff-only origin main
Law: claude/GO-21-DISPATCH-DEFECT-REGISTER-2026-09-02.md

VOID: POST Book Load · db/migrations · J1 tokens / money inputs (CC-2) · B5/B8/GO-22
      money (CC-1) · B6/B12 (Codex) · one-off patching C/D/E2/E3/F2/F4/H3/I1
      (those close with J1) · remake A1 tables (#19567)

NOW:
1. A2 FIRST — BookLoadCustomerSection.tsx. Server type-ahead over ~2,700 customers.
   Caps 500/200 are the defect (CLS-SILENT-CAP, LST-PICKER-01). Own PR.
2. Then K1 — Section A first column is the income item, not a raw "code" column.
3. Then K3 — remove search field inside Section A charge rows.
4. Then K4 — per-stop pickup/delivery extra rates HIDDEN until extra stop/delivery.
5. Then K5 — remove per-page / "Page 1 of 1" under Section A charges.
6. Then wizard B1 B2 B3 B4 B7 B9 (B9 State combo AFTER CC-2 K2 component on main).
7. Then A1 FE — OUR unit XOR interchange trailer. APIs already on main #19567:
   dispatch.non_owned_trailers + dispatch.trailer_interchanges. Never write broker
   trailers into mdata.units.
8. Then boards E1, F1, F3, G1–G4, H1 H2 H4 H5 H6, I2 I3. G4 = owner's existing
   one-window trip-pairing design. Adopt CC-2 tokens; do not invent sizes.
9. After GO-22 API on main: PS4/PS5 recommend + manual UI only.

ACK: CC-3 | ACK | GO-21 | NOW=A2 customer picker · NEVER POST | GO
```

---

## CODEX — paste this entire box

```
CODEX · GO-21 B12 + B6
git pull --ff-only origin main
Law: claude/GO-21-DISPATCH-DEFECT-REGISTER-2026-09-02.md

VOID: POST Book Load · A1 SQL · A2 · J1 · GO-22 settlements · gh pr checks --watch

NOW:
1. B12 — BookLoadModalV4.tsx:799 prints only the field-group label ("Stops").
   Name WHICH stop and WHY. A3 (13508 not saved) stays owner-repro until this is clickable.
2. B6 — rate-con upload on Book Load (section A or E): wired, linked, survives reload.
3. Then GO-20 D leftover / H prove if still open.

ACK: CODEX | ACK | GO-21 | NOW=B12 save-block then B6 rate-con · NEVER POST | GO
```

---

## CASCADE — paste this entire box

```
CASCADE · UNIQUE FINDING ONLY
git pull --ff-only origin main
VOID: implement GO-21/GO-22 · recertify U14 · trigger_deploy · tell seats to Book Load
NOW: unique 500 / dead click / silent no-op → AUDIT-COVERAGE + GUARD-WORKORDERS same turn.
     Merge API if you are merger. Do not steal A2/J1/B5.
ACK: CASCADE | ACK | GO-21 | NOW=unique FINDING · NEVER POST | GO
```

---

## CURSOR (lead — already in this chat)

Coordinate · FAST-MERGE · deploy 5–10 · no product rows · no SWEEP-A · no GUARD-WORKORDERS queue.
Devin-A RETIRED. Do not ping Devin.
