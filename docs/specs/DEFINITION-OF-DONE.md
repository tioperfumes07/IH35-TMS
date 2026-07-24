# IH35-TMS — DEFINITION OF DONE (canonical)

**Status: BINDING. Owner-agreed. This file is the single canonical statement of "done."**

Before this file existed the standard was real but scattered across
`docs/trackers/FULL-SYSTEM-AUDIT-AND-WIRING-MASTER-PLAN-2026-07-22.md` (§§0–0.3),
`docs/trackers/OWNER-EXECUTION-PLAN-2026-07-22.md`, `.cursor/rules/14-linkage-law-enforcement.mdc`,
`.cursor/rules/16-fix-not-patch-evidence-law.mdc`, `CLAUDE.md` §9 and agent memory. Scattered law is
skipped law. **This file consolidates them; it does not replace or soften any of them. On conflict the
MORE PROTECTIVE reading wins.**

Enforced by:

- `scripts/verify-definition-of-done-evidence.mjs` (verify-step 1324) — Rule 16 evidence on every app/db commit
- `scripts/verify-no-money-theater.mjs` (verify-step 1430) — **full DoD A–E + VERIFY 1–5 confirmations** on every accounting/banking/QBO-money commit; theater subjects fail closed
- `.husky/commit-msg` → `scripts/check-commit-evidence.mjs` (local reject; CI is the real gate)

---

## 0. The one-line rule

> **A change is DONE only when a hostile reviewer, using only the evidence in the PR, can confirm the
> defect is gone and nothing else broke — without trusting the author.**

CI-green is the floor, not the verdict. "Merged" is not done. "The API accepted it" is not done.
"It renders" is not done.

---

## 1. The five DONE layers (A–E)

Required **per module · per tab · per nested tab · per wizard / creator / drawer.** All five. No partial credit.

### A. Active path
Operators see the NEW design on the real route.
- No `DUAL_PATH_OLD_ACTIVE`, no ComingSoon while a Live tab exists, no archived twin still mounted.
- The route is registered, the component is mounted, and the nav leaf exists (Rule 05 tab law).

### B. Wizard depth
Field-by-field, not a thin form.
- Chrome, pickers, bank/accounts, ops FKs, recovery/posting modes.
- **Every rendered field is controlled AND present in the submit payload.** A field that renders and is
  discarded on save is a defect, not a nicety. (Real instance: an accident wizard rendered 20 fields and
  submitted 6.)

### C. Law §9 linkage — FORWARD *and* REVERSE
Counterparty + GL/CoA + audit + load/driver/unit/trailer/WO/claim/legal as applicable.
- **Memo-only links are FAIL. Canonical FKs required.** A truncated uuid inside a name string, or a
  `jsonb` array of ids, is not a link.
- **Reverse is the half that keeps getting skipped.** Forward persistence shipping without a reverse
  surface = NOT DONE. (Real instance: Create Advance persisted `load_id/unit_id/trailer_id` to prod,
  while LoadDetailDrawer showed **0** advance refs and no by-load API existed.)
- "Accepted by the API" is not done — the column must be **persisted AND readable from the reverse side.**

### D. Purpose → economics
The *purpose* of the transaction decides *what money object is created* — settlement deduction vs
expense vs bill vs escrow. Not the other way round, and never a silent default.

### E. Evidence
Live proof, or an explicit **UNVERIFIED — needs live check** naming the blocker. Never a guess.

**Chrome-only, nested-`+ Create`-only, or docs-only NEVER closes a module.**

---

## 2. The five VERIFY layers (what must be proven on every PR)

1. **Visual / QBO chrome** — money creators are QBO-style right-side `ParityDrawer`, not a thin full
   page; no box-in-box; QBO calendar; Bill Date + Terms Net-30 auto-computes Due; nested create =
   drawer-on-drawer, never a centered modal on a money drawer.
2. **Universal picker law** — EVERY picker (Category, Account, A/P, Payment account, Vendor, Customer,
   Class, Item, Terms, Unit): real entity-scoped catalog behind it; **inline `+ Add new …` as the FIRST
   ROW INSIDE the dropdown** (never a button floating outside the box); opens the QBO wizard for that
   exact entity; **writes the same canonical table the picker reads**; after save it appears, is
   selected, and survives reload; scoped to the current company (a USMCA create shows on USMCA).
3. **Deep linkage chains — forward AND reverse:**
   - **Claim:** Claim → Unit/Trailer/Asset → Driver(s) → Load → Safety/accident → Vendor (shop/tow) →
     Repair WO → Bill/Expense → driver escrow/deduction → JE/GL → Audit; and reverse from
     JE/Register/Vendor/WO back to the claim.
   - **Driver at fault:** fault=driver → recovery economics → escrow liability → settlement deduction →
     optional bill to driver-vendor → reverse register→claim/driver. FAIL = at-fault is text only, a
     deduction with a null claim, or the driver missing from the Vendor picker.
   - **Repair WO:** WO → Unit → Vendor → Driver/Load → parts/labor lines → Bill/Expense carrying
     `work_order_id` + `unit_id` → Category/GL → JE → reverse Bill↔WO↔Unit↔Claim.
   - **Expense:** Expense → Vendor → Category (entity CoA) → Payment account → Unit/Driver/Load/WO → JE
     when flag ON → Audit → reverse Register→Expense→Vendor/JE/Unit.
   - **Bill + Bill Payment:** Bill → Vendor (incl. driver-vendor) → Lines (**Total = sum of lines**) →
     A/P → Unit/WO/Load → Payment → Bank → JE → reverse from AP aging/register/vendor to THAT id.
