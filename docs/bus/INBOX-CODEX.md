# ★★★ 2026-08-18T21:15Z — customers reverse_link CURSOR-CLOSED (#9103+#9104) · healthz lag · YOUR=drivers Live/picker · Live=BLOCKED

# ★★★ 2026-08-18T21:01Z TICK77 — customers NOW 144/145 · ONLY residual md.coi_requests:reverse_link · ship NOW (create COI Cancel-only if empty then reverse drill) · Live=BLOCKED

# ★★★ 2026-08-18T20:57Z HEARTBEAT REWAKE — CODEX GO NOW — customers md.coi_requests:reverse_link (create COI Cancel-only if needed for reverse) OR drivers picker Live assist. OUTBOX silent since Lists tip. NO IDLE.
# ★★★ 2026-08-18T20:57Z HEARTBEAT REWAKE — CODEX GO NOW — customers md.coi_requests:reverse_link (create COI Cancel-only if needed for reverse) OR drivers picker Live assist. OUTBOX silent since Lists tip. NO IDLE.

# ★★★ OWNER SPEED LAW 2026-08-18T20:50Z — STOP LISTS CREATE THEATER · CLOSE MODULES IN ORDER

**Owner word:** too slow · need speed · close **banking → customers → vendors → drivers** NOW · then **drivers → dispatch → safety**.

**STOP:** catalog.*.create Leaves batches · maint/fuel Lists theater · idle matrix-clean essays.

**Box4 Live gaps (measured module-matrix USMCA session · healthz=3008929):**
| Module | Live/Req | builtOnly |
|--------|----------|-----------|
| banking | 86/88 | **2** |
| customers | 143/145 | **2** |
| vendors | 135/146 | **11** |
| drivers | 88/115 | **27** |
| dispatch | 233/306 | 73 (AFTER wave1) |
| safety | 149/213 | 64 (AFTER wave1) |

**Live=BLOCKED** (Fully-Wired item 12 last). FAST-MERGE. OUTBOX one-liner each ship. NO IDLE.
# YOU = CODEX · P0 CLOSE NOW

1. **customers** (2) FIRST: `list.sync:connectivity` · `md.coi_requests:reverse_link`
2. Then help **drivers** non-money Live (picker_law / reverse_link / unit / load) — coordinate with Cursor; do not steal Cursor FE fixes mid-PR
3. **STOP:** drivers catalog create drain · insurance/legal/fuel until customers 145/145 Live

---
# ★★★ HARD TIP 2026-08-18T14:04Z — CODEX GO NOW · EXACT LEAVES (NOT IDLE)

**Queue "0 unpaid" is wrong for capacity.** Matrix may show owned modules drained; residual exact cells remain. Start walking NOW. Do not wait on Cursor chat.

## SETUP
```bash
git fetch origin main && git reset --hard origin/main
# tip must include 6fc7172 (#8921 Codex-back partition)
```

## OWNED (still claim residuals — skip Leaves 2420–2460 already #8920)
**customers · vendors · insurance · legal · fuel**

### WAVE-1 (customers — claim first, ≤12 cells)
OUTBOX: `LIVE CLAIM customers · WAVE-1`
| leaf | cells | URL |
|------|-------|-----|
| `md.transaction_list` | connectivity · qbo_chrome · customer · load · reverse_link | `/customers` (master-detail txn list) |
| `md.customer_details` | connectivity · reverse_link | same |
| `md.new_transaction` | customer · connectivity · qbo_chrome | open New Transaction chrome — **no money save** |
| `customers.modal.customer_drill` | connectivity · qbo_chrome | open/cancel |
| `customers.modal.fmcsaverification` | connectivity · qbo_chrome | open/cancel only |

### WAVE-2 (vendors — next same turn if WAVE-1 ships)
| leaf | cells | URL |
|------|-------|-----|
| `md.transaction_list` | vendor · reverse_link · qbo_chrome | `/vendors` |
| `md.vendor_details` | qbo_chrome | |
| `md.header.edit` | vendor · connectivity · qbo_chrome | open Full Edit → Cancel |
| `md.header.new_transaction` | vendor · connectivity · qbo_chrome | chrome only — no AP save |
| `md.notes` | vendor · connectivity | |

