# LEAD — ROUND 394 · ALL SEATS · TEN RULINGS, THREE UNBLOCKS

**2026-10-04, Laredo Central** · **Entity: USMCA only** · Production `br-fancy-credit-akjnd07a`.
Every number below was measured by me this hour, RLS-bypassed, not relayed.

---

## 1. CC-1 — YOUR r389 BLOCKER IS ALREADY FIXED ON MAIN. STOP WORKING IT.

You reported posting `4086069b…` as bad production data needing a reversal and asked me for an AUTH
number. **There is no AUTH number, because there is nothing for you to correct.** Measured:

```
posting_id   4086069b-fff6-47e6-a2f9-1f3f1d867a00
description  "Reclass 99cbc6a7 (account/load) · Fuel-Reefer Diesel"
created_at   2026-10-04T02:50:30.541Z
posting_load 34fa267e-9c11-4e9f-89e3-e2aa48d0b80e
expense_load 2bbc2cf0-fc08-42ed-bb54-ea95ae7e8c35
```

That is a **reclassify-engine** line, not a purge artifact. CC-3 reported this same hour:

> *verify-every-load-born-posting-carries-its-load: the reclass lines didn't name their source line,
> so a load move got stamped with the wrong load. CC-2 fixed the reclassify engine itself, and the
> guard now handles the one existing prod line, which can't be changed.*

**That one existing prod line is yours.** CC-2 merged the fix as **#25136 (`7e1105eef6`)**. Rebase
onto current `origin/main` and the guard passes. Do not reverse it, do not correct it, do not wait
on me.

## 2. CC-1 — STOP PUSHING r389 AND R2 SEPARATELY. CC-3 HAS THE BATCH.

Your r389 commits are **inside** `claude/r393-batch-five` (17 commits, 201 files, cut from tip main).
CC-3 is running the gate on it now with their own gate credential. Two seats pushing the same commits
is how we burn 12-minute cycles.

**Your sequence:**
1. **Stop** pushing r389. It is CC-3's.
2. **R2** (driver account numbers `1245-00-nnn`) rebases **on top of the batch after it lands** —
   not before. Your fork results are accepted: 28 accounts renamed in place, LUIS ARMANDO SOSA PEREZ
   now `1245-00-001` matching his escrow `2100-00-001`, a new hire gets one number for both, a first
   advance creates the account instead of refusing, ANGEL's second record links to `1245-00-024`.
   That is exactly the ruling. Good work.
3. Then **R1** (negative settlement → `Dr 1257`), then your 39 guard verdicts.

## 3. THE FUEL-DUPLICATE GATE BLOCK — MY EARLIER RULING WAS WRONG. CORRECTED.

I told you to "name a failing check in the PR body and let it fail." **You are right that this is not
possible** — the pre-push hook refuses the push, there is no sanctioned skip, and the gate's only env
switches are the database URLs. I was describing a mechanism that does not exist. My error.

**Corrected ruling: fix the DATA, not the gate.** Nobody adds a skip, nobody edits the gate script.

The duplicates are same-day, same-amount import artifacts:
- receipt `1848853` — twice, both **08-26**, **$585.36** each
- receipt `99794138` — twice, both **08-31**, **$1,005.59** each
- plus a fourth group nobody reported: **`ustFluid` × 4** — a broken import field, not four fills

**Assigned to CC-3 (fuel lane), P0, above everything else in that lane**, because it blocks every
seat whose change touches accounting. Void one of each same-day pair through the **void engine** —
never a hand-written delete. The `ustFluid` group is an import defect: fix the importer so the
reference field can never be a literal again, then correct the four rows.

## 4. RECEIPT 99530579 — THE OWNER ALREADY ANSWERED. SECOND LOAD.

CC-2 asked which date and load the real receipt shows for `99530579` ($510.61, booked twice six days
apart on loads **13533** and **13548**).

The owner answered this already, in his own words: **"I TOLD IT TO ASSIGN THE RECEIPT FOR THE SECOND
LOAD."** Second of the two is **13548**, the later one. Assign it there, drop the 13533 booking
through the void engine.

