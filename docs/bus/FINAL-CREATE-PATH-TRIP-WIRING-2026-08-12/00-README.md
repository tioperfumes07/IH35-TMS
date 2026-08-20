# SUPERSEDED · 2026-08-20 — use `docs/bus/CODER-INSTRUCTIONS-NOW.md`

# FINAL — CREATE-PATH TRIP WIRING · 2026-08-12 20:15 CT (CANONICAL)

**SUPERSEDES (do not open):**
- Prior 19:43 reading of this folder that put **CC-2 Live prove in parallel with unfinished wiring** (owner correction 20:12 — that was a plan drift)
- `_SUPERSEDED-2026-08-12/round7-trip-wiring-1943/FINAL-ALL-CODERS-2026-08-12/`
- MATRIX-COMPLETE-INVENTORY · OWNER-CHROME packets · PR **#6290**

**Quality bar:** Desktop `Claude.docx` = `docs/specs/OWNER-QUALITY-COMPACT.md`

---

## ★ OWNER SEQUENCE (LOCKED — do not re-order)

> **Finish ALL true create-path trip wiring first (Built = 100% for this class).**  
> **Live verify ONLY AFTER that gate — not interleaved.**

This is Wire-First law. Scoreboard Required ≠ Built. Chrome (Wave D) last.

---

## Product bar

Trailers (incl. reefers) follow trucks → load · maint · safety · accidents · insurance · docs · reverse.  
On a trip → load links repairs/WO · maint · safety · insurance · fines · fuel · expenses.  
Fuel/trip-cost ↔ driver · customer · vendor · unit · trailer · load · AP · expense · GL/JE · invoice · bank · reverse.  
Historical QBO `load_id=NULL` = EXEMPT — never invent FKs.

---

## Ranked work (wire phase → then Live gate)

| Rank | Work | Who | Status |
|------|------|-----|--------|
| **0** | This sequence + Claude.docx | all | LAW |
| **1** | Accident CREATE `$1…$6` + expense `suggest-load` | Cursor | **DONE #6296** |
| **2** | ClaimCreate `suggest-load` | Cursor | **DONE #6300** |
| **3** | WO create `equipment_id` (trailer picker) | Cursor | **DONE #6303** |
| **4** | `fuel.trailer_id` · fuel JE unit/load · fuel office POST · `expense.trailer_id` · `accident.trailer_id` · unify suggest-load | **CC-1** | **WIRE NOW** |
| **5** | Cursor FE after CC-1 schema: expense/accident trailer pickers + any remaining create-path FE | **Cursor** | after #4 lands |
| **6** | Wave B reverse_link / connectivity **Built** on create-path surfaces (code+API+guards — not Live certify) | **CC-2** | **WIRE NOW** (support) |
| **7** | Codex: create-surface / non-hotfile FE only | Codex | support |
| **8** | **LIVE VERIFY GATE** — USMCA create→stamp→Neon→reverse for full create-path class | **CC-2** | **BLOCKED until ranks 1–7 Built 100%** |
| **9** | Matrix Required density as primary | — | **FORBIDDEN** |

**Forbidden drift:** starting Live prove / Box-4 certification while fuel/expense/accident trailer schema or remaining Built reverse hops are still open.

---

## Read order

1. This README  
2. Your `PASTE-*.md`  
3. `STATUS-NOW.md`  
4. Worktree INBOX  
5. Ship

Repo: `docs/bus/FINAL-CREATE-PATH-TRIP-WIRING-2026-08-12/`
