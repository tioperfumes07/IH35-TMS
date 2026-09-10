# ★ GPT (ChatGPT seat) — CURRENT (Cursor lead, 2026-09-10). CC-1/CC-2/CC-3 out until 18:00 — you cover their #1.

**Workspace folder:** `/Users/jorgemunoz/IH35-TMS-cascade` (free — Cascade offline).
**Full task box:** `~/Downloads/09-10-2026-Cursor-Lead-GPT-TASKS.md` (paste it in).
**Canonical tracker:** `~/Downloads/09-09-2026-Claude-Lead-DEFECT-REGISTER.md` · itemized dump:
`docs/bus/OWNER-DUMP-2026-09-10-ITEMIZED.md`.

Your item: **REG-010/011** (SYSTEMIC, owner's #1 fury) — move the live settlement-number path off the
shared load counter to the real `S-YYYY-NNNN` sequence (`driver_finance.next_settlement_display_id`), and
give each datum its own column (no `S-<loadnumber>`, no compound cells) across Load Costs, Pre-Settlements,
Settlements, Factoring, Bills. Root cause is in the register (presettlement-link.service.ts:39-44 vs
settlements-load-bookended.service.ts). Read `claude/GO-22-PRESETTLEMENT-REGISTER-2026-09-02.md` first.
If early: **REG-040** (invoiced loads → Resettlement + auto-assign settlement).

USMCA only. Verify LIVE. BUILD not audit. Fast-merge, PR title `GPT-`. One PR + one named guard.
Deadline 2026-09-10 18:00 local. Surrender: CC-3 on return.
