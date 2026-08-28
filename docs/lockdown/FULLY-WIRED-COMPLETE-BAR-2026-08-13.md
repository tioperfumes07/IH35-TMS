# FULLY WIRED = COMPLETE BAR (owner-locked 2026-08-13 — PERMANENT)

**Answered = closed. Do not re-ask. Do not soft-read.**

**Who this is for:** the owner (non-engineer) and every coder (Cursor · Codex · CC-1 · CC-2 · Cascade · GUARD).

**Authority:** This file is the mandatory meaning of **“fully / completely wired.”**  
If a coder says “yes, that includes all” or “wired” or “done” without completing **every numbered item below** for the leaf/module in scope, that answer is a **defect**.

**Companions (do not replace — MORE PROTECTIVE wins):**  
`DEFINITION-OF-DONE.md` · `PER-PR-CHECKLIST.md` · `EVERY-PR-AUDIT-CHECKLIST.md` · Full Audit Law (DoD A–E + VERIFY 1–8) · `VERTICAL-WIRING-LAW-2026-08-12.md` · `MODULE-MATRIX-SCOREBOARD-LOCKED.md` · `IH35-FULL-SYSTEM-AUDIT-SPEC.md`

---

## Owner one-liner

> **Fully wired** means: you can create the thing in the real app, it saves to the real database table, money posts (or honestly holds) when owed, every related screen links both ways, **every** button/search/filter/picker/modal on that surface is on the matrix, chrome looks/behaves like serious QBO/McLeod software — **and only then** someone clicks through it live in Chrome on production and proves it.  
> **CI green · scoreboard Built · `@matrix-built` · “almost all green” · module N-of-M alone = NOT fully wired.**

---

## THE MANDATORY LIST (in order)

Every fix, wiring PR, creator, money path, or module close must cover **all applicable items**. Skip only with an explicit `N/A (reason)` that a hostile reviewer accepts — never silent skip.

### 1. Real place in the product
- Tab · sub-tab · leaf exists on the approved design.
- Route is live (not ComingSoon twin / dead dual-path).
- Operator can open it from nav.

### 2. Create / save writes the canonical table
- Wizard / `+ Create` / `+ Book` / nested create saves to the **real** table (never a RETIRE / ghost / memo-only path).
- Every field on screen is in the submit payload (no discarded fields).
- Display IDs are server-generated only.

### 3. Money / economics (when the surface owes money)
- Vendor **or** customer (as required) + GL / CoA purpose.
- Correct money object: invoice · bill · expense · payment · settlement · factor · escrow · liability · JE — not a silent default.
- Balanced JE when posting is ON for that entity; flags respected; **no TMS→QBO write-back**.
- Header **and** lines where the document has lines.

### 4. Forward links (who/what this record points to)
Populate real FKs for every owed link, for example:  
`load` · `driver` · `unit` · `trailer` · `vendor` · `customer` · `work_order` · `claim` · `policy` · bank / GL — **as Required on that leaf**.  
Memo text / UUID-in-name / jsonb-id theater = **FAIL**.

### 5. Reverse links (the other side can find this record)
- From the related record you can open a filtered list / graph / section and land back on this one.
- Forward **and** reverse — reverse is the half that gets skipped and is still mandatory.

### 6. Matrix columns (scoreboard — vertical, not one module)
Every **Required** cell for the leaf is **Built** with a **leaf-specific** guard (`@matrix-built` — **forbidden:** `leafRe=.*` theater), including where owed:
- `connectivity` · `reverse_link` · `picker_law` · `qbo_chrome`
- `driver` · `unit` · `trailer` · `load` · `vendor` · `customer`
- money cols: `gl_je` · `expense` · `ap_bill` · `invoice` · `payment` · `settlement` · `bank` · `factor` · `escrow` · `liability`
- entity / catalog scope as Required

**Vertical law:** finish the column across priority modules, then across **all** modules that owe it — not “this one screen is green.”

### 7. SURFACE BAR — every control, every module, no exceptions
Each of these on the surface must map to a matrix leaf / chrome law (not “list page only”):
- **Hierarchy:** tab · sub-tab · leaf
- **Controls:** search · filter · gear · range · picker · Combobox
- **Containers:** modal · popup · popup modal · side modal · side panel · drawer · ParityDrawer
- **Flows:** wizard · nested create (`+ Add new` first row inside the dropdown)
- **Rule:** every clickable / searchable control → matrix

### 8. Chrome law (how it must behave)
- No box-in-box
- QBO calendar / money patterns where money UI applies
- Combobox outside/Escape dismiss without forced bad selection
- Filter **Apply** (collapsed filters don’t silently lie)
- search + range + gear together where the toolbar pattern applies
- Proportions · responsive
- Primary buttons: `+ Create` / `+ Book` only (never `+ New` / `+ Add`)

### 9. Pickers + creators (universal picker law)
- Catalog behind the picker
- `+ Add new` is the **first row**
- Opens the **same** creator Lists would use
- Writes the **same** canonical table the picker reads
- New row appears · stays selected · survives reload
- Entity-scoped (TRANSP / USMCA / TRK as designed)

