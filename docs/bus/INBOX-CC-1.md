# INBOX-CC-1 · GO-23 · PURGE TAIL + WAVE 2 C6/B8/B5

`git pull --ff-only origin/main`

Law: `docs/lockdown/HONEST-BUILT-LAUNCH-LAW-2026-08-14.md`

**FAST-MERGE ON (4 min).** Gate 0 → create → squash. Never POST Book Load.

## VOID
Remake expense N1 (#19641) · remake N1 bill-payment (#19660) · catalogs.locations · TONU · "N1 done" = expense only · idle after a status PR

## DONE on git — do not remake
Locations customer search #19656 · phantom-relation regen #19659 · N1 Pay from load #19660 · historical_import_reasons ledger #19663 · loans junk delete recorded in #19665

## NOW (strict order — your Wave 1 tail, then Wave 2)
1. **Finish purge.** Batches 3–5 (~85 columns) from your own #19665/#19668 remaining list. Counts **before** delete. Then delete junk. Additive `is_sample_data` default false on fixture-capable tables. Per-table before/after. Do not force WORM children on the 2 sample drivers. Template `67138fcf-…` if still present.
2. **Wave 2 C6** — money INSERT without a balanced journal entry. Highest-risk open money row. Guard spec already written. Live count (was 221 → 38 last recount — re-measure at your SHA).
3. **Wave 2 B8** — cash and fuel advances fully wired (Comchek/Comdata/EFT/wire, load + driver + settlement deduction, receipt into `docs.files`, pending until approved).
4. **Wave 2 B5** — driver pay rate from the **profile**, not a typed rate that silently wrongs a settlement. Frontend if still missing is still yours per GO-23 row 8 (not a new register).

ACK `CC-1 | ACK | GO-23 | NOW=purge-tail · C6 · B8 · B5 · NEVER POST | GO`
