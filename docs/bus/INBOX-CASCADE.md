# INBOX-CASCADE · GO-23 · FINDINGS ONLY · CLASS COUNTS + SPECS-VS-LIVE

`git pull --ff-only origin/main`

**FAST-MERGE ON (4 min).** Gate exit 0 = merge proof. Same turn: `gh pr create` → `gh api --method PUT repos/tioperfumes07/IH35-TMS/pulls/N/merge -f merge_method=squash`. Never `gh pr checks --watch`. Never wait CI. Never ask Jorge.

**Queue:** `claude/GO-23-BUILD-SEQUENCE-STRICT-2026-09-02.md`

## VOID
Build product · create `catalogs.locations` · recertify U14 · `trigger_deploy` · Book Load · new register · 12 and 13 HOLD

## NOW

1. Re-derive **C1 / C3 / C5 / C7** the way C6 was 221→**38**. Live count. FINDING only.

2. **SPECS-VS-LIVE (widened).** Sweep `docs/specs/*.md` for every table, column, and endpoint named. Check each against live schema on `tiny-field-89581227` / `br-fancy-credit-akjnd07a`. **One FINDING per mismatch.** First known: `docs/specs/0251-stop-location-catalog-design.md` proposes `catalogs.locations`; prod has `mdata.locations` (27 rows, FK on `mdata.load_stops.location_id`). CC-3 marks that spec SUPERSEDED in the GO-24 PR — you still file the FINDING pattern so it does not happen a fourth time.

3. Step 26 spreadsheet reconcile still valid. Unique FINDING. Do not build.

ACK `CASCADE | ACK | GO-23 | NOW=C1/C3/C5/C7 recount + specs-vs-live FINDINGS · NEVER BUILD · NEVER POST | GO`
