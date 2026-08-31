# BUS DIET LAW — TOKEN COST CONTROL — 2026-08-31

**OWNER DIRECTIVE:** cut bus overhead to only what is necessary. Money is finite.
**Cursor owns enforcement. Effective immediately.**

Canonical paste: `GO-E2E-2026-08-31/14-BUS-DIET-LAW-COST-CONTROL.txt` (also mirrored under `docs/bus/`).

## Where the money actually goes

GitHub Actions minutes are **FREE** (public repo, unlimited). **CI is NOT the bill.**

**THE BILL IS AI TOKENS.** Every seat that wakes reads its INBOX and often the OUTBOXes.
A 15,816-line file is ~200k tokens **per read**, × seats × wakes/day. That is Claude
subscriptions, Devin ACUs, Cursor usage. Reducing bus **SIZE** and bus **WRITES** is the
single biggest cost lever available.

## The five rules

### RULE 1 — OUTBOX files are capped at 200 lines

An OUTBOX is a **working log**, not an archive. Keep the most recent entries only.
Everything older moves to `docs/bus/archive/OUTBOX-<SEAT>-<date>.md` **once**.
**NO SEAT EVER READS `docs/bus/archive/`.** Nothing is deleted — WORM preserved, out of
the read path.

### RULE 2 — No commit for a message that says nothing new

`LEAD-TICK`, census, wake, rewake, ACK, "still idle", "no delta", "seats dead" are
**BANNED** as standalone commits. A status post is only allowed when **STATE CHANGED**:
a chain step passed or failed, a defect was found, a decision is needed from the owner.
If nothing changed since the last post — **do not post**.

### RULE 3 — Seats read their own INBOX top block only

Read the **current GO** at the top of your own INBOX. Do not read other seats' OUTBOXes
unless grading a specific claim (then read only those lines). **CC-2** is the only role
that reads across seats, and only targeted.

INBOXes stay **under 40 lines**. Superseded GOs are **deleted**, not stacked.

### RULE 4 — One bus commit per seat per hour, maximum

Batch updates. Exception: P0 / stop-the-line findings post immediately.

### RULE 5 — Code and evidence always beat paperwork

If a seat's last 3 commits are all docs-only, it is off-task. Cursor stops it and
reassigns to a chain. Target: docs-only share of merges **under 25%**.

## What stays — do not over-cut

**KEEP:** findings with evidence, defect filings, tie-out OBSERVED records, owner
decisions, laws, GO specs, CC-2 verification records.

**CUT:** heartbeats, censuses, wake-ups, ACKs, "no change" posts, stacked superseded GOs.

**Test:** would this line matter to a CPA, an auditor, or the owner in six months?
If yes → stay. If it only says a seat was awake → cut.

## Cursor's own lane

Hourly owner report = **5 lines in chat**, not a commit.
`STATUS-NOW.md` and `LEAD-CENSUS.md` are **overwritten in place**, never appended.

## Measure it (daily owner report — not a commit)

| Metric | Target |
|--------|--------|
| total `docs/bus/` line count (excl. `archive/`) | under 2,000 preferred for hot files; GO specs may remain |
| docs-only share of merges | under 25% |
| LEAD-TICK count | under 10 |

If those three are not falling, this law is not being followed.

## Presence

Enforced by Cursor lead practice + `scripts/verify-bus-diet-outbox-cap.mjs` (local / future verify-step).
