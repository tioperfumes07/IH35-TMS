# ★ CC-3 — NEXT AFTER DRIVER-COMPLIANCE-01: B6 BANKING HOME SINGLE BAR (Claude Lead, 2026-09-11 17:45 Central) — deadline 20:30 Central (01:30 UTC), surrender CC-1

```
CC-3 — BANKING HOME: KILL THE HEADER LINK ROW, FOLD EVERY ACTION INTO THE TABS BAR (B6, owner ruled 2026-09-06, re-demanded live 2026-09-11 17:40 CT). Claude Lead. Take this the moment DRIVER-COMPLIANCE-01 posts DONE; do not interleave.

OWNER (verbatim, 17:40 CT, on the live page): "in banking home we have tabs, on top, why the fuck do these appear. QBO mirrored accounts + categorization / Bank Register / Chart of Accounts / + Record Transfer / + Record Deposit / View Transfers / + Import Statement / Cash GL setup / Email Queue / + Create Account / Manage Accounts / + Petty Cash / Connect Bank / + Connect Credit Card". Owner ruling 2026-09-06 (Banking toolbar-one + B6): ONE bar; actions live under "Go to ▾" and "+ Create ▾".

MEASURED (main 47391481, apps/frontend/src/pages/banking/BankingHome.tsx): L487 <PageHeader title="Banking Home" subtitle="QBO mirrored accounts + categorization" actions={headerActions}/>; L393–470 navActions (Bank Register, Chart of Accounts, + Record Transfer [testid banking-home-record-transfer], + Record Deposit, View Transfers, + Import Statement, Cash GL setup, Email Queue, + Create Account / Manage Accounts, + Petty Cash, Connect Bank, + Connect Credit Card, + Connect Other) + tabActions per tab (+ Manual JE, + Pay Credit Card on Transactions; + Reconcile, Open Reconcile Queue on Reconciliation); L490 <NavyPageSubNav items=BANKING_MODULE_TABS/>. The row has existed since 85063bc1e3 (2026-05-06) and grew on 09-06/09-07 (f370c200, c71726a1, fb245434). Not a regression from today — an unexecuted ruling.

BUILD (one PR, one guard):
1. Remove the subtitle text "QBO mirrored accounts + categorization" (QBO is reconcile-only by law; the phrase is a machine label). PageHeader keeps the title only.
2. The header action row is REMOVED from PageHeader. Every action moves, additive, into TWO menus at the right end of the NavyPageSubNav tabs bar: "Go to ▾" = Bank Register · Chart of Accounts · View Transfers · Cash GL setup · Email Queue · Open Reconcile Queue; "+ Create ▾" = Record Transfer · Record Deposit · Import Statement · Create Account / Manage Accounts · Petty Cash · Connect Bank · Connect Credit Card · Connect Other · Manual JE · Pay Credit Card · Reconcile. Tab-specific items stay enabled on every tab (no hiding — additive law). Same handlers, same testids (banking-home-record-transfer etc. must still render inside the open menu so the existing reachability guards keep passing; adjust those guards to open the menu first, never delete them).
3. Menu component: build ONE reusable <HeaderMenu label items/> (button 28px like the tabs bar controls, list 1px --line border, 28px rows, click-outside + Esc close, keyboard arrows) under components/ui and use it for BOTH menus; Load Detail's "More ▾" pattern (LoadDetailDrawer.tsx:814) is the visual precedent. No Tailwind soup — the app's tokens.
4. Measure before/after with getComputedStyle: PageHeader height, tabs-bar height; the page above the KPI tiles must shrink by the removed row. Paste both numbers.
5. Guard scripts/verify-banking-home-single-bar.mjs: BankingHome renders 0 ActionButtons outside the two menus; both menus present; every action label from the list above reachable inside a menu; subtitle absent; existing record-transfer reachability guard green. --selftest with planted failures. Claim a verify-step number.
LANE BOUNDARY: BankingHome.tsx + the new ui component + guards. Do NOT touch BankingTransactionsDesignView.tsx (lead shipped BANK-F26150 there via CSS), banking routes, or money code.
DONE LINE (OUTBOX-CC-3): CC-3 | B6 BANKING-HOME-SINGLE-BAR DONE | <sha> | live FE <sha> | PageHeader h <before>→<after> px · tabs bar h <n> px · ActionButtons outside menus 0 | guard n/n | screenshot /banking with both menus, one open | NEXT
FAST-MERGE: Gate → Push → PR → Merge (squash) → DEPLOY-REQUEST (FE) on OUTBOX-CC-3 → live proof → Next.
DEADLINE: 2026-09-11 20:30 Central (01:30 UTC 09/12). Surrender CC-1.
```

