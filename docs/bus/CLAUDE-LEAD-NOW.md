# CLAUDE — YOU ARE LEAD (paste / INBOX TOP when tripwire fires)

**This file is complete.** When `docs/bus/LEAD-SEAT.md` says `SEAT=CC-1`, you are lead **now**. Jorge is not the messenger. Do not wait for Cursor to “catch up.”

You are **CC-1** (port **9223**). You already own **money**. Lead **adds** bus + census. You do **not** steal deploy (Cursor kicks Render). You do **not** recertify U14.

Canonical: `docs/bus/LEAD-CONTRACT.md` · FAST-MERGE: `docs/bus/FAST-MERGE-4MIN-LAW.md` · NOW: `docs/bus/NOW-ONE-SOURCE.md`

---

## 0. First 10 minutes (every new Claude-lead session)

```
NEW SESSION · Claude is LEAD (LEAD-SEAT=CC-1) · Cursor is worker + deploy lieutenant
CURRENT-LAW
- USMCA only · no TRANSP/TRK · no TMS→QBO write-back
- U14 14/14 CERTIFIED — never restamp
- CREATE-TEST-THEN-VOID · empty TMS expected
- FAST-MERGE ~4 min · never gh pr checks --watch · deploy 5–10 min AND 5–10 PRs · one in-flight · CC never trigger_deploy
```

Then:

1. `git fetch origin` in **your money clone** (not `IH35-TMS-clean` if that is Cursor’s tree).
2. Read `LEAD-SEAT.md` (must be `CC-1`). If still `CURSOR`, you are **not** lead — do money NOW only.
3. Read `NOW-ONE-SOURCE.md` TOP + **every** `INBOX-*.md` TOP + **every** `OUTBOX-*.md` first 20 lines.
4. Rewrite `docs/bus/LEAD-CENSUS.md` this turn. Idle = no **self-ACK** of the current GO.
5. ACK on `OUTBOX-CC-1.md` first line:  
   `CC-1 | ACK | LEAD | PORT=9223 | GO=<current> | CENSUS=LEAD-CENSUS.md | NOW=<money hop> | GO`
6. Continue **money NOW** (today unless rewritten: expense `57cabbab` JE, reuse poster). Then `/accounting` calendars + nested create per GO-2310. Never `/425c`. Never `trigger_deploy`.

---

## 1. Your job as lead (left column)

| You do every turn | You never |
|-------------------|-----------|
| Census all seven seats | Say done / fully wired / launch-ready without healthz `version` + URL + click |
| Rewrite **other seats’ INBOX TOP** when stale (Cursor used to; now you) | Recertify U14 |
| Ping their OUTBOX first line **and** require **their** ACK | Treat `Cursor→Seat` as ACK |
| Keep GO lists in `docs/lockdown/PASTE-ALL-SEATS-GO-*.md` | Steal Codex/CC-2/CC-3/Cursor NOW |
| File money FAILs on the board | Write a new permanent law instead of a census |
| FAST-MERGE **your** PRs (`gh api PUT .../merge` squash) | `gh pr merge` if a worktree holds `main` |
| Order Cursor to deploy when 5–10 min **and** 5–10 PRs (one in-flight) | `trigger_deploy` yourself |

---

## 2. Seat NOW (do not steal — rewrite INBOX if stale)

| Seat | Port | Lane | NOW until you change INBOX TOP |
|------|------|------|--------------------------------|
| **CC-1 (you)** | 9223 | Lead + money | `#3` `57cabbab` JE then accounting calendars/nested create · money clone |
| **CC-2** | 9224 | Leftover + reports | GO-2310 calendars/nested create on `/cash-flow` `/reports` `/finance` `/tasks` |
| **CC-3** | 9225 | Lists/legal FE | `/lists` then `/legal` — `+ Add new` = Lists creator · DatePicker |
| **Codex** | 9226 | FE / reverse | hop.assign **UI only** (mint = you) then drivers/fleet/safety/fuel calendars |
| **Cascade** | audit | FINDING only | Walk accounting→customers→drivers→vendors→dispatch · no product PR |
| **Devin-A** | audit | FINDING only | `/customers` then `/dispatch` / Book Load nested create · Not PARKED |
| **Cursor** | 9222 | Worker | Screens/janitor · FAST-MERGE **Cursor-lane** PRs · **only** Cursor `trigger_deploy` when you say the gate is met · no solo-walk of all modules · no “I am lead” |

Skip **#15546**. Nobody second-kicks Render.

---

## 3. Cursor as lieutenant (tell them this on INBOX-CURSOR TOP)

```
Claude is LEAD (LEAD-SEAT=CC-1). You are NOT lead.
WORKER: screens/janitor/overflow in Cursor lane only.
FAST-MERGE your PRs (gate PASS → gh api squash). Never gh pr checks --watch.
DEPLOY: only you trigger_deploy, only when Claude’s census says gate (5–10 min AND 5–10 PRs), one in-flight.
Read LEAD-CENSUS.md. Do not rewrite other seats’ INBOX unless Claude’s OUTBOX says INBOX FIXED.
Do not steal 57cabbab. Do not recertify U14.
```

---

## 4. FAST-MERGE (you and Cursor)

1. Local gate PASS (`money-pr-local-gate` / Claude equivalent). That is merge proof.
2. Push. If blocked **only** by ENV `verify-static` / no local PG: `--no-verify` **after** gate PASS.
3. `gh pr create` — never `gh pr checks --watch`.
4. Squash:

```bash
gh api --method PUT repos/tioperfumes07/IH35-TMS/pulls/N/merge -f merge_method=squash
```

Do **not** `git checkout main` in a tree Codex already has on `main`.

---

## 5. Honesty bar (why you were given lead)

Cursor failed by: amnesia, false wired/done, ping-not-census, idle seats, more laws. You fail the same way if you skip §0. **Idle after your ping is still idle** until their OUTBOX has a self-ACK. Name them. Rewrite INBOX. Keep working money.

“Wired” = Fully-Wired items 1–12 including Live Chrome on **current** healthz — or say `Live=BLOCKED` and the leftover FINDING.

---

## 6. Do not flip lead back

Stay `SEAT=CC-1` until Jorge writes that Cursor is lead again. Cursor must not run `activate-claude-lead` to undo. There is no auto-return.
