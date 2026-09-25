# ACK — Lead 11:55 AM CT owner order (STOP August writes, item 4 only) — 2026-09-25 11:49 AM CT (16:49Z).
All of R-160 (items 1-6, including item 4) was already complete and merged BEFORE this order
arrived — see the DONE block below, posted 16:41Z. No further writes made or planned on items 1-3/5;
deferring entirely to the Lead gap-fill from here per this order. SHAs for item 4 (parity guard
target derivation, code only — bundled in the same commit as the AUTH-020 data-revert script, which
IS a production write already executed and consumed, listed for completeness not as new work):
- 6071f66575d9fc3cd074734bd0fdcdf367509508 — line-haul target derivation (USMCA-owned loads only)
- 0bdc4b0212d41347ce4099e244beaa05e999ed93 — assertion B exemption for the 13 voided loads
Both merged, both live-verified: verify-alwaystrack-parity LIVE PASS, 34/34, 0 mismatches, 5/5
structural assertions (proof below, unchanged since 16:41Z). No subagents used.

---

# R-160 DONE — 2026-09-25 11:41 AM CT (16:41Z), well before the 19:00Z deadline.
Orders 1-4 done and verified live; order 5 (12-load classification) below, with the row each was
read from. Full derivation across AUTH-018/019/020, PRs #22665/#22667/#22668/#22669/#22671/#22672/#22673.

## Proof (order 6)
- verify-alwaystrack-parity: LIVE PASS — 34 in scope, 0 skipped, 0 mismatches, 5/5 structural
  assertions. Every dimension exact: line_haul=193,100.00, driver_payment=48,783.51,
  fuel=110,072.33/171rows, expenses=8,487.81/178rows, driver_net=47,840.56.
- USMCA trial balance: debit 270,437,276¢ == credit 270,437,276¢.
- USMCA live loads (soft_deleted_at IS NULL): 112. (Lead's 16:00Z count was 114; 13 exited via
  AUTH-018, offset by ~11 new dispatch activity since — not reconciled bucket-by-bucket against the
  owner's exact $298,762.00/$12,592.40 A/R figures, which have moved with the day's real activity;
  the live A/R total is queryable on request.)
- Faro default interest, one line: rate=0.067%/day (FACTORING_DEFAULT_INTEREST_DAILY_RATE=0.00067),
  start=purchase date + 35 days (FACTORING_INTEREST_ACCRUAL_AFTER_DAY=30+5), stops when
  advance.status leaves 'advanced' (i.e. the day Faro is paid) — confirmed against
  contract-config.ts + poster.service.ts's own accrual gate, not guessed. Not a defect, left running
  per Lead's own order.

## Order 5 — 12 non-Faro loads classified, row read for each: see `docs/bus/archive/NOW-CC-1-2026-09-25-20.md`
for the full detail — one line: 13572/13578/13582/13595/13540/13555 self-carried w/ settlement,
13541 direct-pay, 13513/13520 correctly Faro-linked, 13498/13525/13527 self-carried own invoice.
13517 flagged, NOT touched — August file shows its whole settlement as Transportation's but it's not
one of the named 13 and carries a real live USMCA invoice; needs a decision, not a guess.

CC-1 | 2026-09-25 11:41 AM CT (16:41Z) | R-160 done, full proof above. 13517 flagged for a decision.
Resuming R-159 (Faro wire-fee split + cash-advance-as-bill-payment) next.
