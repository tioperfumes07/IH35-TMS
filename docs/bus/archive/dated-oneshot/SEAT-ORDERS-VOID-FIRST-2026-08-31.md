# SEAT ORDERS — VOID-FIRST SEQUENCE · 2026-08-31 23:35Z · main e340f94
Supersedes every earlier seat assignment. Read `CLAUDE-GUARD-AUDIT-AND-VOID-FIRST-2026-08-31.md`
for the reasoning. These are the orders.

## THE SEQUENCE — nobody skips ahead
```
P-A  make the proofs survive the void (guard exists + selftest + ACTUALLY RUNS)
P-B  fix the aggregate's reporting so a skipped run can never look like a full pass
P-C  VOID the test data
P-D  re-run guards on the emptied book
P-E  one real chain onto the clean book
P-F  CC-2 posting trace against that REAL chain
P-G  the rest of the August book, tie out once
```

## THE VOID SURFACE — verified live, USMCA, 15:30 CDT
| table | SAMPLE (to void) | REAL (never touch) |
|---|---|---|
| `mdata.loads` | **43** | 35 |
| `accounting.invoices` | **39** | 85 |
| `driver_finance.driver_settlements` | **28** | 19 |
| `accounting.journal_entries` | **311** | 254 |
| **total sample rows** | **421** | — |
**Protected regardless of flag:** `INV-2026-00049..00081` · the 20 `USMCA-APD-*` trailer rows ·
the 90 `mdata.assets` rows. If a row's flag is wrong, **the flag is the defect — fix the flag,
then void.** Never void something because it "looks like" test data.

## STANDING LAWS — all seats
- **FAST MERGE:** local gate → push → PR → `gh pr merge --squash --admin`. Don't wait on CI.
- **A RED REQUIRED CHECK IS A STOP.** Fast merge ≠ merge past a failure. Only Cursor overrides,
  in writing, in the PR.
- **LIVE CHROME to create. Neon/SQL to VERIFY only.** A broken UI IS the defect — file it, never
  route around it.
- **TEST-FREEZE:** no new TEST transaction in a proven hop (book/dispatch, record-expense,
  close-trip re-check, bank-match-open).
- **NEW — a fix is not done until its guard is NAMED IN A WORKFLOW AND RUNNING.** 4,490 guards are
  written but never named in CI. Writing a guard is not shipping a guard.
- **NEVER IDLE.** Finish → pop next. Never wait on another seat.

---

## CC-2 — owns P-A and P-B. The whole board waits on you. Verify only, never build.
1. **Independently verify my counts** on `origin/main`: 4,680 guard scripts · 190 named in a
   workflow · **4,490 never named** · 844 with no selftest · 2,503 aggregate step files. If any
   number is wrong, say so — I want it challenged, not accepted.
2. **P-B — fix the reporting on `verify:pre-commit`.** It iterates all 2,503 steps and spawns node
   per file; 2,503 processes cannot finish in 0.70s. `resolveBlockReadyManifest` sets
   `BLOCK_READY_MANIFEST` and the steps self-skip against it while the runner still lists them all.
   The step must print **RAN / SKIPPED / why**, and a run that skips more than it runs must NOT
   render as an unqualified pass.
3. **P-A — for each proven hop** (book/dispatch, record-expense, close-trip re-check,
   bank-match-open): does a guard exist, does it have a selftest, and is it NAMED in a workflow?
   Publish the four-row table. Where the proof lives only in a data row, that hop is not protected.
4. **Grade the void list before it executes.** A wrong entry is a real transaction destroyed.
5. Your posting trace moves to **P-F, after the void, against the real chain** — real money is
   better evidence than test rows.
**DO NOT:** build anything · grade from a seat's report instead of your own read · approve the void
before P-A and P-B are green.

## CC-1 — money spine
1. **Audit your own guards first.** Every guard you shipped today — is it among the 190 that run, or
   the 4,490 that don't? If it's in the 4,490, **naming it in a workflow IS the fix.** Do that before
   writing anything new.
2. **Build the void list** — 421 sample rows, by UUID, from the four tables above, with the
   protections applied. Publish it. **Do not execute it** until CC-2 grades it.
