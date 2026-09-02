# JORGE DESK — first hour (2026-09-01 ~20:35 CT)

Order. Do not skip. USMCA only.

## 0) Do not purge money without owner
- Escrow **$500.01** is real balances with **0 postings** and audit **3 INSERT / 0 DELETE**. Leave `balance_cents` alone.
- **Jorge does not answer Neon restore.** Agents reconcile from Neon ops + audit. Escrow forensic = CC-1.
- Bank **97.5% unmatched** = owner categorizes. Nobody invents GL rules.

## 1) Book Load first (you, ~2h)
Hard-reload `https://app.ih35dispatch.com/dispatch` (API healthz **12bfbd6** — miles + GO-17 live).
1. USMCA · **+ Book Load**.
2. Pickup City `Laredo TX` (or Laredo + St TX). Delivery `Denton TX`.
3. Expect Practical **456.7** / Short **452.2** filled. Hint like “34 prior runs”.
4. Same modal: delivery **Chicago, IL** — boxes **empty**. Hint about spread / Check ZIP / enter ZIP. Do not treat empty as a bug.
5. **Cancel** unless this is *your* owner walk. Seats must not leave fixtures.

If you see **Enter practical miles before booking** after Laredo TX + Denton TX, hard-reload — API must be `12bfbd6` or later.

If you see **Checking dispatch authorization gates…** stuck, same — need the miles PR live.

## 2) GO-17 proof panel
**On API 12bfbd6.** After Save, modal stays open with Created / Linked / Ledger / DID NOT. Null driver = not_set, never Linked green. Continue then close.

## 3) GO-11 bank
**Closed #19366** for the 34 fixture bank rows (already voided) + driver/vendor archive. `is_sample_data` on `bank_transactions` was Cursor Step 5 — do not reopen as “half-done purge.” Unmatched density is a **categorize** job, not a second purge.

## Click checklist (Devin-A / Jorge)
- [ ] healthz SHA `12bfbd6` (GO-16 miles + GO-17)
- [ ] Laredo→Denton fills
- [ ] Laredo→Chicago empty
- [ ] Cancel (or owner void same session)
- [ ] No seat memo “do not void”
