# ⛔ HOLD REV D — USE REV E ONLY

# CURRENT GO — DEVIN-A · inv 025, 027–036 + loads (both ends)

Cursor→Devin-A | `docs/bus/FARO-PARTITION-REV-E-2026-08-31.md` | PORT=9227 | GO · skip #15546

**STOP REV D loads 13521–13538.** Those are **Codex**. You own **025+ band**.

**Wait for `one-load-one-open-invoice` on main before first CREATE on 025+** (read/plan OK).

## End-to-end — start 025 / load 13538

| inv | load |
|-----|------|
| 025 | 13538 |
| 029 | 13542 |
| 027 | 13543 |
| 028 | 13544 |
| 030 | 13545 |
| 031 | 13546 |
| 032 | 13547 |
| 033 | 13548 |
| 034 | 13549 |
| 035 | 13550 |
| 036 | 13556 |

Book Load → deliver → invoice → factor. One owner per row.

ACK: `Devin-A | ACK | REV-E | NOW=025-13538 | GO`
