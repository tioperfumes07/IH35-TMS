# WIRING PLAN — 50 TASKS LOCKED · USMCA · 2026-08-11

**Authority:** This file wins over chat, archived bus docs, `complete:true`, scenario dots, and stale INBOX paste files.  
**Vertical law (2026-08-12):** `docs/lockdown/VERTICAL-WIRING-LAW-2026-08-12.md` — P-rows are **column/class examples**, not permission to finish one module horizontally. P20–P17 = column sweeps on modules 11–28.  
**Entity:** USMCA only `5c854333-6ea5-4faa-af31-67cb272fef80`  
**Countdown:** **NN OF 50** = tasks remaining including this one until wire sprint complete. When task ships, bump STATUS + OUTBOX with new countdown.  
**Built:** FK write-path merged + canonical picker + guard both ways + smoke row FK **NOT NULL**.  
**Live (Box 4):** after task **1 OF 50** — Cascade only, after owner system test.  
**Population:** Jorge uploads **trail** the listed task's FK writer — loads before bills (LAW-0-A).

**Read first:** `00-CODER-START-HERE.md` · **Progress log:** `PLAN-PROGRESS-LOG.md`

**Repo mirror (CI-enforced):** `docs/specs/scoreboard/WIRING-PLAN-50-TASKS-LOCKED.md` · guard `scripts/verify-wiring-plan-50-present.mjs`

---

## Entity scope (owner amendment 2026-08-11 — answered = closed)

| Layer | Scope | Law |
|-------|-------|-----|
| **CODE FIX** | **ALL ENTITIES** (TRANSP · TRK · USMCA) | Every create-path / poster / guard stamps FKs via `operating_company_id`. "USMCA sprint" ≠ USMCA-only code. |
| **LIVE TEST-CREATES + PROVE** | **USMCA only** | Keeps unproven writes off TRANSP QBO mirror + TRK lessor books (money flags OFF). |
| **EXISTING TRANSP/TRK NULL FK ROWS** | **H-track only** | ~16k bills · ~12k invoices · 1,555 fuel — never USMCA test-creates; owner-gated backfill after writers proven. |

**50-track Wave C** = prove poster on **USMCA smoke** · **H-track** = TRANSP/TRK historical economics + orphan FK density · **Company done** = 50-track + H-track + **H-1** owner sign-off.

**1 OF 50** = **USMCA wire sprint complete — NOT company done.**

---