### 10. Security / entity
- `operating_company_id` (or correct unit owner/lease scope) · FORCE RLS
- No cross-entity leak
- Append-only audit on mutations
- Void / reverse — never hard-delete financial history

### 11. Guard + evidence
- Root-cause fix (not a patch)
- Guard that **fails on the bug** and **passes on the fix** (`--selftest` can fail)
- FINDING / ROOT CAUSE / FIX / GUARD / LIVE PROOF|UNVERIFIED / REMAINING on the PR
- Honest Required map: drop columns that were never owed; never keep theater Required

### 12. LIVE CHECK IN CHROME — LAST (after Built = 100% for the scope)
**Only after** items 1–11 are Built for the scope under test:
1. Deployed SHA matches what you claim (`healthz/shallow` version).
2. Open the **live** app in Chrome (prod / true data path).
3. Click the real path: create → save → reload → reverse drill → money surface if owed.
4. Prove picker `+ Add new` → wizard → appears selected after reload.
5. Prove every owed link navigates to the correct live target (not a 404 / empty tab).
6. Record evidence (screenshot / URL+result / Neon row under app-path RLS discipline).
7. Ledger tier = **PROD-VERIFIED** (or honest `UNVERIFIED — <blocker>`).

**Forbidden before step 12:** claiming the software / module / column is “complete,” “certified,” “McLeod-ready,” or “fully wired.”

**Wire-sprint honesty:** during the build wave you may say **`Built` / `Live=BLOCKED`**. You may **not** say fully wired until step 12 passes.

### 13. GL DELTA (owner 2026-08-28 — cannot be satisfied by looking at a screen)
For any leaf that creates or settles a money object, the resulting GL delta must equal the **posting matrix** (C25). Balanced JE ≠ correct JE. A miss with `fail_is_unique: true` is the same severity as an HTTP 500. Companions must appear as **their own scoreboard columns**, never one consolidated strip: C26 subledger tie · C27 no stranded intermediate · C28 reversal symmetry · C29 period/date · C30 this-entity roles · C31 living non-empty document. Live Chrome (12) stays last for **surface**; item 13 is **ledger**. USMCA only — a TRANSP/TRK pass never satisfies USMCA.

---

## What “yes” must mean when the owner asks “does this include all?”

| If they ask about… | “Yes” means… |
|--------------------|--------------|
| Surface bar (tabs, search, drawers, wizards…) | Items **7 + 8 + 9** — and still **1–6 + 10–12** for that leaf |
| Money wiring | Items **3–6 + 10–12** |
| A module “done” | **All 12** for every leaf in that module (both entities where owed) |
| The whole product | **All 12** across all 28 modules · Live Chrome last |

---

## Forbidden claims (process defects)

- “Wired” because scoreboard % is high or accounting is 326/331
- “Includes all” when only money columns or only chrome were built
- Stopping after a wave slice / N-of-6 / one picker
- `leafRe=.*` Built theater
- Live before Built = 100% on the agreed gate
- Asking the owner to re-define this list — **it is locked here**

---

## Companion — HONEST BUILT + SEAT LANES (2026-08-14)

**Canonical:** `docs/lockdown/HONEST-BUILT-LAUNCH-LAW-2026-08-14.md`

Launch-ready **without** Live Chrome = items **1–11** with **honest** Box 3 Built (no `leafRe:.*`, no `|.*`, no word-blanket Built). Seat lanes + boot order + surface-bar inventory gap live there. Soft “Done” while theater remains = defect.

---

## Priority scope (current owner sequence)

1. Shared columns vertically across modules that owe them.  
2. Priority set: first-10 deep-audit order **plus** vendors · customers · drivers · fleet.  
3. Then remaining modules.  
4. **Live Chrome (item 12)** only after Built gate.

**§3 "remaining modules" is not optional and is not later.** Priority set finishing first does not mean
the other modules are out of scope — it means they're next, same session, same sweep. Full scope is
**all 30 sidebar modules** (`SIDEBAR_ITEM_IDS` in `apps/frontend/src/components/layout/sidebar-config.ts`
— `eld` stub-exempted, 29 real modules in scope). Owner re-stated this three times on 2026-08-14 after a
"Step 2 all-modules" guard (`verify-wave-c-ap-bill-fe-all-modules.mjs`) turned out to only prove 7
representative files while 32 real gaps sat untouched across 8 modules its own contract list never read
— see `VERTICAL-WIRING-LAW-2026-08-12.md` §7 for the full account. Subscription-launch quality
(McLeod / QuickBooks-grade) means every leaf, every module, proven — not counted.

Canonical sequence pointers: `OWNER-EXECUTION-PLAN-2026-07-22.md` · `VERTICAL-WIRING-LAW-2026-08-12.md`.

---

*Owner-locked 2026-08-13. Autoload + presence ratchet: `scripts/verify-standing-directive-present.mjs` (FULLY-WIRED bar pointers). Registered in `docs/law/LAW.json`.*
