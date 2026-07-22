# IH35 — OWNER EXECUTION PLAN (plain language)

**Date locked:** 2026-07-22  
**Why this exists:** Jorge is not a coder. Sessions forget. Agents shrink the job. This file is the **sequence that must be followed** until launch-ready.  
**Remind Cursor / Claude:** paste  
`Execute docs/trackers/OWNER-EXECUTION-PLAN-2026-07-22.md — do not invent a new sequence.`

**Companion (technical):** `docs/trackers/FULL-SYSTEM-AUDIT-AND-WIRING-MASTER-PLAN-2026-07-22.md`  
**Desktop copy:** `~/Desktop/IH35-CURSOR-AUDIT/plans/OWNER-EXECUTION-PLAN-2026-07-22.md`  
**Module scoreboard:** `docs/trackers/MODULE-DEEP-AUDIT-SCOREBOARD-2026-07-22.md`

---

## 0. Honest starting point (do not sugarcoat)

- The app has **30** sidebar modules (not 28 — docs were stale).
- A **full click-through + money audit of every module has NOT been finished**.
- What we had before: block piles (~431 pending), partial dual-path scan, Law §9 money paths mostly FAIL, deep samples (claim / advance / settlements reverse).
- That was **not** the deep audit Jorge asked for. This plan fixes the sequence so it cannot be “forgotten” again.

---

## 1. What “audit” means (Jorge’s definition = law)

A module is **audited** only when an agent (or Jorge) has done this **in the live product or truthful local app**, not by grepping files alone:

### A. Click-through connectivity (UI)

1. Open the module from the sidebar (the **new** design — not an old path).
2. Open every tab and nested tab the architectural design requires.
3. Click every important link: driver → driver profile; load → load; unit → truck; trailer → trailer; customer/vendor → their page. **Both directions** must work.
4. On each detail page: inspect layout — **no boxes inside boxes**; type-ahead filters; calendars like QuickBooks; catalogs open the **correct** list.
5. Click every **+ Create** / **+ Book**: the wizard must be complete — fields lined up, bank/account pickers real, load/unit/trailer/driver where required, recovery modes where money is recovered.

### B. Economic / financial connectivity (books)

Same seriousness as **Insurance claim economics** (fault, who pays, escrow vs settlement, asset vs expense):

- Driver, customer, vendor, truck, trailer, load must appear on: expense, bill, bill payment, settlement, work order, repair, fuel, advance, claim, banking match, **and** GL / Chart of Accounts when money posts.
- A registered bill payment must be able to **match in Banking** and post to the **correct CoA** (when posting flags allow — otherwise prove the wiring and HOLD the live post).

### C. Verdict per surface

Every button/surface: **HAVE / MISSING / DRIFT / WILL FAIL** — with evidence.  
**CI green ≠ audited. Docs ≠ audited. “File exists” ≠ audited.**

---

## 2. Correct sequence (FOLLOW THIS ORDER)

Do **not** jump to random pending blocks first. Many pending blocks *are* this work — but without module audits we keep shipping partials and losing 40 days again.

### PHASE 0 — Lock the law so sessions cannot forget (1–2 days, docs + rules)

| Step | What | Owner sees |
|------|------|------------|
| 0.1 | This plan + module scoreboard in repo **and** Desktop | One place to check progress |
| 0.2 | Update Law of the Land / connectivity docs to match Jorge’s audit depth + 30 modules | Agents load the same definition |
| 0.3 | Always-apply Cursor rule: **one module deep-audit → CODE PRs for that module → mark scoreboard** before starting the next | No silent scope shrink |
| 0.4 | Claude: push §11 / standards into skill when Jorge says “push standards” | Same bar in Claude |

**Exit:** Jorge can open Desktop scoreboard and see 30 modules = NOT STARTED / IN PROGRESS / AUDITED / FIXING / DONE.

### PHASE 1 — Module-by-module deep audit inventory (no skipping)

**Owner-locked order (2026-07-22) — follow exactly:**

| Seq | Module (sidebar) | Notes |
|-----|------------------|-------|
| 1 | **accounting** | Expense, bill, bill payment, JE, CoA — money trust first |
| 2 | **bank** | Match, categorize, transfers ↔ payments/GL |
| 3 | **safety** | Accidents, fines, dual-path active design |
| 4 | **lists** | Catalogs that every wizard depends on |
| 5 | **maintenance** | WO ↔ bill/expense/unit |
| 6 | **insurance** | Claim economics (already IN_PROGRESS — finish depth) |
| 7 | **legal** | Matters ↔ claims/lawsuits |
| 8 | **dispatch** | Loads ↔ driver/unit/trailer/money |
| 9 | **settlements** | Pay, deductions, escrow, advances on statement |
| 10 | **factoring** | Advances ↔ loads/AR |
| 11 | **vendors** | A/P counterparty |
| 12 | **customers** | A/R counterparty |
| 13 | **drivers** | Driver profile reverse (all money + ops) |
| 14 | **driver-hub** | Hub surfaces ↔ profile |
| 15 | **fleet** | Truck + trailer |
| 16 | **cash-flow** | Cash views ↔ bank/accounting |
| 17 | **finance** | Finance hub |
| 18+ | **Last wave** | home → fuel → form_425 → reports → tasks → inventory → docs → users → help → program → system → eld → **compliance** (owner: end) |

