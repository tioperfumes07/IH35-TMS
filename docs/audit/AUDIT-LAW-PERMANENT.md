# IH35-TMS — AUDIT LAW (PERMANENT, BINDING)
**Established 2026-08-02 by owner directive. Binding on CASCADE (auditor), CLAUDE CODER / CURSOR (fixers),
and GUARD (verifier). Read this before ANY audit work.** Companion to `docs/audit/AUDIT-COVERAGE-LIVE.md` 
(the findings file) — this document is the METHOD; that file is the ledger.

## WHY THIS EXISTS (the failure this stops — it has happened TWICE)
The audit has twice been run wrong the same way: the **surface layers (picker, design) were done first and
rubber-stamped**, the **deep-linkage layer was skipped**, and the pass was declared **"complete" while 0 of 30
modules were certified**. That is the short/easy route, and it is forbidden. This law makes the correct method
non-negotiable.

---

## §1 — THE ORDER IS FIXED. DEEP LINKAGE FIRST. DESIGN LAST.
Every audit runs the layers in this order, across the modules, and **may not reorder**:

**C (deep linkage + GL) → B (data proof) → A (surface close-out) → D (picker law) → E (design).**

- **Layer C is done FIRST**, across the unvisited modules, before D or E get any attention.
- Doing D or E while C is still open is **a failed pass, not progress.** An auditor that returns D/E rows and
  zero C rows has skipped the job.
- **You may never substitute an easier layer for a harder one.** Volume of D/E rows does not offset a missing C.

---

## §2 — WHAT EACH LAYER REQUIRES (no layer passes on less)
- **A — Live Surface.** The page renders and responds in the REAL authed app. No 500, blank screen, dead route,
  or phantom-column crash. Evidence: an actual load of the real page/endpoint.
- **B — Data Proof.** The data sits in the **CANONICAL** table (never a RETIRE twin). Counts are re-run with
  RLS/opco set and a **positive control** (a table known non-empty, e.g. `mdata.vendors`) — **a 0 is never proof**
  until proven not RLS-masked. Evidence: the query + counts + positive control.
- **C — Deep Linkage + GL.** Every record walked **BOTH ways** to (a) its financial primitives AND (b) its
  operational modules, **ending at a balanced GL**. Follow the insurance-claim depth chain as the bar:
  claim → driver → unit → trailer → policy → deductions → liability → asset account → JE → GL, **forward AND
  reverse**. An unstated link is a defect (explicit `N/A(reason)` + owning block, never silence). Money-VALUE
  proof (does the JE post correctly, balanced) requires real transactions — where posting/data isn't available,
  the verdict is `UNVERIFIABLE-until-data`, never a guessed PASS.
- **D — Picker Law.** Every reference dropdown: catalog behind it; inline **+Create as the first row that
  ACTUALLY PERSISTS** to the same canonical table the picker reads; the new record **appears + is selected +
  survives reload**; entity-scoped. **You MUST exercise the inline create** — click it, save, confirm the row
  landed. (A picker "passed" on inspection silently failed live: the Book Load customer inline-create did a
  native GET and wrote nothing. A screenshot would have missed it. Test the behavior.)
- **E — Design / UI. A SCREENSHOT IS NOT A LAYER-E PASS.** A screenshot proves the page **renders** — nothing
  more. Layer E requires exercising: **resizable columns work AND are discoverable** (not a 4px invisible target);
  proportions correct (no boxes out of proportion); **QBO-style filter views** (the Banking spend/received filter
  was wrong — a real E pass catches that); box-in-box; drawer-on-drawer; `+Create`/`+Book` vocab. If you only
  took a screenshot, the verdict is **`E render-only PASS — design-bar UNVERIFIED`**, not PASS.

---

## §3 — EVIDENCE IS SUBSTANCE, NOT SHAPE
- Every verdict carries a **live-evidence field**: a prod read + positive control, a `file:line`, an endpoint
  response, a health SHA, or a **real UI interaction** (control clicked, result observed). A row with no evidence
  does not count.
- **A screenshot is evidence of RENDER ONLY** — never of behavior, persistence, or correctness.
- **No fake green.** If a criterion wasn't exercised, its verdict is `UNVERIFIED`, never `PASS`. "Looks clean"
  is not a verdict.

---

## §4 — "COMPLETE" HAS ONE DEFINITION
- A module is **CERTIFIED** only when **A, B, C, D, and E each PASS independently, with live evidence, PER
  ENTITY** — TRANSP and USMCA reported separately (TRK where relevant). A verdict is TRANSP-only unless the entity
  cell says otherwise.
- **The audit is NOT "complete" while any module is uncertified.** No agent may declare the audit complete while
  the scoreboard shows fewer than 30/30 certified. "I did a pass over the surface layers" is **progress**, not
  completion — do not label it complete.
- The scoreboard (`AUDIT-COVERAGE-LIVE.md`) is the truth. If it reads `0/30 certified`, the audit is not done,
  regardless of how many rows exist.

---

## §5 — GUARD IS THE ONLY GATE TO "VERIFIED"
- A coder's `FIXED` and Cascade's `PASS` are **claims**, not verdicts. Only **GUARD** flips a row to `VERIFIED`,
  after an **independent live re-check**: git for code (file+line on `origin/main`, guard wired, deploy SHA),
  Neon for data (positive control), the app for UI. GUARD may `REOPEN` any row with a reason.

---

## §6 — ANTI-PATTERNS THAT FAIL THE AUDIT (memorize these — they are the recurring failures)
1. Doing D or E before C is closed.
2. Screenshot-only Layer E ("28 modules PASS via screenshots").
3. Declaring "complete" with <30/30 certified (or 0 certified).
4. Passing a picker without testing that its inline create persists.
5. A one-entity pass presented as both entities.
6. Substituting a high volume of easy rows for the missing hard layer.
7. Any `PASS` with no exercised-behavior evidence.

---

## §7 — THE FILE & FLOW (unchanged, restated)
One file: `docs/audit/AUDIT-COVERAGE-LIVE.md`, append-only, column ownership (Cascade writes findings; coders set
`FIXED (PR#)` on their lane; GUARD sets `VERIFIED`). Sync before write; commit + push per module-layer batch;
never delete a row (supersede with a dated new row). Keep the scoreboard current every session.

**Read order for any agent starting audit work:** this law → `AUDIT-COVERAGE-LIVE.md` → do the work in §1 order.
