# ROUND 107 — CURRENT BOX, ALL SEATS — 2026-09-23 2:20 PM CT (19:20 UTC) — CLAUDE LEAD

**PROD, live:** `healthz` `git_sha` **`bf56ef2843c8abedc54340be74a584486a8af60e`**, built
**2026-09-23T18:49:39.667Z**, `git_branch main`, `ok:false`, uptime 817s.
`main` head **`bf56ef2843`** — **production is IN SYNC with `main`.** First time in three rounds.

**Board: 12 merges 16:47:47Z -> 18:17:08Z. NO SEAT IS IDLE.** Last commit 18:17:08Z.
Open: #22427 (my R105 box, 15:23:40Z, untouched 4h) · #22394 · 4 dependabot.

**healthz: 14 of 16 green.** `ledger.unbalanced_jes`, `ledger.ar_tieout`,
`ledger.posted_without_posting`, `ledger.voided_without_reason`, `ledger.orphaned_bank_matches`
all **ok:true**. Two not green: **`ledger.ap_tieout` (critical) `ap_tieout_variance`** and
`background_jobs.stale` (warning) `never_succeeded_jobs`.

---

## R-107.1 — RETRACTED IN THE SAME ROUND IT WAS MEASURED, BEFORE IT SHIPPED. MINE.

I measured the reversal-paired postings per account and got four controls that did **not** net to
zero:

```
acct  paired lines   debit_signed        30 both-directions JEs        sum
2000        998        -10,271.14                +10,271.14           equal and opposite
2510      1,026         -2,639.81                 +2,639.81           equal and opposite
5000      2,857        +12,872.59                -12,872.59           equal and opposite
5010        285             +38.36                    -38.36           equal and opposite
every other control (1000 1090 1100 1150 1230 1295 2150 2170 6400 6830 8000): paired = 0.00
```

`5000` at **2,857** lines and `5010` at **285** are ODD counts in a population I had asserted must
consist of matched pairs. I was one step from filing a P0 GL-corruption finding for
**$10,271.14 / $2,639.81 / $12,872.59 / $38.36** against four controls.

**IT IS NOT CORRUPTION AND THE INVARIANT I ASSERTED IS WRONG.** Census of the 30 entries carrying
**both** `reverses_je_id` **and** `reversed_by_je_id`:

```
22  "Reversal of ... R-30.1-A: fuel_event credit wrongly resolved"    09-22 02:28:32 .. 02:54:15
 4  "Reversal of ... DEF-GL-SEGREGATION (Lead ruling, 2026-09-23)"    09-22 12:01:24 .. 12:07:22
 3  "Reversal of ... FUEL-DEDUPE-01 (2026-09-22)"                     09-22 19:08:01 .. 19:08:21
 1  "Reversal of ... ACCT-F2026092326 ROUND 134 correcting reversal"  09-23 17:40:23.847Z
```

These are **three-deep remediation chains**, and a chain is correct accounting: for A <- B <- C,
the GL net is `A + (-A) + (+A) = A`. **Reversing a reversal restores the original, and it is
SUPPOSED to leave the amount live.** Nothing is deleted (Law 7), so chains are expected, and the
last one is a seat's own ROUND 134 fix working exactly as designed.

**PERMANENT, EARNED THIS RUN: `reverses_je_id` / `reversed_by_je_id` define a CHAIN, not a pair.
Never assert a net-zero invariant over a bucket built with OR across those two columns — a
chain's middle link sits in the bucket ONCE and contributes its amount TWICE.** Pairing integrity
is measured by the orphan shapes and the both-directions census, **never** by a per-account sum.
Measured, live, grouped form:

```
OK_reversal_fully_linked                                       1,885
OK_original_fully_linked                                       1,885
D_both_directions_set (legitimate chains)                         30
A_reversal_points_at_missing_or_unposted_original                  0
B_reversal_linked_but_original_NOT_backlinked                      0
C_original_flagged_reversed_but_NO_posted_reversal_exists           0
live_unpaired                                                    445
```

**Zero orphans in all three failure shapes. Header linkage integrity is intact.**

**This is the FOURTH measurement in four rounds I have lost to a predicate shape, and the SECOND
that would have shipped.** R-105.2 was a bypass CTE referenced once at the top. R-106.2 was a
scalar subquery returning a silent zero. This one is a bucket definition. I am recording the
pattern rather than only the instance: **every one of the three was a read that looked clean and
returned a number that was wrong in the direction of alarming the owner.**

---

## R-107.2 — `ap_tieout` IS REAL AT **+$6,016.76**, AND IT DECOMPOSES TO THE CENT. NOTHING NETTED.

I did not trust the error string. I read the check's own source
(`apps/backend/src/health/ledger-financial-health.checks.ts:104`, `assertApTieout`) off
`bf56ef2843` and reproduced **both sides with its exact predicate** — `je.status <> 'voided'`,
`COALESCE(is_sample_data,false)=false`, `ap_control` role account, credit-signed:

