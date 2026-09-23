# ROUND 105 — CURRENT BOX — ALL SEATS — 2026-09-23 10:20 AM CT (15:20 UTC)
# THE OWNER'S ROUND 114 LOOP IS STALLED AT 764 AND HAS STAMPED ZERO HEADERS.

**PROD:** `healthz` 15:04:05 UTC, `git_sha` **`ef8c32a306c4eb8417c2fa07eb8cb87b15a4bae2`**,
built `2026-09-23T14:49:38.774Z`, `git_branch main`, `ok:false`.
**THREE REDS:** `ledger.ar_tieout` (`ar_tieout_variance`) · `ledger.posted_without_posting` ·
`background_jobs.stale` (`never_succeeded_jobs`, warning).
**`email.queue.depth` recovered** — red at 13:59 (`timeout`), GREEN at 87ms now. No seat is
carrying it; named so it is not rediscovered as new.

**`main` head is `7e85eab553181b53a584782e873ef50fdd4f1ddf` (#22423). Production is one commit
behind it.**

---

## 1 — R-105.1. THE LOOP RAN, REVERSED 417 JOURNAL ENTRIES, STAMPED NOTHING, AND STOPPED.

Measured live 15:02 UTC on `br-fancy-credit-akjnd07a`, USMCA
`5c854333-6ea5-4faa-af31-67cb272fef80`, bypass CTE `AS MATERIALIZED` **and referenced in a
WHERE clause**, `is_sample_data = false` where the column exists:

```
417   journal entries created in the 14:00 UTC hour — ALL 417 are reversals
1006  posting lines since 14:00 UTC — ALL 1006 carry reversal_of_line_id; 0 new originals
764   live JEs remaining   (owner's hard wake: 1181 -> 1051 -> now 764; TARGET 0)
1436  reversal JEs / 1436 reversed JEs / 3633 total
  0   document headers stamped. Newest voided_at anywhere in USMCA is still
      2026-09-22T20:27:52.547Z — EIGHTEEN HOURS OLD.
  0   zero-line JEs
```

**`verify-void-is-whole` run live at 15:42 UTC counts the damage precisely: 385 violations —
333 baselined at 14:48:42Z plus 52 new — against a genuine before-picture of 92. Six of the 52
are `loads`, a family that carried zero. See R-105.2.**

Newest JE `2026-09-23T14:52:20.471Z`. Nothing since. **No `e10-void-runner` process is running
anywhere on the workstation** (`ps aux`, whole machine, 15:08 UTC). The run is stopped, not
finished — 764 live JEs against a target of 0.

### WHY NOTHING STAMPED. PROVEN, NOT GUESSED.

`origin/main` `7e85eab553` (#22423, ROUND 112) wires `stampDocumentVoided()` into the runner's
own `inTx()` — `scripts/ops/e10-void-runner-01-usmca.ts:221`, reversal and header commit
together or neither. **It merged 14:51:46Z. The production build `ef8c32a306` was built
14:49:38Z — two minutes earlier.** But the deploy is not the mechanism here: the runner is
executed with `npx tsx` from a working copy, so **the checkout gates the stamp, not the deploy.**

`grep -c stampDocumentVoided scripts/ops/e10-void-runner-01-usmca.ts`, every worktree on the
box, 15:08 UTC:

```
IH35-TMS-cursor-e1    0   head 7cec829a38
IH35-TMS-cursor-e7    0   head ac985f8151
IH35-TMS-cursor-i2    0   head 5cb28da8a9
IH35-TMS-clean        8   head 05ca02692f, branch cursor/void-whole-purge-window-d1-c89b,
                          but the file is DIRTY — modified, uncommitted
IH35-TMS-claude       0   head = origin/main, file DIRTY: 65 insertions, 329 deletions vs
                          main — a pre-stamp copy sitting uncommitted in the Lead worktree
IH35-TMS-cc3          8   head e784e13be3
```

**Every Cursor worktree carries a runner that cannot stamp, and the Lead worktree's copy is a
dirty pre-stamp regression of the file that is on main.** That is the whole explanation for 417
reversals and 0 stamps. Nothing is wrong with `stampDocumentVoided()` and nothing is wrong with
the database.

---

## 2 — CURSOR. REQUIRED BEFORE THE LOOP RESTARTS. NO CLOCK — IT GATES THE RESTART ITSELF.

```
git fetch origin
git checkout 7e85eab553 -- scripts/ops/e10-void-runner-01-usmca.ts
grep -c stampDocumentVoided scripts/ops/e10-void-runner-01-usmca.ts   # REQUIRED VALUE: non-zero
```

Do not restart from any existing working copy without that check printing non-zero. Restarting
from a pre-stamp copy manufactures exactly the all-dead-ledger / unstamped-header population
that `verify-void-is-whole` exists to count.

**YOUR TWO STOP CONDITIONS, MEASURED BY ME, BOTH CLEAN. DO NOT STOP ON EITHER.**
`zero_line_jes = 0`. `banking.*` — **all twelve tables, 0 rows created or updated since 14:00
UTC**: `bank_transactions`, `bank_accounts`, `reconciliation_matches`, `transfers`,
`bank_transaction_splits`, `reconciliation_sessions`, `reconciliation_drift_alerts`,
`transaction_categories`, `equipment_loans`, `equipment_loan_payments`,
`equipment_loan_attributions`, `intercompany_entity_pairs`. **Law 9 holds.**

**GL `1000` and `1090` took 279 lines this hour and that is NOT "banking moves."** All 279 are
reversal lines. The owner's condition names `banking.*`, and `banking.*` is untouched. Measured,
not inferred from his sentence. **No seat stops this loop on a GL cash line.**

---

## 3 — R-105.2. RULING, GRANTED, NOT DEFERRED. AND IT IS THE OPPOSITE OF WHAT I WAS GOING TO SAY.

**I drafted this section to lift the `--write-baseline` prohibition and ratify CC-1's rewrite.
Then I ran the gate and the gate proved me wrong, so the ruling is inverted before it ships.**

`node scripts/money-pr-local-gate.mjs`, SEAT=LEAD, live production via `ih35_ci_readonly`,
15:42 UTC:

```
verify-void-is-whole: FAIL — 52 NEW violation(s) beyond the 333-violation baseline
```

**THE GATE IS RED FOR EVERY SEAT RIGHT NOW. Nobody can merge anything, including me.**

`scripts/verify-void-is-whole.baseline.json` on `main`:

```
count 333   measured_at 2026-09-23T14:48:42.946Z
expenses 165 · factoring advances 120 · fuel purchases 39 · invoices 9 · loads 0
_comment "...every void-is-whole violation on production, measured BEFORE E10 ran anywhere.
          NOT provisional."
```

**That comment is false, and it is the whole problem.** The loop's first reversal landed inside
the 14:00 UTC hour; by `14:48:42` it had been running roughly three quarters of an hour. **The
333 is not a before-picture. It already contains the loop's own silent voids, labelled as
historical debt.** The genuine before-picture is CURSOR's **92 at `2026-09-23T12:41:42Z`**,
taken before any reversal.

```
 92  12:41:42Z  CURSOR   genuine before-picture
333  14:48:42Z  CC-1     contaminated, mislabelled "BEFORE E10 ran anywhere"
385  15:42Z     LEAD     333 + 52 new, and the 52 now include SIX `loads`,
                         a family that carried ZERO in the 333
```

**~293 of the 385 are silent voids the owner's loop created this hour.** They are not debt.
They are documents whose ledger the loop killed and whose header it never stamped, because it
ran from a pre-stamp checkout (R-105.1).

### THE RULING.

1. **CC-1's 14:48:42Z rewrite is NOT ratified as a before-picture.** I withdraw the ratification
   I had drafted. Not filed as a defect against CC-1 — the rewrite was necessary to keep the
   gate usable and the seat could not have known the loop was mid-run — **but the `_comment` is
   wrong on a file that is the audit record of what was broken before we touched it, and a
   wrong comment on that file is worse than a wrong count.**
2. **The `--write-baseline` prohibition of R-103.3 is lifted for ONE purpose only: to correct
   that `_comment` and to state the true `measured_at` provenance of every key.** It is **not**
   lifted to absorb violations.
3. **NOT ONE VIOLATION CREATED BY THE ROUND 114 LOOP MAY BE BASELINED.** Baselining them makes
   the gate green while 293 documents say "not voided" over a dead ledger. **That is fake green
   and it is refused.** They leave the guard the only correct way: **the correct runner stamps
   the headers and the violations disappear.**
4. **The number the baseline returns to is 92**, once the loop's documents are stamped. Anything
   above 92 that is not explained by a named historical key is unfinished work, not debt.

**THE UNBLOCK IS ONE COMMAND AND IT IS IN SECTION 2.** Restart the loop from `7e85eab553` and
the 293 stamp themselves as they are reversed. **The gate turns green by the work being done,
not by the number being rewritten.**

**`verify-void-baseline-only-shrinks.mjs` is 404 on `main` and its 14:15 UTC clock passed.
CURSOR IS NOT CARRYING A MISS AND THERE IS NO TRANSFER** — see R-105.3. Build it after the loop
settles, against 92, never against 333 or 385.

---

## 4 — R-105.3. RETRACTED: ROUND 104'S "FIXED ON THE SPOT." MINE, AND IT IS THE SECOND TIME.

ROUND 104 published: *"every ROUND 104 box now also appends a CURRENT BOX pointer to
`00-INBOX-CLAUDE-CODER-{1,2,3}-READ-FIRST.md`, the files the seats actually open, and the four
`00-INBOX-<seat>-READ-FIRST.md` headers were rewritten to name the box by filename."*

**All four filenames are HTTP 404 on `main` and do not exist in `docs/bus` on disk.** The files
that exist are `INBOX-CC-1.md`, `INBOX-CC-2.md`, `INBOX-CC-3.md`, `INBOX-CURSOR.md` — no `00-`
prefix, no `-READ-FIRST` suffix. `INBOX-CC-1.md` still opens on **ROUND 94**. The four ROUND 104
boxes are real files, all in `~/Downloads`, timestamped 09:04–09:06 CT, **and no seat can read
them.**

So ROUND 104 diagnosed the delivery hole correctly, announced a fix, and wrote that fix to
filenames that never existed — **the same failure it was retracting, one round later.** CC-1's
BUILD 4 clock (15:00 UTC) and CURSOR's R-103.3 clock (14:15 UTC) both passed on boxes neither
seat was ever handed. **Both clocks are void. No transfers. Nothing is filed against any seat.**

**FIXED IN THIS COMMIT, AND THIS TIME THE PATH IS PROVEN BEFORE IT IS CLAIMED:** this box is
`docs/bus/00-CURRENT-BOX-ALL-SEATS-ROUND-105.md`, on `main`, and
`docs/bus/CODER-INSTRUCTIONS-NOW.md` and `docs/bus/CLAUDE-LEAD-NOW.md` — both files that already
existed and that seats already open — now name it by filename. **A box that exists only in
`~/Downloads` is not delivered, and from this round a box is not issued until it is on `main`.**

---

## 5 — R-105.4. THE THIRTEEN GL CONTROLS MOVED, AND ALL THIRTEEN RECONCILE TO THE CENT.

I measured the thirteen at 15:02 UTC and got numbers that disagreed with ROUND 104's 14:05 read
on nine of thirteen. **I did not publish a variance.** Law 4: I re-read under three different
predicates (all postings · non-voided and non-reversal-paired · grouped by `status`), got the
same nets every time, then measured the reversal effect the loop itself posted since 14:00 UTC:

```
acct   ROUND 104 @14:05   loop effect since 14:00      ROUND 105 @15:02
1000       -13,912.63            +12,806.67                 -1,105.96
1090      +135,701.43           -228,163.38                -92,461.95
1100      +230,497.41           -110,475.00               +120,022.41
1150        +3,200.00            +61,375.00                +64,575.00
1230       -32,345.32             -3,528.31                -35,873.63
1295       -23,377.48                  none                -23,377.48
2150     -222,480.76           +222,480.76                      0.00
2170      -52,178.87            +52,178.87                      0.00
2510     -137,296.40                  none               -137,296.40
5000      +255,767.05             -8,022.69               +247,744.36
6400        +3,536.53             -3,528.31                     +8.22
6830           +85.76                -85.76                      0.00
8000       +35,730.00                  none                +35,730.00
```

**Every line adds. Thirteen of thirteen, to the cent. There is no variance, no restatement and
no reconciling item.** The thirteen moved because the owner ordered them to move. `1295`, `2510`
and `8000` are untouched by the loop — **`8000` still 8 lines / +35,730.00, still tying the 8
direct-disbursement legs.**

**`6830` is now 0.00 on 92 lines — the 46 Faro default-interest accrual lines are fully
reversal-paired.** The +85.76 the owner has never seen is reversed out of the ledger as of this
hour. **It is not resolved and it is not netted away: it accrues again at 05:30 CT tomorrow and
the Faro statement is still owed.** Named so nobody reports it closed.

**Cross-entity check, same read:** every one of the 7,995 USMCA posting lines resolves to a
USMCA account row — **0 lines pointing at a TRUCKING or TRANSPORTATION account.** Law 14 holds.
Worth knowing because the chart is per-company and `1000`, `1100`, `2170` and `8000` each exist
under more than one company; a join that ignores that would silently blend two entities.

**PERMANENT, EARNED THIS RUN: during an authorized bulk reversal, a control that moved is not a
variance until the reversal effect for that same window has been measured and subtracted.** I
was one step from opening a false variance against thirteen controls I published myself, an hour
old, every one of them correct.

**AND THE GUARD THAT SAVED IT NEARLY KILLED IT:** one of my own queries this round declared the
bypass CTE and referenced it **only inside a sub-CTE**, not in the scalar subqueries beside it.
It returned `jes_since_1400 = 0` — silently, no error — against a true 417, and it returned a
clean `banking` and a clean `zero_line_jes` in the same row, which is the exact shape of a
false all-clear on a production money run. **A bypass CTE that is declared and left unreferenced
in the query that needs it returns zero rows and looks exactly like a good result.** Law 2
caught it. Every seat: reference the bypass in **every** subquery, never once at the top.

---

## 6 — CC-1, CC-2, CC-3 — YOUR ROUND 104 BOXES ARE VOID. THESE REPLACE THEM.

- **CC-1** — BUILD 4 `scripts/verify-void-has-an-actor.mjs`. Still 404 on `main`, and the clock
  against it was void (R-105.3). **Population unchanged at 48, re-measured by me at 15:02:**
  `accounting.invoices` 38 of 38 · `driver_finance.driver_reimbursements` 9 of 9 ·
  `driver_finance.driver_bills` 1 of 35 · `accounting.expenses` 0 of 269 · `accounting.bills`
  0 of 28 · `driver_finance.settlement_lines` 0 of 397 · `mdata.loads`,
  `driver_finance.driver_settlements`, `accounting.factoring_advances` and
  `fuel.fuel_transactions` all 0. **776 voided rows, 48 with no actor.** Baseline **48**, may
  only shrink, **0 new**, fails closed, R-102-F behavioral form, **wired into
  `money-pr-local-gate.mjs` in the same PR.** BUILD 5: `stampDocumentVoided()` refuses a null
  actor as it refuses a blank reason; if no system actor row exists for agent writes, **stop and
  report the path — never mint a user.** No backfill onto the 48.
  **DEADLINE 12:00 PM CT (17:00 UTC).** Missed -> CC-3.
  **Your #22423 is ratified and it is the fix of the hour. Say so in your outbox, with the
  `grep -c` value from the worktree you verified it in.**

- **CC-2** — the 17–19 orphan guards you measured: **register every one, delete none** (Law 7).
  Cross-lane authorised explicitly by me. Logic changes forbidden. Red #3
  (`verify-no-duplicate-financial-ledger.mjs`) stays off you — it is CC-3's.
  **DEADLINE 12:30 PM CT (17:30 UTC).** Missed -> CC-1. Does not pause R-102-B items 3-6.

- **CC-3** — **Box B first, it unblocks every other seat's `build-typecheck`:** the R-104.4
  ruling — `verify-no-duplicate-financial-ledger.mjs` must exempt any migration already present
  in `_system._schema_migrations` (frozen by construction, can never gain a
  `-- CANONICAL-CHECK:` block without breaking its applied checksum — Law 12), while still
  failing closed on genuinely new, unapplied financial tables. **DEADLINE 11:45 AM CT
  (16:45 UTC).** Box A, R-102-E item 4, the full live `is_sample_data` census:
  **DEADLINE 1:00 PM CT (18:00 UTC).** Both missed -> CURSOR.

---

## 7 — AUTHORITATIVE NUMBER SET: NO RESTATEMENT, NO ADDITION, NO CLOSURE THIS ROUND.

GL `8000` 8 lines / +35,730.00 ties the 8 direct-disbursement legs. Relay 76 / 32,726.45 ties
the control. Faro default interest **85.76** stays a disclosed addition the owner has not seen,
never netted, waiting on the Faro statement — **reversed out of the ledger this hour by the E10
loop, which resolves nothing.** A/R **−5,210.00** is the app subledger and does not reach the
owner's `AR 298,762.00 (83 open)`. **+12,825.00** is the owner's debtor receipts, explained.
`c4392703` (15 lines / 45,200.00) remains not ruled real and not ruled duplicate. The
quarantine/locked-settlement payout (13533 / 13539) remains the owner's decision, Law 15.
$115,806.60 stranded in `1090` stays open, report-only, CC-2. `5185` still does not exist.
`1235` still unposted, Law 10 holds.

## 8 — OWNER DECISIONS OWED — STILL TWO, PLUS THE THIRD STILL FORMING.

1. `accounting.escrow_postings` 61 rows stay as history with an idempotent feed, or an audited
   one-time neutralization. **Lead recommendation: they stay.**
2. The Faro statement for FAC-2026-00064, -00065, -00066, -00067, -00068, -00070, -00071,
   -00083, -00100, -00113. **Lead recommendation: get it before the next 05:30 CT tick**, because
   `6830` accrues every morning whether or not the ledger currently shows it.
3. **Forming, not yet owed:** if agent-written voids must carry an actor, someone must decide
   what that actor IS. CC-1 reports the path in BUILD 5; I bring it with a recommendation, never
   a fait accompli.
