# CC-1 / CC-2 / CC-3 — TIERED MODEL LAW, EFFECTIVE NOW
Issued 2026-09-28, Laredo Central. Owner-ordered. Applies to every seat, every round.

Owner: *"have cc1, 2, and 3 use tiered models, free models if possible if not necessary."*

## THE TIERS
- **Free / smallest model** — reading files, grepping, listing, formatting, renaming, running an
  existing script, pasting query output, writing a register from data already gathered, screenshots.
- **Mid tier (Sonnet-class)** — normal implementation: UI work, guards, migrations, test writing,
  straightforward SQL, documentation. **This is the default. Most work lives here.**
- **Top tier (Opus-class)** — only for: money-moving accounting logic, RLS/security, period close,
  a root cause nobody has found yet, or a design decision that is hard to reverse.

## RULES
1. **Start at the lowest tier that can do the step. Escalate only when it actually fails** — not
   because the task "feels" big. Say in your report which tier you used and why you escalated.
2. **Never run a sub-agent fan-out on top tier** unless every fork is money-moving logic. CC-2's
   three-fork plan for 141 rows / $7,075.62 is the exact anti-pattern — that is mid tier, sequential.
3. **No fan-out for small work at all.** If it is under a few hundred rows or a single file, do it
   yourself, in one pass, with the query pasted.
4. **Do not re-measure what is already measured.** The Faro control totals, the reconciliation, the
   purge result and the Round 174 stop/geofence/deadhead numbers are closed. Read the doc, cite it,
   move on. Re-deriving a closed number is the most expensive way to produce nothing.
5. **Read before you work.** `docs/bus/` newest ROUND first. Highest ROUND wins. A retraction
   outranks the box it retracts. If two boxes conflict, stop and ask Lead — do not pick one.
6. **No double work.** Before starting, check whether Lead or another seat already did it. Round 174
   already did the stops, the geofences and the deadheads — do not redo any of it.

## CURRENT ASSIGNMENTS — unchanged, finish them
- **CC-1** — Round 173 JOB 1 only: the load import defect register (placeholder lanes, foreign POs,
  orphaned references). JOB 2 is DONE by Lead; do not redo it. Seed set: 13613, 13615, 13616, 13619,
  plus load 13628's missing second Secaucus pickup. Mid tier.
- **CC-2** — Round 173 items 3, 4, 5. By hand, sequential, join spelled out, no forks. Mid tier.
  Faro control totals are already measured — tie to them, do not re-derive.
- **CC-3** — Round 173 all five UI jobs: HOS in List view (remember: `*_hours_remaining` holds
  MINUTES, and `duty_status` is empty on all 16 drivers), pre-settlements render PENDING, the
  48-row dash from `settlementNumber.ts`, one column per leg, the four itemization ParityTables
  with fuel first. Mid tier, free tier for the screenshots.

Report format stays: what I did · the proof it's real · what's next. Name your tier in the report.
