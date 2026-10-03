# ROUND 363 — CC-3 — LOAD LINEAGE, THE SEND-BACK THAT LOSES THE LOAD, AND THE DERIVED-ARTIFACT REGISTRY
Lead · 2026-10-03 15:13Z · read `10-03-2026-ALL-SEATS-ROUND-363-LAW-THE-RECLASSIFY-ENGINE-AND-THE-POSTING-STAMP.md` first

Your ROUND 361 measurement and its section D are accepted as measured and are now law. Your numbers are the
argument for this whole round. Lane cross granted at the bottom.

---

## 363-CC3-A — LANE CROSS GRANTED: `load_id` ON THE POSTING

`accounting.journal_entry_postings` is CC-1's table. **You have the cross** — cite
`00-LEAD-RULING-2026-10-03-LANE-CROSS-ACCT-F9855-AND-POSTING-LOAD-ID.md`.

CC-1 owns the column and the posters (363-CC1-A) and has it by **2026-10-04 06:00Z**. If that slips, you take
both under this ruling — the column and the posters together, never one without the other. A column nothing
writes is worse than no column.

**Yours either way:** the database refusals, the provable backfill, the guard and the finish test.

- Backfill **only** the 1,960 rows with proof from the deleted documents' audit records (1,912 expense, 48
  invoice). All 978 deleted documents trace to loads that still exist — you proved it.
- The **114 unprovable rows stay NULL** and stay listed: 18 expense lines, and all 96 fuel lines whose deletes
  left no audit record. **Do not infer a load onto a money line.** A NULL you can explain is worth more than a
  value you guessed.
- The 22 paid driver bills with a NULL load: bill number matches exactly one load number **and** the bill's
  driver is that load's driver, confirmed both ways against `driver_finance.driver_bills`. That is two
  independent keys agreeing, so it is provable — backfill them and state both keys in the PR.
- Not provable, so reported and left alone: the 5 invoices never sent, the 3 unpaid bills with no driver or
  number, the 1 expense, the 3 lines on settlement `ae0db193`, the **122** reversal lines with no traceable
  origin and the **58** fuel-posting reversals whose fuel row is deleted.

**Guard:** `verify-every-load-born-document-and-posting-traces-to-its-load.mjs` — live, with the unprovable
count pinned so it can only shrink.

## 363-CC3-B — THE SEND-BACK KEEPS THE MATCH. IT DOES NOT OVERWRITE IT. (LAW 363.9)

Your section D is the defect. Measured on production:

| Measured | Value |
|---|---|
| Bank lines sent Matched -> For Review, Sep 3 – Oct 3 | **248** |
| Live matches or categorizations carrying a journal entry today | **167** — each one exposed the next time it is sent back |
| Ledger reversal lines that trace back to a bank match | **0 of 3,085** |

Today an unmatch, or a void that releases the match, **overwrites** the bank line: every `matched_*` field goes
to NULL including `matched_load_id` and `categorization_load_id`, the "rejected" record overwrites the accepted
one in place and skips load and settlement matches entirely, and the load survives only in an audit snapshot.
That is the same defect as deleting a document to fix a wrong load (LAW 363.1).

Build, with **no new table**:

- A send-back **keeps the accepted match and records the release beside it.** Nothing is overwritten. The line
  returns to For Review and the history of what it was matched to remains readable.
- The reversal journal entry **carries the original's load** and **names the bank line as its source**.
- The finish test gains one more walk: from the reversal line, to the original match, to the load, and back.
- `review_bucket` (where it sits — three values) and `resolution_kind` (how it got there) stay distinct. A
  status with two sources is not measured by one column.
- **STATUS-SET-WITHOUT-ITS-GATE:** no `matched_*` or bucket column is written directly. Every transition goes
  through its governing service.

**PR:** one. **Guard:** `verify-send-back-preserves-the-match-and-its-load.mjs` — live, and it must show
0 bank lines in any `matched_*` state with nothing matched.

## 363-CC3-C — THE DERIVED-ARTIFACT REGISTRY HAS ONE ENTRY AND THE REPO HAS TEN GENERATORS

The owner asked how we would know if anything else is stale. Today we cannot. Measured just now:

```
verify-derived-artifact-freshness: live=6efc968 checked=1 fresh=1 stale=0
```

`checked=1`. The registry at `docs/specs/DERIVED-ARTIFACTS.json` holds **one** artifact. The repo holds **ten**
generator scripts — `gen-block-created-dates`, `gen-canonical-relations`, `gen-class-scoreboard`,
`gen-financial-buildability`, `gen-program-phase-manifest`, `gen-program-scoreboard`, `gen-usmca-battery-doc`,
`generate-batch-8-ledger-backfill`, `generate-gate-step-map`, `generate-module-completion-data`. At least nine
generated artifacts are unwatched and can be arbitrarily stale right now with nothing to notice.

This is also why you had to commit twice: `docs/audit/program-scoreboard.json` and
`apps/frontend/src/pages/program/programScoreboard.data.ts` are **one artifact in two files**, and the registry
treats them as one file, so regenerating one silently leaves the other behind. I hit the identical thing on my
own branch an hour later.

- Every generator **declares its artifact** in the registry: the path or paths, the command that regenerates
  it, and its drift limit.
- **Pairs are declared as pairs.** Regenerating one member without the other is a failure, not a warning.
- The guard fails on any **registered** artifact past its limit. **Required value:** `checked` equals the
  number of generated artifacts in the repo. `checked=1` is the bug.
- And say plainly in the PR what "stale" means, because it has already confused a seat and the owner: a stale
  derived artifact means a **generated file was not regenerated after main moved**. It does **not** mean a PR
  was built wrong or never merged. Nothing was lost.

**PR:** one. **Guard:** the existing `verify-derived-artifact-freshness`, with the registry filled.

## 363-CC3-D — ALSO YOURS FROM THE GATE RE-MEASURE (LAW 363.7)

`verify-no-phantom-load-assignments` · `verify-new-units-have-gps-or-deactivation-reason` ·
`verify-no-new-deleted-at-columns` · `verify-ops-scripts-assert-not-production` ·
`verify-integrity-findings-attribution-rate`

`verify-ops-scripts-assert-not-production` matters most before the purge: an ops script that cannot tell it is
pointed at production is how a purge runs in the wrong place.

---

## THE POOLER FINDING IS LAW NOW — THANK YOU, AND IT APPLIES TO EVERYONE

Your measurement stands and is in the ALL SEATS doc: **10 of 10 pooled connections read as `ih35_app`, 5 of 5
direct read as `neondb_owner`.** A `0` from a pooled connection is **MASKED, not empty** — pgbouncer carries
`SET ROLE ih35_app` across borrowers. `load_charge_lines` 0 -> **284** (136 with no company),
`load_id_reservations` 0 -> **4,057**. Every guard reads the DIRECT endpoint. Your
`verify-guards-do-not-run-as-ih35-app` guard is correct and stays.

**Deadline:** 363-CC3-B by **2026-10-04 06:00Z** — it is purge-exposed. A by **2026-10-04 18:00Z** or
immediately after CC-1 lands the column. C and D by **2026-10-05 06:00Z**.

**Linkage declaration required in every PR.** **NOBODY SEEDS ANY DATA ANYWHERE.**
