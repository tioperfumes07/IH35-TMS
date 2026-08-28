# OWNER LAW — NEVER IDLE · SEED EVERY GATED TABLE · KEEP TEST
**Locked 2026-08-27 23:15 CT. Answered = closed. Do not re-ask.**

Owner chat (verbatim intent): a coder must **always be working**. If their lane is drained they **share with another coder**. There is no luxury of waiting 30–40 minutes for Cursor instructions. If a path needs data, **create labeled TEST** (including a TEST **asset** at a placeholder price and finance cost) and **create bank transactions** so match / bills / expenses / payments can run. **Do not delete.** **Do not leave money tables at 0 rows.**

This **supersedes** GO-2310 “KEEP GATE · N/A” for Faro / equipment loans / RP schedule / tax, and **supersedes** “idle while named-blocked = correct” as a reason to sit.

## 1. Idle

- **Unverified work = defect.** Stamping PASS without SHA + row/JE is still forbidden.
- **Waiting for Cursor / a GO packet while any unblocked work exists = defect.**
- If your NOW is blocked on another seat’s merge, **do not idle**: pull that seat’s leftover, seed the next 0-row gated table through the live wizard, or take the next unique FINDING. Announce the steal on OUTBOX (`STOLE leftover from <seat> because NOW blocked`).
- Cursor lead writes GOs **without** becoming the clock. Seats start from INBOX TOP **or** the drained-lane rule above — they do not wait for a ping.

## 2. Keep TEST — do not delete, do not void for proof

- CREATE labeled TEST (`TEST` / `USMCA-TEST` in name/memo). **Keep it.** Owner voids at operational 100%, not seats.
- Do not DELETE fixture rows. Do not void the central fixture set to “clean up.”
- CREATE-TEST-THEN-VOID law still means **owner** voids at launch — seats **stop voiding evidence**.

## 3. Zero rows

- Any table that **gates a poster, match, recon, factoring submit, loan, detention, POD, Faro import, tax doc, or RP schedule** must have **≥1 USMCA TEST row**.
- If you hit 0 rows on a hop: **create the TEST document that turn** (wizard, not SQL dump unless CC-1 money requires poster).
- CC-2 extends `docs/specs/scoreboard/posting-gate-tables.json` by tracing posters. Seats do not wait for a complete inventory.

## 4. TEST asset on USMCA (owner authorized this hop)

Standing chart law: PP&E exists **when a purchase is recorded**. Owner authorized **one labeled TEST asset purchase** (placeholder price + finance cost) so equipment-loan posting, bank match, bills, expenses, and payments can be exercised. That purchase is TEST, not “USMCA is now the fleet owner.” Do not seed a shadow fleet. **One** TEST unit + **one** TEST loan + bank txns to match is enough unless a second type is required to unblock a distinct poster.

## 5. Bank side

Create TEST bank transactions so **match / categorize / pay bill / receive payment** can run. Empty bank feed is not a stop.

POD still required for **factoring submit** (owner B). Seed a TEST approved POD so that table is not 0. Event 2 A/R does **not** wait on POD.

USMCA only. No TMS→QBO write-back. No U14 restamp.

GO: `docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-27-2320.md`.