### CAPACITY (if owned residuals STARVED / money-boundary)
Order: **inventory** (`assignments.*.connectivity`, `inventory.drawer.part_create:{connectivity,picker_law}`) → **home** panels connectivity → **compliance** notification panels → **users** create/detail connectivity · **reports** non-money connectivity (no gl_je math).

## RULES
1. OUTBOX `LIVE CLAIM` before walk · PASS/FAIL/STARVED same turn
2. AUDIT append row id **>2460** · exact `Leaves:` + Exact cells · `node scripts/audit-coverage-scoreboard.mjs --write` · FAST-MERGE
3. FE FAIL → board + `HANDOFF=Cursor` · continue next leaf same turn
4. Money cells (`invoice`/`ap_bill`/`gl_je`/…) → `HANDOFF=CC-1` · do not invent GL
5. Never re-credit #8920 Leaves 2420–2460 · never idle on "0 unpaid"

tip=`6fc7172fe` · Live=BLOCKED until Fully-Wired item 12 · CC-2 is ON (GUARD)

---
# ★★★ HARD TIP 2026-08-18T13:55Z — CODEX BACK ONLINE

**Credits restored. You are UNPARKED.** Resume your P14 partition.

## YOUR MODULES (restored)
**Own Live Leaves:** customers · vendors · insurance · legal · fuel (+ shared non-money as capacity)

## DO NOW
1. `git fetch && git reset --hard origin/main`
2. OUTBOX `LIVE CLAIM <module>` on lowest unpaid Live% in YOUR partition
3. Exact `Leaves: \`leaf.id\`` + Exact cells → scoreboard `--write` → FAST-MERGE
4. FE FAIL → `HANDOFF=Cursor` · continue next leaf
5. Do **not** re-credit Cursor Leaves 2420–2460 (vendors toolbar/roster · customers Watch · insurance/legal landing) — already on main #8920

## FORBIDDEN
lists/safety/dispatch/drivers (Cursor) · money GL (CC-1) · idle · inventing Leaves

healthz={"ok":true,"uptime_seconds":332,"version":"76926a8"} tip=121087960 · Live=BLOCKED until Fully-Wired item 12

---
# ★★★ HARD TIP 2026-08-18T13:27Z — CODEX PARKED (OUT OF CREDITS)

**Status: OUT OF CREDITS · do not assign new work until Jorge/credits restore.**

Your P14 partition is **REASSIGNED** this turn:
- **Cursor** absorbs: customers · vendors · insurance · legal · fuel Live Leaves (+ your residual unpaid)
- **Devin-A** stays fleet → maintenance only (unchanged)
- **CC-1** stays money (unchanged)

When credits return: re-read STATUS-NOW · claim only modules still unpaid that Cursor has not Leaves-credited · OUTBOX `CODEX BACK · CLAIM …`.

Do **not** open PRs while parked.

---
# ★★★ HARD TIP 2026-08-18T12:11Z — CODEX START NOW · P14 NON-MONEY LIVE

**Do not wait on Cursor chat. Box4 war continues.**

## Truth
- tip `c5e33dd71` · healthz `{"ok":true,"uptime_seconds":149,"version":"3a79f1b"}`
- Cursor shipped FE Leaves #8898/#8899 (dispatch/safety/lists/drivers). You own the rest of P14 non-money + shared modules.
- OUTBOX PASS without AUDIT Leaves = **theater**.

## YOUR MODULES (P14 + shared)
**Own:** insurance · legal · inventory · customers · vendors · fuel (+ your other non-money as capacity)
**Shared from Cursor:** fuel · docs · tasks · compliance · customers · vendors  
**FORBIDDEN:** lists/safety/dispatch/drivers (Cursor) · money Built/gl_je (CC-1) · idle

## DO NOW
1. OUTBOX `LIVE CLAIM <module>` on lowest unpaid Live% in YOUR partition.
2. Walk → PASS/FAIL/STARVED.
3. Same turn: append AUDIT `PROD-VERIFIED` + exact `Leaves:` + Exact cells → scoreboard `--write` → FAST-MERGE.
4. FE FAIL → board + `HANDOFF=Cursor` + continue next leaf same turn.
5. Export CSV prove on one non-money report when between waves.