For **each** module in that order:

1. Write `~/Desktop/IH35-CURSOR-AUDIT/modules/<module>.md` (HAVE/MISSING/DRIFT/WILL FAIL).  
2. Add/update rows in `MODULE-DEEP-AUDIT-SCOREBOARD-2026-07-22.md`.  
3. Tag each finding: `DUAL-PATH` · `WIZARD` · `REVERSE` · `FORWARD-LINK` · `ECONOMICS` · `COA-GL` · `HOLD-NEON`.  
4. **Do not** mark AUDITED until A+B+C above are done or explicitly UNVERIFIED with reason.
5. Open fix PRs for that module (Phase 2) before starting the next module’s deep audit — unless Jorge authorizes parallel lanes on **non-overlapping** modules.

**Exit:** All 30 modules have a Desktop file + scoreboard row. Counts known.

### PHASE 2 — Build PRs from those audits (same module, same wave)

For each module after its audit file exists:

1. Open **fix PRs only for that module’s findings** (single-domain).  
2. FE reverse / dual-path / wizard chrome → ship when CI green.  
3. Migrations / GL / CoA / posting → **HOLD** — Jorge reviews SQL → Neon apply → then re-prove.  
4. Add CI guards so the gap cannot return (especially **reverse-drill guard** — build early).  
5. Update scoreboard: FIXING → DONE only with live proof.

**Parallel lanes OK** only if modules do not collide (e.g. Settlements FE + dual-path Accounting stub). **Never** two agents on the same PR without a claim comment.

### PHASE 3 — Drain remaining block-pile items

After Phase 1–2 for a domain:

- Reconcile old GAP / NEEDS-OWNER piles against the new module audit.  
- **Deduplicate:** if the pile item is already in the module audit, close/mark as covered by the audit PR — do not rebuild twice.  
- Only then pick pile-only items that audits did not surface.

### PHASE 4 — Launch gates (cannot skip)

Before calling launch-ready:

- [ ] All 30 modules scoreboard = DONE or owner-written DEFER with future block id  
- [ ] Law §9 twelve money paths PASS or HOLD with named Neon work  
- [ ] Held-migration reconciliation: no merged code silently needing unapplied schema  
- [ ] Entity-scope / USMCA isolation burn-down to owner threshold  
- [ ] Reverse-drill CI guard live  
- [ ] Sidebar docs say **30**, match config  

---

## 3. Why this order (not “pending blocks first”)

| Approach | What happens |
|----------|----------------|
| **Pending blocks first** | Agents cherry-pick easy chrome; economics stay broken; you lose months |
| **Audit-all-docs then never build** | Scoreboards without CODE — trust defect |
| **This plan: audit one module → build its PRs → next** | Inventory stays true; fixes match Jorge’s click-through definition; old piles get consumed, not ignored |

The old pending blocks **already were** mostly linkage + economics. Phase 1–2 **is** doing those blocks correctly. Phase 3 is only leftovers.

---

## 4. Anti-amnesia kit (so this survives new sessions)

| Tool | Use |
|------|-----|
| This file | Sequence law |
| Module scoreboard | Counts / progress Jorge can see |
| Desktop `IH35-CURSOR-AUDIT/modules/*.md` | Per-module deep audit |
| Remind phrase above | Paste every new chat |
| NEW SESSION banner (Rule 23) | Proves rules loaded |
| Rule 21 + this plan | Forbids shrinking to chrome-only |
| Claude merge / Cursor build | Cursor opens PRs; Claude merges non-HOLD; Jorge labels HOLD |

**Jorge weekly check (5 minutes):** open scoreboard → count NOT STARTED vs DONE → ask “which module is IN PROGRESS?” If answer is vague, agents are drifting.

---

## 5. Immediate next actions (start now)

1. Jorge: **module order locked** (accounting → bank → safety → lists → … → last home/fuel/425/reports).  
2. Cursor: begin **Accounting** deep module audit file to Jorge’s click-through depth, then its fix PRs.  
3. Claude: merge green non-HOLD PRs; hold financial (#3228 claim economics Neon, advance posting).  
4. Build **verify-reverse-drill-required** early (control plane) in parallel with Accounting audit.

---

## 6. Progress log

| Date | Note |
|------|------|
| 2026-07-22 | Plan created from Jorge session — full click-through + economics definition; sequence locked; incomplete prior audit admitted |
| 2026-07-22 | **Module order locked by Jorge:** accounting → bank → safety → lists → maintenance → insurance → legal → dispatch → settlements → factoring → vendors → customers → drivers → driver-hub → fleet → cash-flow → finance → then home/fuel/form_425/reports/… |
