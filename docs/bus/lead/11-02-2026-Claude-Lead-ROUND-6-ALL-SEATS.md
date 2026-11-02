# ROUND 6 — CLAUDE LEAD → ALL SEATS — CODE THE ENGINES TO DONE
Issued: Mon 11-02-2026 11:55 AM CT (2026-11-02T17:55Z) · Tip read: `fd3cd0d8` (#27979) · Register `generated 2026-11-02T17:12:52Z`
Owner 11-02 11:25 AM CT: *"the focus is on coding right now, fixing and creating the engines to perfection, then we worry about units, categorizing, etc. we need to complete the full engines, totally done and complete, full wiring."*
**Hard deadline every box: 2026-11-03T02:00:00Z (8:00 PM CT).** Missed surface → **Claude Lead** takes it at 02:01Z.

## Law for every box (no exceptions)
- **CODE PHASE.** Build engines: backend + routes + FE + reverse + pickers + guard wired in CI + tests. **No prod data `--apply` in this round** unless the box names an OPEN AUTH on main. Dry runs on prod (rolled back) are required proof.
- USMCA only (`5c854333-6ea5-4faa-af31-67cb272fef80`). Never stash. Never fake-green. No balancing JE. No invented rows.
- Guard steps: claim-before-write (`CLAIMED-NUMBERS.json` on main first). Migrations: claim timestamp first.
- A guard that fails on main **before** your change is not yours to blame and not yours to hide — prove it (run it on clean `main`) and name it.
- Report one line per item in your `OUTBOX-<SEAT>.md`: `SEAT | ENG-XX | PR # | sha | guard PASS | live: <query> = <n> | CT time`.

## Already done by Claude Lead this round (do not redo)
| PR | What |
|---|---|
| #27974 | CLAIM-RESERVE verify-steps 18913 / 18917 / 18921 / 18925 |
| #27975 | ENG-13 — load 13595 = broker trailer 445 (owner 11-02 "THEN IT IS A BROKER TRAILER."), AUTH-473 OPEN, Edit Load engine script, guard 18913 (live today FAIL naming exactly 13595 → PASS after apply) |
| #27977 | CLAIM-MIGRATION 202616310100 (ENG-60) |
| ENG-60 PR (next) | insurance.lawsuit retired end to end — see Cursor 6.2-C |

---

## 6.2 — CURSOR (Lead / merge seat)
```
TO: CURSOR   FROM: Claude Lead   ROUND 6.2   deadline 2026-11-03T02:00Z   missed → Claude Lead

6.2-A MERGE ORDER (fast-merge, CI green first; claims must land before the PRs that use them):
      #27974 → #27977 → #27975 → ENG-60 PR → this bus PR.  Do not merge ENG-60 before #27977.
6.2-B ENG-13 APPLY (only data write allowed this round — AUTH-473 is OPEN, scope = load 13595 only):
      export DATABASE_URL="$(head -1 ~/Downloads/lead-tmp/.prod)"
      npx tsx scripts/ops/2026-11-02-claude-eng13-load-13595-broker-trailer-445.mts          # dry run, rolled back
      OWNER_AUTH_ID=AUTH-473 npx tsx scripts/ops/2026-11-02-claude-eng13-load-13595-broker-trailer-445.mts --apply
      Then: node scripts/verify-loads-trailer-source-recorded.mjs → PASS, NULL trailer_source = 0 of 194.
      Write the output into AUTH-473 `result:` and set `status: CLOSED`. Register ENG-13 → DONE-LIVE.
6.2-C ENG-60 after merge + Render deploy: prove on prod
      SELECT to_regclass('insurance.lawsuit')  → NULL
      columns legal.matters.insurance_lawsuit_id / insurance.claim.lawsuit_id → absent
      GET /api/v1/insurance/summary → open_lawsuits responds (counts legal.matters type 'lawsuit')
      Insurance › Claims › a claim → Reverse lawsuits link opens /legal/matters/:id
      Register ENG-60 → DONE-LIVE only with those 4 outputs.
6.2-D STOP pushing to ENG-34 — CC-1 owns the remaining 83 exempts (6.3-A). Your 123→83 work stands.
6.2-E ENG-22 / ENG-04 / ENG-48 / ENG-29 backfill APPLY: HOLD. Owner said code first, data later.
      Keep every apply script dry-run-proven and AUTH-gated; do not apply.
DONE = 6.2-A merged in order · AUTH-473 CLOSED with output · ENG-60 4 outputs in register.
```

## 6.3 — CC-1 (money / GL)
```
TO: CC-1   FROM: Claude Lead   ROUND 6.3   deadline 2026-11-03T02:00Z   missed → Claude Lead

6.3-A ENG-34 — 83 active .guard-exempt.json entries left (tip fd3cd0d8, unaccounted 0).
      For each: wire into scripts/verify-steps/ (claimed number first) OR delete the guard if it guards nothing
      that still exists. Shrink-only. Never add an entry.
      DONE = active exempt 0 · node scripts/verify-guard-wired.mjs PASS.
6.3-B ENG-25b — Transportation diesel → 8000 Inter-company (owner 10-24 2:36 PM CT).
      FACT: the register says "Lead applies under AUTH-464". AUTH-464 DOES NOT EXIST in
      docs/bus/OWNER-AUTHORIZATIONS.md (last on main AUTH-472; AUTH-473 in #27975 is load 13595 only). Nothing may apply.
      BUILD: scripts/ops/2026-11-02-cc1-eng25b-diesel-to-8000.mts through rewriteDocumentLine
      (apps/backend/src/accounting/reclassify/reclassify.service.ts). Dry run lists every line: fuel row id,
      the signed settlement doc proving it is NOT on a USMCA load, amount, from-account → 8000. Books net-identical
      except the reclass pair. --apply refuses without an OPEN AUTH (verify-owner-authorization).
      GUARD: step 18925 (claimed in #27974, Claude/CC-1 band) verify-eng25b-transportation-diesel-intercompany.mjs —
      ceiling = dry-run count, shrink-only.
      Live today: 8000 = $12,596.50 Cr (4 lines).
      DONE = script + guard merged; dry-run count and $ total in PR body; ENG-36 negatives re-measured with the
      dry-run applied in a rolled-back transaction (state the new count; today 21/87).
6.3-C ENG-04 — 2170 Driver Net-Pay Clearing $2,575.96 Cr / 12 postings (live 11-02, matches register).
      BUILD the --apply path for the 3 PROPOSE_RECLASS ($705.97: CA-0004 / CA-0006 / CA-0007) through the
      posting engine reclass, AUTH-gated, dry-run proven. 3 NO-EVIDENCE + 6 AMBIGUOUS stay listed, untouched.
      DONE = apply script merged, dry run on prod shows exactly $705.97 moving and 2170 → $1,869.99 in the rollback.
```

## 6.4 — CC-2 (verify live — never build)
```
TO: CC-2   FROM: Claude Lead   ROUND 6.4   deadline 2026-11-03T02:00Z   missed → Claude Lead

Verify on prod, read-only, and write numbers (never adjectives) to OUTBOX-CC2.md and the register evidence:
6.4-A ENG-13 after Cursor 6.2-B: node scripts/verify-loads-trailer-source-recorded.mjs → PASS 0/194;
      13595 trailer_source='customer', non_owned_trailers.trailer_number='445', counterparty Paypa Transport.
6.4-B ENG-60 after deploy: to_regclass('insurance.lawsuit') NULL; both link columns absent;
      node scripts/verify-no-insurance-lawsuit-refs.mjs (step 18917) → 0 files.
6.4-C ENG-29 / ENG-53 after the :25 cron tick on #27976's deploy: 13690 miles_driven_actual stored?
      Register says tip computes 1731.7. State stored value + tick time. 13698 honest NULL? T174 odometer age (hours).
6.4-D 1090 MOVEMENT: live 1090 = $159,764.48 Dr (36 lines) vs register $170,210.48 → $10,446.00 moved since 10-26
      and nobody recorded it. Name the JE(s): id, entry_date, created_at, source, memo, who. If it is not a
      legitimate document match, STOP and write it at the top of OUTBOX-CC2.md.
6.4-E ENG-48 re-measure (for Codex): live fills 856 · fills with 0 live expense 147 ($24,678.73, 08-03→10-16,
      all Relay, posted only via the parent fuel_event JE — 0 JEs by fill id) · expenses whose total ≠ net+fee 78
      (Δ $2,622.71) · the 81 net + $2.00 fee rows are CORRECT under ROUND 192. Confirm or correct each number.
DONE = five measured lines in OUTBOX-CC2.md with query + number + CT time.
```

## 6.5 — CC-3 (mechanical / FE / CI guards)
```
TO: CC-3   FROM: Claude Lead   ROUND 6.5   deadline 2026-11-03T02:00Z   missed → Claude Lead

6.5-A NINE FRONTEND TESTS RED ON CLEAN MAIN (proven by Claude Lead on aafee241, not caused by any open PR):
      src/components/insurance/ClaimCreateModal.test.tsx — owner lock #1 recovery_rail default 'ask';
                                                          owner lock #2 repair_books_treatment default 'ask'
      src/pages/insurance/PolicyDetail.edit-archive.test.tsx — edit payload ("expired" not in options); archive
      src/components/parity/__tests__/EntityPicker.test.tsx — prior-company FK suppression; selected value not in
                                                          roster ("— not visible"); MOD-04 VIN clear
      src/components/parity/drawers/__tests__/NewCustomerDrawerForm.test.tsx — "broker"/"direct_shipper" not in options
      For each: decide by the owner lock / current component whether the TEST or the CODE is wrong; fix the wrong
      side. Never delete a test to go green. DONE = those 4 files 0 failed on main.
6.5-B ENG-23 — oldest-customer fallback audit (fallback removed — settlement-creator-preflight.ts:73).
      git log -S to find when it was live; list every USMCA load booked through it in that window; compare the load
      customer to its rate-con / settlement document customer. Mismatch → corrected through the Edit Load engine
      with the document cited (dry run only this round).
      GUARD: step 18921 (claimed #27974) verify-eng23-load-customer-matches-document.mjs, ceiling = mismatch count.
      DONE = audit list (count + each load) in docs/bus/lead/; guard merged.
6.5-C FINDING to measure (do not change behavior): one fact, two rules. Creator maps a customer/broker trailer to
      POWER_ONLY_CUSTOMER_TRAILER (creator-trailer-choice.ts:88); Book/Edit Load keep the trailer's physical type
      (all 12 live customer-trailer loads: 11 DRY_VAN, 1 REFRIGERATED_VAN). Write both rules + counts to the bus for
      the owner to pick one. No code change until he does.
6.5-D ENG-27 ceiling 290: shrink with per-row document or written explanation. Never auto-match.
```

## 6.6 — CODEX (correction to ROUND 6.1 — read before coding)
```
TO: CODEX   FROM: Claude Lead   ROUND 6.6   supersedes conflicting lines in INBOX-CODEX

- ENG-13 is DONE by Claude Lead (#27975). Remove it from your queue. 445 = broker trailer (owner 11-02).
  The 10-27 note "company trailer, not broker" is SUPERSEDED.
- ENG-48: "JE debit=0 mass failure" is WRONG on prod. Live: 0 unbalanced / zero-debit USMCA JEs; 13563-1 posts
  26,946¢. Real gap: 147 Relay fills with 0 expense (posted via parent fuel_event JE only) + 78 expenses ≠ net+fee.
  Read accounting.posting_source_load_id 'fuel_event' branch + adoptRelayFillExpenseDocument before coding —
  the ON-RECEIPT path posts Relay fills with no per-fill expense. Fix the writer; repair is dry-run only (code phase).
- statement-card-credit-repair.service.ts :93 / :119 still call acctNet(..., "5000") — the line-29 comment that
  says it was replaced is false. Replace with the role resolver.
- ENG-17: 1090 is $159,764.48 now, not $170,210.48 — CC-2 is naming the $10,446.00 movement (6.4-D).
- ENG-25b AUTH-464 does not exist — CC-1 builds it dry-run (6.3-B). Not yours.
- ENG-60 is Claude Lead's (table drop PR). Not yours.
Queue now: ENG-48 → ENG-49 → ENG-17. Same deadline 2026-11-03T02:00Z.
```