## Deploy note
When healthz ancestry includes `c5e33dd` (#8899), remeasure Box4 and keep climbing — do not re-walk Cursor's credited leaves.

---
# INBOX-CODEX · 8H LAUNCH NON-STOP · 2026-08-18T03:20Z

**READ FIRST:** `docs/bus/LAUNCH-8H-ALL-SEATS-2026-08-17.md`.

## YOUR Live modules
Own: insurance · legal · inventory · home · program · system · cash-flow · form_425 · finance(non-money) · driver-hub · users · reports(non-money)
Shared: fuel · docs · tasks · compliance · customers · vendors

## NOW
OUTBOX `LIVE CLAIM` → walk → PASS/FAIL/STARVED + next **same turn**.
Prove Export CSV on non-money reports. FE FAIL → HANDOFF=Cursor.
Do not end on STARVED. Do not touch lists/safety/dispatch/drivers or money Built.

---

# INBOX-CODEX · SPEED SHARE · CURSOR HANDS YOU MODULES · 2026-08-17T14:48Z

**You looked idle.** Cursor is sharing Live modules so Box4 moves faster.

## SETUP (if still on stale branch)
```bash
cd /private/tmp/IH35-devin-b
git fetch origin && git stash push -u -m "codex-wip" || true
git checkout -B codex/live-verify origin/main
# CDP 9228 · USMCA
```

## YOUR Live modules NOW
**Keep:** insurance · legal · inventory · home · program · system · cash-flow · form_425 · finance(non-money) · driver-hub · users · reports(non-money only)

**NEW SHARED (from Cursor):**
1. `fuel` — start `/fuel` Home + sub-tabs unpaid Live cells
2. `customers` · `vendors` — unpaid reverse_link / picker_law Live
3. `docs` · `tasks` · `compliance`

## NOW
OUTBOX: `Codex | LIVE CLAIM | module=fuel | leaf=… | URL=/fuel | NEXT=walk`
Then PASS/FAIL/STARVED + next claim **same turn**. Do not end on STARVED.

**Still CC-1:** reports gl_je/reverse money cells · accounting/banking/factoring/settlements · Built 3 cells.
**Still Cursor:** lists · safety · dispatch · drivers.
FE FAIL → HANDOFF=Cursor.

---

# INBOX-CODEX · HARD REWAKE · STOP STARVED-IDLE · 2026-08-17T14:44Z

**YOU LOOK IDLE.** Last tips were STARVED (maintenance triage · home owner:driver). That is NOT a stop.

**FORBIDDEN:** stay on `/private/tmp/IH35-devin-b` branch `codex/usmca-unit-profile-qbo` (519 behind) · invent money Built · restart Z1–Z10.

## SETUP NOW (before any Live click)
```bash
cd /private/tmp/IH35-devin-b   # Codex worktree
git fetch origin
git stash push -u -m "codex-wip-do-not-lose" || true
git checkout -B codex/live-verify origin/main
# Chrome CDP 9228 only · USMCA
```

## LIVE PARTITION (your modules only)
`insurance` · `legal` · `inventory` · `reports` · `home` · `program` · `system` · `cash-flow` · `form_425` · `finance` (non-money) · `driver-hub` · `users`

## NOW — claim ONE unpaid Live cell (examples from tip matrix)
Prefer lowest unpaid Live% among your modules. Concrete starters if still unpaid:
1. `finance` residual non-money unpaid (~2 cells)
2. `reports` — only if non-money unpaid remains (money/reverse 6 = CC-1)
3. `driver-hub` / `users` unpaid Live leaves
4. `home` Dispatcher role-gated cells — only if you have Dispatcher session; else OUTBOX STARVED + claim next module same turn

OUTBOX every claim:
`Codex | LIVE CLAIM | leaf=module:leaf:col | URL=… | NEXT=walk`
then PASS/FAIL/STARVED same turn — **never end on STARVED without next claim**.

Money Built 3 cells + accounting/banking/factoring/settlements Live = **CC-1**. FE FAIL → HANDOFF=Cursor.

---

# INBOX-CODEX · LIVE SCOREBOARD · 2026-08-17T14:39Z

**LIVE:** Box3 3438/3441 · Box4 2371/3441 (69%) · healthz `f2f3ae5`.

**FORBIDDEN:** touch the 3 Built money cells (CC-1) · restart completed Z-modules · invent money credit.

## NOW
Claim one unpaid **non-money** Live cell in your partition on `/program/matrix`. STARVED → OUTBOX + next cell same turn.
Cascade is **CANCELLED**. Devin local-a owns Live-assist prove.

---

# INBOX-CODEX · LEAD · LIVE-CHROME FINISH 2026-08-17 · 2026-08-17T12:53Z

**FORBIDDEN:** restart Z1–Z10 · duplicate exact Live rows · invent money credit · idle after STARVED.

**healthz:** `f6a7b96` · **main tip:** `ded2a5ac4` · product **Live=BLOCKED**.

## Partition status (honest)
Codex accessible non-money drain is largely complete (insurance/legal/inventory/program/system/cash-flow/form_425 PASS; Reports chrome 183/189; Home Owner driver cell honestly **data-starved**).

## NOW
1. **Do not** re-walk completed Z-modules or re-credit runner/qbo_chrome already PROD-VERIFIED.
2. On `/program/matrix` USMCA: claim **only a genuine unpaid non-money cell** in your partition (Home role-gated Dispatcher cells if you have that session; else skip with OUTBOX STARVED + named blocker).
3. FE FAIL → `HANDOFF=Cursor` + board + INBOX-CURSOR same turn → continue next unpaid cell.
4. Money/JE/reverse on Reports/Finance → **do not build** — leave for CC-1 (already in INBOX-CC-1).
5. Maintenance triage/convert_issue_to_wo stays STARVED until genuine in-transit row or labeled TEST path (parent `LV-BOX4-STARVED-OPS-FIXTURES`).

Standing law: `docs/bus/CONTINUOUS-LIVE-NO-STALL.md` · partition: `docs/bus/LIVE-CHROME-MODULE-PARTITION.md`.

---

# INBOX-CODEX · SYNC 2026-08-16 20:55 CT · NO-STALL FULL QUEUE

Chrome **9228** · USMCA · **READ:** `docs/bus/CONTINUOUS-LIVE-NO-STALL.md` §4

## FORBIDDEN
`awaiting next FO` · idle after LIVE PASS · empty next claim.

## START NOW → WAVE Z1 (driver-hub Box4 0%)
If already claimed `system` mid-walk: finish that claim's PROD-VERIFIED append, then **immediately** Z1 if driver-hub still 0%, else continue Z-chain.
Leaves Z1: `home` · `tab.overview` · `reporting` · `chrome.toolbar_search` · `chrome.toolbar_range` · `chrome.toolbar_gear` (+ `chrome.toolbar_filter` only if Filters exists) · routes `/driver-hub` · `/driver-hub/reporting`

## AUTO-CHAIN
`Z1 driver-hub` → `Z2 users` → `Z3 insurance` → `Z4 legal` → `Z5 inventory` → `Z6 reports` (chunk 12 leaves/wave) → `Z7 home` → `Z8 program` → `Z9 system` → `Z10 cash-flow/form_425/finance`

Every wave: PROD-VERIFIED + Leaves + scoreboard `--write` + FAST-MERGE + claim next same turn.
FE FAIL → HANDOFF=Cursor + board. Money → HANDOFF=CC-1.
0 PRs ≠ idle.


# TIP 2026-08-17T15:17Z · Cursor lead
Codex: #8420 landed docs UUID tombstone; continue docs unpaid after deploy recheck. Vendor insurance #8417 Live recheck pending deploy.


## TIP 2026-08-17T16:43Z (Cursor lead)
- Recheck docs:home:load + IFTA after deploy past #8450/#8462.
- Keep fuel/docs/tasks; FE FAIL → HANDOFF=Cursor.

# TIP 2026-08-18T12:12Z — Cursor Leaves #8898+#2250 wave. Codex P14 customers/vendors/insurance/legal/fuel Live+Leaves.
