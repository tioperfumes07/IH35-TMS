# FINAL — CREATE-PATH TRIP WIRING · 2026-08-12 19:43 CT (CANONICAL)

**SUPERSEDES (do not open):**
- `_SUPERSEDED-2026-08-12/round7-trip-wiring-1943/FINAL-ALL-CODERS-2026-08-12/`
- `_SUPERSEDED-…/MATRIX-COMPLETE-INVENTORY-2026-08-12/`
- `_SUPERSEDED-…/OWNER-CHROME-AND-INVENTORY-LAW-2026-08-12/`
- PR **#6290** (scoreboard Required density — CLOSED)
- Any paste that says “extend Required inventory” / “matrix leaves first” as primary work

**Quality bar (owner Desktop `Claude.docx` = repo `docs/specs/OWNER-QUALITY-COMPACT.md`):**
never guess · never patch · never defer · never claim done without verified wiring · match/surpass QBO/NetSuite/McLeod/Alvys · research + live/repo evidence before recommend.

---

## Product bar (standing)

Trailers (incl. reefers) follow trucks → load · maint · safety · accidents · insurance · docs · reverse.  
On a trip → **load** must link repairs/WO · maintenance · safety/accidents · insurance · fines · fuel · expenses.  
Fuel/trip-cost events cross-link: driver · customer · vendor · unit · trailer · load · AP/bill · expense · GL/JE · invoice · bank · reverse.  
Goal: **P&L by truck** / **cost per trip**.  

**Historical QBO fuel/expense `load_id=NULL` = pre-operational EXEMPT** — never invent FKs. Going-forward create paths must stamp load when on trip.

---

## Correct sequence (ALL SEATS — no deviation)

| Rank | Work | Who | Status |
|------|------|-----|--------|
| **0** | Quality bar + this folder | all | LAW |
| **1** | Accident CREATE param scramble (`$3`→unit) + expense `suggest-load` | Cursor | **DONE #6296** |
| **2** | ClaimCreate `suggest-load` | Cursor | **DONE #6300** |
| **3** | **WO create** submit `trailer_id` / `equipment_id` (+ picker if missing; tires/reefer) | **Cursor** | **NOW** |
| **4** | Schema/API: `fuel.trailer_id` · fuel JE class by unit/load · fuel office POST · `expense.trailer_id` · `accident.trailer_id` · unify active-load resolver | **CC-1** | **NOW** |
| **5** | Live-verify create-path stamps on USMCA after deploy · reverse_link when FKs set · board OPEN for real gaps | **CC-2** | **NOW** |
| **6** | Chrome only on surfaces you touch / non-hotfile classes — **Wave D NOT primary** while 3–5 open | **Codex** | support |
| **7** | Matrix Required density / inventory expansion | — | **FORBIDDEN as primary** until create-paths green |

Waves A→B→C still apply **inside** a real create-path fix (FK + payload + reverse).  
**Scoreboard Required cells ≠ implementation.** Built tags after the write path works.

---

## Read order

1. This README  
2. Your `PASTE-*.md` in this folder  
3. `STATUS-NOW.md` (bus root)  
4. Worktree INBOX  
5. Ship (Claude-green + FAST-MERGE)

**Repo mirror:** `docs/bus/FINAL-CREATE-PATH-TRIP-WIRING-2026-08-12/`

## Ping
15m seat ping only · nudge=OFF while Jorge present · OUTBOX = **one line**.
