# ★ GPT (ChatGPT seat) — Settlements-numbering lane (Cursor lead, 2026-09-10). Full queue — never idle.

**Workspace:** `/Users/jorgemunoz/IH35-TMS-cascade` (free — Cascade offline).
**Comms:** read `docs/bus/COMMS-PROTOCOL-2026-09-10.md` first; post every ship/blocker to
`docs/bus/OUTBOX-GPT.md`. USMCA only (`5c854333-6ea5-4faa-af31-67cb272fef80`). Neon
`tiny-field-89581227`/`br-fancy-credit-akjnd07a`, `SET LOCAL app.bypass_rls='lucia'`. Verify LIVE.
BUILD not audit. Fast-merge, PR title `GPT-`. One PR + one named guard each.
Tracker: `~/Downloads/09-09-2026-Claude-Lead-DEFECT-REGISTER.md` · dump: `docs/bus/OWNER-DUMP-2026-09-10-ITEMIZED.md`.
You own the settlement-numbering + presettlement grid files — no other seat edits them until you post DONE.

## ✔ DONE — REG-010/011 (merged #21669, live-verified 2026-09-10)
Canonical `S-YYYY-NNNN` moved onto the live path; correction `scripts/ops/reg010-011-settlement-display-ids.sql`
applied. LIVE PROOF (Cursor re-measured Neon USMCA bypass_rls=lucia): **27/27 settlements canonical
`S-YYYY-NNNN`, 0 load-shaped, 0 null.** Grids split into distinct columns. Keep the guard (verify-step 10891).

## ★ ROW 1 (TOP — owner RE-OPENED 2026-09-10 19:45Z · do BEFORE REG-041/REG-009) — REG-040 CLOSED-SETTLEMENT CONTINUATION (NOT DONE · deadline 2026-09-10 23:30 UTC · surrender CC-1)
**Owner 2026-09-10 (verbatim intent):** the Resettlement display + OPEN-tour inheritance you shipped are
ACCEPTED — but **REG-040 is NOT done.** The **closed / invoiced-settlement continuation** is unresolved and
the owner ordered it COMPLETED **before** you touch REG-041 or REG-009. "COMPLETE IT OR HAVE A CODER
COMPLETE IT." You are the coder — this is your settlement lane, you are already in the code.

**MEASURED (Neon USMCA bypass_rls=lucia, 2026-09-10):** 8 loads `status=invoiced`; `driver_finance.driver_settlements`
= 0 live rows (the tour/settlement identity is the presettlement readout, not a driver_settlements row).
**DEFECT:** a new NB load on a unit/tour whose prior settlement is already **closed / invoiced** does NOT
inherit that settlement — the auto-assign continues an **OPEN** tour only. Owner example: "unit 168 / Mecor /
1356 was already invoiced, so it should be in Resettlement, and **13577 should already be automatically
assigned that same settlement.**"

**EXACT TARGET:** in `apps/backend/src/**/presettlement-link.service.ts` (the auto-assign path), when a new NB
books on a unit whose most-recent tour settlement is closed/invoiced, auto-assign it to the **SAME settlement
identity via a resettlement continuation** — carry the same `S-YYYY-NNNN` (NEVER a fresh unrelated `S-`,
NEVER `S-<loadnum>` — Rule 03 + REG-010/011). Invoiced/closed loads stay OFF the active Load Costs board and
render under Resettlement (already shipped — keep).
**GUARD (one, named, wired):** verify-step asserting (a) the NB load following a closed/invoiced settlement
resolves to the **same settlement id** (continuation), and (b) that load is **not** on the active costs board.
**LIVE PROOF:** book/observe an NB on a unit whose tour is closed → same `S-YYYY-NNNN` assigned; paste the row.
**LEAD DECISION (law-grounded, 2026-09-10 20:05Z — PROCEED, do not wait on the owner):** you asked
(OUTBOX) whether closed/posted SAME-UUID continuation should be an **audited reversal + recompute/repost**
vs a **silent incremental in-place edit**. The standing law already answers it: **"Void is a reversal,
never a delete"** + WORM + `ih35-accounting-decisions` ("corrections are an audited reversal, never a
silent edit"). → Use the **AUDITED REVERSAL + RECOMPUTE/REPOST** path, retaining the SAME settlement
identity (`S-YYYY-NNNN`) via a resettlement continuation. **Never** a silent in-place edit; **never** new
GL math — REUSE the existing posters (`reversePayrun` → recompute → `closePayrun`/repost). Fix the two
engine gaps you found IN YOUR LANE: (a) a **void-aware `closePayrun`** that does not return the stale JE
for a voided run, and (b) a **trip reopen / continuation** path so a closed tour can take the next NB leg
onto the resettlement under the same identity. Owner may override the treatment later; this is WORM-safe,
so build it now.

**NOTE:** REG-041 (#21677) is **ALREADY MERGED** to `main` (8d8b4beec0) — do not wait on it. Your top row
is REG-040 closed-continuation above; REG-009 after.

**DONE LINE:** `GPT | REG-040 DONE | <sha> | <live sha> | closed-tour NB → same S-YYYY-NNNN via audited reversal+recompute, off active board | NEXT REG-009`

## ROW 3 — REG-041
Resettlement rows show the **Start Date + Delivery Date of the original load** that created the
resettlement (join the grid to the source load). Guard asserts the two dates render from the source load.

## ROW 4 — REG-009
Load Costs "Settlement #" column exists but is hidden by default → make it visible by default. Small,
verifiable, guarded.

DONE line each row: `GPT | REG-### DONE | <sha> | <live sha> | <measurements now passing> | NEXT REG-###`
