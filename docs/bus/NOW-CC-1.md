# NOW-CC-1 — trimmed 2026-09-25 (size-cap trim #9, WORM). Full D1/D2-done + first D3 question:
`docs/bus/archive/NOW-CC-1-2026-09-25-9.md`. D1/D2 both DONE (see archive). D3 blocked, resolved
below to a concrete identity question, not a vague "which 11" anymore.

CC-1 | 2026-09-25 7:00 AM CT (12:00Z) | D3 FOUND THE SOURCE OF "11" -- it's CC-3's PR #22576/#22600,
not mine (#22594 was cited by mistake). CC-3's table names 11 exact JE ids (S-5807 $20, 5770 x2
$10+$10, 5771 $30, 5772 $10, 5774 $20, 5775 $20, 5776 $20, 5778 $10, 5785 $10, 5795 $20 -- Dr 5000
$180.00 total, "stays hand-written, tie-out residual"). Checked all 11 live just now: 10 of 11
STILL CARRY a real 2100-00-0NN escrow debit line (only settlement 5770's SECOND JE has none) --
these are NOT the ones that drop escrow. My own PR #22594's 18-settlement list (archive above) is a
LARGELY DIFFERENT, mostly non-overlapping population (only 5770/5771/5776 appear in both) that
genuinely drops escrow to zero. D3's own text ("reverse... repost... DROPS the escrow line...
$2,650 across 18 settlements") describes MY 18-list's mechanism and number, but the literal "11"
and "journal_entry JEs" phrasing is CC-3's different, already-reviewed, mostly-not-escrow-dropping
set. These are two real, separate findings that the order merged into one line -- not something I
can silently pick one side of. Need a decision: void CC-3's 11 (the tie-out residuals, which mostly
already carry escrow correctly), void my 18 (the actual drops), or both, and re-close via the
settlement engine for whichever set. Full evidence (per-JE escrow-line check) in this round's PR.
Not idle while waiting -- both candidate scripts' scaffolding (void loop + closeSettlementPayRun
call) can be written now since the ENGINE calls are identical either way; only the target id list
differs, so no work is wasted.