| NN OF 50 | ID | Owner | Wave | Task | Built proof |
|:---:|:---|:---|:---|:---|:---|
| **50 OF 50** | P50 | **ALL** | — | Ack **`00-CODER-START-HERE.md`** + **`CODER-FILE-INDEX-LOCKED.md`** — ignore `_ARCHIVED-*` | OUTBOX `ACK P50` |
| **49 OF 50** | P49 | **Cursor** | infra | Rebase + merge **#5780** (matrix Built/Live/Queue cols + honesty banner) · local gate → `--admin` | PR merged · deploy sha |
| **48 OF 50** | P48 | **Cursor** | infra | Merge **#5767** (banking register void/future filter + categorize recover/payable) | PR merged |
| **47 OF 50** | P47 | **Codex** | A0 | Fleet catalogs POST — no 500 (trailing `--` SQL) | smoke POST 200 + row |
| **46 OF 50** | P46 | **Codex** | A0 | Maintenance catalogs route mounted — no 404 | list API 200 |
| **45 OF 50** | P45 | **Codex** | A0 | Payment-terms creator — no 42701 dup column | create succeeds |
| **44 OF 50** | P44 | **Codex** | A | **Lists** — Wave A linkage atoms on all list cards → canonical create R=W | picker smoke FK |
| **43 OF 50** | P43 | **Codex** | A | **Customers** — customer FK on create + every consumer picker | smoke customer_id |
| **42 OF 50** | P42 | **Codex** | A | **Vendors** — vendor FK on create + bill/expense pickers | smoke vendor_id |
| **41 OF 50** | P41 | **CC-2** | A | **Safety** — accident/violation create stamps driver · unit · load · claim_id | Neon FK not null |
| **40 OF 50** | P40 | **CC-2** | A | **Drivers** — hub tiles wired to canonical driver_id paths · dedupe drift cleared | profile smoke |
| **39 OF 50** | P39 | **Codex** | A | **Dispatch** — Book Load stamps customer · driver · unit · trailer · load FKs | load row FKs set |
| **38 OF 50** | P38 | **CC-1** | A | **Accounting bills** — create/update stamps unit_id · vendor_id · load FK | bill smoke row |
| **37 OF 50** | P37 | **CC-1** | A | **Accounting invoices** — source_load_id · customer_id on create | invoice smoke |
| **36 OF 50** | P36 | **CC-1** | A | **Settlements** — settlement stamps driver_id · load_id on create | S-* smoke FKs |
| **35 OF 50** | P35 | **CC-2** | A | **Insurance** — ClaimCreate/Spawn stamps 6 NULL FKs · backfill 2 USMCA claims | graph populated |
| **34 OF 50** | P34 | **CC-2** | A | **Legal** — matter create stamps insurance_claim_id · driver · unit | matter smoke |
| **33 OF 50** | P33 | **CC-2** | B | **Insurance** — `/claims/:id/graph` + reverse sections on Driver/Unit/Load profiles | click-back live |
| **32 OF 50** | P32 | **CC-2** | B | **Banking** — categorize → EntityLink forward + register drill reverse | click chain |
| **31 OF 50** | P31 | **Codex** | B | **Dispatch** — LoadDetailDrawer reverse gold standard on all hub links | F+R click |
| **30 OF 50** | P30 | **CC-2** | B | **Settlements** — driver profile reverse settlement S-0085 + load column | reverse nav |
| **29 OF 50** | P29 | **CC-1** | C | **Settlements** — settlement→GL (`driver_settlement_gl_bills` / `gl_runs` > 0) | balanced JE |
| **28 OF 50** | P28 | **CC-1** | C | **Accounting** — bill→GL poster on new USMCA bill (extend proven path) | JE + register |
| **27 OF 50** | P27 | **CC-1** | C | **Accounting** — invoice→GL when posting flag ON | balanced JE |
| **26 OF 50** | P26 | **CC-1** | C | **Banking** — categorize→matched JE + driver GL provision path with CC-2 UI | match + JE |
| **25 OF 50** | P25 | **CC-1** | C | **Insurance** — deductible→driver_liabilities→settlement_deduction | money chain |
| **24 OF 50** | P24 | **CC-1** | C | **Factoring** — advance liability JE (flag OFF until owner chat) | poster path exists |
| **23 OF 50** | P23 | **Codex** | D | **Priority 10** — picker_law: `+ Add new` first row → creator → R=W → reload | V2 smoke all |
| **22 OF 50** | P22 | **CC-2** | D | **Priority 10** — qbo_chrome parity drawers on money surfaces | guard green |
| **21 OF 50** | P21 | **Cursor** | — | Matrix **Built ÷ Required = 100%** on priority 10 boards (honest API feed) | scoreboard metric |
| **20 OF 50** | P20 | **ALL** | A | **Modules 11–28** — Wave A linkage column sweep (same column id all seats) | batch Built cells |
| **19 OF 50** | P19 | **ALL** | B | **Modules 11–28** — Wave B connectivity + reverse_link | batch Built |
| **18 OF 50** | P18 | **CC-1** | C | **Modules 11–28** — Wave C money columns (serial) | batch Built |
| **17 OF 50** | P17 | **Codex+CC-2** | D | **Modules 11–28** — Wave D chrome | batch Built |
| **16 OF 50** | P16 | **Cursor** | — | Matrix Built 100% **all 28** module boards | system rollup |
| **15 OF 50** | P15 | **Jorge** | pop | **Loads** bulk upload — **only after P39 merged** | real load FK hub |
| **14 OF 50** | P14 | **Jorge** | pop | **Bills + bill payments** — **only after P38+P28** | unit/vendor/load set |
| **13 OF 50** | P13 | **Jorge** | pop | **Bank categorize + payments** — **only after P26** | matched rows |
| **12 OF 50** | P12 | **Jorge** | pop | **Settlements + dispatch ops** — **only after P36+P29** | settlement chain |
| **11 OF 50** | P11 | **Devin-A** | test | System test — priority 10 flows USMCA Chrome | PASS/FAIL log |
| **10 OF 50** | P10 | **Devin-A** | test | System test — remaining modules + population data | PASS/FAIL |
| **9 OF 50** | P09 | **Cascade** | Live | Box 4 Live — priority 10 sample PROD-VERIFIED (V2/V3/V4) | ledger tier |
| **8 OF 50** | P08 | **Cascade** | Live | Box 4 Live — all 28 modules PROD-VERIFIED | ledger complete |
| **7 OF 50** | P07 | **CC-1** | fix | **USMCA-only** orphan backfill — claims NULL FK cohort (logged) · TRANSP/TRK → **H-5** | USMCA NULL % down |
| **6 OF 50** | P06 | **Cursor** | guard | Ratchet guard: no new row without required FK on create (**all opcos**) | guard green |
| **5 OF 50** | P05 | **Codex** | fix | Fuel Wave A+C when **USMCA** rows exist · TRANSP 1,555 historical fuel → **H-5** | USMCA scoped |
| **4 OF 50** | P04 | **CC-2** | fix | Driver Hub + Factoring FE chains unwalkable until rows + links | F+R smoke |
| **3 OF 50** | P03 | **ALL** | — | **`PLAN-PROGRESS-LOG.md`** — every seat current countdown matches this table | audit match |
| **2 OF 50** | P02 | **Cursor** | bus | STATUS-NOW + INBOX countdown sync after every merge | no stale SHA |
| **1 OF 50** | P01 | **Owner** | done | **USMCA wire sprint complete — NOT company done** — authorize Cascade USMCA Live (P09/P08) | owner sign-off USMCA |