This one is **not** a duplicate-import artifact — six days apart is two real events, one of which was
mis-attributed. Treat it differently from §3.

## 5. CC-1 — R3 (THE $2,976.63 A/P REVERSAL): DO NOT POST IT.

Your rehearsal is accepted and it is clean: 60 reversals dated 2026-10-03, A/P from **$3,542.98 →
$566.35**, no leftover unreversed lines, fork rolled back with nothing persisted. That is exactly
what I asked for.

**And it does not get posted.** The owner authorized the investigation to find the cause, not to fix
the balance — *"unless the reversal will help reveal what caused the issue and you can fix the engine
that caused it."* It did, and I have:

**The void engine reverses lines that are themselves reversals.** 60 of 60, proven:

| step | description | D/C | effect on A/P |
|---|---|---|---|
| 1 | `Expense EXP-2026-00054 AP` | credit | + owed |
| 2 | `REVERSAL: Expense EXP-2026-00054 AP` | debit | − owed → nets to 0 ✓ |
| 3 | `Void reversal: REVERSAL: Expense EXP-2026-00054 AP` | **credit** | **+ owed again — phantom** |

`target_was_ITSELF_a_reversal = 60`, `target_row_gone = 0`. The originals all still exist, so my
earlier "the source expenses no longer exist" was wrong — corrected.

**Keep R3 committed and unmerged.** The purge deletes the balance. **ROUND 390.1 — the engine fix —
is what matters**, and it is now your highest-value item after the batch lands: a reversal line is
terminal, refuse by name with `posting_line_is_already_a_reversal`, and find out why the
document-level idempotency did not stop these 60 on 09-30.

## 6. CC-2 — `verify-bank-feed-gl-posting` IS A FALSE POSITIVE. FIX THE MATCHER.

Accepted: the feed already posts through the engine and the check's text match did not recognize the
call shape it uses. That removes it from your money-path queue — **but the guard does not stay
broken.**

Fix the matcher so it recognizes the real call, and **add the exact call shape it missed as a
selftest case**, so the next refactor that changes the call shape fails loudly instead of silently
passing. Do not allowlist, do not baseline. A guard that cannot see the thing it polices is the same
class as a guard nothing runs.

## 7. CC-2 — YOUR 3,938 BREAKDOWN IS ACCEPTED, AND THE BACKFILL IS CANCELLED.

Accepted: 3,908 orphans from the Sept 30 purge + 30 July rows outside USMCA, not growing. My own
re-measurement drifted (11,518 → 11,542 postings while I was counting) because other seats are
writing; your breakdown is the better account of it.

**They stay OPEN and the backfill is cancelled** — the purge deletes them. r391 fixed the *writer* so
the recreate carries links from birth, which was the half that mattered. Do not build a backfill.

Also noted and accepted: your four database copies are deleted. Good discipline.

## 8. SECURITY — CC-1 IS RIGHT, AND IT IS WORSE THAN REPORTED. **OWNER ACTION REQUIRED.**

CC-1 flagged `ih35_ci_readonly` as not read-only. I verified it myself. The mechanism is not table
grants — those are empty. It is this:

```
rolname                rolbypassrls  rolcreatedb  rolcreaterole
ih35_ci_readonly           true         true          true
ih35_ci_readonly_v2        true         true          true

pg_db_role_setting for both: EMPTY  -> no default_transaction_read_only
```

**`rolcreaterole = true` on a credential named "readonly" is privilege escalation.** It can create a
role and grant that role anything. `rolcreatedb = true` lets it create databases. And with no
`default_transaction_read_only`, every session it opens is read-write.

I tried to close it and could not: **`ALTER ROLE` → "permission denied to alter role"** as
`neondb_owner`. These roles are owned above that level, so this needs the Neon console or a
superuser session. **Owner: this is yours, and it is the most serious finding on the board.**

Exact statements, and nothing more than these:

```sql
ALTER ROLE ih35_ci_readonly    NOCREATEDB NOCREATEROLE;
ALTER ROLE ih35_ci_readonly_v2 NOCREATEDB NOCREATEROLE;
ALTER ROLE ih35_ci_readonly    SET default_transaction_read_only = on;
ALTER ROLE ih35_ci_readonly_v2 SET default_transaction_read_only = on;
```

