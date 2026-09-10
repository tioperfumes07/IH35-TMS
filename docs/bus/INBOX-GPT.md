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

## ✔ DONE — REG-040 CLOSED-SETTLEMENT CONTINUATION (merged #21692 `c03ec09489`, LIVE 2026-09-10 21:05Z)
Lead re-measured: your REG-040 continuation (`settlement-payrun-recovery.service.ts`, ACCT-F6350) is on
`origin/main @ 950bf263` and **live** — `GET /api/v1/healthz/shallow` → `git_sha=950bf263`. Audited
reversal + recompute/repost path landed, closed tours split identity + continued loads handled, 11 tests
pass, 13569/13577 classify under the same settlement. **You are OFF REG-040.**

## ✔ DONE — REG-009 (Settlement # column default-visible) + REG-041 (#21677) — owner confirmed complete 2026-09-10 21:1xZ
Owner relayed: **REG-010/011, REG-040, REG-041, REG-009 all COMPLETE.** Your entire settlement-numbering
queue is drained. Well done — do NOT rebuild any of them.

## ★ ROW 1 (NEW, LIVE TOP) — SETTLEMENTS-MODULE STANDING SWEEP (deadline 2026-09-11 03:00 UTC · surrender Cursor)
Your numbering lane is clean, so widen to a **live BUILD sweep of the whole Settlements module** on the
deployed bundle (`app.ih35dispatch.com` @ `950bf263`, login is live). Walk every left-nav Settlements tab —
Drivers · Profiles · **Pre-Settlements · Settlements · Company Settlements · Settlement Close · Settlement
Disputes** · Cash Advance Requests · Cash Advances · Liabilities · Escrow · Pay Rate Templates · Deductions.
For EACH surface assert (fix in-lane, one PR + one named guard per fix; register cross-lane, don't fix):
1. **Numbering** — every settlement shows canonical `S-YYYY-NNNN` (never `S-<loadnum>`, never a 5-digit load
   number); Company = `CS-YYYY-NNNN`. 2. **Three-date honesty** — incurred/due/paid never conflated; dates
   are the real source-load dates. 3. **One datum per column**, centered + sortable (GLOBAL-TYPE-SIZE-BASELINE).
4. **KPIs real** — every tile a live USMCA number, dash-never-zero, no confident-zero. 5. **No dead control** —
   every button/link resolves; Back arrow present; picker dismisses on outside click. 6. **Settlement Close /
   Disputes actually wired** (owner-flagged surfaces) — not an empty stub pretending to be built.
MEASURE the defect (getComputedStyle/DOM on the named sha, or Neon USMCA bypass_rls=lucia), name file:line +
the rule, ship ONE PR + guard per fix, deploy, re-measure. Post each as a DONE line to OUTBOX.
DONE line: `GPT | SETTLE-SWEEP <surface> DONE | <sha> | <live sha> | <measured pass> | NEXT <surface>`.

<details><summary>REG-040 original brief (kept for audit — DONE)</summary>
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

</details>

## ROW 3 — REG-041 ✔ MERGED (#21677 `8d8b4beec0`) — skip
Resettlement rows show the Start Date + Delivery Date of the original load — already shipped.

## ROW 4 — REG-009
Load Costs "Settlement #" column exists but is hidden by default → make it visible by default. Small,
verifiable, guarded.

DONE line each row: `GPT | REG-### DONE | <sha> | <live sha> | <measurements now passing> | NEXT REG-###`