---

## Seat focus (current — updates when task ships)

| Seat | **NOW (NN OF 50)** | NEXT |
|------|-------------------|------|
| **Cursor** | **47 OF 50** P02 bus sync + P06 guard | P47 coordinate Codex |
| **Codex** | **47 OF 50** P47 fleet catalog A0 | P46→P45 A0 |
| **CC-1** | **36 OF 50** P36 settlements FK · P38+#5805 P37+#5810 shipped | P36 then Wave C serial |
| **CC-2** | **41 OF 50** P41 safety FKs | P35 insurance |
| **Devin-A** | **Hold** until P21 — then P11 | prove only |
| **Cascade** | **Hold** until P11 — then P09 · bus on **Desktop only** | verify only |
| **Jorge** | **Hold** until P15 — population trails writers | loads first |

**Drop from queue:** C-10 limit=300 — **fixed on main #5795** (`limit=200` at `accounting.ts` listClassesForJe).

---

## OUTBOX shape (mandatory)

```
<SEAT> | NN OF 50 | P49 | SHIPPED #5780 @ sha | Built=<cells> | NEXT=P48
```

Forbidden: skip countdown · load archived docs · `complete:true` as done · build insurance scenario before P35 · Tier S without `NOT linkage done` · treat **1 OF 50** as company done without **H-track**.

---

## Historical Reconcile Track (H-track) — **after USMCA writers proven · NOT in 50 countdown**

| ID | Owner | Task | Proof |
|:---|:---|:---|:---|
| **H-5** | **CC-1** | Backfill TRANSP/TRK orphan FK cohorts using **same proven writer logic** as P38/P37/P36… Additive · void-not-delete · migrate→verify→repoint. Cohorts: bills.unit_id (~15,947) · invoices.source_load_id (~11,980) · fuel.load_id (1,555) · expense load/category/customer. **No invented load FK** on pre-dispatch import cohort. | NULL % down per entity · tie-out |
| **H-4** | **CC-1** | Re-run **RECON-01** TRANSP↔QBO after each backfill slice — prior tie-out is baseline; must still tie to cent | regression green |
| **H-3** | **Cursor** | `verify-fk-on-create.mjs` — fails if **any opco** creates bill/invoice/claim/settlement without required FK (extends P06) | guard both ways |
| **H-2** | **Cascade** | Box 4 Live on **TRANSP/TRK financial chains** after H-5 — NULL% down · tie-out green | PROD-VERIFIED |
| **H-1** | **Owner** | Sign-off: TRANSP/TRK books reconciled + linked = **company truly done** (not 1 OF 50) | owner sign-off |
