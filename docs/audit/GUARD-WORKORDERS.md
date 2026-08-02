# GUARD WORK-ORDERS — the live fix board (read after AUDIT-COVERAGE-LIVE.md, before any block)

**Maintained by GUARD. Purpose: no coder idles.** `AUDIT-COVERAGE-LIVE.md` says WHAT is broken (finding +
live evidence). This board says WHO owns it, the FIX REQUIREMENT + the standard it must meet, and the GUARD
status. Pull the top `OPEN` item in your lane and start — do not wait to be told, do not re-audit a row that
already has an owner here.

## How to use this board

1. Read `docs/audit/AUDIT-COVERAGE-LIVE.md` (the findings) + this file (the assignments + requirements).
2. Take the highest `OPEN` item in **your lane** below.
3. Build to the **Fix requirement** + the cited standard. Author the compliant block (18 git-gate keys, DoD/
   VERIFY, guard with `--selftest`, linkage declaration) — CI enforces it.
4. **Apply on Neon yourself** (you have access; the owner does not hand-run Neon) after the gates pass.
5. Set the audit row `Status = FIXED (PR #nnnn)`. Post the merge sha here + to GUARD.
6. **GUARD verifies** in git (file+line on main, guard wired, deploy sha) + on Neon (posting balanced, linkage
   both-ways, positive control) and flips the row to `VERIFIED`. A coder `FIXED` is a claim until then.

## Lanes

- **CLAUDE CODER** — financial cluster: `accounting.*`/`catalogs.accounts`, migrations, posting/GL, role
  designations, the USMCA chart, the seed battery.
- **CURSOR** — frontend/UI, measurability, docs, non-financial backend, catalog seeds, KPI/parity fixes.
- **CASCADE** — audit writer: finish the Layer-C sweep, re-test the UNVERIFIED D/E rows, design-bar pass.

---

## LIVE BOARD (GUARD updates as shas land)

| Item | Audit row | Layer | Owner | Fix requirement (+ standard) | Block/PR | GUARD status |
|---|---|---|---|---|---|---|
| Fleet KPI parity | 114 | A | Cursor | Shared visibility helper; roster + KPI same predicate; parity guard | #4016 `575aee6eaf` | **VERIFIED** |
| Recovery/parts/fines accounts + 4 designations | — | C | Claude Coder | Contra-expense/never-income (warranty+insurance, ASC 450 cap-at-loss); parts separate from R&M; fines non-deductible; entity-scoped | #4015 `d49918608d` | **VERIFIED** |
| Book Load inline "+Add customer" native-GET | 113 | D | Claude Coder | Surgical: un-nest the 4 drawer `<form>`s → `type=button` + `onClick`; restore Enter via `onKeyDown`; class guard. Do NOT bundle the ParityDrawer portal (separate audited PR) | FIX 2 | in flight |
| Driver default drift | (FIX 1) | — | Claude Coder | Keep Probation default; change BACKEND default to Probation (match UI); show "not assignable — Probation" reason in picker + detail; do not touch the Active gate | pending build | approved |
| USMCA `damage_recovery` → COGS-5400 repoint | 11 | C | Claude Coder | Create USMCA "Driver Accident Damages & Repairs" contra account; repoint off 5400; NOT the inactive Income acct | Task 3 | owner-gate → building |
| USMCA chart gaps (fuel/tolls/lumper/pay/escrow, 42xx revenue) | — | C | Claude Coder | Mirror TRANSP by purpose; entity-scoped (never FK a TRANSP acct); 4210/4220/4230/4240 + 6 revenue maps 1:1; fix NULL account_number on USMCA Insurance Expense | Task 3 | building |
| Bills `mdata_vendor_id` NULL ×2 | 3 | C | Claude Coder | Backfill the 2 remaining to canonical vendor hub; additive | — | OPEN |
| Fuel GL-dark / `load_id` NULL 1,547 | 1, 122 | B/C | Claude Coder | Categorize Relay fuel via the workflow (owner-adjacent); each diesel expense FKs a load (G18) | — | OPEN |
| Banking all-accounts aggregate | 2 | E | Cursor | Reproduce the surface + filter that must equal per-account sum; fix the aggregate view | — | OPEN |
| Inventory category picker empty | 25 | D | Cursor | Seed `catalogs.parts` category source; picker renders + persists | — | OPEN |
| ParityTable resize hit-target | 57 | A | Cursor | Discoverable resize affordance (grip/cursor); UX polish | — | OPEN (minor) |
| 7 pickers "D UNVERIFIED" | 19–23,26,55 | D | Cascade re-test | EXERCISE the inline +Create live (fill→save→persist, no native GET); after FIX 2. Code-wired ≠ verified (see §2-D note) | — | UNVERIFIED |
| 28 E design-bar UNVERIFIED | 27–54 | E | Cascade | Interactive per module: resize works+discoverable, proportions, QBO filters, box-in-box, drawer-on-drawer; per entity | — | UNVERIFIED |
| 11 modules UNVERIFIABLE-until-data | (C rows) | C | seed → GUARD | Become real PASS/FAIL once the seed battery posts transactions; GUARD verifies each JE | — | UNVERIFIED |

---

## §2-D NOTE (do not let this class come back)

The Layer-D test is the **inline +Create inside a picker/wizard** — it must be **exercised** (click, fill, save,
confirm the row persists to the canonical table and appears selected, with NO native GET). It is NOT satisfied by:

- "the code is wired to POST" — the Book Load customer create *was* wired to `createCustomer()`, but a nested
  `<form>` HTML5-drop meant the POST never fired. Code inspection is the exact false signal.
- a `created_at` row from a **module-level** create modal — that proves the module create works, not the
  inline-picker create. They are different code paths (the module modal is not inside a wizard `<form>`).

Until an inline +Create is actually exercised and confirmed to persist, its row is `UNVERIFIED`, never `PASS`.

## The gate

Only **GUARD** writes `VERIFIED`, after independent live re-check (git for code, Neon for data, the app for UI).
Governed by `docs/audit/AUDIT-LAW-PERMANENT.md` (order C→B→A→D→E; a screenshot is not a Layer-E pass; "complete"
= 30/30 certified only).
