# CURSOR VERIFY overlay — 2026-07-19
_Adversarial check of `CODER-FINAL-HANDOFF-2026-07-19.md` (PR #2762). Owner asked: inspect answers, verify real, disagree openly._

## Verdict on the handoff as a whole
| Claim | Cursor verdict |
|---|---|
| Counts 34 / 61 / 587 / 504 / 1186 + purge 287 | **AGREE** — matches regenerated `BLOCK-RECONCILIATION-2026-07-19.md` on the PR branch; purge plan = 148 resolved + 116 noise + 23 duplicate |
| Purge method (superseded_by / duplicate_of, reversible) | **AGREE** — sampled retired JSON carries `superseded_by` evidence strings |
| Provenance labels LIVE-REPO / TRIAGE / RELAYED-GUARD | **AGREE as process** — honest. Prod §7 must not be treated as Cursor-verified until re-run |
| "60 decisions already answered in corpus" | **AGREE that many citations are real** (e.g. lockdown §9.1 / §9.6 / §8.6 checked) — **DISAGREE that the tracker was updated**: ~38 "DECIDED" IDs remain listed in §4 open backlog; `h-03-open-queue-navy-cta` still `NEEDS-VERIFY` with no `superseded_by` |
| DECIDED = DONE / build complete | **DISAGREE** — DECIDED means a written ruling exists; many are design-only (e.g. 0251-gap12 has a design for `requires_equipment`, commodity catalog still unbuilt) |
| VISUAL-REMAINDER "merge-base --is-ancestor → on main" | **DISAGREE on the git test** — `b314b2639` / `02c3064d2` / `6fab66fa2` are **not** ancestors of current `origin/main` (history rewrite). **Partial agree on product**: AdvanceDetailDrawer "Edit cash advances…" disable+toast **is** on `origin/main` today. `VISUAL-REMAINDER-LAYOUT` on the purge branch has **empty** `superseded_by` — do not purge LAYOUT on that evidence alone |
| Notable bugs (settlement-payment routes, HoldDeduction id) | **AGREE likely real** — `registerSettlementPaymentRoutes` defined, no other backend import found; HoldDeductionModal wiring present on SettlementDetailPage |

## Independent Neon re-verify (Cursor, br-fancy-credit-akjnd07a, `app.bypass_rls='lucia'`, 2026-07-19)
Replaces §7 rows that were wrong or stale. Claude's "PM=0 / phone=2" must not be handed to Coder as fact.

| Item | Claude RELAYED | Cursor LIVE | Notes |
|---|---|---|---|
| Active drivers | 165 | **165** | `status = 'Active'` |
| Settlements rows | 0 (all drivers) | **0** in `driver_finance.driver_settlements` | Matches; interpretation (QBO-side for now) still owner |
| Blank hire_date | 165/165 | **165/165** | Matches |
| Blank CDL | 16 | **16** | Matches |
| is_sample_data=true | 78 | **78** | Matches count; Mexican-CDL/B1 interpretation still RELAYED unless re-proved |
| Placeholder phone | "2" | **74** with `phone = '000-000-0000'` (0 blank) | **Claude undercounted** |
| Units total | 186 | **186** | Matches |
| "Active" units | "50" | **82 InService** (+78 Sold, +26 OutOfService) | Status enum ≠ "active" |
| PM schedules | **"0/50 active units"** | **30** `pm_schedules` with `is_active`; **4/82 InService** have ≥1 active PM | **Claude wrong** — not zero coverage |
| VIN blank on active fleet | "0 blank / 50 complete" | **UNVERIFIED this pass** | Not re-run; do not CLOSE from relay alone |
| GL flags all ON | RELAYED CLOSE | **UNVERIFIED this pass** | Owner previously said parallel-books ON is intentional — agree with "do not flip OFF" as policy, not as a fresh count |

## Internal contradictions inside the same handoff (do not CLOSE blind)
1. **bf10b-qbo-recon-six-types** — §4 backlog says `qbo-recon-reads.ts` REMOTE_ENTITY_KEY maps **5** master objects; §9 REC says CLOSE because recon-cron has **6 bank register** sources. Both can be true (different surfaces). **Do not CLOSE** until the original finding's object list is named.
2. **0257-audit-88** — UNDECIDED corpus note = tariff/HTS classification absent; Group B CLOSE = "border-crossing module exists." Module existence ≠ HTS gap closed. **Do not CLOSE**.
3. **CDC omits Purchase/Deposit/Transfer** (notable bugs) vs bf10b CLOSE — CDC string on main is still `Invoice,Bill,Payment,BillPayment,JournalEntry,CreditMemo,Customer,Vendor,Item,Account` (**no Purchase/Deposit/Transfer**). Keep CDC gap OPEN.

## Revenue-recognition conflict (§6)
**AGREE there is a real prereq conflict** before `REVENUE_RECOGNITION_POST_ENABLED`: two-event latch docs (#2733/#2735) vs deferred-shaped schema. **Do not flip the flag** until Unbilled CoA seeded + earn-first path exists. Matches standing owner hold from this Cursor session.

## Cursor recommendations on Groups A–G (for Jorge to rule)

### A — DECLINE enterprise templates → **AGREE decline all 10**
Single-carrier Ch.11 shop; these are audit-template noise. Reclassify as noise after your "decline all".

### B — CLOSE as resolved → **DISAGREE "close all"**
| ID | Cursor |
|---|---|
| 0275-audit174 / 177 / 181 | **Partial decline** as new platforms — keep if they ask for dashboards you don't want; do **not** mark "resolved built" |
| p1-dashboard-implementation | **CLOSE** only the generic "no dashboard" claim; Home exists |
| bf10b-qbo-recon-six-types | **KEEP OPEN** (see contradiction) |
| 0257-audit-88 | **KEEP OPEN** (HTS/tariff vs module existence) |

### C — DEFER → **AGREE defer** audit3 / 16 / 17 / 21 / factoring-g3
No urgency pre-launch.

### D — BUILD gated → **AGREE greenlight HIGH first only until capacity**
1. **HIGH now (design-first, financial gate):** `dip-mor-pre-post-petition-ap-split`, `PHASE2_RECON-COLLECTOR` unfreeze  
2. **HIGH next (canonical money):** `flow5` consolidate onto `driver_finance.driver_settlement_deductions` (lockdown §9.1 already decided — this is **execution**, not a new policy)  
3. **CPA-needed:** `ruling-3` escrow current vs LT; `P4-07` parts-GL  
4. **Connectivity P4-01..06:** BUILD, but each needs a 1-page allowed_files design before code (Rule 14)  
5. **0519-at2 DB SoD:** **DEFER** unless lender asks — app-layer maker-checker exists; DB triggers are heavy for owner-run shop (disagree with Claude's "HIGH given embezzlement" as automatic yes)  
6. **module25 / flow2 / ACCESSORIAL / 0518-r18 / 0091-m-factor-1:** agree build, after HIGH

### E — KEEP-AS-IS policies → **AGREE confirm all four**
Manual payment apply; 5% net-pay floor; no auto driver-status from safety; no auto escrow deduct.

### F — Frontend non-financial → **AGREE queue**
idvr row click; `/finance` stub→hub; compliance tabs → URL sync (same pattern as URL-sort PRs).

### G — Owner-enter / cleanup → **AGREE**
Exhibit C OB = you enter; $0.02 TB = gated test cleanup; underspecified retention/notifications → re-author or drop.

## What Coder must not do from the uncorrected §7
- Do **not** open a "zero PM schedules" emergency block — data shows 30 active schedules / 4 covered InService units (gap = incomplete coverage, not absence).
- Do **not** treat "2 placeholder phones" as the DQ scope — **74** `000-000-0000` on Active drivers.
- Do **not** purge VISUAL-LAYOUT on ancestor SHA alone.

## PR / process
- Handoff file for Coder: `docs/trackers/CODER-FINAL-HANDOFF-2026-07-19.md` + **this overlay**.
- Merge #2762 only after CI green (docs/tracker-only).
- URL-sort babysit remains separate (#2754/#2756/#2757/#2759/#2760/#2763 etc.).