**Keep `BYPASSRLS`.** A read-only audit credential legitimately needs to see every row — that is why
the guards use it, and removing it would blind them. The defect is write capability and escalation,
not visibility.

Sequence it **after the batch lands**, so the read-only default cannot break a rehearsal mid-flight.

**Guard, CC-1, after the console change:** a guard that reads `pg_roles` and FAILS if any role whose
name contains `readonly` has `rolcreaterole`, `rolcreatedb`, `rolsuper`, or no
`default_transaction_read_only`. Measured, not asserted. That is how this never comes back.

## 9. THE TEST OWNER'S USMCA ACCESS GRANT — REMOVE IT.

`bed20058…`. Yes, remove it. A test account holding a company-access row on production is the same
class as the E2E fixtures I deleted today. CC-1 owns it, go ahead, no further authorization needed —
paste the before/after row count.

## 10. CC-3 — THE RELAY / DREAMLINE ISSUER PICKS ON `/fuel/cards`

I am not guessing a business fact and I am not sending it back to the owner. **Measure it instead.**

The issuer vendor on a fuel card type is whoever **actually invoices us for that card's fuel**. That
is a measurable fact, not a preference: join the fuel transactions on each card type to the expenses
and bills they produced, and read the vendor those were paid to in banking. Whichever vendor the
money actually went to is the issuer.

If a card type has **zero** paid fuel on it, leave `issuer_vendor_id` NULL and surface it as
unmapped — do not guess, and do not default it to the more common provider. An unmapped issuer that
says so is honest; a guessed one is a silent wrong number on an IFTA and fuel-credit path.

## 11. CC-3 — CLOSED, AND CREDITED

`verify-master-data-protected` green again on main (#25135, `890797420f`), floors at **1,215
customers / 616 vendors**. It had blocked every seat's gate since the purge.

For the record, since you and CC-1 both correctly refused to lower a floor without an authorization:
**every row those floors moved for was my purge today**, under the owner's explicit authorization —
the 3 E2E Customer rows and their load at 02:37Z, the CC3 QA-Fixture vendor at 02:38Z, Juan
USMCA-Battery and ZZTEST AUTOACCT PROBE at 02:44Z. You were right to tie each batch to an
authorization before touching the floor. That is the discipline working.

Two test drivers remain in prod and **cannot** be deleted: `TEST DriverTESTMTDP79YF` and
`CODEX ACTIVE FLEET TEST 20260821`. Their DVIR, harsh-event, vehicle-assignment and leave-audit rows
live in **append-only WORM tables** (44 of them). That outcome is correct — those are DOT/FMCSA
records and audit trails. Nobody bypasses a WORM trigger. Do not re-attempt them.

---

## STANDING ORDER OF WORK

| # | Who | Item | Due (UTC) |
|---|---|---|---|
| 1 | **CC-3** | push `claude/r393-batch-five`, merge on green | **10-04 23:00** |
| 2 | **CC-3** | fuel duplicates `1848853` / `99794138` / `ustFluid`×4 — P0, unblocks every seat | **10-05 20:00** |
| 3 | **CC-1** | ROUND 390.1 void-engine fix + the zero-tolerance chain guard | **10-05 20:00** |
| 4 | **CC-1** | R2 rebased on the landed batch | **10-05 20:00** |
| 5 | **CC-1** | ROUND 390 purge engine, dry-run mode first | **10-05 20:00** |
| 6 | all seats | first wiring batch of your passing guards | **10-05 20:00** |
| 7 | **CC-2** | `verify-bank-feed-gl-posting` matcher + selftest case | **10-06 20:00** |
| 8 | all seats | failing-guard verdicts, one line each | **10-06 20:00** |
| 9 | **CC-1** | R1 negative settlement → `Dr 1257` | **10-06 20:00** |
| — | **OWNER** | the four `ALTER ROLE` statements in §8 | after the batch lands |

Never report done without the live row, the live query, or the green CI run pasted.
