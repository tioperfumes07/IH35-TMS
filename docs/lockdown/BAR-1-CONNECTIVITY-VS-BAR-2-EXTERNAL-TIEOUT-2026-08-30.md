# BAR-1 vs BAR-2 — Urgent 6 certify (owner 2026-08-30)

**Claude and Cursor agree.** Browser replay of real August USMCA books is **bar-1** (connectivity). It is **necessary**. It is **not** certification.

**Permanent solution (the only way “certified” is true):**

1. **Outside document is committed, immutable.** Factoring expected totals live in `docs/lockdown/CODERS-2026-08-30/FARO-AUGUST-2026-TIEOUT-EXPECTED.json`, sourced from the Faro schedule (face **95075.00**, escrow **1426.13**, fee **1426.13**, wire **120.00**, cash **92102.74**, NFE **88648.87**). **Never shrink this file to match the app.**
2. **TMS is on trial.** A bar-2 guard compares USMCA live rows to that file at **tolerance 0**. Internal JE↔advance↔invoice (`verify-chain-06-factoring-ar-tieout.mjs`) is **wiring only**.
3. **Named variances only.** HOLD 016 is **VOID**. Missing 016 / $91,275 active is a **CC-1 miss**, not a new expected face. Tie-out **FAILS $3,800** until 016 is on-book as $4,200 + $400 CM + factor $3,800. Same for 007 $100 QBO vs Faro.
4. **Do not certify “app = source” when source is wrong.** QBO duplicate $24,800 stays out of TMS. One load, one open invoice.
5. **`complete: true` is illegal** on accounting / banking / settlements / factoring / dispatch / vendors until **that module’s external tie-out is PROD-VERIFIED**. Board wording until then: **bar-1 connectivity on live August USMCA books; bar-2 pending.**

Tonight: run bar-1 (amendment first). Land bar-2 **gate** against the Faro JSON. Flip complete only when the gate is green at $0 (016 closed).

Companion: `docs/lockdown/URGENT-6-TIE-OUT-BAR-2026-08-30.md` · GO amendment carve-outs 4–5.
