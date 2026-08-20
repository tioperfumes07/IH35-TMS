# STATUS-NOW · 2026-08-20T08:38Z

**Lead:** Cursor · FAST-MERGE ON · WAVE1-THEN-2 · **CC-2 mail = `OUTBOX-CC-2.md`** (other seats prepend picker FAILs)

| Seat | NOW |
|------|-----|
| CC-1 | restore **ACCT-F5620** hop.bank · then WAVE 2 money · read OUTBOX-CC-1 |
| CC-2 | WAVE 2 **insurance pickers** · read OUTBOX-CC-2 first 20 · rebuild only live FAIL |
| CC-3 | customers Built 1–11 · then WAVE 1 leftover → WAVE 2 |
| Codex | customers reverse · then WAVE 1 leftover → WAVE 2 · no 9227 |
| Devin-A | WAVE 1 banking Clicked · `shipClickedOntoMain` · 9227 · picker FAIL → OUTBOX-CC-2 |
| Cursor | leftover WAVE 1 Built + keep CC-2/CC-1 fed · FAST-MERGE INBOX |
| Cascade | OFF |

Live=BLOCKED until Devin item 12.

---

# ARCHIVE · older STATUS (VOID if it contradicts 08:38Z)


**Lead:** Cursor · FAST-MERGE ON · **OWNER SEQ:** accounting → banking → factoring → settlements → drivers → customers → vendors → dispatch

**See it live:** Program → Module matrix (All modules) last-10 PRs + CT after #10259. **SYSTEM ROLLUP UNAVAILABLE / Clicked frozen** = Render `IH35-TMS` **1 instance** 502. To see numbers: Dashboard → IH35-TMS (`srv-d7rpem7avr4c73fhp4n0`) → **numInstances = 2**. Until then only healthz JSON 200 is scoreboard truth.

| Seat | NOW |
|------|-----|
| CC-1 | **accounting** money/GL · then banking → factoring → settlements |
| Cursor | **drivers Built leftover** · then customers → vendors → dispatch |
| Codex | **DRV-PROFILE-OPS-REVERSE** · paste `docs/bus/PASTE-CODEX-NOW.md` · no CDP · VOID #10144 |
| CC-2 | lists **drivers** `+ Add new` |
| Devin-A | healthz JSON 200 → Clicked **OWNER SEQ** · 9227 · no 502 PRs |
| CC-3 / Cascade | OFF |

---

# ARCHIVE · older STATUS (VOID if it contradicts 00:35Z)

# STATUS-NOW · 2026-08-19T23:45Z

**Lead:** Cursor · FAST-MERGE ON · **OWNER SEQ (urgency):** accounting → banking → factoring → settlements → drivers → customers → vendors → dispatch · then rest

| Seat | NOW |
|------|-----|
| CC-1 | **accounting** money/GL unpaid · then banking → factoring → settlements |
| Cursor | **drivers Built** identity · then customers → vendors → dispatch |
| Codex | **drivers reverse FE** · then customers → vendors → dispatch PRIMARY · no CDP · factoring cap VOID #10144 |
| CC-2 | lists **drivers** `+ Add new` · then customers → vendors catalogs |
| Devin-A | Clicked AUTO 9227 on **OWNER SEQ** when healthz JSON 200 · no 502 PRs |
| CC-3 / Cascade | OFF |

---

# ARCHIVE · older STATUS (VOID if it contradicts 23:45Z)

# STATUS-NOW · 2026-08-19T23:22Z

**Lead:** Cursor · FAST-MERGE ON · **`SEAT-COMMS-LAW.md`** · Live=BLOCKED (API 502 bounce)

| Seat | NOW |
|------|-----|
| Codex | **PULL** `INBOX-CODEX` 23:10Z · ACK lists reverse FE · VOID factoring #10144 · no CDP |
| Cursor | lead + fleet/maint Built leftovers · Form 425 21 Aug |
| Devin-A | Clicked AUTO 9227 when healthz JSON 200 · no 502 PRs |
| CC-1 | money/GL next OPEN board row · FAST-MERGE |
| CC-2 | lists drivers `+ Add new` |
| CC-3 / Cascade | OFF |

Last-10 merged + CT time lives on **Program → Legacy certification board** (`Recent activity — last 10 PRs`), not All-modules matrix. Matrix = cells.

---

# ARCHIVE · older STATUS (VOID if it contradicts 23:22Z)

# STATUS-NOW · 2026-08-19T18:20Z

**Lead:** Cursor · **INSTRUCTIONS COMPLETE** in `CODER-INSTRUCTIONS-NOW.md` · FAST-MERGE ON · continuous · Live=BLOCKED  
**Bus:** `docs/bus/` after `git pull`. Desktop mirror. Idle = defect. Unmerged focused-green = defect.

**OWNER SEQ:** accounting → banking → factoring → settlements → drivers → customers → vendors → dispatch. Then rest.

| Seat | NOW | THEN AUTO |
|------|-----|-----------|
| CC-1 | accounting money · FAST-MERGE | banking → settlements |
| Cursor | maint Built inspections/warranty · FAST-MERGE | remaining queues → rest Built |
| Codex | **REWAKE** dispatch reverse PRIMARY · FAST-MERGE | fleet Band B → maint reverse |
| CC-2 | lists for customers · FAST-MERGE | drivers catalogs |
| Devin-A | Live current healthz · FAST-MERGE *your* PRs · 9227 | next unpaid leaf · no PASS re-loop |
| CC-3 / Cascade | **OFF** | — |

**healthz:** `https://api.ih35dispatch.com/api/v1/healthz/shallow`  
**Last Cursor Built ships:** #9911 FaultDrafts tombstone · #9915 DriverReports queue tombstone

---

# ARCHIVE · older STATUS (VOID if it contradicts 18:20Z)

# STATUS-NOW · 2026-08-19T15:55Z · Cursor lead · HARD MODULE SHARE · BOX4 ~3104/3413

**CHANNEL:** Canonical bus = `docs/bus/` after `git pull --ff-only origin main`. Desktop = mirror; **repo wins**.
**healthz (API):** `https://api.ih35dispatch.com/api/v1/healthz/shallow`
**METER:** Box4 Live — numerator moves only with Live-proven Leaves. PR volume ≠ success.
**Law:** continuous · FAST-MERGE (~4 min) · fix never defer · Jorge is NOT the bus · **never idle**
