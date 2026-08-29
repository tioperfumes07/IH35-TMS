# IH35-TMS — DEFINITION OF DONE (canonical)

**HONEST BUILT + LAUNCH (2026-08-14):** `docs/lockdown/HONEST-BUILT-LAUNCH-LAW-2026-08-14.md` — launch without Live Chrome = Fully-Wired 1–11 with leaf-specific Built only; seat lanes Cursor/CC-1/Codex; no `leafRe:.*` / `|.*` / word-blanket Built; no new scoreboard columns.

**Status: BINDING. Owner-agreed. This file is the single canonical statement of "done."**

**FULLY WIRED (owner 2026-08-13):** for product / module / “includes all” claims, also obey the plain 12-item list in `docs/lockdown/FULLY-WIRED-COMPLETE-BAR-2026-08-13.md` (surface bar + Live Chrome **last**). DoD A–E + VERIFY 1–8 remain binding; the Fully-Wired bar makes the owner meaning non-skippable.

**OWNER LAW (2026-08-03, FINAL) governs §6 Merge gates below: NO HOLDS, NO `JORGE-APPROVED` LABEL — every
coder merges on green in every lane, including financial. See `.cursor/rules/00-operating-method-LAW.mdc`.**

Before this file existed the standard was real but scattered across
`docs/trackers/FULL-SYSTEM-AUDIT-AND-WIRING-MASTER-PLAN-2026-07-22.md` (§§0–0.3),
`docs/trackers/OWNER-EXECUTION-PLAN-2026-07-22.md`, `.cursor/rules/14-linkage-law-enforcement.mdc`,
`.cursor/rules/16-fix-not-patch-evidence-law.mdc`, `CLAUDE.md` §9 and agent memory. Scattered law is
skipped law. **This file consolidates them; it does not replace or soften any of them. On conflict the
MORE PROTECTIVE reading wins.**

Enforced by:

- `scripts/verify-definition-of-done-evidence.mjs` (verify-step 1324) — Rule 16 evidence on every app/db commit
- `scripts/verify-no-money-theater.mjs` (verify-step 1430) — **full DoD A–E + VERIFY 1–8 + MODULE_PROGRESS** on every accounting/banking/QBO-money commit; theater subjects fail closed
- `scripts/verify-module-completion.mjs` (verify-step 1431) — module **N of M** manifests; `complete:true` illegal while items open
- `.husky/commit-msg` → `scripts/check-commit-evidence.mjs` (local reject; CI is the real gate)

---

## 0. The one-line rule

> **A change is DONE only when a hostile reviewer, using only the evidence in the PR, can confirm the
> defect is gone and nothing else broke — without trusting the author.**

**Subscription-grade (owner 2026-08-29):** if the owner has to check it, it is not done. Canonical:
`docs/lockdown/SUBSCRIPTION-GRADE-DEFINITION-OF-DONE-2026-08-29.md`. Every block names:

- **PROVES-IT-WORKS** — runnable check + asserted outcome (including designed account codes)
- **KEEPS-IT-TRUE** — recompute-on-read, or regenerate job + `verify-derived-artifact-freshness`

A stored snapshot without KEEPS-IT-TRUE is not done. Enforced for listed artifacts by
`scripts/verify-derived-artifact-freshness.mjs`.

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

## 6. Merge gates (OWNER LAW 2026-08-03, FINAL — supersedes the old CLAUDE.md §1 self-merge/owner-approval split)

- Merging to `main` **is** the production-deploy decision. There is no second gate — including no owner
  approval gate.
- **NO HOLDS. NO `JORGE-APPROVED` LABEL.** Every coder (Cursor, Claude, Devin, Cascade) merges on green in
  **every** lane, including the financial cluster, migrations, and `accounting.*`/`catalogs.*`/`mdata.*`.
- **Financial cluster still has a proof gate, not an approval gate:** independent code-review + financial-
  agent pass, the 18-key evidence block, the migration firewall, and (for a migration) applying it on Neon
  yourself with the SHA posted — then merge on green. No "STOP and get owner approval."
- Opening balances are **owner-entered only** (retained — a data-accuracy control, not a merge gate).
  Default env flags **OFF**; flag flips happen after the owner's DECISION in chat ("turn it on"), executed
  and proven live by the coder — never a label, never a merge-time ask.
- Prod DB access is verified **per connection** (right branch, `current_database()`) — a correctness check,
  not a permission ask.

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

## 10. EVERY money PR — Claude-consolidated checklist (git-enforced)

**Binding source (2026-07-24):** same list Claude coder consolidated from this file +
`FULL-AUDIT-LAW-AGREED-2026-07-22.md` + Full Linkage Audit RTF. Desktop:
`~/Desktop/IH35-CURSOR-AUDIT/EVERY-PR-DOD-CHECKLIST-GIT-GATE-2026-07-24.md`.

