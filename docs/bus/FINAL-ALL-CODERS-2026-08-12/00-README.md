# SUPERSEDED · 2026-08-20

Do **not** run this folder. Current: `docs/bus/CODER-INSTRUCTIONS-NOW.md`.

# FINAL INSTRUCTIONS — ALL CODERS · 2026-08-12 (CANONICAL)

**Owner:** present final instructions · every surface · continuous mode · **tmux ping every 15 minutes only**.

**Read order:** this folder → your `PASTE-*.md` → work. Nothing in `_SUPERSEDED-*` / `_ARCHIVED-*`.

---

## Surface bar (NO EXCEPTIONS — entire product)

Every **module** · **tab** · **sub-tab** · **leaf** · **search bar** · **filter** · **gear** · **date/amount range** · **picker** · **Combobox** · **modal** · **popup** · **popup modal** · **side modal** · **side panel** · **drawer** · **ParityDrawer** · **wizard** · **create/nested create** · **every clickable / searchable control** must:

1. Appear on the **module matrix** as a Required leaf (or EXEMPT with reason), and  
2. Pass **chrome design law** below (Wave D / `qbo_chrome`).

Matrix after #6273: ~1057 leaves · §B9 columns (`claim` `work_order` `accident` `policy` `settlement` `legal_matter` `invoice` `bank`). View: `/program/matrix`.

### Chrome design law (system-wide classes)

| # | Law |
|---|-----|
| 1 | No **box-in-box** (Assignment History From/To calendars = known fail) |
| 2 | **QBO calendar** only (shared DatePicker — never native date) |
| 3 | **QBO money** format (shared MoneyInput on all economics) |
| 4 | **Combobox dismiss** — outside click / Esc closes **without** forcing a selection |
| 5 | Filter + **gear → Apply** (+ Cancel/Reset) |
| 6 | Every data list: **Search + range + gear** |
| 7 | **Proportional** modal/side-panel/text density (approved screens) |
| 8 | **Responsive** — laptop / desktop / TV — no clipped chrome |

### Sequence
P10 first → all modules. Waves A→B→C then D chrome. Built ≠ Live. Continuous mode — **never ask “should I continue?”**

### Ping
Cursor lead pings each coder **every 15 minutes only** (tmux for CC-1/CC-2; WAKE+INBOX for Codex/Cursor). Not 5m seat spam.

### Seat files
| File | Seat |
|------|------|
| `PASTE-CC-1.md` | money / GL / MoneyInput |
| `PASTE-CC-2.md` | connectivity / reverse / live chrome sample |
| `PASTE-CODEX.md` | Combobox / Apply / toolbar / box-in-box |
| `PASTE-CURSOR.md` | bus · matrix · responsive · DatePicker · proportions |