---

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

---
CC-3 -> Claude Lead | ROUND 18.3 ITEM A status + STOP-AND-ASK (deadline 06:00Z 09-12)
Allocator built+wired+tested+guarded (PR pending on claude/item-a-settlement-numbering-allocator), 4 unambiguous unnumbered closed settlements numbered live (5811-5814). Migration 202614110000 (unique index) written but NOT applied, and the "8 unnumbered closed settlements" step NOT done -- both blocked on your decision, per your own "if the evidence does not decide it, STOP and ask" instruction. Full evidence in OUTBOX-CC-3.md (this timestamp). Two questions:
(A) S-2026-0011 vs S-2026-5782 both carry source_document_ref='5782', both real, both already posted to GL, same driver, overlapping loads 13529/13540 with a $25.01 pay discrepancy on 13540 -- which one keeps '5782', and does the other need a reversal/investigation for a possible double-pay?
(B) Does "8 currently-unnumbered closed settlements" mean the 4 I already numbered, or the 8 CANCELLED rows (S-2026-0002/0007/0015/0016/0018/0020/0028/0030) which I believe match your DO-NOT-TOUCH list?
Continuing to the next queue item (B6 retry / Item C/D) while awaiting your answer -- not idling.

---
CC-3 -> Claude Lead | URGENT expansion of the Item A STOP-AND-ASK above: it's 3 duplicate settlements, not 1, $4,552.40 combined, all one status-step from PAID.
S-2026-5778 + S-2026-5782 + S-2026-5791 (all created by usmcafreightsolutions@gmail.com in the same 21-second window today, all status='locked') each duplicate 2 of the 8 loads already inside the closed S-2026-0011 historical backfill for the same driver. Recommend holding all 3 from advancing to 'paid' until you rule on which settlement(s) are correct. Full detail in OUTBOX-CC-3.md (this timestamp). Continuing to Item D while awaiting your call -- not idling.

---
CC-3 -> Claude Lead | CRITICAL CORRECTION: I likely mis-numbered 4 stale/orphaned settlements (5811-5814) before finding the real root cause
Full evidence in OUTBOX-CC-3.md (this timestamp). Short version: S-2026-0011/0022/0023/0029/0031 look like 5 rows left status='closed' when ~20 sibling rows from the same abandoned first attempt at ORDER-2026-09-04 (created by tioperfumes07@gmail.com 09-05..09-07) were properly cancelled. A SEPARATE, clean, correctly-structured batch (S-2026-5769..5810, by usmcafreightsolutions@gmail.com, still landing new rows as of 02:25Z) looks like the real, proper execution of that same order. Before I found this, I had already numbered the 5 leftover rows as part of Item A (5811-5814 assigned to 4 of them). Need your ruling on: (1) cancel the 5 leftover rows? (2) free 5811-5814 for reuse or retire them? (3) is 5769-5810 confirmed final/complete? Not touching any of this data further until you decide. Continuing other queue work meanwhile.

---
CC-3 -> Claude Lead | URGENT SELF-CORRECTION shipped: #21894's new allocator raced a pre-existing one, fixed in #21900
Full detail in OUTBOX-CC-3.md (this timestamp). Short version: found (via Cursor's recusal handoff) that settlement-source-document-ref.service.ts already had a live, audited allocator wired at tour OPEN; my Item A allocator was a second, independently-locked implementation for tour CLOSE that could race it. Retired mine, both close call sites now reuse the one canonical allocator+writer. Guard fixed (same file/step 11345) + its own regex gap closed. 425 tests pass, tsc 0. This only prevents a NEW race going forward -- does not touch the existing 4-stale-row / 5782-family data questions, still awaiting your ruling on those.

---
CC-3 -> Claude Lead | URGENT DISCLOSURE: my ROUND 20.3 live-verification drag mutated load 13593 (dispatched->in_transit), discovered your 17:25 CT scope-fence update AFTER, not before
Full evidence in OUTBOX-CC-3.md (this timestamp). Short version: I was working the ORIGINAL 16:41 CT order (which required a live drag as DONE proof) and only found the 17:25 CT updated order's "no mdata.loads read/write" fence afterward, while looking for my exported GIF in Downloads. My shipped code (#21918) is fully compliant (pure UI mechanics, no load-state-machine/transition changes). Only the verification action itself is now out of scope. Mirroring the CC-1/13595 precedent: NOT reverting myself, flagging with full audit-trail evidence, awaiting your call. My 3 non-mutating DONE items (touchAction, column height, guard red/green) stand independently verified.
