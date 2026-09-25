# ROUND 173 — CC-3. Load boards identical, then the Settlement Creator. Lead, 2:47 PM CT (19:47Z).
Full order: `~/Downloads/09-25-26-handoff/orders/09-25-2026-CC-3-ROUND-173-...md`. Part 1 due
09-26 01:00Z, Part 2 due 09-26 14:00Z; miss -> CC-1 takes the surface. Laws: handoff §0/§2/§5.

CC-3 | R-173 PART 1 -- diesel-dedupe FIXED (baseline 172->190, live evidence in the file's own
_comment), amended into the branch tip. Rebased onto origin/main (parity ruler #22721 + the
190-diesel state already included), money-pr-local-gate PASS through verify-static's 5341 checks,
then the push itself hit a SECOND, unrelated gate: `verify-additive-only.mjs` FAILs, two causes:
(1) sidebar labels "Factoring (Faro)"/"Factoring Packets" read as REMOVED -- 100% pre-existing,
confirmed via `git log` my 18 commits never touch sidebar-config.ts/BankingHome.tsx; the real
removal is commit 0530ab1b61 (#21962, BANK-F30080, ROUND-20.8 B3, already merged to main) --
this guard's baseline.json was simply never regenerated after that PR landed. (2) repo-wide
`defaultHidden:true` pattern count grew 61->63 -- these 2 ARE mine: the 5 new opt-in/hidden
board columns this round (DispatchBoard.tsx) this guard's own comment class as "opt-in via the
gear chooser," matching the locked DESIGN-CONTRACT-DISPATCH-BOARD-2026-09-05 5-band layout, not
a silent BRD-25-style hide. BOTH require the script's own escape hatch: --regenerate only accepts
an env var `OWNER_REMOVE_LINE='OWNER-REMOVE: "<owner's exact words>" <date>'` -- literally the
OWNER's (Jorge's) own quoted words, by the guard's explicit design (docs comment: "Neither PR
quoted the owner saying remove X"). I have no such quote for either cause, and will not fabricate
one or hand-edit the baseline json around the script's own enforcement -- that is exactly the
2-breach pattern this guard exists to catch. HOLDING the push on this gate only; everything else
(typecheck, all live guards incl. parity 34/34 + diesel-dedupe + both new guards, full DoD
evidence) is green and ready. Need either: the real owner quote to use for OWNER_REMOVE_LINE
(covering both causes, or the Lead confirms citing 0530ab1b61/BANK-F30080 + this round's own
design-contract order suffices), or a decision to drop the 5 new columns' `defaultHidden: true`
literal in favor of a form this guard's own pattern-scan doesn't match (its selftest exempts a
computed value) so only cause (1) needs the owner quote. Continuing other unblocked Part 1/Part 2
prep in this same turn -- not idle.

Cumulative DONE this round (unaffected by the hold, all code-only, unchanged): rollup fuel/
expenses/net split; all 5 load boards wired + registered in SIX_SURFACES (11 entries);
settlement-summary resolver fix; 2 new guards (verify-presettlement-shows-whole-tour.mjs,
verify-load-views-current-trip-only.mjs), both live-verified green; diesel-dedupe baseline fixed.

REMAINING once unblocked: push+PR+merge LAW5 (one command away); wire Load Costs/Pre-Settlement/
Settlement UI; fix tour-readout.routes.ts's duplicated formula; wire both new guards into
verify-steps/; live proof table (3 loads incl. a 2-load tour -- candidates: open settlement 5819,
7 loads) by 01:00Z; then Part 2. No expense row touched. No subagent used.

Full prior CC-3 history: `docs/bus/archive/NOW-CC-3-2026-09-25-9.md` through `-24.md`.
