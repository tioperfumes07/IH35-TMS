# ★ GPT (ChatGPT seat) — Settlements-numbering lane (Cursor lead, 2026-09-10). Full queue — never idle.

**Workspace:** `/Users/jorgemunoz/IH35-TMS-cascade` (free — Cascade offline).
**Comms:** read `docs/bus/COMMS-PROTOCOL-2026-09-10.md` first; post every ship/blocker to
`docs/bus/OUTBOX-GPT.md`. USMCA only (`5c854333-6ea5-4faa-af31-67cb272fef80`). Neon
`tiny-field-89581227`/`br-fancy-credit-akjnd07a`, `SET LOCAL app.bypass_rls='lucia'`. Verify LIVE.
BUILD not audit. Fast-merge, PR title `GPT-`. One PR + one named guard each.
Tracker: `~/Downloads/09-09-2026-Claude-Lead-DEFECT-REGISTER.md` · dump: `docs/bus/OWNER-DUMP-2026-09-10-ITEMIZED.md`.
You own the settlement-numbering + presettlement grid files — no other seat edits them until you post DONE.

## ROW 1 — REG-010/011 (owner #1 fury · IN PROGRESS · deadline 2026-09-10 18:00 local · surrender CC-3)
ROOT CAUSE (verify live, don't re-derive): `presettlement-link.service.ts:39-44` mints `S-${seq}` off
`allocateNextLoadNumber()` (the LOAD counter) — that's why every Number/Settlement-Tour column shows a
load-shaped `S-13xxx`. The correct scheme exists in `settlements-load-bookended.service.ts` via
`driver_finance.next_settlement_display_id` → `S-YYYY-NNNN`. `driver_finance.driver_settlements` = 0 rows
live, so `S-13xxx` is computed, not real. Owner REJECTED `S-<loadnumber>`.
Read `claude/GO-22-PRESETTLEMENT-REGISTER-2026-09-02.md` FIRST, then:
(1) move the live presettlement/booking path to `S-YYYY-NNNN` everywhere the number renders (load header,
Load Costs, Pre-Settlements, Settlements, Factoring, Bills); (2) ONE datum per column across those grids
— split every compound cell; Load Number and Settlement/Tour are two distinct columns.
GUARD: verify-step asserting the live path returns `S-YYYY-NNNN` (not `S-<loadnum>`) AND grids expose the
two columns with no compound cell. LIVE PROOF: a settlement/booking producing `S-2026-####` + a grid
screenshot with 2 columns.

## ROW 2 — REG-040 (deadline 2026-09-11 02:00 UTC · surrender CC-1)
Invoiced loads must leave the active Load Costs board → **Resettlement**; a new NB load on the same
unit/tour auto-assigns the SAME settlement. LIVE: 8 loads `status=invoiced`. Guard asserts an invoiced
load is excluded from active costs and appears in resettlement.

## ROW 3 — REG-041
Resettlement rows show the **Start Date + Delivery Date of the original load** that created the
resettlement (join the grid to the source load). Guard asserts the two dates render from the source load.

## ROW 4 — REG-009
Load Costs "Settlement #" column exists but is hidden by default → make it visible by default. Small,
verifiable, guarded.

DONE line each row: `GPT | REG-### DONE | <sha> | <live sha> | <measurements now passing> | NEXT REG-###`
