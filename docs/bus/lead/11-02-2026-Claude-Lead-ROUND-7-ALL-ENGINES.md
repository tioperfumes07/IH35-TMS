# ROUND 7 — CLAUDE LEAD → ALL SEATS — EVERY PENDING ENGINE, BUILT END TO END
Issued: Mon 11-02-2026 12:15 PM CT (2026-11-02T18:15Z) · Tip read: `f6f411ec` (#27977) · Register `ENGINE-REGISTER.json` (29 rows not DONE)
**Supersedes ROUND 6** (`11-02-2026-Claude-Lead-ROUND-6-ALL-SEATS.md`) wherever they differ.
Owner 11-02 12:00 PM CT: *"send instructions for all pending engines now. fully and totally complete builds, no excuses. from start to finish, economic, mechanical, money, financial, double, reverse, double route, reverse … i need all engines fully complete and done."*
Owner 11-02 11:53 AM CT: *"if it is safe, use fast 4 minute merge method, following fast merge law. instruct all coders."*

**Hard deadline every box: 2026-11-03T02:00:00Z (8:00 PM CT).** A surface still open at 02:01Z → **Claude Lead** takes it.

---

## LAW 7.0 — FAST 4-MINUTE MERGE (every seat, every PR)
1. Branch prefix MUST map to your seat or CI cannot resolve you (`verify-lane-ownership`): `claude/`=LEAD · `cc-1/` · `cc-2/` · `cc-3/` · `cursor/` · `codex/`. **`chore/` maps to NO seat — never use it.**
2. Claims: `CLAIMED-NUMBERS.json` new key `claimed_by` MUST equal your seat (`lead`, `cc-1`, `cc-2`, `cc-3`, `cursor`, `codex`). Claim-only PR (subject `CLAIM-RESERVE`) merges first; then author the step file. (Lesson #27974: `chore/` + `claimed_by:"claude"` → would have gone red; superseded by #27987.)
3. Before merge run the fast-merge regression check — it is the safety gate:
   `SEAT=<SEAT> node -e 'import("./scripts/lib/affected-guard-regressions.mjs").then(m=>{const r=m.checkNoRegressions(process.cwd());console.log(JSON.stringify({guards:r.guards.length,regressions:r.regressions,deleted:r.deleted}))})'`
   **0 regressions → merge.** Any regression → fix the code (or a guard made stale by a correct refactor, with its selftest), never bypass.
4. Merge: `SEAT=<SEAT> node scripts/fast-merge.mjs --branch <b> --title "FINDING: …" --body-file <f>` (opens + squash-merges). Body = ROOT CAUSE / FIX / GUARD / REMAINING / LIVE PROOF with numbers.
5. A guard red on clean `main` before your change is pre-existing: prove it on `main`, name it in the body, do not hide it.

## LAW 7.1 — WHAT "COMPLETE" MEANS (no shells)
Every engine = **backend engine + routes + FE board + EntityLink forward AND reverse drill + pickers + void/reverse path + audit event + entity scope (USMCA `5c854333-6ea5-4faa-af31-67cb272fef80`) + guard wired in CI (never `.guard-exempt`) + tests + live proof**. Money engines also: posts only through the posting engine door, debits = credits, reversal tested, GL account + vendor/customer + load/driver/unit linked. No balancing JE. No invented rows. Never stash. Never fake-green.
**Code phase:** prod data `--apply` only under an OPEN AUTH on main. Every apply script ships dry-run-proven on prod (rolled back) with exact counts and $ in the PR body.

---

## 7.0-B AMENDMENT (11-02-2026 12:40 PM CT) — read before your box
Owner 12:30 PM CT: *"all questions have been asked and answered, cpa answers, questionnaire, etc. they can check repo, files, project, downloads and desktop folders for answers. we are fully coding and building right now, then once all work is fully completely done, then we focus on categorizing … do not pause … i want all in repo, i do not want anything pending."*
Owner 12:31 PM CT: Codex checks all work and tests visuals to spec.

1. **DO NOT ASK THE OWNER.** Answers live in: `docs/bus/00-CLOSED-ASKED-AND-ANSWERED-NEVER-REOPEN.md`, `docs/bus/00-OWNER-*`, `docs/bus/OWNER-AUTHORIZATIONS.md`, `docs/lockdown/`, `docs/specs/OWNER-QUALITY-COMPACT.md`, the CPA questionnaire / contador answers in the repo, and on the owner's Mac `~/Desktop` + `~/Downloads` (reconciliation workbooks, settlement text, Faro CSVs). Search all of them first; cite the file in the PR body. Only a fact that exists in none of them is a question — write it to your OUTBOX and keep building everything else.
2. **ROLE CHANGE — CODEX = CHECK-ALL-WORK + VISUAL QA** (box 7.6 below is replaced). Codex build items move:
   - ENG-48 fuel writer (ON-RECEIPT Relay path, literal "5000" at statement-card-credit-repair :93/:119, wire verify-fuel-expense-one-to-one) → **CC-1** (adds to 7.3-D: one seat owns writer + bridge).
   - ENG-49 settlement 5787 document-first + module SETL-TIEOUT-01 → **CURSOR** (7.2-F).
   - ENG-17 Faro 1090 (14 unmatched, PROPOSED/AMBIGUOUS + owner pick screen with Undo; 2510 BLOCKED on Dreamline statement) + module FACT-TIEOUT-01 → **CURSOR** (7.2-G).
3. **TIERED MODELS — NO UNNECESSARY TOKENS** (owner 12:31 PM CT; law `docs/specs/MODEL-TIER-POLICY.md`): money / GL / posting / migrations / RLS / root-cause = **Tier A** (never down-tier); well-specified non-money features, guards, tests, wiring, non-trivial UI = **Tier B**; mechanical class waves, tokens/palette, docs, repetitive refactors, CI drift = **Tier C**. Stuck 2 red cycles → one tier up. Read only the files your item needs; no repo-wide sweeps without a reason; one regression-gate run per PR. Tier never lowers the proof bar.
4. **OWNER "BUILD FIRST, MATCH LATER"** (docs/bus/lead/11-02-2026-Owner-BUILD-FIRST-NOT-MATCH.md) governs every box: build engines + fill every shell; defer bank matching, Dreamline 2510, month locks (ENG-38), ENG-48 mass apply, ENG-60 table drop (owner AUTH later). Dry runs are still required proof.
5. **CURSOR ALREADY CLOSED** (12:20 PM CT): ENG-13 AUTH-473 DONE-LIVE (13595 customer 445, NULL 0/194); ENG-22 prevention guard 18930 (mismatches 0).
6. **CORRECTION (ENG-48):** the live guard `verify-diesel-expense-fuel-dedupe` reports duplicate_fill_pairs **6** (baseline 4) and live_diesel_expenses **316** (baseline 272) — my earlier "0 same-day duplicate groups" used a narrower definition; the guard's numbers stand. CC-2 measured the ≠net+fee delta at **$2,476.71** (not $2,622.71) and the 0-expense window to **10-29**. The 1090 $10,446.00 movement = FAC-2026-00009/10/11 factoring deposit clears (10-26) — **legitimate, closed** (CC-2 #27989).

## 7.10 — MAIN IS RED (blocks everyone's green) — fix the root cause, never baseline
Measured on `main` `aafee241` (before ROUND 6/7 merges) — same checks red on every PR since:
| Check | Cause on main | Seat |
|---|---|---|
| locked-guards / -heavy | `verify-no-swallow-on-money-paths`: silent swallow at `apps/backend/src/driver-finance/settlements-load-bookended.service.ts:1201` | **CC-1** |
| required-live-load-guard | `verify-diesel-expense-fuel-dedupe` (316 > 272 expenses; 6 > 4 duplicate pairs) → fix with ENG-48; `verify-settlement-net-matches-signed-doc` 1 failure → fix with ENG-49 | **CC-1** (dedupe) · **CURSOR** (settlement) |
| guard-integrity | 1 NEW silent list cap (a capped list that never tells the user it capped) | **CC-3** |
| build-typecheck / -heavy | zod `TS2418`/`TS2322` in `accounting/{invoices,payments,bills,expenses}-bulk.routes.ts`, `driver-finance/settlements-bulk.routes.ts`, `lib/strict-query.ts` (`.loose`), `docs/files.routes.ts:636` implicit any | **CC-3** |
| CodeQL Analyze (javascript-typescript) | read the alert list on the run, fix each real finding; a false positive gets a written reason in the PR | **CURSOR** |
DONE = all five green on a `main` commit, run id in the PR body.

## 7.2 — CURSOR (Lead merge seat + data ops)
```
TO: CURSOR   FROM: Claude Lead   ROUND 7.2   deadline 2026-11-03T02:00Z   missed → Claude Lead

7.2-A ENG-13: after Claude's #27975 merges — dry run then
      OWNER_AUTH_ID=AUTH-473 npx tsx scripts/ops/2026-11-02-claude-eng13-load-13595-broker-trailer-445.mts --apply
      → node scripts/verify-loads-trailer-source-recorded.mjs PASS (NULL 0 / 194). Close AUTH-473 with the output.
7.2-B CODED-QUEUED → DONE-LIVE or reopen, with live proof each (deploy SHA + query/endpoint + number):
      ENG-19 (company settlement / trip P&L fuel counted once: parity 81/81) · ENG-55 (drift alert, reconciler 42/42)
      ENG-62 (stop-arrival-from-fence-history; stop-stamp ratchet 13 → 0) · LEAD-443.319 (escrow visible; DB refuses
      delete of driver/vendor with escrow) · LEAD-AUTH ledger (AUTH-461/462 recorded).
7.2-C ENG-22: 3 loads booked DRY_VAN on a Reefer (13593→10219, 13634→10870, 13635→10218). Apply waits owner AUTH.
      BUILD the prevention: Book/Edit Load must refuse a trailer choice whose equipment type ≠ the booked trailer type
      (or re-derive it) — guard ceiling 3 → 0 after apply.
7.2-D ENG-36: re-measure negatives after ENG-19 deploy (today 21/87, named list in register). State each remaining one's
      cause class. Further fuel/expense cause → ENG-25b (CC-1).
7.2-E STOP on ENG-60 (Claude Lead owns the table drop; your 410 mutate work is kept) and ENG-34 (CC-1 owns the 53).
7.2-F ENG-49 (moved from Codex): settlement 5787 — signed doc $140.20 vs app non-diesel $107.00 (75 layover + 22 reimb
      + 10 admin gas; + escrow 25) vs claimed $235.01. Line-by-line from Company_Settlement_5787.txt / Driver_Settlement_5787.txt
      (~/Desktop/IH35-KEEP-Reconciliations-and-Settlements/.../settlement-text/); name the $235.01 source; correct through the
      settlement engine's closed-period path (P-0018 closed). No JE. Also module SETL-TIEOUT-01 (5753 to the cent) and
      required-live-load-guard verify-settlement-net-matches-signed-doc.
7.2-G ENG-17 (moved from Codex) — BUILD ONLY (owner 11-02 "BUILD first, match later" — docs/bus/lead/11-02-2026-Owner-
      BUILD-FIRST-NOT-MATCH.md): build the Faro 1090 proposal engine (each unmatched purchase → PROPOSED / AMBIGUOUS from the
      Faro CSVs + wire candidates) and the owner pick screen with Undo through createBankDeposit, proven on a dry run.
      DO NOT execute any match. 2510 / Dreamline deferred by owner. No balancing JE. FACT-TIEOUT-01 auto_check measured only.
7.2-H CodeQL on main (7.10).
DONE = AUTH-473 CLOSED · 5 CODED-QUEUED rows DONE-LIVE (or reopened with the failing number) · ENG-22 guard merged ·
       ENG-49 / ENG-17 per above · CodeQL green.
```

## 7.3 — CC-1 (money / GL)  — YOU ARE IDLE: START NOW
```
TO: CC-1   FROM: Claude Lead   ROUND 7.3   deadline 2026-11-03T02:00Z   missed → Claude Lead

7.3-A ENG-34: 53 active .guard-exempt.json left (Cursor took 123→53). Wire each into scripts/verify-steps/ (claim the
      number first, claimed_by "cc-1") or delete a guard that guards nothing that exists. Shrink-only.
      DONE = active exempt 0 · node scripts/verify-guard-wired.mjs PASS.
7.3-B ENG-25b Transportation diesel → 8000 Inter-company (owner 10-24 2:36 PM CT). AUTH-464 DOES NOT EXIST (last AUTH
      on main 472; 473 in #27975 is load 13595 only). Build scripts/ops/2026-11-02-cc1-eng25b-diesel-to-8000.mts through
      rewriteDocumentLine (apps/backend/src/accounting/reclassify/reclassify.service.ts): every line = fuel row id + signed
      settlement doc proving NOT on a USMCA load + amount + from-account → 8000. Reverse path tested. --apply refuses without
      an OPEN AUTH. Guard step 18925 (claimed by lead in #27987 — you may author it; branch cc-1/).
      Live now: 8000 = $12,596.50 Cr (4 lines). DONE = script + guard merged, dry-run count + $ in PR body,
      ENG-36 negatives re-measured inside the rolled-back dry run (today 21/87).
7.3-C ENG-04 2170 Driver Net-Pay Clearing $2,575.96 Cr / 12 postings: AUTH-gated --apply for the 3 PROPOSE_RECLASS
      ($705.97: CA-0004 / CA-0006 / CA-0007) through the posting engine reclass + reversal. 3 NO-EVIDENCE + 6 AMBIGUOUS stay
      listed. DONE = dry run shows exactly $705.97 moving, 2170 → $1,869.99 in the rollback.
7.3-E ENG-48 WRITER (moved from Codex — you own writer + bridge): fix the ON-RECEIPT Relay path so every fill mints its own
      expense (read accounting.posting_source_load_id 'fuel_event' branch + adoptRelayFillExpenseDocument in
      fuel-expense-document.service.ts); literal "5000" at statement-card-credit-repair.service.ts :93/:119 → role resolver;
      wire verify-fuel-expense-one-to-one.mjs; make verify-diesel-expense-fuel-dedupe green (316>272, 6>4 pairs) by root cause.
7.3-F main red: verify-no-swallow-on-money-paths at settlements-load-bookended.service.ts:1201 (7.10).
7.3-D ENG-48 money side: review scripts/ops/2026-09-30-cc1-r290-1-fuel-expense-bridge-backfill.ts against
      live: 147 Relay fills ($24,678.73, 08-03→10-16) have 0 expense — posted only via the parent fuel_event JE. The bridge
      must, per Relay parent, void the parent JE through the posting engine and mint one expense per fill, books
      net-identical per account to the cent; parent whose fills ≠ JE net → STOP + listed. Dry run only (AUTH-145 consumed).
```

## 7.4 — CC-2 (verify live — never build)
```
TO: CC-2   FROM: Claude Lead   ROUND 7.4   deadline 2026-11-03T02:00Z   missed → Claude Lead

Read-only prod. Numbers, query and CT time to OUTBOX-CC2.md + register evidence. Never adjectives.
7.4-A MERGED-UNVERIFIED — prove live or reopen: M1 (match candidates scoped to the bank line's account) ·
      M2 (invoices + Faro purchases in the match union) · M3/M5 (one matcher, MatchDrawer embedded, filters live) ·
      G1/G9/G11/G12/G15 (code fixes; data remainders) · LEAD-various (cash-basis P&L F412, bank-line delete rule F431,
      recurring worker refusal, 7-day unmatched alert, reefer off IFTA, A/P control by documents, matched-to-nothing refusal).
      Each: commit on main → deployed? → endpoint/query result → PASS/FAIL line.
7.4-B 1090 movement: live 1090 = $159,764.48 Dr (36 lines) vs register $170,210.48 → name the $10,446.00 JE(s)
      (id, entry_date, created_at, source, memo, user). Not a document match → STOP at top of OUTBOX-CC2.
7.4-C ENG-48 re-measure for Codex/CC-1: fills 856 · 0-expense 147 ($24,678.73) · expense ≠ net+fee 78 (Δ $2,622.71) ·
      net+$2.00 fee 81 = CORRECT (ROUND 192).
7.4-D Stop-dwell: after Claude's #27985 deploys, Sentry IH35-TMS-PROD-5Y (load_stops_actual_stamp_precision_check)
      must stop recurring at the next :25 tick. State 13690 + 13698 stored miles_driven_actual after the tick.
7.4-E ENG-13 after Cursor 7.2-A (0/194) and ENG-60 after deploy (to_regclass('insurance.lawsuit') NULL; both link
      columns gone; node scripts/verify-no-insurance-lawsuit-refs.mjs PASS 0).
```

## 7.5 — CC-3 (mechanical / FE / CI guards)
```
TO: CC-3   FROM: Claude Lead   ROUND 7.5   deadline 2026-11-03T02:00Z   missed → Claude Lead

7.5-A NINE FE TESTS RED ON CLEAN MAIN (proven on aafee241): ClaimCreateModal.test (owner locks #1 recovery_rail 'ask',
      #2 repair_books_treatment 'ask') · PolicyDetail.edit-archive.test (edit "expired" option; archive) ·
      EntityPicker.test (prior-company FK suppression; "— not visible" selected value; MOD-04 VIN clear) ·
      NewCustomerDrawerForm.test ("broker"/"direct_shipper" options). Fix the wrong side per owner lock. Never delete a test.
      DONE = those 4 files 0 failed.
7.5-B ENG-23 oldest-customer fallback audit (fallback removed — settlement-creator-preflight.ts:73): git log -S → live
      window → every USMCA load booked through it → customer vs rate-con / settlement doc. Mismatch → Edit Load engine,
      doc cited, dry run. Guard step 18921 (claimed by lead #27987; you may author it). DONE = list + count + guard.
7.5-C ENG-29 (149/194 missing driven miles) + ENG-53 (13690 deadhead/driven NULL; 13698 NULL; T174 odometer):
      after #27976 + #27985 deploy, fence-fill the rest through the engine; never estimate. Each remaining load named with
      its exact missing input (no fence / no OBD / date_only stop). Backfill --apply waits AUTH.
7.5-D ENG-27 ceiling 290 pre-10-17 bank-cat postings without load: per row document or written explanation; never
      auto-match. Ceiling shrink-only.
7.5-F main red (7.10): build-typecheck zod drift + guard-integrity silent list cap.
7.5-E FINDING (measure, no behavior change): Creator maps a customer/broker trailer → POWER_ONLY_CUSTOMER_TRAILER
      (creator-trailer-choice.ts:88); Book/Edit Load keep physical type (12 live: 11 DRY_VAN, 1 REEFER). Write both + counts
      for the owner.
```

## 7.6 — CODEX — CHECK ALL WORK + VISUAL QA (replaces the earlier 7.6)
```
TO: CODEX   FROM: Claude Lead   ROUND 7.6 (amended 12:40 PM CT)   deadline 2026-11-03T02:00Z   missed → Claude Lead

You no longer build ENG-48/49/17 (moved: CC-1 / Cursor). You are the independent checker: you did not write this code, so
you grade it. Verify, measure, and FIX ONLY a defect you can prove (failing guard, wrong number, broken screen) in a codex/ PR.

7.6-A EVERY PR MERGED TODAY (11-02-2026) on main — for each: read the diff, run its named guard + --selftest, run the fast-merge
      check (checkNoRegressions) on its merge commit, and confirm its LIVE PROOF line is reproducible (same query → same
      number). Includes #27966–#27989+ (Cursor ENG-60 FE/410, ENG-46/47/50/51, ENG-34 waves, ENG-29/53 cron, CC-2 6.4) and
      Claude Lead #27975 (ENG-13), #27977, #27983, #27985 (stop-dwell date_only), #27987. Result table in OUTBOX-CODEX.md:
      PR | guard | selftest | regressions | live re-measure | PASS/FAIL.
7.6-B VISUAL QA TO SPEC — open each module screen in Chrome against https://app.ih35dispatch.com (USMCA) and grade against
      docs/specs/GLOBAL-TYPE-SIZE-BASELINE.md (body 12px · headers 11px/700/UPPERCASE/#4B5563 · H1 22px/600 · page #F7F8FA ·
      surface #FFFFFF · border 1px #E5E7EB · radius 4px · rail #1B2333 · green #16A34A · equal paired-field sizes ·
      centered sortable headers) + .cursor/rules/00-IH35-LAW.mdc + 03-display-ids.mdc. For every screen: list renders real
      rows (no empty shell / placeholder / "coming soon" / dead button), filters are multi-select comboboxes, every id is a
      human label (no raw/truncated uuid), every row drills forward AND back (EntityLink), create opens the canonical
      drawer/page with pickers, void/reverse exists on money docs. Screenshot each failure. Order: Accounting · Banking ·
      Settlements · Dispatch · Fuel · Factoring · Vendors · Customers · Insurance · Legal (Lawsuits) · Safety · Fleet ·
      Maintenance · Cash Flow · Reports · Program.
      Run node scripts/verify-ui-design-system-ratchet.mjs and report its count.
7.6-C MODULE ITEMS (7.9): re-run each auto_check; state PASS/FAIL with the number. Re-verify the 13 not-PASS rows.
7.6-D Report: OUTBOX-CODEX.md — one line per PR / screen / module item, numbers not adjectives. A defect you fix → codex/ PR
      through the fast-merge gate. A defect in another seat's lane → write it to that seat's INBOX with file:line + screenshot.
```

## 7.9 — MODULE SHELLS / UPGRADES NOT YET AT SPEC (all seats)
Owner 11-02 12:02 PM CT: *"make sure the coders fully finish building all the pending modules shells the new updates and upgrades up to spec, not only shell, or half build, fully done and complete."*
Source: `docs/module-completion/*.json` on tip — **373 PASS · 13 not PASS** (2 FAIL, 6 OPEN, 4 HOLD, 1 UNVERIFIED). Each row closes only with its `auto_check` / live number, never a stamp.

| Item | Status | What must be true | Seat |
|---|---|---|---|
| ACCT-R-04 | FAIL | Deploy smoke: render.yaml backend declares IH35_SMOKE_UNIT_ID + IH35_SMOKE_OPERATING_COMPANY_ID **and set on Render**; test owner excluded from prod listings | CURSOR |
| BANK-TIEOUT-01 | FAIL | Every live USMCA bank_account closing balance = its ledger_account_id GL (incl. Faro 1296) at tolerance 0 — `scripts/tieout/bank-ledger-closing.mjs` exit 0 (last run: 5 accounts expected, 4 observed) | CC-1 build · CC-2 measure |
| ACCT-TIEOUT-01 | OPEN | Trial balance debits = credits AND read-only QBO comparative ties to the cent | CC-1 |
| VEND-TIEOUT-01 | OPEN | Sum of open bills = A/P control account balance | CC-1 |
| DISP-TIEOUT-01 | OPEN | Every delivered load ↔ invoiced revenue, zero orphans both directions | CC-3 |
| FACT-TIEOUT-01 | OPEN | Faro statement 08-10..08-28 face / reserve / fee / wire / cash / AR / escrow / NFE ties | CODEX (with ENG-17) |
| SETL-TIEOUT-01 | OPEN | Owner settlement PDF 5753 gross / deductions / reimbursements / net to the cent | CODEX (with ENG-49) |
| VEND-CERT-01 | OPEN | Vendors Fully-Wired 7–12 on current healthz: URL-addressable tabs, master-detail stacks responsive (Customers pattern), leftover audit PATCH closed | CC-3 |
| CASH-T03 | UNVERIFIED | Cash Flow "Rolling Ledger" tab renders entity-scoped open A/R + A/P through the **HTTP route** (last proof was a direct DB read only) | CC-2 |
| SAF-B08 · SAF-ORPH-01 · SAF-ORPH-02 · SAF-ORPH-05 | HOLD | Re-verify live; PASS with today's number or name the exact blocker (no HOLD carried past 02:00Z without a reason line) | CC-2 |

**Shell rule, every seat:** any screen you touch that renders an empty shell, a placeholder, a "coming soon", a dead button, a list with no reverse drill, or a create without a void/reverse path is **in scope and finished in the same PR** — backend + routes + FE + forward/reverse links + pickers + guard + live proof. "Built" = live-proven (HONEST-BUILT-LAUNCH-LAW).

## 7.11 — OWNER UI REGISTER + CODE SHELLS (added 12:50 PM CT — were not yet assigned)
Source: `docs/bus/00-OWNER-UI-REGISTER-EVERY-REQUEST-NOTHING-DROPPED.md` (dated 10-03, last edited 10-26 — state may be stale) lists **28 OPEN** (U1–U14, U16–U18, U21–U31) + **2 "fixed, awaiting merge"** (U19, U20) + U15 STANDING.
1. **CODEX (by 20:00Z = 2:00 PM CT):** measure every U-row on prod in Chrome — DONE (screenshot) or OPEN (what is wrong). Update the register's State column in a codex/ PR. A row is never closed on code-read alone.
2. **Build owners for rows still OPEN after Codex measures** (same deadline 02:00Z):
   - **CC-1** (money, Tier A): U8 Create Check must offer open bills (a check paying a bill IS a bill payment), U9 print-check numbering (editable, sequence continues, duplicate warns, gaps recorded), U25 Diesel→Reefer Diesel reclass (item + account + IFTA flag + trailer, hour-based), U27 P&L / Balance Sheet render like QuickBooks (backend signs correct — surface fix), U31 cleared/uncleared on every balance + both agings.
   - **CC-3** (Accounting / FE, Tier B): U1 Accounting resizes, U2 tab bar overflow, U3 Load costs → Dispatch, U4 one Expenses tab, U5 receipt creator = expense creator, U6 checks list + filters, U7 Create Check QBO size, U10 bills sub-tabs own type only, U11 Vendor bill vs Bill (measure first), U13 remove redirect tabs, U14 rename Work orders & bills, U16 WO/unit/trailer columns + stored WO copy, U17 Expenses read-only + reclassify, U21–U24 reclassify (year in calendars, expense number, Load/Truck/Driver/Unit/Trailer/Vendor filters + column chooser, account/item/load selectors), U26 Banking filters.
   - **CURSOR** (app-wide sweeps, Tier C/B): U12 + U28 multi-select status/account filters everywhere, U18 breadcrumb back app-wide, U29 every record cell clickable, U30 every header sorts asc/desc; U19/U20 confirm merged + live.
3. **CODE SHELLS still rendering "not yet"** (measured on main a83ab8c3):
   - `pages/home/QboStyleHomePage.tsx:176` card "Not yet available" + `:413` "Category breakdown not yet available" → **CC-3**: wire to the live engines.
   - `pages/reports/SubscriptionManager.tsx:257` "Email delivery is not implemented yet" (no worker; 6 report generators) → **CURSOR**: build the delivery worker + generators, Last sent / Next populated.
   - `pages/safety/reports/SafetyReportsPage.tsx:300` "Not yet available as a report" list → **CC-3**: build each listed report.
   (`ComingSoonPage` routes in `routes/manifest.tsx` are fallbacks for unknown list keys only — not shells.)

## 7.7 — CLAUDE LEAD (self)
ENG-60 table drop (rebased onto Cursor's 410 work: all three verbs SQL-free 410 stubs, migration 202616310100, guard 18917) · ENG-13 #27975 · stop-dwell #27985 · merge gate + register.

## 7.8 — OWNER (only you can answer)
| Item | Needed |
|---|---|
| ENG-38 | Which USMCA months to lock (24 periods open) |
| ENG-54 | The 16-truck ownership list |
| LEAD-ENG-21 | Load 13699 Bradley, IL delivery street address |
| AUTH (data phase) | ENG-48 bridge apply · ENG-22 apply (3 loads) · ENG-04 apply ($705.97) · ENG-25b apply · ENG-29 miles backfill |