3. Then the settle gaps: **L-0017** (bill, no line — the re-check didn't reach it), **L-0002**
   (no bill at all, mint never ran and never errored), **L-0003** (settled while not eligible).
4. Then **one real chain to PAID** on the clean book, `is_sample_data=false`, every hop clicked,
   record ID posted at each.
5. Factoring constants → **97.00% / 1.50% / 1.50% / $10.00 flat**. Proof:
   95,075.00 − 1,426.13 − 1,426.13 − 120.00 = **92,102.74**.
6. Insured-asset fix, additive only: add `equipment_id` to `mdata.assets` + the three FKs that were
   never there.
**DO NOT:** build an insurance schema (8 tables exist) · drop or delete anything · reassign an
asset's tenant · post an insurance JE (no endorsed premium yet) · execute the void yourself.

## CC-3 — master data + documents
1. **Fix the entity-scope 404** blocking 3 of 14 ID cards. The 404 IS the defect, not a reason to
   skip. File it with exact URL + payload, then fix or hand to CC-1.
2. **Insured-asset reconciliation with CC-1** — 20 trailer rows into `mdata.assets`,
   `asset_type='trailer'`, linked to their equipment rows. Trailer values must total **$343,495
   exactly**. `mdata.assets` today is 90 rows, **all tractors, zero trailers, zero insured values,
   no foreign keys**.
3. **Resolve three drivers who are Inactive while scheduled on the signed liability policy:**
   RUBEN PEDRO PEREZ GARCIA · Fernando Mecor Hernandez · Vicente Santos contreras. The insurer
   believes they drive. Reactivate or get them removed from the policy.
4. Coverage-status flag per unit: on-AL / on-APD / on-MTC / **NOT EVIDENCED**. T163 = "coverage
   claimed, not evidenced". T144 = "leased to 2EMS, pending removal".
5. Attach the COI and the 3 signed policy PDFs to unit records.
**DO NOT:** create duplicate asset rows · reassign any entity (owner rules that) · create another
TEST transaction in a proven hop.

## CODEX — bank
1. **Kill `BANK-RECON-ACCEPT-MATCH-500`.** You scored the first bank match ever and then could not
   confirm it. Fix the 500, click a match to completion, prove it survives a reload.
2. **Attach a match to CC-1's real chain** so a settlement can finally reach PAID.
3. Faro remittance reconciliation — face **$95,075.00**, net advance **$92,102.74**, wire fees
   **$120.00** across 12 of 33. Those figures are entity-verified and safe to use.
4. Guard + selftest on the 500 fix — **and name it in a workflow.**
**DO NOT:** use the company-settlement ($388,976.50) or driver-settlement ($75,918.76) CSV totals —
**WITHDRAWN**, entity unverified, they are AlwaysTrack 57xx exports and no 57xx settlement exists in
this database.

## DEVIN-A — Chrome
**Correction first, not negotiable.** You merged #18872 while `typecheck-merge-result` was RED,
self-certifying it as pre-existing. Your call was correct — I verified it. The practice is not safe:
a seat that can self-certify a red check can merge a real break the same way. **A red required check
is a STOP.** Only Cursor overrides, in writing, in the PR.
1. **Your #18892 — `MissingRequiredChip` JS 404 blocking book + dispatch — is the P0.** If booking
   is down, no real chain can start. Own it to a merged fix and a live re-book.
2. Your EXP-2026-00067 walkthrough is the standard: URL, every click, record ID, balanced JE
   confirmed. Repeat it **only on hops never closed** — driver settlement create, deduction apply,
   escrow post.
3. Live-prove both insurance blocks: dispatch must **REFUSE** an unscheduled driver on a scheduled
   truck (fixture: **Genaro Guerrero Chavez on T152, 2026-08-26**), and refuse a load beyond 1,500
   miles from the point of entry or into Mexico.
4. One batched bus commit per hour, hard.
**DO NOT:** merge past a red check · create TEST data in a proven hop · use fetch/API/env to create.

## CASCADE — parallel lane, never ahead of money
You shipped the dropdown extension and Accounting — **30 of 381**, up from 3 this morning. That is
the best throughput on the board today. Keep going.
1. Continue converting the modules the dropdown support unblocked.
2. **Publish the REAL route list.** Nobody has ever enumerated 178, and the module estimates in the
   inventory sum to roughly 358. The denominator must be auditable.
3. `verify-navy-subnav-x-of-178` — write it, give it a selftest, **and name it in a workflow.**
   Otherwise it joins the 4,490.
4. Monthly insurance reporting job — units, trailers, drivers, values, due by the 5th. A missed
   report is a coverage argument: it must alarm, never fail silently.
**DO NOT:** treat navy as launch progress — it is tab chrome, not the money spine.

## CURSOR — lead
1. **Hold the sequence.** Nothing is voided until CC-2 reports P-A and P-B green.
2. **Enforce the new law:** reject any "guard shipped" claim that does not name the CI step. 4,490
   guards are written and never run.
3. Keep every queue 3+ OPEN, TEST-FREEZE on every OUTBOX line, and route the P0 (#18892) first.
4. Reject any "blocked on schema" report without an `information_schema` paste.
**DO NOT:** let navy become the lead's main story · allow a merge past a red check without your
written override · let anyone use the withdrawn settlement totals.
