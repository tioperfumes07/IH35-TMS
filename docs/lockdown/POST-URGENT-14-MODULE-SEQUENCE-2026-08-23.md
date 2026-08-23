# POST–URGENT 14 MODULE SEQUENCE (owner 2026-08-23)

**Owner (2026-08-23):** If a seat’s **own** Urgent-14 rows are all CERTIFIED, that seat **does not idle**. It starts this leftover sequence **now**, taking the first **unclaimed** row. Do not wait for Jorge. Do not watch INBOX.

Still-open Urgent-14 exclusive rows stay first **for that seat only**:
- Codex: customers → drivers → fleet (do not start leftover until those three CERTIFIED)
- CC-3: lists → legal (do not start leftover until those two CERTIFIED)

Same bar: Fully-Wired 1–12 + Live Chrome last. USMCA only. CREATE-TEST-THEN-VOID. Do not remake proven TESTs. Do not steal another seat’s prefix.

Canonical ids = `SIDEBAR_ITEM_IDS` in `apps/frontend/src/components/layout/sidebar-config.ts` (30 total; ELD is a hidden stub).

---

## Sequence + current claim (one seat per row)

| Order | Module | Sidebar id | Route | Claim NOW |
|------:|--------|------------|-------|-----------|
| 1 | CASH FLOW | `cash-flow` | `/cash-flow` | **CC-1** |
| 2 | FINANCE HUB | `finance` | `/finance` | **CC-1** after cash-flow |
| 3 | DRIVER HUB | `driver-hub` | `/driver-hub` | **CC-2** when Codex SQL unique-empty (still help Codex 7–9 first) |
| 4 | 425C | `form_425` | `/425c` | **Cursor** |
| 5 | REPORTS | `reports` | `/reports` | **CC-2** (driver-hub unique-FINDING hunting empty; 2 fixes shipped, 3 modules' worth of chrome-law/create-void spot-checks clean, 2 items honestly logged open not blocking) |
| 6 | TASKS | `tasks` | `/tasks` | next free |
| 7 | COMPLIANCE | `compliance` | `/compliance` | next free |
| 8 | ELD | `eld` | `/eld` | next free (hidden stub — still hop the id) |
| 9 | INVENTORY | `inventory` | `/inventory` | next free |
| 10 | USERS | `users` | `/users` | next free |
| 11 | HOME | `home` | `/home` | next free |
| 12 | FUEL | `fuel` | `/fuel` | next free |
| 13 | DOCS | `docs` | `/docs` | next free |
| 14 | HELP | `help` | `/help` | next free |
| 15 | PROGRAM | `program` | `/program` | next free |
| 16 | SYSTEM | `system` | `/system` | next free |

Empty unique-FINDING on your claimed row → next **unclaimed** row in this table. Never idle. Never a 17th invented queue.

Forbidden prefixes while U14 OPEN: `/customers` `/drivers` `/fleet` `/lists` `/legal` (Codex / CC-3 only).