Touches `apps/**/accounting|banking|qbo-sync|qbo/**` or `pages/accounting|banking/**`
(and `db/migrations/**` for MIGRATE/LANE).  
**Commit + PR body MUST include every key** or verify-step **1430** / commit-msg **FAIL**.

### §0 Before code (process — not all git-parsed)

- `git fetch` + current `main` · fresh branch · never `git add -A`
- Read spec / approved screen first — never build from a defect list alone
- Classify lane: financial → proof gate (independent review + financial-agent pass + 18-key evidence), then merge on green yourself (OWNER LAW 2026-08-03 — no hold)

### Required commit keys

| Key | Claude section | What you confirm |
|---|---|---|
| **FINDING** | ranked audit | `ACCT-F##` / `BANK-F##` / `LST-F##` from Desktop module audit |
| **LANE** | §0 / merge | `HOLD` · `FINANCIAL-HOLD` · `NON-FINANCIAL` · `DOCS` |
| **DOD-A** | §1 A | Active path — registered, mounted, nav leaf; no dual-path / ComingSoon twin |
| **DOD-B** | §1 B | Wizard depth — every rendered field controlled **and** in submit payload |
| **DOD-C** | §1 C | Law §9 F+R — canonical FKs both ways; memo/uuid-in-name/jsonb ids = FAIL |
| **DOD-D** | §1 D | Purpose → economics — no silent default |
| **DOD-E** | §1 E | Live proof or `UNVERIFIED — <blocker>` |
| **VERIFY-1** | §2.1 | Visual / QBO chrome (ParityDrawer, calendar, Due, + Create/+ Book, drawer-on-drawer) |
| **VERIFY-2** | §2.2 | Universal picker law — all 7 clauses |
| **VERIFY-3** | §2.3 | Connectivity/wiring — nav → route → API → canonical Neon table (not RETIRE) |
| **VERIFY-4** | §2.4 | Deep linkage chains F+R (claim / WO / expense / bill+payment as applicable) |
| **VERIFY-5** | §2.5 | Catalogs / entity scope — TRANSP+USMCA; units owner/lease; no cross-entity leak |
| **VERIFY-6** | §2.6 | Economics CPA-grade — header+lines; JE when ON; control roles; flags; no QBO write-back |
| **VERIFY-7** | §2.7 | Tab / design law (Rule 05) — no missing/invented tabs |
| **VERIFY-8** | §2.8 | Security / entity / RLS — FORCE RLS, GUC, security_invoker, grants |
| **MODULE_PROGRESS** | Rule 24 | `accounting N of M` and/or `banking N of M` — **must match** `docs/module-completion/<module>.json` |
| **MIGRATE** | §7 | `N/A` or number/idempotent/FORCE RLS/throwaway validate/no hardcoded UUID |
| **ROOT CAUSE / FIX / GUARD / LIVE PROOF / REMAINING** | §3–4 | Rule 16 + guard FAIL-on-bug / verify-steps only |

Values: `PASS` · `N/A` · `FAIL` · `UNVERIFIED — <reason>`.

**Forbidden:** EntityLink-only · honesty-banner-only · claiming “module done” from PR volume while
manifest `complete:false` · `REMAINING: none` on chrome hops · weakening guards ·
`package.json` / `locked-guards.yml` thrash.

Template (printed by the guard on failure) — see `MONEY_DOD_COMMIT_TEMPLATE` in
`scripts/verify-no-money-theater.mjs`.

---

## 11. Module COMPLETE = N of M checklist (permanent · mechanical)

**Not** “how many PRs.” **Yes** every item in `docs/module-completion/<module>.{json,md}`.

| Module | Progress source | COMPLETE when |
|---|---|---|
| Accounting | `docs/module-completion/accounting.md` | N === M and `complete: true` |
| Banking | `docs/module-completion/banking.md` | N === M and `complete: true` |

Each item maps to DoD A–E + VERIFY 1–8 + Neon `lucia` evidence (or owner HOLD with tracker + future block).  
CI: verify-step **1431**. Session law: Rule **24**.

As of 2026-07-24 live audit: **Accounting 3 of 25** · **Banking 2 of 13** · neither COMPLETE.

---

**Cross-refs:** `docs/trackers/FULL-SYSTEM-AUDIT-AND-WIRING-MASTER-PLAN-2026-07-22.md` ·
`docs/specs/QUALITY-STANDARD-LOCKED.md` · `docs/specs/STOP-THE-THRASH-WORKORDER-2026-07-17.md` ·
`.cursor/rules/14-linkage-law-enforcement.mdc` · `.cursor/rules/16-fix-not-patch-evidence-law.mdc` ·
`.cursor/rules/23-no-money-theater-prs.mdc` · `.cursor/rules/24-module-completion-n-of-m.mdc` ·
`docs/module-completion/SCHEMA.md` · `CLAUDE.md` §1/§9 · `AGENTS.md`.