4. **Catalogs / entity scope** — TRANSP **and** USMCA. Vendors include drivers (driver-as-vendor). Units
   scoped by `owner_company_id OR currently_leased_to_company_id` (units have **NO**
   `operating_company_id`). No cross-entity leak. CoA roles need the company GUC — bypass alone can
   false-empty.
5. **Economics (CPA-grade)** — header **plus lines**, never header-only; balanced JE when posting is ON;
   correct control roles (A/P, A/R, Undeposited Funds); flags honest; parallel books, **no TMS→QBO
   write-back**. Live $0.05 smoke → Neon proof, or explicit UNVERIFIED with the blocker named.

---

## 3. The evidence block (Rule 16) — required in every PR body

```
ROOT CAUSE:  the actual mechanism, not the symptom
FIX:         what changed and why this is the root fix, not a patch
GUARD:       scripts/verify-*.mjs + scripts/verify-steps/NNNN-*.mjs
LIVE PROOF:  endpoint / health sha / DB row / browser — or UNVERIFIED + named blocker
REMAINING:   what is still open, explicitly. "nothing" is a claim you must be able to defend.
```

A PR that changes app code and omits this block is not reviewable and is not done.

---

## 4. Guard rules (how a fix is made un-regressable)

- **Every bug fix ships a static CI guard.** No guard = not done.
- A guard must **FAIL on the bug and PASS on the fix.** Prove both. The standard proof is running the
  guard's assertion against the pre-fix file from `main`.
- **`--selftest` must be capable of failing.** Run the real assertion against *mutated copies of real
  source*, one case per assertion, each deleting exactly what that assertion requires. Reject a case as
  inert if the mutation did not change the source. A selftest that compares two string literals declared
  inside the script proves nothing.
- **A selftest must also assert the CORRECTED shape is not flagged** — false positives burn trust as
  fast as misses. (Real instance: a guard flagged 6 already-correct call sites.)
- **Wiring: `scripts/verify-steps/NNNN-*.mjs` ONLY.** Adding `verify:*` entries to `package.json` is
  FORBIDDEN (`docs/specs/STOP-THE-THRASH-WORKORDER-2026-07-17.md`), and a package.json-only guard is
  executed by no workflow — it never runs. Never edit `locked-guards.yml` / `ci.yml` to pass.
- **Never weaken a guard to go green.** If a fix trips a guard, check whether the GUARD is wrong first —
  guards have been found asserting the exact defect they exist to prevent. Update it; never delete the
  assertion. Ratchets may only tighten.

---

## 5. Verification discipline (how evidence is obtained)

- **Prod wins.** Schema/columns/enums/tables are verified against the Neon prod branch, not migrations,
  not memory, not a doc, not another agent's "verified."
- **A 0 or empty result is not proof of absence — RE-RUN it.** RLS masks `accounting.*`/`catalogs.*`/
  `mdata.*` to 0. `mdata.drivers` RLS is **identity-based** (`org.user_accessible_company_ids()`), so a
  raw SQL session reads 0 while the app reads 82. Include a **visibility sanity check** (assert a known
  non-zero count is visible) before trusting any count.
- **A 200 is not proof of success.** The SPA origin returns `index.html` with **HTTP 200** for unknown
  `/api` paths, so `res.ok` is true and `res.json()` throws. Check the **content-type**, not the status.
- **Never trust a string-grep as a systemic check.** Grep misses variables (`fetch(path)` vs
  `fetch("/api/…")`). Test the endpoint or diff identifiers against prod.
- **Pipes mask exit codes.** `cmd | tail; echo $?` reports `tail`'s status. Redirect to a file and
  capture the real code.
- **Establish the baseline before blaming your change.** Run the suite on `main` and compare counts.
- **Deploy is verified by ancestry**, not string equality: the live sha may be *newer* than your merge
  commit and still contain it. Use `git merge-base --is-ancestor`.

---

## 6. Merge gates (CLAUDE.md §1 — unchanged, restated)

- Merging to `main` **is** the production-deploy decision. There is no second gate.
- **Self-merge allowed:** pure frontend/docs/CI-action bumps, and non-financial backend touching none of
  the financial cluster, migrations, or `accounting.*`/`catalogs.*`/`mdata.*` schema-or-data.
- **STOP and get explicit owner approval:** any financial change, any migration/schema change, any touch
  to `accounting.*`/`catalogs.*`/`mdata.*`, any runtime dependency bump.
