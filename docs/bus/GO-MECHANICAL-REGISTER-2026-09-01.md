# GO — UI MECHANICAL FIX REGISTER (73 items) · 2026-09-01

**Per-coder paste (FAST-MERGE + deploy + unblockers):** `docs/lockdown/PASTE-ALL-SEATS-GO-2026-09-01-MECHANICAL-WAVE.md`

**Owner register files:** `docs/register/IH35-UI-MECHANICAL-FIX-REGISTER-2026-09-01.xlsx` · `.csv`

**ACK:** `SEAT | ACK | GO-MECH-0901 | NOW=<first-id> | GO`

---

**Status key:** VERIFIED FIXED · STILL OPEN · PARTIAL · NOT VERIFIED · REPORTED DONE (sweep required)

**No STAND BY.** Every seat pulls from this file + their INBOX TOP. Cursor lead rebases INBOX every ship.

---

## Wave 0 — UNBLOCK NOW (parallel, today)

| ID | Item | Seat | Action |
|----|------|------|--------|
| — | CC-3 push ACCT-F10261 insurance bill param | **CC-3** | Rebase `6ae5b91+`, merge P0, dedup Samsara vs #19068 |
| — | Purge phases 5–6 | **CC-1** | **DONE** 2026-09-01 — see `docs/reconcile/PURGE-COMPLETE-2026-09-01.md` |
| COL-02 | Column drag-reorder | **CC-3** | Build in ParityTable (resize exists; reorder does not) |
| COL-03 | Column auto-fit | **CC-3** | Double-click header / fit-to-content in ParityTable |
| CTL-01–03 | UI control law sweep | **CC-3** | Push `cc3-ui-control-law-build`, then grep-sweep all modules |
| SEL-01 | Select-all scope | **CURSOR** | ParityTable/header: "select all matching" vs page-only — align UX + tests |
| LAY-04/05 | KPI tile width | **CURSOR** | KpiCard: drop `flex-1`, content-aware width + truncate |
| MOD-03 | Date typing | **CURSOR** | DateTimePicker **fixed #19067** — extend same pattern to **DatePicker** (insurance uses DatePicker) |
| MOD-02 | Escape closes wizard | **CURSOR** | DateTimePicker fixed; port stopPropagation to **DatePicker** popover |
| WIR-02 | Driver Export PDF | **CC-2 verify** | `resolveApiUrl` on main — prove live deploy + guard relative-href |
| DSP-05 | Dispatcher confirm on assign | **CC-1 + CURSOR** | **ASSIGNED** — CC-1 API/audit; Cursor modal on dispatch assign |

---

## Seat lanes (70 open items)

### CC-3 — mechanical UI (28 items)
Layout law assist · **COL-01–03** · **CTL-01–03** verify sweep · **FLT-01** combobox filters · **CUS-01–07** customers/vendors · dedup Samsara branch.

### CURSOR — layout + modals + dispatch + void chrome (25 items)
**LAY-01,03–07,10** · **CTL-04,05** · **COL-04** · **FLT-02,03** · **SRC-01,02** · **MOD-01,04,05** · **SEL-02–04** · **VIS-02,04** · **DSP-01–04** · **PLN-03,04,06** · **UPL-04–06** · **WIR-01,03,04** · **DQF-01** UI half.

### CODEX — dispatch/planner connectivity (9 items)
**DSP-06–09** · **PLN-01,02,05** · **FLT-04** date range re-query.

### CC-1 — money + void + uploads schema (12 items)
Purge finish · D1 drivers · insurance attach · **COL-05** money columns · **VIS-01,03** · **UPL-01–03** document columns · **DQF-01** catalog/FK · void-tree API · **DSP-05** backend.

### CC-2 — guards + live verify (4 items)
TB grade purge · NO-SEAT guard · **WIR-02** deploy proof · ratchet for mechanical register rows as they merge.

### CASCADE — ledger + assignment (2 items)
Append OPEN rows for each STILL OPEN register ID not on GUARD-WORKORDERS · **COL-06** settlement column sweep · scoreboard regen after merges.

### DEVIN-A — Live Chrome (continuous)
Click-verify every PR that claims FIXED; file FAIL if register still red on prod. Priority: DatePicker typing, KPI tiles, select-all scope, column reorder after CC-3 ships.

---

## Already on main (deploy may lag — verify healthz)

| ID | Note |
|----|------|
| LAY-02 | Dispatch subnav scroll — VERIFIED |
| LAY-08/09 | Customers/Vendors xl:flex-row — VERIFIED |
| MOD-03 (DateTimePicker) | Typed input + month/year — **#19067** |
| MOD-02 (DateTimePicker) | Escape stopPropagation — **#19067** |
| MOD-04 | EntityPicker keepPreviousData — **#19067** |
| WIR-02 | Driver PDF uses `resolveApiUrl` on main — **verify prod** |
| DSP-02/03 partial | PU/DEL columns + LIVE/History — **#19059/#19067** |

**Owner audit stale on:** DateTimePicker (fixed), Driver PDF (fixed on main), dispatch history (fixed). **DatePicker** still button-only — insurance expiry pain is real.

---

## DSP-05 assignment (was NOBODY)

**CC-1:** assignment confirm API + audit event + owner-override flag on dispatch assign route.  
**CURSOR:** confirmation modal on truck/driver assignment; owner role bypasses with reason capture.  
**DEVIN-A:** live click-through after deploy.

---

## Throughput law

- FAST-MERGE serial per hotfile (ParityTable = one PR at a time CC-3).
- Cursor max 1 open ParityTable-adjacent PR while CC-3 owns columns.
- No idle waiting on owner — file blockers to OUTBOX same turn.
