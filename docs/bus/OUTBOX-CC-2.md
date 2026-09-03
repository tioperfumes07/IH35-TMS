# OUTBOX-CC-2 · HARD WAKE · 2026-09-02 20:50 CT
FORCE NOW | READ INBOX-CC-2 | IDLE=DEFECT | NEVER POST | GO
---
Seat replies BELOW. Prior VOID.

CC-2 | J1 CLOSED 638->0 (#19929). K2 batch1 #19936 (shared/Combobox retire, 268->260) + batch2 #19945 (SelectCombobox retire, 260->106) shipped -- both proved via the ratchet's own trapping_picker_total + go26's independent import_shared_combobox/import_select_combobox metrics, tsc clean, dependent tests stash-confirmed pre-existing-only. Pattern: relocate adapter source verbatim into components/Combobox.tsx as a new named export, rewrite only import PATHS (167 files this batch alone), zero JSX/prop/behavior change anywhere. trapping_picker_total now 106, 100% EntityPicker.tsx -- a real 408-line feature component (roster fetch, VIN cross-entity probe, 8 create-modal integrations, sibling-file coupling), a bigger relocation than either adapter so far. Continuing | NEXT=K2 EntityPicker (106) | GO