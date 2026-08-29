# IH35-TMS — SUBSCRIPTION-GRADE DEFINITION OF DONE
### Owner standard, 2026-08-29. This supersedes "the feature works" as the acceptance test.

## The bar, in the owner's words

> *"It is as if we had a subscription with QuickBooks or McLeod. That is complete and done. I know I
> can trust the software to register and link correctly where it should record and register. Like an
> invoice — I know my A/R, my statements, my GL, my chart of accounts, my account register, and
> everything possibly related is working correctly and honest and reliable."*

**The test is not "did it work when someone checked."** The test is: **the owner never checks.**

In QuickBooks you enter an invoice and you do not then open A/R to see whether it moved. You do not
open the GL to confirm it posted. You do not reconcile the statement against the register to see
whether they agree. Verification is not fast — it is *absent*, because it was never in doubt.

A feature that requires the owner to go verify it is **not done**, no matter how well it works.

---

## What DONE means for one action — EVERY domain, not just accounting

**Owner, 2026-08-29: "And this is for every aspect of the app."** The invoice below is the worked
example, not the scope. Every domain has its own "every derived place," and the rule is identical:
one action reaches all of them, correctly, and stays correct.

### The worked example — an invoice

| Surface | Must be true |
|---|---|
| A/R subledger | balance moved by exactly the invoice amount |
| GL | `DR 1100 A/R / CR 4000 Freight` — the designed codes, DR = CR |
| Trial balance | still balances |
| Chart of accounts | accounts used exist, are active, correct type |
| Account register | entry appears, right period, right sign |
| Customer statement | reflects it |
| A/R aging | right bucket, ages correctly over time |
| P&L | revenue in the correct period per ASC 606 |
| Cash forecast | expected receipt appears |
| Audit trail | who, when, from what document |
| Void / reversal | symmetric — reverses every row above, leaves a trail, never a silent delete |
| Period close | survives close and reopen without drift |
| Entity isolation | appears in that operating company only |
| Cross-report consistency | every report touching it agrees with every other |

### The same standard, per domain — each action names its own derived set

| Domain | One action | Must correctly reach |
|---|---|---|
| **Dispatch** | book a load | load record · driver + unit + trailer assignment · rate card vs customer rate · deadhead/miles · driver bill · revenue latch (Event 1) · invoice gate (Event 2) · customer statement · dispatch board · ELD/HOS eligibility · insurance coverage gate |
| **Safety** | log an accident | accident report · driver + unit + **trailer (`mdata.equipment`)** + load · fault/responsibility · insurance claim · DOT reportability · civil fine → JE · accident cost lines · driver liability (`origin='safety_accident'`) · CSA/FMCSA record · work order |
| **Maintenance** | open a work order | WO · unit + trailer · parts issued → inventory · labor · vendor bill → A/P → GL · warranty claim → reimbursement posting · PM schedule reset · downtime · unit OOS state affecting dispatch |
| **Driver / payroll** | run a settlement | pay lines · deductions · advances recovered · escrow · driver liabilities · settlement JE · net pay · 1099/W-2 basis · driver statement · bank payment |
| **Escrow** | driver resigns or abandons | escrow balance · forfeit posting → JE · outstanding liabilities netted · final settlement · refund or forfeit per contract · audit trail |
| **Insurance** | file a claim | claim · accident + unit + trailer + policy · deductible → bill → A/P → GL · recovery posting when paid · loss run · premium impact |
| **Legal** | open a matter | matter · related accident/claim · attorney invoices → A/P → GL · accrual/reserve · document retention · statute dates |
| **Fuel** | post a fuel transaction | fuel event · unit + driver + trailer · IFTA miles/gallons by jurisdiction · card overage → driver deduction · vendor bill → GL · MPG/efficiency |
| **Compliance** | record a DOT violation | violation · driver + unit · CSA points · fine → JE · corrective action · insurance/legal exposure · renewal or filing dates |
| **Banking** | categorize a transaction | bank txn · match to bill/invoice/transfer · JE · reconciliation status · register · cash forecast |

