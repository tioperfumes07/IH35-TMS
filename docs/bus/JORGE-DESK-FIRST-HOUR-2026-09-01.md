# JORGE DESK — first hour (2026-09-01 ~20:35 CT)

Order. Do not skip. USMCA only.

## 0) Do not purge money without owner
- Escrow **$500.01** is real balances with **0 postings** and audit **3 INSERT / 0 DELETE**. Leave `balance_cents` alone.
- **Owner question (yes/no tonight):** Neon restore/rollback today that could have dropped `escrow_postings`?
- Bank **97.5% unmatched** = owner categorizes. Nobody invents GL rules.

## 1) Book Load first (you, ~2h)
Hard-reload `https://app.ih35dispatch.com/dispatch` (SPA may be ahead of API until deploy).
1. USMCA · **+ Book Load**.
2. Pickup City `Laredo TX` (or Laredo + St TX). Delivery `Denton TX`.
3. Expect Practical **456.7** / Short **452.2** filled. Hint like “34 prior runs”.
4. Same modal: delivery **Chicago, IL** — boxes **empty**. Hint about spread / Check ZIP / enter ZIP. Do not treat empty as a bug.
5. **Cancel** unless this is *your* owner walk. Seats must not leave fixtures.

If you see **Enter practical miles before booking** after Laredo TX + Denton TX, the miles PR is not live yet — wait for `healthz/shallow` to move past `441ac88`.

If you see **Checking dispatch authorization gates…** stuck, same — need the miles PR live.

## 2) GO-17 proof panel
**Not built.** No GO-17 packet in repo/Downloads this turn. Next Cursor hop after Book Load is live: English Created / Linked / Posted / **DID NOT** on Save, reading `journal_entry_postings` + `audit.row_changes` + `trace_no`. Null driver must not show Linked green.

## 3) GO-11 bank
**Closed #19366** for the 34 fixture bank rows (already voided) + driver/vendor archive. `is_sample_data` on `bank_transactions` was Cursor Step 5 — do not reopen as “half-done purge.” Unmatched density is a **categorize** job, not a second purge.

## Click checklist (Devin-A / Jorge)
- [ ] healthz SHA includes GO-16-MILES-CREATE-BLOCK
- [ ] Laredo→Denton fills
- [ ] Laredo→Chicago empty
- [ ] Cancel (or owner void same session)
- [ ] No seat memo “do not void”