- **Never self-merge the financial cluster.** Opening balances are owner-entered only. Default env flags
  **OFF**. Flag flips are the owner's sole decision.
- Prod DB access is gated **per connection** — ask every time.

---

## 7. Module completeness

A module is COMPLETE only when **all N of its M blocks ship** (or are on HOLD with a written tracker
entry) **and no click-through FAIL remains on any money leaf**, with A–E satisfied on every tab and
wizard. Owner-locked module order lives in
`docs/trackers/FULL-SYSTEM-AUDIT-AND-WIRING-MASTER-PLAN-2026-07-22.md`.

**A count of findings is not an audit.** Findings from code reading are UNVERIFIED until checked against
prod or exercised live, and must be labelled that way. (Real instance: of six P0s in one module audit,
**three were false** — all resting on one unchecked assumption — while the single worst defect in that
module appeared in no finding at all.)

---

## 8. Owner money locks — implement, never re-litigate

- **Recovery rail = ALWAYS ASK** (escrow / next settlement / split). Never auto-default.
- **Uninsured repair = always ask** expense vs capitalize. **No dollar threshold, ever.** An invented
  approval threshold is a real failure class (PR #3231 shipped an invented $1k threshold; removed).
- **Driver at fault owes the FULL company-funded repair**, not just a deductible.
- **Deductible books = Option C** — expense residual tells the loss story, Driver A/R tells who owes.
- **Insurer payment credits the SAME expense** (or Insurance Receivable → Bank) — **never sales income**.
- **Split = two separate lines**, each carrying the claim id.

---

## 9. Honest reporting

- Report outcomes faithfully. If a step was skipped or a check failed, say so.
- If you cannot verify, write **UNVERIFIED — needs live check** and name the blocker. Never a guess.
- Do not present a partial review as complete. If you covered 8 of 12, say 8 of 12.
- Correcting your own earlier claim is required, not optional, when it would change a decision.

---

## 10. EVERY money PR — audit checklist (git-enforced)

Touches `apps/**/accounting|banking|qbo-sync|qbo/**` or `pages/accounting|banking/**`.  
**Commit message + PR body MUST include every line below** or verify-step **1430** / commit-msg **FAIL**.

| Confirm | What you are auditing / fixing |
|---|---|
| **FINDING:** `ACCT-F##` / `BANK-F##` / `LST-F##` | Ranked id from `~/Desktop/IH35-CURSOR-AUDIT/modules/<module>.md` — no PR without it |
| **DOD-A** Active path | New design on real route; no dual-path / ComingSoon while Live exists |
| **DOD-B** Wizard depth | Every rendered field controlled + in submit payload (or N/A) |
| **DOD-C** Linkage F+R | Canonical FKs both ways — EntityLink-only is FAIL / theater |
| **DOD-D** Purpose→economics | Correct money object for purpose; no silent default |
| **DOD-E** Evidence | Neon/live proof **or** `UNVERIFIED — <blocker>` |
| **VERIFY-1** Chrome | QBO ParityDrawer / money chrome for surfaces touched |
| **VERIFY-2** Picker | Entity-scoped catalog; inline `+ Add new`; write = read table |
| **VERIFY-3** Deep linkage | Claim/WO/Expense/Bill/Payment chains F+R as applicable |
| **VERIFY-4** Catalog scope | TRANSP + USMCA; no cross-entity leak |
| **VERIFY-5** Economics | Header+lines; flags honest; density or named blocker |
| **ROOT CAUSE / FIX / GUARD / LIVE PROOF / REMAINING** | Rule 16 evidence block |

Allowed values per DOD-/VERIFY- line: `PASS` · `N/A` · `FAIL` · `UNVERIFIED — <reason>`.

**Forbidden:** EntityLink-only · honesty-banner-only · N-of-M “module done” while density still 0 · `REMAINING: none` on chrome hops.

Template (also printed by the guard on failure):

```
FINDING: ACCT-F##
DOD-A: …
DOD-B: …
DOD-C: …
DOD-D: …
DOD-E: …
VERIFY-1: …
VERIFY-2: …
VERIFY-3: …
VERIFY-4: …
VERIFY-5: …
ROOT CAUSE: …
FIX: …
GUARD: …
LIVE PROOF: … OR UNVERIFIED — …
REMAINING: …
```

---

**Cross-refs:** `docs/trackers/FULL-SYSTEM-AUDIT-AND-WIRING-MASTER-PLAN-2026-07-22.md` ·
`docs/specs/QUALITY-STANDARD-LOCKED.md` · `docs/specs/STOP-THE-THRASH-WORKORDER-2026-07-17.md` ·
`.cursor/rules/14-linkage-law-enforcement.mdc` · `.cursor/rules/16-fix-not-patch-evidence-law.mdc` ·
`.cursor/rules/23-no-money-theater-prs.mdc` ·
`CLAUDE.md` §1/§9 · `AGENTS.md`.
