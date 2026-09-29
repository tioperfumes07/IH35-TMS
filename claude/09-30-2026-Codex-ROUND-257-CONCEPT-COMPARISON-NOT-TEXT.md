# ROUND 257 — CODEX — COMPARE CONCEPTS AND QUANTITIES, NOT TEXT

## ANTI-DRIFT CONTRACT — READ BEFORE THE FIRST LINE OF CODE
1. You build EVERY item on your list COMPLETELY: schema, migration, backend service, route DEFINED
   and MOUNTED and CONSUMED by a real frontend surface, GL postings, linkage both ways to every hub,
   catalogs, guards, backfill, and print where it applies. **The Check Creator was reported DONE
   while sitting unmounted and dead for weeks. That must never happen again.**
2. NO HANDING OFF. If something blocks you, you MEASURE it, FIX it, and report what you fixed. The
   only thing you escalate is a write the owner has not authorized.
3. NO PATCHING. Root cause only. No report-only guards, no skips, no `--no-verify`, no exception
   lists, no "same pattern as X" without evidence.
4. NO DRIFT. Do not invent tables, concepts or names not in this document. Do not rename anything.
   Do not "improve" the design. If you believe something here is wrong, say so in ONE paragraph with
   the measurement that proves it, then do what this document says.
5. NEVER write test, sample or demo rows into USMCA — including for proof. Two seats broke this and
   are still reconciling it.
6. USMCA ONLY: 5c854333-6ea5-4faa-af31-67cb272fef80. TRANSPORTATION and TRUCKING stay frozen.
   Reads require BOTH lines: `SET LOCAL ROLE neondb_owner;` then `SET LOCAL app.bypass_rls = 'lucia';`
7. Blank is blank. Unknown prints `—`. Never 0 for unknown, never a substituted value.
8. Every guard is REQUIRES_LIVE_DB. A guard that cannot connect is a FAIL, never a pass.
9. Save your completion report to the repo at `claude/<date>-<SEAT>-<ROUND>-REPORT.md` so nothing is
   lost. Cite live SQL output for every claim. Never report DONE without pasted proof.
10. You have API keys available in the Desktop files. No seat may claim it lacks a key.

## THE OWNER'S CORRECTION, VERBATIM
*"The comparison is supposed to be of load amounts, ours showing the same data, in our own words. I
didn't mean literally compare the text, I mean the transactions — that we recorded or created the
document for the same concept in our app for the same quantity."*
Your workbook marked **96 of 96 settlements RED**. That is a FALSE RED, the same defect class as a
fake green. On the DRIVER tab the money actually ties **47 of 48** to the cent — settlement 5769 reads
AlwaysTrack `1,095.52` vs app `$1,095.52` and you marked it red over a dollar sign. On the COMPANY
tab every AlwaysTrack detail line compares against the literal string
`"N/A — not represented by app report"` — the app side was never built.

## ITEM 1 — REBUILD THE COMPANY TAB AS A CONCEPT COMPARISON
Compare NORMALISED AMOUNTS BY CONCEPT, per load and per settlement:
  line haul total · driver pay total · extra pay total · fuel total · expense total · repairs total ·
  margin
Normalise before comparing: strip `$` and thousands separators, parse to cents, take ABSOLUTE VALUE
so `Deductions: -60.00` and `$60.00` are the same magnitude, and match line items by LOAD NUMBER and
CONCEPT — never by position. AlwaysTrack line 1 being load 13498 while the app's line 1 is load 13508
is the SAME DATA IN A DIFFERENT ORDER, not a mismatch.
GREEN when the concept and the quantity match. RED only when a real amount differs, and the cell says
BY HOW MUCH.

## ITEM 2 — SETTLEMENTS SHARED WITH TRANSPORTATION ARE THEIR OWN CLASS
Owner: *"for the settlements that are shared with Transportation, ours should show all expenses and
income, just not Transportation's load — ours will show 1 load with 2K in expenses while AlwaysTrack
shows 2 loads with 2K."*
Handle this as a DEFINED CLASS, not a mismatch: match on the USMCA subset of loads, report the
AlwaysTrack-only load separately in its own column, and DO NOT mark the settlement red for it. Count
this class and report it.

## ITEM 3 — THE CLASSES YOU MUST REPORT SEPARATELY
1. Concept and quantity match — GREEN.
2. Transportation-shared — AlwaysTrack has a load we correctly do not.
3. **AUTH-089 class** — the app total is LOWER than AlwaysTrack by exactly one repeated charge. The
   app is wrong here, not AlwaysTrack. Proven on 5787: AlwaysTrack `EXPENSES total: 140.20` vs our
   live 124.95, the difference being one $15.25 scale charge voided in error. CC-1 is reinstating.
4. **Wrong-load-split class** — same settlement total, expenses on the wrong load. On 5787, load
   13555 has ZERO non-diesel expenses live while the document assigns it several.
5. Genuine amount differences — everything else.

## ITEM 4 — THE DRIVER TAB IS ACCEPTED. DO NOT REWORK IT.
47 of 48 NET PAY tie. Only 5812 differs and that is the known header-vs-GL defect.

## ITEM 5 — REPORT THE HEADLINE YOU LEFT OUT LAST TIME
Per tab: GREEN count, RED count, discrepancies grouped BY TYPE ranked by count and by dollars, total
absolute variance, and the count in each of the five classes above. Plus the provenance of the flat
Downloads copy you used for company 5782 — a source you cannot name is a source that cannot be
accepted.

## SELF-CHECK BEFORE YOU DELIVER — PASTE ALL THREE
a. Settlements 5769–5816 must come out GREEN on the driver tab. If any is red, the comparator is
   wrong, not the data.
b. Count of rows where the app value is any "N/A" or "UNKNOWN" string must be **0**.
c. Count of settlement numbers outside the live USMCA range must be **0**.
Do not deliver a workbook that fails its own self-check.

## PROOF REQUIRED
The three self-check numbers · green/red per tab · the five class counts · total absolute variance ·
the 5782 provenance · the workbook in ~/Downloads.
