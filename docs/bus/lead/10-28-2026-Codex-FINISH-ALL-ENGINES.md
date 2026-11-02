# CODEX — FINISH ALL ENGINES · FULL COMPLETE WORK ONLY — 11-02-2026 ~11:20 AM CT (Cursor Lead)

> **Standing law:** [HONEST-BUILT-LAUNCH-LAW-2026-08-14](../lockdown/HONEST-BUILT-LAUNCH-LAW-2026-08-14.md)  
> **Rulings:** [10-27-2026-Codex-Lead-Answers-ENG28-13595-ENG17.md](./10-27-2026-Codex-Lead-Answers-ENG28-13595-ENG17.md)  
> **Register:** [ENGINE-REGISTER.json](./ENGINE-REGISTER.json) — single source of truth

```bash
export DATABASE_URL="$(head -1 ~/Downloads/lead-tmp/.prod)"
# USMCA only
USMCA=5c854333-6ea5-4faa-af31-67cb272fef80
SEAT=CODEX node scripts/fast-merge.mjs --branch <b> --title "FINDING: …" --body-file <f>
```

---

## NON-NEGOTIABLE · READ BEFORE YOU CODE

### FULL AND TOTALLY COMPLETE — OR DO NOT CLAIM DONE
**NO half work. NO shells. NO "board only". NO "API only". NO "guard only". NO "docs only" as a close.**

Every engine you touch must ship **all** of the following when the surface exists:

1. **Backend truth** — real query / writer / service path; company-scoped; no invented rows  
2. **API / routes** — list + detail + create/update as the leaf requires; entity-scoped filters  
3. **Frontend board** — ParityTable (or MoneyListToolbar where law says), real columns, honest empty, retryable error  
4. **Routing** — deep links land; `?id=` / reverse query params honored; Navigate redirects not dead  
5. **Reverse chrome** — EntityLink / EntityLinkOrTombstone / LegalMattersReverseSection / Insurance*Reverse where the law already requires them; exact FK filters  
6. **Pickers** — EntityPicker registry R=W; no raw UUID paste; inlineCreate only where master-data  
7. **Guards** — static `--selftest` + LIVE (DATABASE_URL) when money/telematics; shrink-only ceilings never invent  
8. **Register + bus** — update `ENGINE-REGISTER.json` evidence; OUTBOX line with PR # + sha + live counts  
9. **Fast-merge** — `SEAT=CODEX node scripts/fast-merge.mjs` after tip-proof; never stash; never fake-green  

If any one of those is missing for a surface that already has siblings with them → **NOT DONE**. Keep building.

### Forbidden
- Invent Dreamline / trailer 445 / AUTH / balancing JEs / fake test rows  
- Dependabot / CI-green theater  
- Closing PARTIAL by documenting without wiring  
- Mounting BoardSection with empty chrome and calling it filled  
- Leaving Lawsuits/Legal/Insurance reverse half-migrated  

### Lead tip-closed (DO NOT REBUILD)
ENG-18/28/41/42/61 · 01c/24/39/40 · 43/45 · 26 · **44/46/47/50/51 DONE-LIVE** · **60 FE cutover DONE** (table-drop remains) · **29 ceiling 149** · **53 mileage-missing→0** · **34 unaccounted 0** · 27 PARTIAL@290

---

## YOUR QUEUE — START NOW · FINISH EACH FULLY

### P0-1 · ENG-17 — Faro 1090 document match (FULL)
**DONE =**
- Every residual on Faro **1090** matched **document-by-document** against live USMCA bank/factoring/settlement evidence you can name (display_id, cents, date)  
- Unmatched set listed with reason (owner selects later) — **do not invent matches**  
- Dreamline / **2510** → **BLOCKED / MISSING** only — never invent Dreamline rows  
- **NO balancing JE. NO AUTH-453.**  
- Guard or ratchet that fails if a new unmatched 1090 residual appears without an OUTBOX name  
- Register → DONE-LIVE or PARTIAL with exact unmatched list + PR  

