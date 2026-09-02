# INBOX-CC-1 · LEAD TOP 2026-09-01 20:52 CT · FORCE NOW = ESCROW FORENSIC (DO NOT ASK JORGE)

`git pull --ff-only origin main`

**Jorge is not the message bus.** He said he does not know about Neon restore. Agents reconcile from evidence.

## FORCE NOW — forensic only. Do not zero. Do not recreate rows. Do not invent JE/settlement.

Cursor already measured (lucia, USMCA `5c854333-6ea5-4faa-af31-67cb272fef80`):

| Fact | Evidence |
|------|----------|
| Balances | `1a450978` $250.00 · `93358b4d` $250.00 · `b46f3e8a` $0.01 = **$500.01** · `updated_at` 2026-08-21 / 08-21 / 08-31 |
| Live `escrow_postings` | **0** |
| `audit.row_changes` escrow_postings | **3 INSERT, 0 DELETE** · ids `77fe680d`, `d58efce0`, `b55732c9` · `changed_by_role=Owner` |
| Neon ops (last 200) | **zero** `restore` / `reset_from_parent` / snapshot-restore. Only create_branch / delete_timeline / archive / compute / apply_config |
| Snapshots | daily auto on `br-fancy-credit-akjnd07a` including `snap-delicate-wave-ak0ldjkv` 2026-09-01T02:00:05Z — **created**, not restored onto prod |

**Close the mechanism:** TRUNCATE / trigger-disabled DELETE / out-of-band SQL vs seat recreate after GO-11. Report IDs only. Leave `balance_cents` alone.

## ALSO (serial, after forensic report)
GO-11 34 bank fixtures already **voided** (#19340/#19366). Do not rebuild as half-done purge. `is_sample_data` on `bank_transactions` is Cursor Step 5 if still OPEN — do not invent GL deletes.

NO-SEAT: stop creating prod money. Board OPEN for leftover seat memos (CC-2 already named 4 KEEP TEST rows). Void under WORM only if still live.

Never `trigger_deploy`. Never seat fixtures.

ACK `CC-1 | ACK | NOW=ESCROW forensic from Neon ops + audit · no owner Q · no zero | GO`
