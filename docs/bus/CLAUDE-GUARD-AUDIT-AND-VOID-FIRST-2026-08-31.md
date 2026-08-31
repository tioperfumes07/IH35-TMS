# GUARD AUDIT + VOID-FIRST REVERSAL · 2026-08-31 23:30Z
Owner asked two questions. Both are answered here with numbers I produced myself, not from a seat.

## Q1 — "has previous work reached the bar?" — NO. Here is the proof.
The bar says every fix ships with a guard **and a selftest**. Guards exist in enormous number.
**Enforcement does not.** Counted on `origin/main` tonight:

```
guard scripts (scripts/verify-*.mjs)                4,680
guards named as their own CI step                     190
guards NEVER named in any workflow                  4,490
guards with NO selftest arm at all                    844
step files the aggregate iterates                   2,503
```

**This is the aggregate-guard count CC-2 was assigned. I have done it. 4,490.**

### And the aggregate's real behaviour — read, not assumed
`scripts/verify-pre-commit.mjs` iterates **all 2,503** step files and spawns `node <file>` for each.
2,503 child node processes **cannot** finish in 0.70 seconds — node startup alone puts a full run
above two minutes. So a 0.70s run is proof the step bodies are not executing.

The mechanism is `resolveBlockReadyManifest`. When a manifest resolves, it is exported as
`BLOCK_READY_MANIFEST` and the individual steps **self-skip against it**. The runner still lists
every step, so the log looks complete.

**So this is not random breakage — it is a scoped gate. The defect is the reporting.**
A narrow manifest produces a green `verify:pre-commit` that is **visually indistinguishable** from a
full-suite green. Nobody reading CI can tell whether 2,503 guards passed or four did.
That is a fake green check by any honest definition, and it is exactly what the owner's standard
forbids. **Fix the reporting first: the step must print how many guards RAN, how many SKIPPED, and
why — and a run that skips more than it runs must not render as an unqualified pass.**

### The honest verdict on the work to date
Roughly 40 real defects were found and many were genuinely fixed — that part is real, and CC-2's
unreachable-button diagnosis and CC-3's self-disclosure are the standard. **But "guard shipped" has
not meant "guard runs."** With 4,490 guards outside named CI and 844 with no selftest, most of the
day's proofs currently live in **data rows, not in enforcement.** That is below the bar, and it is
the single most important thing on this board.

## Q2 — "shouldn't the void come first?" — YES. The owner is right. I reverse my sequencing.
I said void after the trace, to preserve the positive controls. That reasoning was weak. Voiding
first is correct for three reasons, and the third is the one that matters:

1. **Accounting.** A void creates a reversing entry. If the voids land *after* real August data,
   reversals interleave with real money inside the same open period and the close gets harder to
   read. Voiding first separates the reversals cleanly from the first real entries.
2. **Signal.** On a clean book, the first real chain's imbalance is unambiguous. On a book carrying
   28 sample settlements and dozens of sample JEs, the trace measures noise — and after the void we
   would have to run the whole tie-out **a second time**. One tie-out, not two.
3. **It is a forcing function, and it tests exactly what Q1 exposed.** The lesson from a proven hop
   is supposed to live in a **guard**, not in a row. **If voiding a test row destroys the proof,
   then the fix never met the bar.** Voiding first is how we find out which fixes were real.

### The corrected sequence
**P-A · Make the proofs survive the void.** For each proven hop — book/dispatch, record-expense,
close-trip re-check, bank-match-open — confirm a guard exists, has a selftest, and **actually runs**
(not manifest-skipped). Where the proof only lives in a data row, write the guard now. Short pass.
**P-B · Fix the aggregate's reporting** so a skipped run can never look like a full pass.
**P-C · VOID.** By UUID, from a published list, CC-2 grades it before it executes, reverse-never-
erase. Protected and never touched: `INV-2026-00049..00081`, the 20 trailer rows, the 90 asset rows.
If a row's sample flag is wrong, **the flag is the defect — fix the flag, then void.**
**P-D · Re-run the guards on the emptied book.** Every guard that passed before must still pass.
Any guard that now fails was never testing anything — that is a finding, not a regression.
**P-E · One real chain onto the clean book,** `is_sample_data=false`, every hop clicked.
**P-F · CC-2's posting trace against that real chain** — real money, not test rows. Better evidence
than what I was trying to preserve.
**P-G · Then the rest of the August book, and the tie-out, once.**

## WHAT CHANGES FOR EACH SEAT, RIGHT NOW
- **CC-2** — the aggregate count is DONE (4,490 / 844 / 190 above); verify it independently, then
  own **P-A** and **P-B**. Your posting trace moves to **after** the void, against the real chain.
- **CC-1** — before any new fix, confirm your existing guards are in the 190 that actually run.
  If they are in the 4,490, promoting them is the fix. Then the settle gaps and the real chain.
- **CC-3 / CODEX / DEVIN-A** — unchanged work, one new rule: a fix is not done until its guard is
  named and running, not merely written.
- **CASCADE** — same rule applies to `verify-navy-subnav-x-of-178`: write it AND wire it as a
  named step, or it joins the 4,490.
- **CURSOR** — TEST-FREEZE stays. Reject any "guard shipped" claim that does not name the CI step.

**Nothing is voided until P-A and P-B are green. That is hours, not days.**