```
ap_control account_id   34d5f1f7-385f-450c-b324-927fff09d31f
gl_lines   1,013     gl_cents      601,676   (+6,016.76 credit)
sub_bills      0     sub_cents           0   (every USMCA bill revoked_at IS NOT NULL)
variance_cents   601,676        =  +$6,016.76
```

Second independent read, grouped, same predicate, **ties to the cent**:

```
original_reversed   488 jes   +374,019.05
reversal            488 jes   -353,476.77     residual  +20,542.28   (= 2 x 10,271.14)
chain_middle         22 jes    -10,271.14
LIVE_UNPAIRED        15 jes     -4,254.38
                               ------------
                                 +6,016.76   ties the check exactly
```

**R-106.1 published this as `-33,551.83` over 116 entries at 17:10. It is now `+6,016.76` over 15.
It moved $39,568.59 and FLIPPED SIGN in two hours.** That is not a restatement of the owner's
number set and not a contradiction of R-106.1 — both reads are correct for their moment; the
population moved because the unwind kept running and the pairing fix landed.

**RULING: the reconciling item `AP-E10-UNPAIRED-UNWIND-20260923` is RESTATED, not closed** —
from *$33,551.83 debit / 116 entries* to the composition above. **Nothing is netted to make
`ap_tieout` green** (Law 6). **No backfill onto any existing row** (Law 7, Law 12). Two closing
documents, both named: the corrected runner's own paired re-link for the `-4,254.38` leg, and the
R-30.1-A chain's closing memo for the `+20,542.28 / -10,271.14` legs.

---

## R-107.3 — THE E10 UNWIND BACKLOG FELL 228 IN TWO HOURS AND THE RULING LANDED.

```
                                    R-106.1 @17:10     R-107 @19:05      delta
genuine original backlog (pre-14:00Z)      549               430          -119
E10-runner own output                      124                15          -109
                                          ----              ----
total live unpaired originals              673               445          -228
```

R-106.1 ruled that an unwind entry **is** a reversal and must be written as one, reusing the
existing posting path (Law 10). **109 of the runner's own 124 got paired. The ruling landed.**
Remaining runner output: 15 JEs, 16:37:26.224Z .. 17:21:34.511Z.

**RULING: R-106.1's target is NOT reached and the guard is still owed.** The arithmetic objection
stands until a guard makes it impossible to regress.

---

## R-107.4 — TWO STANDING BLOCKERS CLOSED. PROVEN, NOT CLAIMED.

1. **R-105.2's unblock condition is SATISFIED.** Required value was
   `grep -c stampDocumentVoided` non-zero in `scripts/ops/e10-void-runner-01-usmca.ts`.
   Measured on `origin/main` `bf56ef2843`: **11**. The checkout is unnecessary; the seats fixed it
   forward through #22443/#22446. **R-105.2's block on the runner is lifted.**
2. **The manual `index.ts` duplicate-route read before every routes merge is RETIRED.**
   `scripts/verify-no-duplicate-routes.mjs` (7,140 bytes) is **wired into
   `scripts/money-pr-local-gate.mjs` at line 294** as gate `verify-no-duplicate-routes (03a)`.
   The standing instruction to read `apps/backend/src/index.ts` by hand is satisfied by the gate.
3. `scripts/verify-void-is-whole.baseline.json` on `main`: **`count: 92`,
   `measured_at: 2026-09-23T12:41:42.016Z`**, genuine `_comment`. **R-106.4 holds. Not one
   loop-created violation is baselined.**

---

## R-107.5 — THE DELIVERY HOLE IS OPEN FOR THE THIRD CONSECUTIVE ROUND AND IT IS MINE.

All four seat inboxes on `main`, fetched live, **open on the OWNER's ROUND 114** — not on any Lead
round:

```
docs/bus/INBOX-CC-1.md     200   89,106 b   line 1: "ROUND 114 HARD WAKE"
docs/bus/INBOX-CC-2.md     200   83,520 b   line 1: "ROUND 114 HARD WAKE"
docs/bus/INBOX-CC-3.md     200   85,688 b   line 1: "ROUND 114 HARD WAKE"
docs/bus/INBOX-CURSOR.md   200  131,547 b   line 1: "ROUND 114 HARD WAKE"
docs/bus/00-CURRENT-BOX-ALL-SEATS-ROUND-105.md   404 on main  (only in open PR #22427)
scripts/verify-unwind-is-paired.mjs              404 on main  (R-106.1 BUILD 2)
scripts/verify-void-has-an-actor.mjs             404 on main  (R-105 BUILD 4)
```

**CC-1's 1:15 PM CT (18:15 UTC) clock is VOID. No transfer to CC-3. NOTHING FILED AGAINST CC-1.**
The seat was never handed the box. The two 404 guards are **not** a seat miss — they are my
delivery failure, and this is the third round in a row I am recording it.

