# ★ CC-3 — LEAD ASSIGNMENT (Claude Lead, 2026-09-11 15:55 Central / 20:55 UTC) — deadline 18:00 Central (23:00 UTC), surrender Codex

> Owner-saved copy: ~/Downloads/09-11-2026-CC-3-DRIVER-COMPLIANCE-01-LICENSE-PDFS-AND-ACTIVE-ROSTER.md. Post every ship/blocker to docs/bus/OUTBOX-CC-3.md.

```
CC-3 — DRIVER-COMPLIANCE-01: LOAD THE 15 LICENSE PDFs, POPULATE THE ACTIVE ROSTER, QUARANTINE THE 2 JUNK ACTIVE ROWS
Issued by Claude Lead 2026-09-11 15:55 Central (20:55 UTC). Lane: Safety/Compliance (pages/safety/**, backend/compliance/**, mdata.drivers). No money.

MEASURED LIVE (Neon br-fancy-credit-akjnd07a, bypass_rls=lucia, USMCA, 20:52Z):
- mdata.drivers USMCA non-sample = 161; status='Active' = 25.
- Of the 25 Active: cdl_number populated 17 · cdl_expires_at populated 13 · dot_medical_expires_at populated 2.
- 3 drivers are on the 3 live loads (dispatched/in_transit/assigned): 3 of 3 have NO dot_medical_expires_at, 1 has NO cdl_expires_at, 1 has NO cdl_number. Every one of them passed the dispatch gate with blanks.
- 2 junk rows carry status='Active' with is_sample_data NOT true: "ZZTEST AUTOACCT PROBE" and a row whose name renders as "SAFETY —". Quarantine-law violation (law §2: sample/test data is marked and quarantined, never destroyed).
- GENARO GUERRERO CHAVEZ = 2 Active rows (duplicate).
- SOURCE DOCUMENTS EXIST AND ARE UNLOADED: 15 Licencia Federal de Conductor PDFs in the owner's ~/Downloads, named by driver: ANGEL ALFONSO SOSA PEREZ.pdf · Concepcion Cordova Dominguez.pdf · Fernando Mecor.pdf · JORGE FLORES VALADEZ.pdf · JORGE LUIS INFANTE CORONA.pdf · JOSE ANTONIO VICENTE MARTINEZ.pdf · JOSE GERARDO RUIZ FLORES.pdf · JOSE MANUEL MEJIA OLMOS.pdf · JOSE MIGUEL DE SANTIAGO.pdf · LEONEL ANTONIO MORALES.pdf · Luis armando sosa.pdf · NEFTALI CORONADO URBANO.pdf · Rafael Rogelio Rivero Reynoso.pdf · Ruben Pedro perez.pdf · Vicente Santos Contreras.pdf. docs.files has columns category_id, document_date, expiration_date — the schema already fits.

TASK (one PR, one guard):
1. For each of the 15 PDFs: open it, read the licence number, category/class and expiration date FROM THE DOCUMENT (never guess, never infer from a name). Match to exactly one mdata.drivers row by name; if 0 or 2+ candidates, list it as UNMATCHED in your OUTBOX — do not pick.
2. Upload each PDF through the REAL document upload path (the same route/service the Documents tab uses → docs.files with operating_company_id=USMCA, category = the driver-licence category, document_date, expiration_date, linked to the driver). No direct INSERT into docs.files. Never write into TRANSPORTATION/TRUCKING.
3. Populate mdata.drivers.cdl_number and cdl_expires_at (this is where the Licencia Federal lives for a B1 driver — do not add a new column) through the real driver update service so audit.row_changes records it. Do not overwrite a populated value with a different one — list conflicts in OUTBOX with both values.
4. dot_medical_expires_at: no source document exists. Do NOT invent a date. Safety screen and driver profile must show "Missing — no document" (not blank, not 0, not a dash that looks like N/A) and the dispatch gate must name the missing item on the load. If the gate currently lets a driver with NULL dot_medical_expires_at be dispatched silently, that is the defect — fix it at the service boundary, not only in React.
5. Quarantine "ZZTEST AUTOACCT PROBE" and the "SAFETY —" row via the real route: is_sample_data=true and status inactive, reason recorded. Never delete. Report GENARO GUERRERO CHAVEZ ×2 in OUTBOX with both UUIDs and their load/settlement FK counts — merge is the owner's call, do not merge.
6. Guard scripts/verify-driver-licence-documents-linked.mjs: for USMCA Active drivers on any dispatched/in_transit/assigned load, asserts cdl_number, cdl_expires_at AND a linked docs.files licence row (or an explicit UNMATCHED entry) — fails on blanks; asserts 0 Active rows with is_sample_data=true; --selftest with planted failures. Wired in scripts/verify-steps/ (claim the number first).
LANE BOUNDARY: mdata.drivers + docs + safety/compliance only. Do not touch dispatch Kanban (Devin/Devin-B), Bills/settlements (GPT/Codex/CC-1), banking (CC-2).
DONE LINE (docs/bus/OUTBOX-CC-3.md), every number re-measurable:
  CC-3 | DRIVER-COMPLIANCE-01 DONE | <sha> | live API <sha> / FE <sha> | docs.files licence rows +N (list driver→file id) | Active drivers cdl_number 17→N · cdl_expires_at 13→N | UNMATCHED: <names or none> | CONFLICTS: <or none> | quarantined 2 (ids) | gate blocks NULL medical: <route + test> | guard selftest n/n + live PASS | screenshot of Safety roster showing the populated expirations | NEXT <n>
FAST-MERGE: Gate → Push → PR → Merge (squash) → Neon proof → Next. No CPA gate, no owner hold.
DEADLINE: 2026-09-11 18:00 Central (23:00 UTC). Missed = surface reassigns to Codex.
```

---

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
