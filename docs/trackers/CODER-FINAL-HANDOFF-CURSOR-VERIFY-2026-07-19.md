# CURSOR VERIFY overlay — 2026-07-19 (updated after v2 reconcile)

Adversarial check of `CODER-FINAL-HANDOFF-2026-07-19.md` (PR #2762 tip includes v2).  
Owner asked for agree/disagree + settle contested Neon numbers.

## Cursor endorsement of Claude’s reconciled position

| Topic | Cursor |
|---|---|
| Provenance LIVE / TRIAGE / RELAYED | **AGREE** — correct honesty |
| bf10b SPLIT (recon-register vs CDC) | **AGREE** — CDC omits Purchase/Deposit/Transfer; keep CDC OPEN |
| DECIDED ≠ tracker updated / ≠ built | **AGREE** (Claude conceded) |
| 0257-audit-88 keep OPEN | **AGREE** |
| 174/177/181 = decline new platform | **AGREE** |
| audit171 → BUILD (lightweight DQ) | **AGREE** — prod DQ is real |
| D order: RECON → MOR → flow5; SoD DEFER-WITH-TRIGGER | **AGREE** — OWNER-APPROVED 2026-07-19; §1.4 per-item gate still stands |
| E / F / G as grouped | **AGREE** |
| Rev-rec: decision closed (#2733); impl prereqs open | **AGREE** — do not flip flag until Unbilled CoA + earn-first path |
| Fresh chat for financial D builds | **AGREE** — good hardline |

## AUTHORITATIVE Neon (Cursor re-ran 2026-07-19, `br-fancy-credit-akjnd07a`, `app.bypass_rls='lucia'`)

These **replace** CONTESTED rows in §7 / §12. GUARD’s PM=0 and phone=2 are **superseded**.

| Metric | AUTHORITATIVE |
|---|---|
| Active drivers (`status='Active'`) | **165** |
| `phone = '000-000-0000'` | **74** |
| phone null/blank | **0** |
| placeholder loose (`000|111|555|999|test…`) | **76** |
| `driver_finance.driver_settlements` rows | **0** (prior re-run; still stands) |
| blank hire_date / blank CDL / sample_flagged | **165 / 16 / 78** (prior re-run; still stands) |
| `mdata.units` total | **186** |
| InService units | **82** |
| `maintenance.pm_schedules` total / `is_active` | **30 / 30** |
| InService units with ≥1 active PM | **4** |
| Distinct units with any active PM | **5** |

**Interpretation:** PM is **incomplete coverage**, not “zero PM in TMS.” Phone DQ scope is **~74 zero-phones**, not 2.

## RECON-COLLECTOR priority — AGREE #1, with precision

Live prod:

| Surface | Evidence |
|---|---|
| `accounting.qbo_remote_counts` | **FROZEN** — 3 rows, all `qbo_vendors`, `collected_at` max **2026-06-03T04:07:06Z** |
| `accounting.recon_runs` | **NOT dark** — 131 non-voided rows; newest starts **2026-07-20**; types include `pm_categorization_diff`, `master_data_drift_*`, `am_bank_count` (newest bankish **2026-07-19T11:00Z**) |

So: **unfreeze / fix the remote-count collector is HIGH and real.**  
Do **not** claim “all twice-daily recon is dark” — some recon_runs still fire. Scope D-#1 to: restore collector that feeds lists/QBO remote counts + prove the **money** TMS↔QBO twice-daily path is healthy (separate acceptance from Lists Hub tiles).

## Final Cursor ruling card (matches Claude v2 + this settle)

1. **A** — DECLINE enterprise noise **except** `0275-audit171` → **BUILD (gated, small DQ monitor)**  
2. **B** — no blanket CLOSE; bf10b **SPLIT**; 0257 **OPEN**; 174/177/181 decline-new-platform  
3. **C** — DEFER/DECLINE nice-to-haves as grouped  
4. **D** OWNER-APPROVED scope+order (gated, design-first; **§1.4 per-item diff/SQL still required**):  
   1. RECON-COLLECTOR / `qbo_remote_counts` unfreeze (+ money-recon health proof)  
   2. MOR pre/post-petition A/P  
   3. flow5 (§9.1 execute)  
   4. then flow2 · ruling-3 · module25 · P4 · accessorial · 0518-r18 · 0091-m-factor-1 · **audit171**  
   5. `0519-at2` SoD = **DEFER-WITH-TRIGGER** (not build-now)  
5b. **Fleet status integrity (new, AUTHORITATIVE):** `InService` + `deactivated_at` set = **45** total / **4** non-sample — real contradiction; track as DQ/cleanup (gated if write).  
5. **E** KEEP-AS-IS all 4  
6. **F** frontend queue now (non-financial)  
7. **G** owner-enter / cleanup  

## Coder must not
- Open a “zero PM schedules” emergency — use AUTHORITATIVE table above  
- Scope phone cleanup as “2 rows” — use **74** `000-000-0000`  
- Purge VISUAL-LAYOUT on SHA ancestry alone  
- Flip `REVENUE_RECOGNITION_POST_ENABLED` before Unbilled CoA + earn-first path  

## Files
- Handoff v2: `docs/trackers/CODER-FINAL-HANDOFF-2026-07-19.md`  
- This overlay: `docs/trackers/CODER-FINAL-HANDOFF-CURSOR-VERIFY-2026-07-19.md`  
- Purge PR: https://github.com/tioperfumes07/IH35-TMS/pull/2762  
