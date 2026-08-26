# LEAD CONTRACT — stop false done, idle seats, amnesia (owner 2026-08-25 23:32 CT)

This is the **job**, not a privilege. Cursor keeps the seat only while this contract is executed **every lead turn**. Break it once after this file is on `origin/main` → **activate Claude lead the same turn**. Do not ask Jorge. Do not write another law.

Canonical packet (already written): `docs/bus/CLAUDE-LEAD-NOW.md`  
Who is lead: `docs/bus/LEAD-SEAT.md`  
Census: `docs/bus/LEAD-CENSUS.md`  
Activate: `node scripts/ops/activate-claude-lead.mjs --reason="<T#>"`

---

## 1. What lead is

| Lead owns | Lead does not own |
|-----------|-------------------|
| Read **all** `INBOX-*` TOP + **all** `OUTBOX-*` first 20 lines **before** product claims | Being the smartest model |
| Rewrite INBOX TOP when stale | CC-1 money / GL / JE / migrations |
| Name idle seats with evidence (no self-ACK of **current GO**) | Cascade/Devin-A product PRs |
| FAST-MERGE (Cursor while `SEAT=CURSOR`) | Saying done / wired / launch-ready |
| One in-flight deploy; CC never `trigger_deploy` | Recertifying U14 |
| Overflow in **Cursor lane only** | Stealing another seat’s NOW |

Claude/ChatGPT/Codex as **lead** means they own the **left column**. It does not mean they write all the code.

---

## 2. Every lead turn (mandatory, before other work)

1. `git fetch origin` (do not `checkout main` if Codex holds it).
2. Read `LEAD-SEAT.md`. If `SEAT=CC-1`, **stop leading**. Follow Cursor worker lines in `CLAUDE-LEAD-NOW.md`.
3. Read `NOW-ONE-SOURCE.md` first 15 lines + `INBOX-<this-seat>.md` TOP.
4. Read **seven** OUTBOXes first 20 lines: CC-1, CC-2, CC-3, Codex, Cascade, Devin-A, Cursor.
5. Write `docs/bus/LEAD-CENSUS.md` with **this turn’s** table (replace the table, keep the header).
6. User-visible reply **must** include that census (or a one-line pointer that the file was updated **this turn** with idle named).
7. Then overflow code **only** if the census is done and the item is in-lane.

**Self-ACK** = a line **authored by that seat** (`CC-1 | ACK | …`, `Codex | WORKING | …`) whose GO id matches **current** NOW (today: GO-2310, else the TOP GO). A `Cursor→Seat` ping is **not** an ACK.

---

## 3. Forbidden claims (false green)

Do **not** say: done, complete, fully wired, launch-ready, CERTIFIED, all seats working, wired correctly — unless **all** of these are in the **same** message:

- live `GET https://api.ih35dispatch.com/api/v1/healthz/shallow` → `version`
- named URL
- what was **clicked** (or Neon row with RLS discipline)
- leftover unique still OPEN named, or honest **none found this hop**

CI-green, route exists, prior stamp, scoreboard Built ≠ proof.

Empty TMS is expected. CREATE-TEST-THEN-VOID. U14 14/14 never restamp.

---

## 4. Tripwire (any one → Claude lead same turn)

After this file is on `origin/main`, **any** of these is “doing this once more”:

| ID | Trigger |
|----|---------|
| **T1** | Owner says idle seats / you did not check INBOX/OUTBOX / false done or wired / forget / deviate / not trustworthy / cannot launch — and this turn has **no** fresh census |
| **T2** | Lead turn with product work or “seats are working” **without** reading all seven OUTBOXes |
| **T3** | Claim done / wired / launch-ready / CERTIFIED without SHA + URL + click in the same message |
| **T4** | Ping seats and treat that as coordination (no census of **self-ACK** vs ping) |
| **T5** | Write a new permanent rule/law instead of a census or a FINDING on the board |
| **T6** | End a turn without naming idle seats when any OUTBOX has no self-ACK of the current GO |

**Action (automatic, no Jorge):**

```bash
node scripts/ops/activate-claude-lead.mjs --reason="T#"
```

That script **is** writing Claude’s lead instructions onto INBOX-CC-1 TOP (full packet already in `CLAUDE-LEAD-NOW.md`). Then FAST-MERGE the bus files. Cursor’s next lines are **worker**, not lead.

Do not invent a 16th plan. Do not recertify U14. Current product NOW stays GO-2310 / `NOW-ONE-SOURCE.md` until Claude rewrites it.

---

## 5. What this contract does **not** do

It does not make Cursor honest by itself. It makes the **next** failure change the seat instead of adding another markdown file. If Claude-as-lead then fails the same class, Jorge replaces the lead **person** in chat; do not auto-flip back to Cursor without his sentence.
