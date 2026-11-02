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
DONE = AUTH-473 CLOSED · 5 CODED-QUEUED rows DONE-LIVE (or reopened with the failing number) · ENG-22 guard merged.
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
7.3-D ENG-48 money side (with Codex): review scripts/ops/2026-09-30-cc1-r290-1-fuel-expense-bridge-backfill.ts against
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
7.5-E FINDING (measure, no behavior change): Creator maps a customer/broker trailer → POWER_ONLY_CUSTOMER_TRAILER
      (creator-trailer-choice.ts:88); Book/Edit Load keep physical type (12 live: 11 DRY_VAN, 1 REEFER). Write both + counts
      for the owner.
```

## 7.6 — CODEX
```
TO: CODEX   FROM: Claude Lead   ROUND 7.6   deadline 2026-11-03T02:00Z   missed → Claude Lead

Queue: ENG-48 → ENG-49 → ENG-17. ENG-13 / ENG-60 are Claude's. ENG-25b is CC-1's.
7.6-A ENG-48 engine: the "JE debit=0 mass failure" line was wrong (0 live). Real: 147 Relay fills with 0 expense +
      78 expenses ≠ net+fee. Read accounting.posting_source_load_id 'fuel_event' branch + adoptRelayFillExpenseDocument
      (fuel-expense-document.service.ts) — fix the ON-RECEIPT writer so every Relay fill mints its own expense; wire
      verify-fuel-expense-one-to-one.mjs into CI. Literal "5000" at statement-card-credit-repair.service.ts :93/:119 →
      role resolver (line-29 comment is false). Repair = CC-1 7.3-D dry run.
7.6-B ENG-49 settlement 5787: signed doc $140.20 vs app non-diesel lines $107.00 (75 layover + 22 reimb + 10 admin gas;
      + escrow 25) vs claimed $235.01. Line-by-line table from Company_Settlement_5787.txt / Driver_Settlement_5787.txt;
      name where $235.01 came from; correct through the settlement engine's closed-period path (P-0018 closed). No JE.
7.6-C ENG-17: 1090 now $159,764.48 (CC-2 names the $10,446.00). 14 unmatched Faro purchases → PROPOSED / AMBIGUOUS with
      Faro CSV row + wire candidate; owner pick screen with Undo through createBankDeposit. 2510 $187,894.21: Dreamline
      statement MISSING → BLOCKED, measured by source. No balancing JE.
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

## 7.7 — CLAUDE LEAD (self)
ENG-60 table drop (rebased onto Cursor's 410 work: all three verbs SQL-free 410 stubs, migration 202616310100, guard 18917) · ENG-13 #27975 · stop-dwell #27985 · merge gate + register.

## 7.8 — OWNER (only you can answer)
| Item | Needed |
|---|---|
| ENG-38 | Which USMCA months to lock (24 periods open) |
| ENG-54 | The 16-truck ownership list |
| LEAD-ENG-21 | Load 13699 Bradley, IL delivery street address |
| AUTH (data phase) | ENG-48 bridge apply · ENG-22 apply (3 loads) · ENG-04 apply ($705.97) · ENG-25b apply · ENG-29 miles backfill |
