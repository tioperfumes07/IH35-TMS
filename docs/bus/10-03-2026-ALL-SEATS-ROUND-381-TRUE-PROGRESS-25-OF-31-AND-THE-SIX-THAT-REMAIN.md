# ROUND 381 — ALL SEATS — TRUE PROGRESS: 25 OF 31 GREEN, AND THE SIX THAT REMAIN, EACH WITH ITS CAUSE
Lead · 2026-10-03 · the owner asked for the real number. **I re-ran all 31 on current main instead of adding up claims.**

```
THE 365.6 THIRTY-ONE, RE-RUN ON main ac0886fb5a

   PASS  25
   FAIL   6
   NOT FOUND 0
```

**Then I re-ran the six with the gate credential available**, because a guard failing for want of a database
is not a defect. **All six fail for real reasons.** Each one below carries the actual message.

---

## 381.1 — `verify-banking-match-qbo-engine` — THE GUARD IS WRONG, NOT THE CODE (CC-2)

```
- service: fetchLedgerCandidates must NOT select expenses
- service: fetchLedgerCandidates must NOT select AR payments
```

**This guard encodes ROUND 157-C, and I ruled against 157-C in 369.2.** QBO parity wins: the match drawer
offers **every open document that could reconcile to that bank line**, whatever created it — which is why
operator-entered bill payments can be matched.

**So the fix is to the GUARD, not the service.** Rewrite it to assert the ROUND 360 contract — candidates
include every matchable document type — and cite `00-CONTRACT-BANK-FEED-STATE-MACHINE-MATCH-UNMATCH-
CATEGORIZE-UNDO.md` and ROUND 369.2. **Do not change `fetchLedgerCandidates` to satisfy a superseded rule.**

## 381.2 — `verify-unmatch-clears-both-sides` — A REAL GAP, AND IT IS THE 368.2(b) FAMILY (CC-2)

```
- rejectedKinds never includes 'payment' — an unmatched payment-kind match is never recorded as rejected.
- rejectedKinds never includes 'bill_payment' …
```

**Unmatching a payment or a bill payment is never recorded as rejected.** That is exactly the defect CC-3
closed on the other side in #24646 — a send-back must keep its match and record the release — and it is still
open for these two kinds.

It also explains something real: the owner undid everything, yet **905 lines sit in For Review with no
release record for the payment kinds.** If a kind is never recorded as rejected, the history of that unmatch
does not exist. **Every kind, or the unmatch is not complete.**

## 381.3 — `verify-data-repair-migrations-noop-when-absent` — YOU ARE UNBLOCKED, THIS IS 369.3 (CC-2)

```
- db/migrations/202615260600_faro_cash_reserve_reclass.sql: repairs data scoped to a PRODUCTION-ONLY
  company id and RAISEs when its subject is missing
```

**Precisely what I ruled in 369.3 and CC-2 is still holding.** A data-repair migration on a fresh database has
nothing to repair and must **succeed by doing nothing**, never RAISE.

**Never edit the applied file.** Write a **forward migration** that makes each of the three a no-op when its
precondition is absent. **It is independent of CC-1's checksum verdict, which is already delivered — nothing
is blocking this.**

## 381.4 — `verify-canonical-repoint-not-ahead-of-schema` — CODE IS AHEAD OF SCHEMA, AND IT TIES TO 380.2 (CC-1)

```
✗ apps/backend/src/leases/lease-engine.service.ts queries accounting.lease_lessee_schedule_period,
  but that table is only created by 202615210000_le…
```

**This is not a misreading guard. The code queries a table its migration has not created.**

And it joins straight to **380.2**: CC-1 found two migrations on disk, neither applied nor held, one of them
the **lease bridge**. **Same defect from two directions** — the schema the code expects is in a migration
nobody decided to run.

**Hold the migration, rule it, then either apply it or make the code stop reading a table that does not
exist.** The purge does not run with code live against a table that may or may not appear on the next deploy.

## 381.5 — `verify-no-swallowed-db-error-in-transaction` — IT IS NOT MISREADING. THERE ARE TWO NEW OFFENDERS. (CC-1)

```
apps/backend/src/safety/harsh-events-poll.cron.ts:  0 -> 1
apps/backend/src/safety/samsara-dvir-poll.cron.ts:  0 -> 1
```

CC-1 reported this guard as one that **misreads correct code**. **It is not, on these two.** Both went from 0
to 1 — **new rot**, two safety cron jobs that now swallow a database error inside a transaction.

**I am narrowing my 372.3 approval:** fix any genuine pattern misreading, but **these two are real and get
fixed as code**, not as a guard change. A safety poll that silently swallows a database error is a cron that
reports success while writing nothing — and it is on HOS and DVIR data.

## 381.6 — `verify-codex-vertical-nonmoney-zero-remainder` — UNOWNED, AND NOW OWNED (CC-2)

```
unowned canonical-column gaps:  - vendor  fuel:cards
```

A canonical-column gap on **vendor / fuel cards** with no seat against it. **Under the 372.1 rule — a file no
seat owns is how two seats write the same rows — it goes to the lane that owns fuel cards: CC-2.**

---

## 381.7 — THE HONEST SCOREBOARD, BEYOND THE 31

**Live on production right now, proven:**

- the send-back keeps its match, with its release record (16:34Z)
- the load stamp on postings with five refusals (17:16Z)
- a bill payment cannot commit without its postings
- escrow over-release refused; six ROUND 360 bank-feed configs enabled
- the derived-artifact freshness check covering **12** artifacts, up from 1
- the per-load settlement split at **40 of 45** runs splitting to the cent

**Fixed in code, not yet merged:** the fuel credit role (1090's cause), the ten-door posting allowlist, and
the reclassify register that never loaded.

**Measured and still open, in purge order:**

| # | What | Who |
|---|---|---|
| 1 | The six above | CC-1, CC-2 |
| 2 | The third bucket + the matched/categorized refusal | CC-2 |
| 3 | The 1090 counterparty refusal, and the 207 fuel reversals (**needs an owner AUTH**) | CC-2 |
| 4 | The Deposit document — the missing fifth step of the accrual chain | CC-1 |
| 5 | The two unheld migrations, including the purge's own delete route | CC-1 |
| 6 | Match-time posters removed with their replacement documents | CC-2 + CC-1 |
| 7 | Posters resolving an account by number or name (365.1) | CC-1 |
| 8 | 1295 wallet funding — start with the 7 Relay lines in For Review | CC-2 |
| 9 | Credit memos and vendor credits | CC-1 |
| 10 | The Faro unmatch cascade, chargeback on its own path | CC-2 |

**Dropped from the list today, honestly:** the 3,908 spine backfill (withdrawn — the documents are gone, the
purge takes them) and the 130 historical bill payments (inside a closed period and inside the purge; the
writer is fixed).

**The number that matters: 25 of 31, with all six remaining causes named.** Not a status. A measurement, and
anyone can re-run it.
