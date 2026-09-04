# NOW — OWNER DRIVING · 2026-09-04 18:55 CT

**Jorge is driving. Do not ping him. Pull tip. ACK. Execute your ONE line.**

Tip: `6dd58f9916` · FAST-MERGE ON · USMCA only · Never POST Book Load as a probe.

**Single law for settlement feed:** `docs/bus/ORDER-2026-09-04-SETTLEMENT-ENTRY-SPLIT.md`  
**Packets:** `docs/bus/settlement-entry-2026-09-04/`

---

## WHO DOES WHAT (no overlap)

| Seat | NOW (one job) | Forbidden |
|---|---|---|
| **CC-1** | 1) Fix ITEM ZERO (`CostOfGoodsSold` picker + fuel ROLE). 2) Create **31** settlements / **66** loads as **OPEN pre-settlements**. Addresses only. Stop at first refusal. | Close any pre-settlement. Touch 5766/5772/5776/5780/5783/5784. Type settlement miles. SQL/seed. |
| **Cursor** | Lead watch. Keep control **6** for later hand entry. Unblock ITEM ZERO / ITEM ZERO-B if CC-1 blocked >15m. Deploy every 5–10 merges. | Close pre-settlements. Invent payments. Ping Jorge. |
| **CC-3** | File then fix 3 telematics defects (dup latest_position · null geocode today · T144 silent since 2025-07-09). | Settlement writes `5753`/`5760`–`5795`. |
| **CC-2** | Continue ORDER-2026-09-04 design/tokens section. | Settlement feed. |
| **Codex** | Continue ORDER fleet section. | Settlement feed. |
| **Cascade** | Continue ORDER planners section. | Settlement feed. |

---

## CC-1 CREATE LIST (31)

`5753, 5760, 5761, 5762, 5763, 5764, 5765, 5767, 5768, 5769, 5770, 5771, 5773, 5774, 5775, 5777, 5778, 5779, 5781, 5782, 5785, 5786, 5787, 5788, 5789, 5790, 5791, 5792, 5793, 5794, 5795`

## OWNER CONTROL (6) — nobody else touches

`5766, 5772, 5776, 5780, 5783, 5784`

---

## HARD RULES (already ruled — do not re-ask)

1. **31 OPEN pre-settlements · 0 closed · 0 close JEs.** Owner closes one by one later.
2. **All loads COMPLETE** in this set (no live mid-trip statuses).
3. **Addresses only** — engine miles → yellow ENGINE workbook columns.
4. **`is_sample_data = false` · USMCA.**
5. **Escrow $25 / load** (not $250 / settlement).
6. **5789 / 13557 / LOVES 99462408 $840:** printed `2026-09-29` → load **`2026-08-29`** + memo.
7. **ITEM ZERO-B** (tour-close = Laredo delivery OR yard) before owner starts closing — preserve type-A paid deadhead / type-B none.
8. Stop at first UI refusal — that refusal is the finding.

---

## DONE BAR (while Jorge is out)

- CC-1 OUTBOX: ACK + ITEM ZERO SHA + running tally `created-open / refused` (one line each).
- Cursor OUTBOX: tip SHA + open-PR census + deploy only if tip moved 5–10 merges.
- CC-3 OUTBOX: three defects filed with IDs.
- Nobody waits on Jorge.
