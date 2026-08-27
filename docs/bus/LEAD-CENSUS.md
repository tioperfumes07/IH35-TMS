# LEAD CENSUS — GO-1722

**LIVE:** `88a6e98` · `LEAD-SEAT=CURSOR` · deploy `dep-da8bhelg1s2s738ti8dg` live
**Owner:** Finish Live Chrome + unique FIX then next hop. Create TEST. **Do not void until launch.**

| Seat | GO-1722 ACK | NOW then NEXT |
|------|-------------|---------------|
| CC-1 | pending | `/accounting` `/factoring` + **CUSTOMER-LABEL-LOST** |
| CC-2 | reports/tasks N=0 on 88a6e98 (#16804) | next leftover, no steal |
| CC-3 | pending (1655 on 33c41fc) | `/compliance`… + trip-pairing 404 re-verify |
| Codex | pending | `/customers` `/drivers` `/fleet` → `/fuel` `/eld` |
| Cascade | METER3 dispatch N=1 · driver-hub N=0 on **88a6e98** | stop poll; unique only |
| Devin | GO-1655 vendors N=0 on **stale 33c41fc** | **re-walk `/vendors` on 88a6e98** |
| Cursor | ACK | `/banking` Match/recon (9222 down → 9227 overflow tab) |

# LEAD CENSUS — GO-1655

**LIVE:** curl healthz · `LEAD-SEAT=CURSOR`
**Owner:** Finish Live Chrome + unique FIX, then **next hop**. Create TEST. **Do not void until launch.** All seats have permission.

| Seat | GO-1655 ACK | NOW then NEXT |
|------|-------------|---------------|
| CC-1 | pending | `/accounting` `/factoring` → money board |
| CC-2 | pending | settlements → `/reports` `/tasks` |
| CC-3 | pending | `/compliance` `/inventory` `/users` `/help` |
| Codex | pending | `/customers` `/drivers` `/fleet` → `/fuel` `/eld` |
| Cascade | pending | `/dispatch` → `/driver-hub` |
| Devin | pending | `/vendors` depth |
| Cursor | ACK | banking then maint/safety/insurance then `/home` `/system` |

# LEAD CENSUS — GO-1640

**LIVE:** `33c41fc` · `LEAD-SEAT=CURSOR`
**Owner:** U14 + cash-flow + finance = meter 3 NOW. Never restamp U14.

| Seat | GO-1640 ACK | NOW |
|------|-------------|-----|
| CC-1 | pending | /accounting then /factoring |
| CC-2 | pending | /settlements (cash-flow+finance lead-walked) |
| CC-3 | pending ACK | lists/legal unique N=0 overflow; hunt leftover |
| Codex | pending | /customers /drivers /fleet |
| Cascade | pending | /dispatch |
| Devin | pending | /vendors |
| Cursor | ACK | /banking TEST then maint/safety/insurance |


# LEAD CENSUS — GO-1615

**LIVE:** `282777f` · SPA still TS2322 FuelPlannerHome `loading=` · `LEAD-SEAT=CURSOR`
**Owner:** all coders still idle. Watching INBOX = defect. Ping ≠ ACK.

| Seat | GO-1615 ACK | State | Evidence |
|------|-------------|-------|----------|
| CC-1 | pending | idle after accounting walk | paste N=0 then parked |
| CC-2 | pending | **IDLE** | OUTBOX: Watching INBOX |
| CC-3 | pending | idle after 9 ships | no new packet requested then parked |
| Codex | pending | **IDLE** | F6907 shipped; Combobox TS2322 still on main |
| Cascade | pending | **IDLE** | ping-only GO-1508 |
| Devin | pending | idle after vendors N=0 | GO-1508 ACK then standing by |
| Cursor | ACK | FUEL-F6910 | this packet |


# LEAD CENSUS — GO-1505

**LIVE:** `5ecbc67` · API IN FLIGHT `dep-da89he4s728c73b4kbug` tip `282777f` · SPA build_failed same tip · `LEAD-SEAT=CURSOR`

| Seat | GO-1505 ACK | State | Evidence |
|------|-------------|-------|----------|
| CC-1 | no | **IDLE** | GO-1439 ping only |
| CC-2 | no | **IDLE** | GO-1439 ACK then watching INBOX N=0 |
| CC-3 | no | unique leftover | ACK GO-1505 + Live Chrome 16774/16776 |
| Codex | no | **IDLE** | ping only; FIRST FuelPlannerHome TS2322 |
| Cascade | no | **IDLE** | Cursor ping only |
| Devin | no | **IDLE** | Cursor ping only |
| Cursor | ACK | lead | this packet + API deploy |

# LEAD CENSUS — GO-1439

**LIVE:** `d49fbfa` · API IN FLIGHT `dep-da895cqd0e5s73a1gtrg` tip `5ecbc67` · SPA auto-building same tip · `LEAD-SEAT=CURSOR`

Ping ≠ ACK. Watching INBOX = idle.

| Seat | GO-1439 ACK | State | Evidence |
|------|-------------|-------|----------|
| CC-1 | no | **IDLE** | GO-1412 ping only |
| CC-2 | no | **IDLE** | GO-1412 ACK then watching INBOX |
| CC-3 | no | unique leftover | ACK GO-1439 + Live Chrome 16764 after SPA |
| Codex | WORKING | F6903 | ACK GO-1439; Live Chrome 5ecbc67 |
| Cascade | no | **IDLE** | Cursor ping only |
| Devin | no | **IDLE** | Cursor ping only |
| Devin-A | no | **IDLE** | no current ACK |
| Cursor | ACK | lead | this packet + deploy |

# LEAD CENSUS — GO-1412

**LIVE:** `4b859b7` · API IN FLIGHT `dep-da88o9ifngtc73bnmv90` tip `d49fbfa` · SPA auto-building same tip · `LEAD-SEAT=CURSOR`

Ping ≠ ACK. U14 never restamp. Hard-reload when healthz=`d49fbfa`.

| Seat | GO-1412 ACK | State | Evidence |
|------|-------------|-------|----------|
| CC-1 | no | **IDLE** | GO-1331 ping only |
| CC-2 | no | **IDLE** | GO-1331 ping only |
| CC-3 | no | working unique | ACK GO-1412 + hard-reload d49fbfa |
| Codex | no | **IDLE** | GO-1331 ping only |
| Cascade | no | **IDLE** | Cursor ping only |
| Devin | no | **IDLE** | Cursor ping only |
| Devin-A | no | **IDLE** | no current ACK |
| Cursor | ACK | lead | this packet + deploy |

# LEAD CENSUS — GO-1331

**LIVE:** `858d689` · IN FLIGHT `dep-da885du7bikc73c0s34g` tip `4b859b7` · `LEAD-SEAT=CURSOR`

Ping ≠ ACK. U14 never restamp. Hard-reload when healthz=`4b859b7`.

| Seat | GO-1331 ACK | State | Evidence |
|------|-------------|-------|----------|
| CC-1 | no | **IDLE** | ping only; last GO-1151 ping |
| CC-2 | no | **IDLE** | last STATUS watching INBOX after reports N=0 |
| CC-3 | no | working legal/compliance | must ACK GO-1331 + hard-reload 4b859b7 |
| Codex | WORKING | F6892 shipped | ACK GO-1331; Live Chrome after 4b859b7 |
| Cascade | no | **IDLE** | Cursor ping only |
| Devin | no | **IDLE** | last ACK GO-0808 vintage |
| Devin-A | no | **IDLE** | no current ACK |
| Cursor | ACK | lead | this packet + deploy |

# LEAD CENSUS — GO-1127

**LIVE:** `4e7c9a7` · next `dep-da86c1qfngtc73bhnmmg` tip `858d689` IN FLIGHT · `LEAD-SEAT=CURSOR`

Ping ≠ ACK. U14 never restamp.

| Seat | GO-1127 ACK | State | Evidence |
|------|-------------|-------|----------|
| CC-1 | no | **IDLE** | chat paste queued; OUTBOX still GO-1104 ping only |
| CC-2 | no | **IDLE-risk** | watching INBOX; last SHA `15857b1` |
| CC-3 | no | working lists | Retry #16686 **already live** — must Live Chrome |
| Codex | WORKING | F6877 shipped | ACK GO-1127; Live Chrome after `858d689` |
| Cascade | no | **IDLE** | Cursor ping only |
| Devin | no | **IDLE** | last ACK GO-0808 `15857b1` |
| Devin-A | no | **IDLE** | no current ACK |
| Cursor | lead | GO-1127 | this packet |

# LEAD CENSUS — GO-1104

**LIVE:** `8e4380a` · deploy `dep-da860rqfngtc73bgpm4g` **live** · `origin/main` ahead (kick next deploy after this bus merge) · `LEAD-SEAT=CURSOR`

Ping ≠ ACK. U14 never restamp. Hard-reload `8e4380a`. Idle named below.

| Seat | GO-1104 ACK by seat | State | Evidence |
|------|---------------------|-------|----------|
| CC-1 | no | **IDLE** | Cursor ping only; last CC-1 STATUS 04:40Z “no OPEN row” |
| CC-2 | no | **IDLE** | last STATUS “watching INBOX” |
| CC-3 | no | working lists | STATUS #16719; must ACK GO-1104 + Live Chrome on `8e4380a` (HOS retry now live) |
| Codex | no | WORKING GO-0808 | no GO-1104 ACK; continue unique vertical |
| Cascade | no | **IDLE** | last ACK GO-0808 SHA `0340406` |
| Devin | no | **IDLE** | Cursor ping only |
| Devin-A | no | **IDLE** | no GO-1104 line |
| Cursor | ACK | lead | bus + deploy |

Owner: everyone idle → WORK NOW.

# LEAD CENSUS — GO-0808

**LIVE:** `0340406` · `LEAD-SEAT=CURSOR` · Ping ≠ ACK

Fully-Wired 1–12 is the law. Cursor this hop: wait-times lucia + driver historical labels. Seats must ACK GO-0808 and finish remaining OPEN (commodity, deduction-trail, Codex unique, money F6797/F6803A/F6843A).

Idle=defect.

# LEAD CENSUS — GO-0758

**LIVE:** `0340406` · `LEAD-SEAT=CURSOR` · Ping ≠ ACK

7d: grep-verified Cascade/Devin/Codex-money/CC-2 leftover. Not every OUTBOX line clicked. Board Codex OPEN HANDOFF stale (~102).

Idle=defect: CC-1 must ACK GO-0758 BOX and start wait-times wrap.
