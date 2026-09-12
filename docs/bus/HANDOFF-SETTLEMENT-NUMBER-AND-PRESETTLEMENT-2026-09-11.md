# HANDOFF — Settlement/Tour numbering + Pre-Settlement rendering (Cursor → next coder)
**Date:** 2026-09-11 · **Author:** Cursor (recused by owner) · **Entity:** USMCA only (`5c854333-6ea5-4faa-af31-67cb272fef80`)
**Neon:** project `tiny-field-89581227`, branch `br-fancy-credit-akjnd07a`, role `neondb_owner`, db `neondb`. Scoped reads: `SET LOCAL app.bypass_rls='lucia'` (+ `app.operating_company_id`).

> The owner recused Cursor from this work. This file is the total handoff so another coder can finish. It lists every owner request/complaint of the last ~12 hours, what was done, the exact repo state, and what is still pending. **Read it top to bottom before touching anything — there is a mid-cherry-pick to resolve first (§4).**

---

## 1. OWNER REQUESTS / COMPLAINTS / ISSUES — last ~12 hours, chronological (verbatim where possible)

The whole effort is: **make the USMCA app render EXACTLY the data AlwaysTrack (awtrack.com / "Faro") shows for dispatch / pre-settlement / settlement.**

1. **Load rates / grouping (earlier):** "13581 should be 4900, the same as 13582…"; the Pre-Settlement grouping was wrong — load numbers must display correctly and multiple loads must group under the SAME settlement number (per driver's tour).
2. **AskQuestion answers:** (a) seed the missing open loads + create the 2 missing customers + 1 driver from the AlwaysTrack screenshots (owner said **"seed"**); (b) **"fix corerclty"** — merge/void the duplicate Angel Alfonso Sosa driver and repoint everything.
3. **(2 AlwaysTrack screenshots — "Unsettled Loads" + "Completed"):** *"you are still showing your tour number. incorrectly. i am fucking tired of this shit, if you cannot fix it reuse yourself. these are delivered loads, and unsettled loads, the always version of pre-settlement for us. we must render the same data."* — AlwaysTrack "Unsettled Loads" (= our **Pre-Settlement**) showed **8 delivered-but-unsettled loads grouped by 7 drivers**.
4. **Model clarification + order:** *"completed loads are fully completed and delivered, they are invoiced. and probably factored. unsettled loads are those loads that have been invoiced but are waiting the return trip etc to close a full settlement tour. why the fuck is the settlement still showing your fucking stupid numbers. remove them now from the entire fucking system."* (the "stupid numbers" = the `S-2026-xxxx` display_ids).
5. *"you have it already you fucking idiot read the fucking architecture, and blueprint again, stop fucking up my work."*
6. *"for tours settlement remove and delete any fucking autogenerating number etc, command-coordinate and code to have the settlement autogenerate based on the numbers we have here from always. and for future to follow sequence, i am fucking tired of you not doing your fucking job."*
7. **FINAL (this message — recusal + new requirements):**
   - *"i want to see immediately in all screens related to loads … the load number in one column and the column next to it presettlement number or tour, whatever you want to name it."* → **EVERY loads-related screen: two ADJACENT columns — `Load #` | `Pre-settlement/Tour #`.**
   - *"in presettlement each load gets its own row. not 3 in one."* → the Pre-Settlement register currently renders **one row per TOUR** with the legs grouped (`NB 13569 → SB 13591 …`). Owner wants **one row per LOAD**.
   - *"i checked the settlement tour, and it is showing historical and closed, why the fuck, it is not related to this trip."* → the **Settlement tab shows all historical/closed tours** (5769–5800 …). Owner says those are **not related to the current trip** and should not be shown as if they are.
   - *"stop … i do not want you working anymore … give me your total handoff work, pending etc. i want another coder to finish this."*

---

## 2. THE NAMING LAW / DOMAIN MODEL — what "correct" means (do not re-derive; owner corrected this 4×)

- **A LOAD = 5 digits** (e.g. `13590`). **A SETTLEMENT / TOUR = the 4-digit AlwaysTrack document number** (`5769`–`5800`, next `5801…`).
- `driver_finance.driver_settlements.display_id` values like `S-2026-0019` / `S-13xxx` are a **MISLABELED INTERNAL COUNTER** (`next_settlement_display_id` mints `S-YYYY-NNNN`). **They are NOT settlement numbers and must never be shown as one.** This is the root of the owner's fury.
- The **real settlement number lives in `driver_finance.driver_settlements.source_document_ref`** (the 4-digit AlwaysTrack doc). It is populated for the 28 rebuilt Faro tours **5769–5796** + **5797–5800**. `MAX(source_document_ref) = 5800`.
- **A settlement IS a TOUR** = NB (northbound) + optional TR (triangulation) + SB (southbound return). HOS makes weekly settlements impossible — **never group by week/calendar**. Multiple per-load driver bills aggregate into ONE settlement (the tour). Settlements post as **Bill + BillPayment** (driver = vendor), never a single JE.
- **Pre-Settlement = AlwaysTrack "Unsettled Loads"** = delivered/invoiced loads awaiting the return trip to close the tour. An **unsettled tour has NO settlement number** until closed (source_document_ref NULL → show a dash).
- Authoritative refs: `docs/MEMORY_BANK.md` (naming law + rebuild history), `docs/specs/ARCHITECTURE-BLUEPRINT-2026-07-05.md` §2–§3.

**AlwaysTrack "Unsettled Loads" authoritative set (8 loads / 7 drivers):** Rafael 13563 · Luis Armando 13588 · Jose Antonio 13576 · Jorge Luis 13582 · Genaro Guerrero 13583 · Fernando 13581 · Angel Alfonso 13578 + 13585.

---

## 3. WHAT WAS DONE (advance) — with proof

### 3a. Data seeded live (owner-ordered "seed"), PROVEN on Neon USMCA
6 open loads booked via canonical `bookLoad()` (`scripts/ops/cursor-2026-09-11-seed-alwaystrack-open-board.mts`, ran `--apply`), auto-linked to each driver's open tour:
- **13590** NB · AB Global · Carlos Mauricio Pena Carvallo (created `61727a46`) · T164 · $5,500 — opened new tour
- **13591** SB · ROAR · Fernando · T168 · $3,700
- **13592** SB · ES Intl · Jorge Luis · T177 · $4,400
- **13593** SB · Aligator Logistics (created `a483ec5e`) · Luis Armando · T170 · $4,800
- **13594** SB · Daffinson Logistics (created `b321bfa3`) · Jose Antonio · T171 · $3,250
- **13595** SB · Paypa · Rafael · T148 · $1,500
- Driver **Carlos Mauricio Pena Carvallo** created (Probation per Rule 49), + 2 customers above.
- Also fixed **13587** trip_type NB→SB (Angel's tour reads 13578 NB + 13587 SB clean; cancelled 13579 excluded).

### 3b. Code — render side, "settlement number = AlwaysTrack doc, never S-YYYY-NNNN"
Committed on branch `cursor/settlement-number-alwaystrack-doc-2026-09-11` (commit `068580d478`, full DoD block, `money-pr-local-gate` PASSED). Edits:
- `apps/backend/src/driver-finance/tour-readout.routes.ts` — `buildTourReadout`/`TourListRow` expose **`settlement_number = source_document_ref`** (Tours register). (Also carries the owner-ordered **SETL-REVERSED-HIDE** open/closed count filter.)
- `apps/backend/src/accounting/load-costs-board.routes.ts` — `settlement_info` selects `ds.source_document_ref` (Costs + canonical column).
- `apps/backend/src/driver-finance/driver-bills-list.routes.ts` — driver-pay register → AlwaysTrack number.
- `apps/frontend/src/api/tourReadout.ts` + `apps/frontend/src/pages/accounting/LoadCostsBoardPage.tsx` — `settlement_number` field; "Settlement/Tour" column renders it, **dash when unsettled**.
- Both `apps/backend` and `apps/frontend` `tsc --noEmit` = exit 0.

**NOT deployed / NOT merged** — the push tripped an auto-rebase because `origin/main` advanced 47 commits (see §4).

---

## 4. ⚠️ EXACT REPO STATE — RESOLVE THIS FIRST

- **Branch:** `cursor/settlement-number-alwaystrack-doc-2026-09-11`
- **Mid cherry-pick of `068580d478`** (my settlement-number commit) onto fresh `origin/main` (`.git/CHERRY_PICK_HEAD` present).
  - **Staged, auto-merged clean:** `load-costs-board.routes.ts`, `tour-readout.routes.ts`, `tourReadout.ts`
  - **Conflicts RESOLVED (already edited, but NOT yet `git add`ed):** `driver-bills-list.routes.ts` (kept main's shared-lateral `settlement.settlement_number`), `LoadCostsBoardPage.tsx` (kept main's COLUMN-ORDERING + `tourLoadColumns`, applied my `settlement_number` tour column). **Verify no `<<<<<<<` markers remain**, then `git add` both.
- **Stash `stash@{0}` = `cursor-settlement-number-push-clean`** holds the non-PR working-tree files that had to be cleared to push: `docs/bus/INBOX-CC-2.md`, `docs/bus/INBOX-CURSOR.md`, `docs/bus/OUTBOX-CODEX.md`, `scripts/verify-steps/CLAIMED-NUMBERS.json` (other seats' bus edits — preserve/restore with `git stash pop stash@{0}`), plus the two ops scripts and the PR body. (There are 298 older stashes from prior sessions — ignore them.)

### CRITICAL discovery during the rebase — main already centralized the settlement number, still on `display_id`
`origin/main` (commit `a25a07d857`) was refactored (**ACCT-F26140**, 2026-09-11) to resolve the settlement number through shared SQL that **still emits `ds.display_id` (the S-YYYY-NNNN counter)**. To truly kill the counter you must change these **shared sources to `source_document_ref`**:
- `apps/backend/src/accounting/load-cost-rollup.sql.ts:44` — `SELECT ds.display_id … AS settlement_number` → **`ds.source_document_ref`** (feeds the whole Load-Costs board).
- `apps/backend/src/driver-finance/settlement-resolution.sql.ts:30` — `min(ds.display_id) AS settlement_number` → **`min(ds.source_document_ref)`** (`RESOLVE_ACTIVE_SETTLEMENT_LATERAL_SQL`; feeds `driver-bills-list.routes.ts` and `bills.routes.ts`).
- `apps/backend/src/driver-finance/pre-settlement.routes.ts:83` — `s.display_id AS settlement_number` → `source_document_ref`.
- `apps/backend/src/accounting/bills.service.ts:1070` — `s.display_id AS settlement_display_id` → `source_document_ref`.
- `apps/backend/src/accounting/driver-reimbursement-detail.routes.ts:29` — `s.display_id AS settlement_number` → `source_document_ref`.
- `apps/backend/src/master-data/drivers/operations-depth/settlement-history.service.ts:50` — `display_id AS settlement_number` → `source_document_ref`.
- `apps/backend/src/dispatch/driver-pwa/tour-close.service.ts` — `settlement_number` should be the AlwaysTrack doc.

**Recovery options:**
- **(A) Continue:** `git add` the 2 resolved files → apply the §4 shared-source changes → `git cherry-pick --continue` → re-run `node scripts/money-pr-local-gate.mjs` → push clean (stash bus files first, see §7) → PR title must start **`Cursor-`** → merge `--squash --admin` → deploy backend `srv-d7rpem7avr4c73fhp4n0` → verify `GET https://ih35-tms.onrender.com/api/v1/healthz/shallow` `git_sha`.
- **(B) Abort & restart clean:** `git cherry-pick --abort`; the logical change is small — re-apply from this handoff on a fresh branch off `origin/main`. **PR body file:** `scripts/pr-bodies/CURSOR-SETTLEMENT-NUMBER-ALWAYSTRACK-DOC.md` (in stash@{0}).

---

## 5. PENDING WORK (prioritized)

### P0 — the render the owner is looking at right now
1. **Two adjacent columns on EVERY loads-related screen:** `Load #` immediately left of `Pre-settlement / Tour #`. Screens to cover (audit for `load_number` + settlement columns): Load Costs board (all tabs), Loads list, Load detail drawer, dispatch board/sheet, driver-bills list, invoices-from-load, factoring, customer-invoices, driver settlement history. The Tour # column value = `source_document_ref` (dash when unsettled).
2. **Pre-Settlement = ONE ROW PER LOAD, not per tour.** Today `listTours` (tour-readout.routes.ts) returns one row per tour with `legs_label = "NB 13569 → SB 13591 …"`. Owner wants each delivered-but-unsettled **load** on its own row, with its tour/pre-settlement number in the adjacent column. This is a **grouping change** (per-load projection of the open tours), not a cosmetic tweak.
3. **Settlement tab must NOT show unrelated historical/closed tours.** Owner: the Settlement/Tour view is "showing historical and closed … not related to this trip." Scope the register to the current/relevant trips (confirm exact scoping rule with owner: likely only tours with live, current-period legs — NOT the full 5769–5800 history dump).

### P1 — the going-forward numbering (owner: "autogenerate based on always numbers, follow sequence")
4. **Retire the `S-YYYY-NNNN` generator** and **auto-generate the AlwaysTrack sequence**: allocate `MAX(source_document_ref)+1` (advisory-locked, mirror the existing `next_settlement_display_id` pattern), stamp `source_document_ref` **at tour close** via the existing audited writer `setSettlementSourceDocumentRef` (`apps/backend/src/driver-finance/settlement-source-document-ref.service.ts`). Next number after 5800/5801 = 5802…. **This is CC-1's money lane + needs the claim-before-author migration process** (`db/migrations/CLAIMED-MIGRATION-NUMBERS.json`).
5. **Reconcile leftover mis-numbered rows:** open tours `S-2026-0013/0017/0019/0021/0024/0025/0026` (my SB legs joined these) have NO `source_document_ref` → they correctly show dash now, but on close must get the next AlwaysTrack number. **Duplicate `5779`:** `S-2026-0013` (Luis, open) AND `S-2026-5779` (locked) both carry `source_document_ref=5779` — resolve in the rebuild. **Void-not-delete: correct the number, never DELETE a settlement money row.**

### P2 — data still owed
6. **Merge/void the duplicate Angel Alfonso Sosa driver** (`2ee70f40` vs `fba21d80`; open tour `S-2026-0025` uses `fba21d80`) and repoint loads/settlements to the survivor.
7. **Seed missing load 13585** (Direct Connect INC, $2,100, Angel Alfonso, T156, W/O 6492060, Sebring FL→Glendale Heights IL, 09-08→09-10) — Completed in AlwaysTrack, not in our app.
8. **13586 / 13589:** in our app dispatched, in NEITHER AlwaysTrack list — **do NOT deliver** until owner clarifies (likely already settled elsewhere). The delivery script `scripts/ops/cursor-2026-09-11-deliver-unsettled-to-factoring.mts` was ABORTED mid-run; 13586/13589 were NOT delivered.

---

## 6. LANDMINES / CONSTRAINTS (do not violate)
- **USMCA only.** QuickBooks/QBO write-back stays OFF.
- **Void-not-delete** on financial tables. Owner said "delete any autogenerating number" — that means kill the **auto-generation + display**, NOT `DELETE` settlement money rows.
- **Never hand-write GL** (reuse existing posters). **Never enter opening balances.** **Nobody closes a period but Jorge.**
- **Shared checkout:** this working tree is shared across concurrent seats. Do not clobber other seats' uncommitted files (the bus files + `CLAIMED-NUMBERS.json` in `stash@{0}`). Read `git show origin/main:docs/MEMORY_BANK.md` fresh before editing it.
- **No seat-created financial fixtures in prod** except owner-ordered (the AlwaysTrack seed above WAS owner-ordered).
- The reverse→repost executor (`scripts/reverse-repost-usmca-settlements.mts`) has a prod hard-block (`assertNotProd`) — do not quietly remove it.
- **Ship discipline:** `node scripts/money-pr-local-gate.mjs` must be green before push (that is the merge proof); PR title starts `Cursor-`; commit message needs the full DoD block (FINDING `(ACCT|BANK|LST)-F\d+`, LANE, DOD-A..E, VERIFY-1..8, MODULE_PROGRESS, `Live=`, ROOT CAUSE/FIX/GUARD/LIVE PROOF/REMAINING); first content line of the commit must be `FINDING:`.

---

## 7. QUICK-START for the next coder
```
cd /Users/jorgemunoz/IH35-TMS-clean
git status                      # confirm mid-cherry-pick of 068580d478
grep -rnE '^(<<<<<<<|=======|>>>>>>>)' apps/backend/src/driver-finance/driver-bills-list.routes.ts apps/frontend/src/pages/accounting/LoadCostsBoardPage.tsx   # must be empty
# decide: continue (§4-A) or abort (§4-B)
git stash show -p stash@{0}     # the bus files + PR body to restore before/after
```
Then work §5 in order (P0 first — it's what the owner is staring at).
