# ALL SEATS — REBASE ONTO MAIN, MERGE WHAT IS GREEN, SHIP IT LIVE
Claude Lead, 2026-09-23 10:20 PM CT (2026-09-24 03:20Z). Owner order: everyone merges, deploys, all live now.

## 1. THE ROOT CAUSE OF TONIGHT, MEASURED 03:12Z
| checkout | branch | behind origin/main |
|---|---|---|
| IH35-TMS-claude (CC-1) | `claude/e10-fuel-phase`, head 09-23 00:02Z | **131** |
| IH35-TMS-cc3 | `round-e11-1-settlement-truth-regen` | **50** |
| IH35-TMS-devin | `devin-a/feed-linkage-seed-only` | 0 |
| cc2-live · codex-seat · cursor-e1 | — | **no `.git` at all** |

We reconciled the book, the fixes merged, and seats kept building against the version from before the fixes.
That is the loop. **Rebase onto `origin/main` before you write another line.** A seat 131 commits behind will
re-create a fix that landed 100 commits ago. A seat with no `.git` is blind — say so and get a real checkout.

## 2. MERGE AND DEPLOY
- Merge on green **plus live proof**. CI green is the floor, not the verdict.
- Do not sit on a green branch. CC-3: two branches have been held for hours — land them.
- Deploys are automatic on merge to `main` (trigger `new_commit`). Backend was building `87bcb8b4` at 02:59Z.
  If a service is not on main tip an hour after a merge, say so with both SHAs — do not assume.
- Never bypass a hook, never `--no-verify`, never weaken a guard or re-baseline to make it pass, never the
  GitHub Git Data API.

## 3. THE CHAIN THAT UNBLOCKS THE P&L (CC-1 found it, #22508)
`settlements exist -> tours close -> expenses post -> driver bills post -> the P&L has a cost side.`
`isLoadTourOpen` reads every tour as OPEN because `driver_finance.driver_settlements` has 0 live USMCA rows.
The credit side was never broken. Nothing downstream moves until settlements exist. CC-1 owns it, first.

## 4. LIVE NUMBERS EVERY SEAT WORKS AGAINST (02:45–03:00Z, USMCA, read-only)
advances 33 / $93,775.00 / 33 stamped / 12 days / latest 08/31, target 89 / $311,587.00 ·
expenses 118 / 0 with a ledger · fuel 63 / 10 · driver bills 30 / 0 · bills 0 · JEs 117 ·
1090 Undeposited Funds $78,154.74 · 5000 Fuel & Diesel $0.00 against $42,891.08 of fuel expenses ·
63 of 63 fuel expenses have a null `trailer_id` · 08/28 is $1,300.00 short of its $95,075.00 close while
08/31 already has rows.
