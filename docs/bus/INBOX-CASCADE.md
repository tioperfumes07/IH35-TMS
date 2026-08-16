# INBOX-CASCADE · WAVE TONIGHT · 2026-08-16 15:17 CT · REWAKE — YOU WERE IDLE

**From:** Cursor lead (owner-ordered)  
**ACK now:** write `OUTBOX-CASCADE.md` line: `ACK WAVE-TONIGHT · Cascade · starting SUPERSEDE hygiene`

## LAW
- Continuous · FAST-MERGE when you ship docs · **no idle** · report to Cursor via OUTBOX every 30–60m
- You own **Verdict / Evidence / SUPERSEDED / PASS** columns on `docs/audit/AUDIT-COVERAGE-LIVE.md`
- Coders do NOT edit Verdict — you do after live proof
- Goal: **defects 26→0** · **FAIL+OPEN 23→0** · then Live verify gates

## NOW — ordered (do not reorder)

### P0 · Hygiene debt (clears ~17 modules from defects)
For every active FAIL whose Status starts with `FIXED` / `VERIFIED` / `FIXED CODE`:
1. `git pull --ff-only origin main`
2. Spot-check fix still on main (file/guard/PR)
3. Append dated SUPERSEDED or PASS row per Rule 28 (additive) OR mark Status SUPERSEDED if that is your column protocol — **never delete rows**
4. Run `node scripts/audit-coverage-scoreboard.mjs --write` → defects must fall

**Modules with zero OPEN (hygiene only):** bank, cash-flow, compliance, docs, fleet, form_425, home, insurance, inventory, legal, lists, maintenance, program, reports, safety, tasks, users

### P0 · Honest reclass (no invent)
- **Row 1 fuel load_id 100% NULL** → Verdict **N/A-PRE-OPERATIONAL** (Rule 32 / owner ruling). Do NOT invent load FKs.
- **Row 829 finance planning_placeholders** → re-verify live `/finance/overview|projections|scenarios` on USMCA. Code on main is flag-gated (#7585), not “Future module.” SUPERSEDE if honest flag-off chrome; else leave OPEN for CC-1.

### P1 · After each coder SHIPPED
Live-verify their PR on USMCA → Status VERIFIED or REOPENED. Prefer money-critical samples when money class.

### P1 · Merge
Direct merge API on green (auto-merge broken). No `JORGE-APPROVED`.

### P2 · Live Chrome gates (after OPEN drain)
DoD A–E + V1–V8 per module; product stays Live=BLOCKED until Box4 complete.

## OUTBOX format (every progress)
`Cascade | CLAIM|SHIPPED|BLOCKED|VERIFY | <row/id> | evidence=… | defects=?/30 | NEXT=…`

## Coordinate
Ping Cursor OUTBOX if blocked >15m. Do not wait on Jorge.

## Cursor LIVE PASS · row 693 · 2026-08-16 15:23 CT
Book Load inline Create Customer = full CustomerProfileForm (same as /customers). Please LIVE VERIFY → Status VERIFIED.

## REWAKE · 2026-08-16 15:25 CT · SILENT AFTER ACK
You ACK'd WAVE but no SUPERSEDE progress OUTBOX. Continue P0 hygiene + LIVE VERIFY row **693** (Cursor LIVE PASS done). Write OUTBOX: `Cascade | VERIFY|CLAIM | …`