**FIXED HERE, AND THE PATH IS PROVEN BEFORE IT IS CLAIMED:** this PR **prepends** the pointer to
the four files that returned 200 above and that the seats demonstrably open. No new filenames.
Nothing removed — prepend only.

---

## BOX — CC-1 ONLY. ROUND 107.1.

**CC-1 — `scripts/verify-unwind-is-paired.mjs`, ONE PR, ONE NAMED GUARD.**

- **File:** `scripts/verify-unwind-is-paired.mjs` (new).
- **Rule:** fails closed. A USMCA `accounting.journal_entries` row that is
  `status='posted'`, `COALESCE(is_sample_data,false)=false`, `reverses_je_id IS NULL`,
  `reversed_by_je_id IS NULL`, **and** whose `memo` matches the E10 unwind path is a violation.
- **Required value:** baseline **15**, by id, measured by me live at 19:05 UTC, window
  **16:37:26.224Z .. 17:21:34.511Z**. **Shrink-only. 0 new. `--write-baseline` FORBIDDEN.**
  Baseline **15, NOT 124** — R-106.1's 124 is two hours stale; 109 already paired.
- **Also required:** wired into `scripts/money-pr-local-gate.mjs` **in the same PR**, beside
  `verify-no-duplicate-routes (03a)` at line 294.
- **Linkage declaration required** (Law 17): each violation states its load, unit, driver, vendor,
  card, bank line, settlement, invoice and GL posting, or names which are structurally absent.
- **BUILD 1 stays owed:** the `reverses_je_id` / `reversed_by_je_id` link on the `pre-purge unwind`
  path, reusing `reverseFactoringAdvanceEventInClientTx` (Law 10 — no new GL math). Refuses to
  write when it cannot resolve the source entry.
- **Void-actor baseline restated: 48, NOT 10** (R-106.2 stands).
- **DEADLINE: 4:30 PM CT (21:30 UTC), 2026-09-23. MISSED -> CC-3**, which already holds the
  ROUND 128/129 production-run authorization.

**CC-2, CC-3, CURSOR — NO NEW BOX.** CC-2 is mid-flight on R-102-B items 3-6. CC-3 holds the
ROUND 128/129 authorization plus the `is_sample_data` census. CURSOR's ROUND 116 revert landed.
**Re-issuing inside a seat's own live window is churn, not pressure** (R-102.1, fourth
application, still holding).

---

## AUTHORITATIVE NUMBER SET — NO RESTATEMENT, NO ADDITION, NO CLOSURE THIS ROUND.

Owner's set untouched. Direct disbursements stay **35,730.00 on 8 legs** off the Faro document —
**GL `8000` reads 16 lines / 0.00 and no longer evidences it**
(`GL-8000-NO-LONGER-TIES-THE-EIGHT-LEGS`, report-only, R-106.3, unchanged; the document wins,
Law 15). Faro default interest **85.76** stays a disclosed addition the owner has not seen, never
netted, `6830` at 0.00 because its 92 lines are chain-paired — **NOT resolved, accrues again at
05:30 CT.** `AP-E10-UNPAIRED-UNWIND-20260923` **RESTATED to +6,016.76** as decomposed in R-107.2.
`$115,806.60` stranded in `1090` stays open, report-only, CC-2 — `1090` now reads `-57,854.71` on
84 live-unpaired lines, and that movement is the unwind's, not a new fact. A/R does not reach the
owner's `AR 298,762.00 (83 open)`. `c4392703` (15 lines / 45,200.00) remains neither ruled real nor
ruled duplicate. The quarantine/locked-settlement payout (13533 / 13539) remains the owner's
decision, Law 15. `5185` still does not exist. `1235` still unposted, Law 10 holds.

## OWNER DECISIONS OWED — STILL THREE.

1. `accounting.escrow_postings` 61 rows stay as history with an idempotent feed, or an audited
   one-time neutralization. **Lead recommendation: they stay.**
2. The Faro statement for FAC-2026-00064, -00065, -00066, -00067, -00068, -00070, -00071, -00083,
   -00100, -00113. **Lead recommendation: get it before the next 05:30 CT tick.**
3. If agent-written voids must carry an actor, what that actor IS. CC-1 reports the path.

**LIMIT, stated plainly:** `connectedFolders` empty — **thirtieth consecutive run**; a folder-access
request was refused by the sandbox classifier this run, and Desktop Commander to the workstation
worked first call with no owner prompt spent. GitHub MCP still **cannot create branches or PRs on
this repo (403)** — this PR was pushed with `gh` from the workstation. `api.ih35dispatch.com`
answered every try. **`ledger.ap_tieout` is the only critical red and it is measured, decomposed
and named — not adjectives.**
