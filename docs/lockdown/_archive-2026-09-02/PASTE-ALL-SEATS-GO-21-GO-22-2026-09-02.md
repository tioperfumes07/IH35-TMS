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
CC-2 — J1 CORRECTED. You do not design anything, and this finishes this week.

TWO CORRECTIONS TO THE EARLIER BOX. Both were wrong.

1. DO NOT DESIGN A TOKEN SET. The scale is ALREADY LOCKED and owner-approved:
   docs/specs/GLOBAL-TYPE-SIZE-BASELINE.md, "Claude + Jorge approved 2026-06-07."
   Body 12px · column/section headers 11px weight 700 UPPERCASE #4B5563 · H1 22px/600 ·
   text #0F1219 / #1F2A44 / #6B7280 · cell padding ~7px · surface #FFFFFF ·
   page #F7F8FA · border 1px #E5E7EB · radius 4px · rail navy #1B2333 · green #16A34A ·
   EQUAL PAIRED-FIELD SIZES (label and input the same width) ·
   CENTERED COLUMN HEADERS, EVERY ONE SORTABLE.
   Applies to ALL screens. No component may deviate without the owner's approval.
   Your values are a TRANSCRIPTION of that file. Proposing a scale violates a locked
   owner decision. Open the doc before you write a single value.
   This also closes GO-21 D1/D2/D3 (equal paired-field sizes) and F2/F4/I1
   (centered sortable headers) — when Chrome matches, not when a diff landed.

2. THIS IS NOT A GRADUAL PROGRAM. Live tree 2026-09-02: 1,083 off-scale across 342
   files; 203 of those files have only one or two. Top 50 carry ~45%. One focused
   job this week. Worklist: claude/GO-21-J1-WORKLIST-2026-09-02.txt
   (or node scripts/verify-ui-design-system-ratchet.mjs --worklist). No hunt.
   Tier 1 = top 50. Tier 2 = tail.
   Worst: BookLoadModalV4 32 · ProgramBoardPage 31 · BankingTransactionsDesignView 31 ·
   CreateWorkOrderModal 25 · CustomerDetail 19 · EquipmentTypesPage 18 · DispatchKanban 18.

THE ONE JUDGMENT PER LINE: header or body? Header → 11px/700/uppercase/#4B5563.
Body → 12px. Nothing else is allowed.

ALSO YOURS, same job: ONE picker. 268 files import a combobox that does not dismiss
on outside mousedown — EntityPicker 106, SelectCombobox 154, shared/Combobox 8. Only
components/Combobox.tsx has the handler. Converge, migrate all 268. That is K2.

GUARD: scripts/verify-ui-design-system-ratchet.mjs
Register it as a required verify-step FIRST (your band ≡3, claim-merge-then-author),
before you migrate a single file. --lower after each PR to bank the drop.
Guard-green does NOT close J1. J1 closes at off_locked_scale_sizes = 0 and
trapping_picker_total = 0. "Guard green, migrating gradually" is banned.

VERTICAL: J1 is the one legitimate exception (no data layer). The guard proves it
landed on all 342 files, not one screen.

DONE = both counts at zero, guard required, owner Chrome on Section D / boards / planners.

ACK: CC-2 | ACK | GO-21 J1 CORRECTED | NOW=claim ≡3 ratchet step THEN count to zero this week · NEVER POST | GO
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
