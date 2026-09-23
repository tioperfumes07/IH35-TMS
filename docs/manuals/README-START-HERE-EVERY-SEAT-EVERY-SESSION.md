# START HERE — EVERY SEAT, EVERY SESSION, BEFORE ANY WORK
**Owner order 2026-09-22: "GIVE THE MANUALS TO CODERS AS WELL. I WANT EVERYONE WORKING
CORRECTLY, ESPECIALLY YOU."** — that last clause is aimed at the Lead. It binds me first.

**Reading these is not optional and it is not a formality. Four things I assigned this session
already existed. A PR that rebuilds something in the capability registry fails review on sight.**

---

## READ IN THIS ORDER — 8 files, ~19 minutes, every session

| # | file | read it before |
|---|---|---|
| 1 | `capability-registry.json` | **building ANYTHING.** 14 verified capabilities with file and line. If it is here, it exists — find out why it is not running, do not write a second one. |
| 2 | `01-DATA-SOURCE-REGISTER-READ-BEFORE-SAYING-MISSING.md` | **saying any data is missing, unattributable or unresolvable.** Every file the owner has given us, with its real columns and what it resolves. A residual declared without trying every listed source is an unfinished search, not a residual. |
| 3 | `03-RULING-THE-RECONCILER-THE-ONE-GENERATIVE-CAUSE.md` | **any linkage, automation or "why didn't this fire" work.** The single cause behind the $0.00 margins, the unlinked fuel, the missing driver bills, the stale statuses and the 19-vs-5. |
| 4 | `04-RULING-FEED-PARITY-THE-VERIFIED-SIDE-EFFECT-LIST.md` | **touching load creation or any ingest path.** The 8 INSERTs and 14 gates Book Load performs, by line number, that a feed skips. |
| 5 | `02-RULING-LIVE-LOADS-VIEW-THE-PERMANENT-FIX.md` | **any board, tile, drill-through or load query.** Why `assertCanonicalSubset` was not enough and what replaces it. |
| 6 | `09-22-2026-IH35-FULL-LINKAGE-PROCESS-AND-MAPPING.md` | **creating any record.** Load → invoice → factoring → cash → driver bill → settlement → GL → bank, every column verified live. Includes the mandatory `LINKAGE:` block every PR body must carry. |
| 7 | `00-USMCA-RECONCILIATION-CLOSED-NEVER-ASK-AGAIN.md` | **citing, disputing or re-deriving any USMCA/Faro reconciliation figure.** Owner order: this is CLOSED. Nine figures are LAW, enforced by `scripts/verify-reconciliation-constants.mjs` on every push — do not re-measure, do not ask again. |
| 8 | `00-READ-THIS-FIRST-EVERYTHING-IS-HERE.md` | **starting any reconciliation, purge or feed work.** The index for the whole IH35-RECONCILIATION-AND-FEED bundle — where every source document, control sheet and ruling actually lives. |

**Domain manuals, read when you are in that domain:**
`09-22-2026-IH35-PROCESS-01-FUEL-TRANSACTIONS.md` · `09-22-2026-IH35-PROCESS-02-IFTA.md` ·
`00-LEAD-CORRECTION-2026-09-22-VERIFIED-AGAINST-REPO.md` (what I got wrong and retracted)

**Work registers, in `docs/bus/`:**
`00-MASTER-REGISTER-2026-09-22-READ-BEFORE-ANY-WORK.md` · `00-NUMBERED-WORK-REGISTER-2026-09-22.md`
(48 numbered tasks — report by number) · `LANES.md` (read LANE CORRECTIONS before you push)

---

## THE SIX RULES THESE MANUALS EXIST TO ENFORCE
1. **GREP BEFORE YOU BUILD.** The Faro importer, the pre-settlement machinery, the settlement
   reverse engine and the driver-bill creator all existed while I was assigning someone to build
   them.
2. **READ THE SOURCE REGISTER BEFORE SAYING SOMETHING IS MISSING.** I declared the Love's file
   absent while it sat on the owner's Desktop.
3. **A SUMMARY OF A PRIOR SESSION IS MEMORY, NOT A SOURCE.** It may never be cited as live proof.
   I shipped a false `bypass_rls` law that way and three seats had to disprove it.
4. **EMPTY IS A QUESTION.** Check the entity, the filter, the join and the spelling before
   reporting an absence. My Faro "not found" was a wrong join key, not missing data.
5. **NEVER REPORT DONE WITHOUT LIVE PROOF.** The row, the screen, the query — pasted. An assigned
   guard that was never written is not a guard; eight of mine were missing.
6. **AFTER YOUR PR, DOES THE OWNER HAVE MORE TO CHECK, OR LESS?** If more, you have not finished.

---

## THE SIMPLICITY LAW — owner, 2026-09-22
*"MAKE THIS SYSTEM EASY FOR THE USER, NOT COMPLICATE IT."*
1. **ONE PLACE TO LOOK.** The exception queue is the owner's screen. Anything the software can
   resolve, it resolves — he never sees it.
2. **NO NEW SCREEN WITHOUT RETIRING ONE.**
3. **EVERY NUMBER AGREES WITH EVERY OTHER NUMBER.** A load renders identically in every tab and
   function of its module.
4. **NEVER ASK THE USER TO RESHAPE DATA THE SOURCE SYSTEM GENERATES.** Faro's export,
   AlwaysTrack's documents, the Dreamline statement, the Love's file — **we adapt to them.**
5. **A BLANK OR ZERO MUST SAY WHY.** "$0.00 costs" with nothing linked reads "no costs linked" —
   never a margin equal to revenue.
6. **NO SETTING OR FILTER TO MAKE A BOARD CORRECT.** If he must configure something to see the
   truth, the default is wrong.