**One action, every derived place, correct and durable.** That is the unit of DONE — in every domain.
Not the screen. Not the endpoint. Not the checklist row.

## The five failures this standard exists to prevent

All five happened on 2026-08-29, all passed their own acceptance test, all failed the owner's:

| Asked for | Delivered | Why it failed the bar |
|---|---|---|
| C25-C31 columns | declared in `columns.shared.json` | nothing drew them |
| Transaction Health screen | backend contract shipped | UI was a table, not the design |
| `prod_verified` greens | 289 marked verified | 275 bound to no deploy — unfalsifiable |
| V1-V6 verifier columns | rendered, 48/48 | data frozen at a stale SHA |
| DOT-fields guard | assertion exists | matched source text, went stale, red on clean main |

**One root cause: the acceptance test was "does the artifact exist," never "does it work end to end
and stay true."**

---

## THE TWO QUESTIONS — every block answers both, in writing, before it is DONE

### 1. WHAT PROVES THIS WORKS?
Not "the code is written." Not "CI is green." Not "the page renders."
A named, runnable check that exercises the real path and asserts the real outcome:
the row linked · the JE hit the **designed account code** · DR = CR · the money nets ·
every derived surface above moved.

### 2. WHAT KEEPS THIS TRUE?
The question nobody asked all day, and the reason four of the five failures shipped.

- A **stored** value must name what recomputes it, and how staleness is detected.
- A **derived** value must be computed at read time, never stored and read back.
- A **claim** must be bound to a deploy SHA that can be re-checked and can fail later.
- A **guard** must have a planted-mutation selftest, or it will go stale silently and nobody notices.

`scenario-tracker.service.ts` already carries the correct law in its own header:
**"status is DERIVED at request time and never stored and read back."**
That file got it right. `verifier-rollup.json`, written the same week, froze its answer into a
committed file bound to a SHA that is already stale. Same repo, same days, opposite pattern.

---

## Rules that follow

1. **No stored status.** If a value can be computed from source data, compute it on read. A stored
   status is a claim that rots. If it must be stored (cost, latency), it carries the SHA and
   timestamp it was computed against, and a guard fails when that is older than live.
2. **Bound or it does not count.** Any assertion about production carries the deploy SHA it was
   taken on, and that SHA must be an ancestor of live `healthz/shallow`. An unbindable claim is
   not evidence.
3. **Spec-vs-screen, never spec-vs-spec.** A guard that compares a description to itself is a
   closed loop and proves nothing.
4. **Every guard has a planted-mutation selftest.** An assertion nobody has seen fail is an
   assertion nobody can trust.
5. **Symmetry is part of done.** If it posts, it must reverse — and the reversal must undo every
   derived surface the posting touched.
6. **Done is the chain, not the hop.** A screen that renders, an endpoint that answers, a row that
   saves: none of these is done. Done is the action reaching every derived place correctly.
7. **KEEP TEST.** Test documents stay until one post-launch pass. Never bulk-void.

---

## The DONE declaration — required in every block, no exceptions

```
PROVES-IT-WORKS: <the runnable check + the asserted outcome, incl. designed account codes>
KEEPS-IT-TRUE:   <recompute-on-read | regenerated by <job> + staleness guard <name>>
DERIVED-SURFACES: <every place this action must reach — the invoice table above, per domain>
REVERSAL:        <what undoes it, and which surfaces the reversal must restore>
BINDING:         <deploy SHA the proof was taken on; must be an ancestor of live healthz>
```

**A block missing `KEEPS-IT-TRUE` is not done. It is a snapshot.**

---

## What this is not

Not a demand for slower work. Four of the five failures above cost *more* time than doing it right —
the columns were built twice, the screen was built twice, and 193 greens were flipped to UNVERIFIED
after months of being trusted. Answering the two questions at spec time is minutes; discovering the
answer in production is what has been expensive.

**If the owner has to check it, it is not done.**
