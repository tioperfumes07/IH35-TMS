# GO-13  24-HOUR LIVE STATUS + SEAT NOW
DATE: 2026-09-01 15:30 CT
LEAD: CURSOR
LIVE API: check `GET https://api.ih35dispatch.com/api/v1/healthz/shallow` → `version`
  Book Load UNTYPEABLE merged #19341 `218c9fb`. API deploy kicked `dep-dabjc72jnfac73bpph60` for main tip `75f469f` (includes #19341). FE autoDeploy on ih35-tms-web. Wait healthz ancestor of `218c9fb` then hard-refresh.
SCOPE: USMCA ONLY `5c854333-6ea5-4faa-af31-67cb272fef80`. TRANSP/TRK frozen.
NO-SEAT prod money. No CC `trigger_deploy`. U14 closed — never recertify.

This packet supersedes GO-12 seat NOW where they conflict. GO-12 cleanup law still stands.

================================================================================
OWNER CORRECTIONS (bind every seat — do not re-ask)
================================================================================
1. REVENUE DOCUMENT: pickup = PRE-INVOICE / PRO FORMA. Delivery auto-converts that
   same document to INVOICE. Not an open earn-at-pickup vs earn-at-delivery GL fight.
2. INSURANCE: reconciled. T144 = 2EMS / excluded. Honest TIV = 34 / $1,040,540.
   Packet $1,077,940 / 35 is not a coding FAIL. Do not invent ACV. Do not hunt a 15th tractor.
3. 217 origin/devin* remotes: KEEP. No glob delete (GO-12 Codex model).
4. PR #19305: leave alone (tracker artifact sync).
5. Driver bill `B-`: WAIT owner. Capitalize $7k vs $2500 still OPEN. Settlement table OPEN.
   USMCA cutover OPEN. SAMPLE policies: delete source with GO-11 (owner sample-money order).

================================================================================
LIVE RIGHT NOW (facts)
================================================================================
- Book Load on live still 422s reserve-id (`first_load_number_required`) because USMCA has
  no digit-only load seed. #19336 kept a white Load # box but still showed
  "Load number unavailable + Retry" — owner cannot type. Cursor shipping
  DSP-F-FIRST-LOAD-NUMBER-UNTYPEABLE: 422 = expected first-seed; typeable box; no Retry banner.
- POSTING-CONTRACTS Event 2 MERGED #19337. CC-1 NEXT = GO-11 execute, not GO-09 remainder.
- GO-11: CC-1 filed #19340 — claims bank/invoice/load/policy purge already done via void, not delete.
  CC-2 verifies live. Do not rebuild. SAMPLE drivers/vendors = owner decision still.
- healthz at packet authoring: was `b6d9679` (#19336). Re-check after this Book Load merge+deploy.

================================================================================
MERGED LAST ~24H (GitHub, 2026-08-31T → 2026-09-01 — do not rebuild)
================================================================================
GO-01 #19315 insurance ACV/trailers/drivers — merged; TIV honest 34/$1,040,540
GO-02 #19320 trailer AL not_required · #19334 LIST API per-type array
GO-04 #19309 KPI captions + class boxes (Cursor) — CC-3 do not rebuild
GO-05 wave 2 #19313 Codex proof
GO-06-ish #19308 hide cancelled WOs / Active columns
GO-07 #19327 At-risk LOADS · #19328 Codex sort guard
GO-08 #19316 trace_no/trace_key
GO-09 L1 #19314 empty No. box · L2 #19329 expense vendor_document_number
GO-10 #19325 plain-digit load allocator
Expense first-bare #19335
Book Load typed-number (partial) #19336 — UI still broken until UNTYPEABLE ships
ConfirmModal #19330
POSTING-CONTRACTS Event 2 #19337
CC-2 verify #19321 #19331 · CC-1 OUTBOX #19339 · CC-2 ACK #19338
Bus GO-11 #19332 · FEED-ALIGN #19307
Leave #19305 open by design.

================================================================================
STILL OPEN — REAL WORK (ranked)
================================================================================
P0  Cursor  Deploy Book Load UNTYPEABLE after merge. One in-flight.
P0  CC-1    GO-11 manifest-then-UUID delete. SAMPLE policies listed in GO-11. TRANSP/TRK untouched.
P0  Jorge   After deploy: hard-refresh Book Load, CLICK the white Load #, TYPE e.g. 13508, book.
P1  CC-2    OUTBOX list of no-git-history deletes. Then concurrency 409 proof. 72 ON CONFLICT. Never #19305.
P1  CC-3    Scratch option 1 only. Confirm GO-04/06 already on main (#19309/#19308) — leftover only, no rebuild.
P1  Codex   GO-03 Fleet Covered with honest TIV 34/$1,040,540. Empty on a covered unit = FAIL. Then leftover GO-07.
P1  Cascade Conflicts 1,2,4 file+line (capitalize $7k vs $2500; depreciation register never-defer; accessorials parent). Conflict 3 CLOSED.
P1  Devin-A Live Chrome after UNTYPEABLE deploy. Keep 217 remotes.
P2  Cursor  GO-09 leftover empty No. box: driver bill, settlement, cash advance.
P2  Cursor  UNITS/LOADS/TRANSACTIONS ParityTable drills if still FAIL.

Cleanup law: archive+Trash+path. Never rm repo docs/bus or docs/audit. Manifest or it did not happen.

================================================================================
SEAT NOW (one line)
================================================================================
CC-1     GO-11 execute NOW. #19337 done. No CI watch. No GO-09 remainder. Insurance closed.
CURSOR   Merge+deploy Book Load UNTYPEABLE. Then leftover number boxes.
CC-2     No-git-history list in OUTBOX. Then verify. Never #19305. Never glob-delete remotes.
CC-3     Option 1 scratch. Then leftover GO-04/06 only if not already on main.
CODEX    GO-03 honest TIV. Cleanup was the model.
CASCADE  Findings 1,2,4. Conflict 3 CLOSED.
DEVIN-A  Keep 217 remotes. Live Chrome after deploy. Type first Load #.

================================================================================
NUMBER BOXES (honest)
================================================================================
HAVE empty box (code on main): Load (broken live until UNTYPEABLE), Invoice, Bill (ours+vendor),
Expense (ours+vendor), Receive payment, Pay bill, CM, VC, Transfer.
NOT YET: driver bill, settlement, cash advance (server mint; Cursor leftover).
Expense seq: first on a load = bare load number; second = 12225-1 (#19335). Needs API deploy ancestry.

================================================================================
DO NOT
================================================================================
Create seat money in prod. Recertify U14. Invent T144 ACV. Rebuild GO-01–10.
Glob-delete origin/devin*. trigger_deploy from CC. Babysit CI.
Treat $37,400 as an OPEN coding card.
