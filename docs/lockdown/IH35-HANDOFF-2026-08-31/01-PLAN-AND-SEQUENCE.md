# THE PLAN, THE SEQUENCE, AND WHETHER THIS IS THE FASTEST METHOD
2026-08-31 · measured from `origin/main`, live Neon, the deployed API, and the bus files.

---

## 1. WHERE WE ACTUALLY ARE

**Urgent 6: 119 of 128 items.** Nine remain.

| Module | Score | Remaining |
|---|---|---|
| accounting | 39/40 | `ACCT-TIEOUT-01` |
| dispatch | 37/38 | `DISP-TIEOUT-01` |
| factoring | 10/11 | `FACT-TIEOUT-01` |
| settlements | 9/10 | `SETL-TIEOUT-01` |
| vendors | 7/9 | `VEND-TIEOUT-01` · **VEND-CERT-01** |
| banking | 17/20 | `BANK-TIEOUT-01` · **BANK-ECON-04** · **BANK-SURF-04** |

**Six of the nine are the same item.** And every one of the six scripts in
`scripts/tieout/` is a stub: 13–30 lines, one `fail()`, no comparison logic.

**Live data (USMCA, this session):** loads 42 · invoices 48 ($104,375) · bills 80 ·
journal entries 434 · driver settlements 17 · vendors 626 · bank accounts 5 ·
credit memos 3 · **factoring advances live: 0** (the only one is voided).

**Two board flags lie.** `safety` reads `complete: true` with four items on HOLD
(and SAF-B08 is HOLD *and* prod_verified — that stamp cannot exist).
`users` reads `complete: false` with 6 of 6 PASS and prod_verified.

---

## 2. THE SEQUENCE — FASTEST PATH TO URGENT 6 DONE

The six tie-outs are **independent of each other**. They do not queue. The correct
shape is six seats writing six scripts simultaneously, today, with no deploy.

### PHASE 1 — NOW, fully parallel, nothing waits (no deploy needed)
| Seat | Task |
|---|---|
| CC-1 | **016 in Chrome** — the only blocking item. Then `settlement-pdf-5753`. |
| CC-2 | `faro-factoring-statement` — face 95,075.00 / reserve 1,426.13 / fee 1,426.13 / wire 120.00 / cash 92,102.74 / NFE 88,648.87 |
| CC-3 | `vendors-ap-aging` — open bills == AP control, tolerance 0. Then **VEND-CERT-01**. |
| Cascade | `dispatch-delivered-revenue` — delivered == invoiced, zero orphans both ways |
| Codex | `bank-ledger-closing` — each bank account closing == its GL balance. Then **BANK-ECON-04**, **BANK-SURF-04**. |
| Cursor | `accounting-trial-balance` — debits==credits AND ties to QBO, read-only. Plus the two false flags. |

### PHASE 2 — run them against live data
Each tie-out reports **observed vs expected vs difference**. Expect failures. A failing
tie-out on first run is the system working, not a setback.

### PHASE 3 — fix what they find
Real defects only. **Never adjust an expected value to make a tie-out pass.**

### PHASE 4 — stamp
`prod_verified` (CC-2 only, Hard Rule 5), then `complete: true`. Not before.

**Rules on every tie-out:** tolerance 0 · record the observed value pass or fail · an
empty result is never a pass · the outside document is the truth, the system is on trial.

---

## 3. IS THIS THE BEST AND FASTEST METHOD? — HONEST ANSWER: NO, AND HERE IS WHY

### What is genuinely good (keep all of it)
- **`scripts/next-work-item.sh` is the right architecture.** Seats compute their own
  queue from `origin/main`. Pull-based, no lead handoff, no bottleneck. It already exists.
- **LEAD-CONTRACT with an automatic tripwire** is real accountability, rare and valuable.
- **Append-only board, WORM everywhere.** Correct.
- **253 PRs merged in ten hours.** Throughput is not the problem.

### The four things actually costing you time

**(a) GO churn is the bottleneck — not deployments.**
`NOW-ONE-SOURCE.md` carries **nine separate "THIS IS NOW" declarations in about four
hours.** Each one invalidates the last. A seat that starts under GO-N finds GO-N+2 by
the time it commits, so it stops and re-reads instead of working.
**This is exactly what stalled 016:** the amendment file still said "HOLD 016" while a
newer ruling said build it. Seats obeyed the stale file, voided the invoice, and waited
for a decision that had already been made. That was a documentation race, not a coder error.
> **Fix: one GO per shift.** Corrections **amend the existing GO in place**, never spawn a
> new "THIS IS NOW." If an instruction is superseded, edit it where it lives — a
> superseded instruction that is still readable will be followed.

**(b) Push is fighting pull.**
`next-work-item.sh` is pull-based and correct. The GO / INBOX-TOP mechanism constantly
overrides it with push. When both exist, a seat spends its turn deciding which to obey.
> **Fix: pull is the default; push is the exception.** A seat runs `next-work-item.sh`
> and takes the top item **without being told**. The GO says only *what changed* — never
> *what to work on*.

**(c) The lead is a serializer, and it also writes product code.**
Everything routes through Cursor: INBOX rewrites, FAST-MERGE, deploys, census — while
Cursor also authored #18393, #18398 and #18404 tonight. One agent, six seats, plus its own
PRs. That is a single-server queue, and it is the structural bottleneck.
> **Fix: while Cursor holds LEAD, Cursor writes no product code.** Lead = merge, deploy,
> unblock, census. Hand the product work to a seat. A lead that codes stops leading
> whenever its own PR gets interesting.

**(d) Deploys are a decision, so they become a wait.**
> **Fix: deploy on a timer.** Every 20 minutes, if `main != live` and nothing is in flight,
> deploy. Nobody asks, nobody waits, nobody stacks. This alone deletes the entire category
> of "waiting on a deployment."

### The fifth thing: nobody can see what blocks what
There is no dependency graph, so a blocked seat stops instead of routing around.
> **Fix: the two-lane standing order** (`docs/bus/NO-IDLE-PARALLEL-LANES-2026-08-31.md`).
> Every seat holds a BLOCKING lane and a FREE lane and switches the moment it stalls,
> without asking. Announcing "blocked" and stopping is itself a defect.

### What I would change tonight, in priority order
1. Deploy on a 20-minute timer. *(deletes the waiting)*
2. One GO per shift, amended in place. *(deletes the churn and the 016 class of failure)*
3. Cursor stops writing product code while lead. *(deletes the serializer)*
4. Pull by default via `next-work-item.sh`. *(deletes the "what do I do" turn)*
5. Two-lane rule already issued. *(deletes idle)*

**Kept honest:** this is a judgement about method, not about anyone's work. The build
quality is high, the board is mostly honest, and vendors/banking were both corrected
downward today by seats policing themselves. That is the hard part and it is being done well.

---

## 4. WHAT IS ALREADY WRITTEN AND WAITING (in `specs/`)
- `202613301700` + `202613301800` — Faro repurchase tracker: the contract's 30/5/**95**-day
  clocks, 0.067%/day, Transaction Fees table, and the live Repurchase Price view.
- Deduction & dilution spec — reason taxonomy, the fault axis, derive-responsibility,
  the accountability report, six guards, and the correction where the Faro contract
  proved my first journal entry wrong.
- Planner UI fixes — already applied in the claude worktree, `tsc --noEmit` clean.
