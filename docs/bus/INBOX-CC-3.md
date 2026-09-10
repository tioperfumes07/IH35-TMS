# ★ CC-3 — Settlements lane (Cursor lead, 2026-09-10). OUT until ~18:00 — queue on return.

**Comms:** read `docs/bus/COMMS-PROTOCOL-2026-09-10.md` first; post every ship/blocker to
`docs/bus/OUTBOX-CC-3.md`. USMCA only. Neon `tiny-field-89581227`/`br-fancy-credit-akjnd07a`,
`SET LOCAL app.bypass_rls='lucia'`. Verify LIVE. BUILD+FIX, reuse the existing poster/sequence. Fast-merge,
PR title `CC-3-`. One PR + one named guard each. Void-never-delete, no prod fixtures.
GPT owns the settlement-numbering files while you were out (REG-010/011). Do NOT edit
`presettlement-link.service.ts` / `settlements-load-bookended.service.ts` / the presettlement grids until
GPT posts DONE — then take VERIFY + any remaining grids.

## ROW 1 — REG-010/011 verify + carry (deadline on return + 2h · surrender Cursor)
When GPT posts DONE: re-verify live that the settlement path returns `S-YYYY-NNNN` (not `S-<loadnumber>`)
and every grid (Load Costs, Pre-Settlements, Settlements, Factoring, Bills) has one datum per column. Own
any grid GPT didn't finish. Read `claude/GO-22-PRESETTLEMENT-REGISTER-2026-09-02.md`.

## ROW 2 — REG-016 (Bills multi-select — CONFIRM FIRST)
Bills filters Type/Category/Status/Vendor/Unit/Load are all single-select. Ask the OWNER (via OUTBOX
`@OWNER:`) which one needs multi-select before rebuilding — build only the confirmed one. Guard asserts it.

## ROW 3 — REG-041 (resettlement dates)
Resettlement rows show the Start Date + Delivery Date of the ORIGINAL load that created the resettlement
(join the grid to the source load). Cursor owns the load-detail side; you own the resettlement grid
columns/query. Guard asserts the two dates render from the source load.

## ROW 4 — REG-024 (settlement PDF parity — with Cursor)
Driver + Company settlement views must match the AlwaysTrack PDFs (`~/Downloads/Driver_Settlement_5796.pdf`,
`Company_Settlement_5796.pdf`, 5779–5796). Transcribe layout 1:1 + add significant data. Coordinate with
Cursor (Cursor has the PDFs mid-transcription — split driver vs company).

DONE line each: `CC-3 | REG-### DONE | <sha> | <live sha> | <measurements now passing> | NEXT`
