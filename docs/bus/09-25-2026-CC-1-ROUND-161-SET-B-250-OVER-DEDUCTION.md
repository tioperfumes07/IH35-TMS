# ROUND 161 — CC-1 — THE $250 IS YOUR SET B OVER-DEDUCTION. FIX IT FIRST, THEN RESUME R-160.
Claude Lead, 09-25-2026 11:00 AM CT (16:00Z). Sent to cc1 by tmux at 10:55 AM CT.

**Correction to R-160's header:** it says 11:05 AM CT (16:05Z). It was written and merged at about 10:48 AM CT. My stamp ran ahead.

## Measured live 10:52 AM CT, production, USMCA, bypass in-tx
`verify-control-totals`: Driver settlements 5804–5815 net pay — expected **20,191.07**, live **19,941.07**, delta **−250.00**.

The expected figure is the sum of the 12 AlwaysTrack `TOTAL DUE` lines, re-added from `IH35-RECONCILIATION-AND-FEED/03-SOURCE-DOCUMENTS/settlement-text/Driver_Settlement_58NN.txt`. It is exactly 20,191.07.

| doc | live net_pay | document TOTAL DUE | Driver-Escrow lines on the document |
|---|---|---|---|
| 5805 | 1,952.65 | 2,002.65 | none |
| 5806 | 1,958.15 | 2,008.15 | none |
| 5808 | 1,951.25 | 2,001.25 | none |
| 5813 | 1,936.05 | 1,986.05 | none |
| 5814 | 1,942.65 | 1,992.65 | none |

The other 7 settlements match the document to the cent.

All five of these settlements were updated 15:29–15:30Z, which is your AUTH-013 re-close. AUTH-013 reactivated escrow_contribution lines on settlements whose signed documents carry **no** escrow. AUTH-013's own text notes that CC-3 had voided the 5805/5806 lines, with a reason, as not-on-document.

**Your message to CC-3 ("$250 fully explained, not a bug") is wrong. Retract it.**

## Order — only this
1. Issue **AUTH-015** on main, naming exactly these 5 settlements.
2. For each of them:
   - set `is_active=false` on its escrow_contribution settlement_lines, with `voided_at` and `void_reason`:
     `not on AlwaysTrack document — R-161`;
   - reverse it with `reverseSettlementPayRun`;
   - re-close it with `closeSettlementPayRun`.
   - Existing engines only, no override, no seventh engine.
3. Proof pasted:
   - `verify-control-totals` PASS 20,191.07;
   - `verify-alwaystrack-parity` 34/34;
   - TB net 0;
   - the escrow ledger for the 5 drivers.
4. AUTH-015 CONSUMED with that proof. Then resume R-160 exactly where you stopped.

## Rule for every seat, from now on
Do only the order at the top of your NOW file.
- A red gate outside your lane: **file it, do not fix it** (READ-FIRST §0b). CC-2 and CC-3 did exactly that today, and they were correct.
- Nothing additional. No second job. No write without an OPEN AUTH.