### P0-2 · ENG-48 — Fuel↔expense 1:1 + JE integrity (FULL)
**DONE =**
- Live one-to-one: every in-scope fuel purchase ↔ one expense (named dups refused by writer)  
- **JE debit integrity:** expenses that currently post with **debit sum 0¢** (mass live failure incl **13563-1**) fixed through the **posting engine** — not a display hack  
- Writer refuses double-fill same provider txn  
- FE Fuel boards already BoardSection'd — keep reverse + EntityLink to expense/JE  
- Guards: `verify-fuel-expense-one-to-one` LIVE PASS (or honest shrink ceiling with named remaining) + posting debit guard  
- Register DONE-LIVE or PARTIAL with live failing expense numbers → 0  

### P0-3 · ENG-49 — Settlement 5787 non-diesel (FULL · document-first)
**DONE =**
- Pull **signed settlement document** + live `driver_finance.settlement_lines` for company settlement **5787** (→ P-0018)  
- Live lines today: layover 75 / reimb 22 / admin gas 10 — **claimed $235.01 vs $140.20 is NOT a single line total** — find the real document total and reconcile through the engine  
- Correct through settlement/expense writers if document proves drift; never raw SQL money rewrite  
- Board: settlement detail shows the reconciled expense set with reverse to expenses/loads  
- Guard naming the residual cents or DONE-LIVE when 0  
- Register with document citation + live cents  

### P0-4 · ENG-13 residual — Trailer 445 BLOCKED list (FULL list · no invent)
**DONE =**
- Load **13595** Trailer **445** missing from fleet → **BLOCKED** list only (owner adds unit)  
- Any other no-trailer loads: document-sourced trailer choice through engine OR named BLOCKED  
- FE load/dispatch reverse still shows honest tombstone / blocked state  
- Guard: blocked list shrink-only; never invent trailer 445  
- Register PARTIAL→DONE when list empty or all named BLOCKED  

---

### P1 · HELP CURSOR / CC-3 LANES — FULL WHEN YOU TOUCH THEM

| ID | FULL DONE = |
|---|---|
| **ENG-23** | Audit every Creator/oldest-customer-fallback suspect load vs document customer; correct through load/customer engine; FE load detail customer EntityLink truthful; guard or measured 0 suspects |
| **ENG-27** | Shrink bank-cat pre-10-17 no-load ceiling **below 290** through engine backfill/explain only (never auto-match); LIVE ratchet |
| **ENG-29** | Fence-fill more `miles_driven_actual` (ceiling **149→lower**); never estimate; reason stamped |
| **ENG-53** | **13690** deadhead/driven miles from fences or named NULL reason; T174 odometer measured; stop stamps already OK on 13700 |
| **ENG-60** | After FE cutover: drop/retire `insurance.lawsuit` **only when 0 rows all entities** + backend route retirement + guards green; reverse stays on `legal.matters` |
| **ENG-25b** | Transportation diesel → 8000 loan via **AUTH-464** only when owner AUTH present — else BLOCKED doc, no invent |
| **ENG-34** | Wire or delete remaining **123** guard-exempts (shrink-only); each wire = verify-step or honest LIVE exempt reason |

### DO NOT TOUCH
OWNER: **ENG-38 / ENG-54 / LEAD-ENG-21** · AUTH-453 invent · Dependabot · balancing JEs · invent Dreamline/trailer 445

---

## HOW YOU WORK (NO HALF SHELL)

```text
1. Claim engine in OUTBOX (one engine or tight pair)
2. Measure LIVE USMCA with DATABASE_URL + bypass_rls lucia
3. Find the real writer / route / FE surface / reverse / guard
4. Implement FULL vertical (BE + API + FE + reverse + guard)
5. node scripts/verify-<guard>.mjs --selftest && LIVE
6. Update ENGINE-REGISTER.json evidence + status
7. SEAT=CODEX fast-merge
8. OUTBOX: CODEX | ENG-XX | PR # | sha | guard PASS | live counts
9. Next engine — do not idle
```

### Finding all info
- `docs/bus/lead/ENGINE-REGISTER.json`  
- `docs/bus/lead/LEAD-PENDING-REGISTER.md`  
- Lead answers file above  
- Live Neon via `~/Downloads/lead-tmp/.prod`  
- Existing guards: `rg -n "ENG-48|fuel-expense-one-to-one|5787|Faro|1090" scripts/`  

When queue empty: **`CODEX DONE`** with register proof.

**START NOW. FULL COMPLETE WORK ONLY.**
