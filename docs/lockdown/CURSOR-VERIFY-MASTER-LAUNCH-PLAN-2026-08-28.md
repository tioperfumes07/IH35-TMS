# CURSOR VERIFY — MASTER LAUNCH PLAN 2026-08-28

**Verdict: AGREE on the bar and the sequence. DISAGREE on three counts, one “tomorrow” slice, and “drop dead columns.”**

Live healthz was last proven **`7eda992`**. Plan’s `main HEAD: e52ccec` is stale. After #16832, `origin/main` includes C25–C31 + sample-data report filter. **Do not recertify U14.** USMCA only.

Instrument: `scripts/verify-gl-invariants.sql`. Opening-balance vs QBO **UNVERIFIED this seat** (no live QBO pull).

---

## 1. Agree (follow this)

- **LAUNCH-SAFE tomorrow ≠ CERTIFIED on 903 leaves.** Arithmetic: 903×2 min ≈ 30 h click; six seats ≈ 5 h with **zero** defects. CERTIFIED tomorrow is false. I will not withdraw that.
- **Money cells first.** Systemwide money Required counts on `origin/main`: `gl_je` 98, `ap_bill` 39, `liability` 26, `expense` 22, `settlement` 22, `bank` 19, `invoice` 14 = **240**. Connectivity 1136 + qbo_chrome 627 dominate the rest.
- **105 `prod_verified:false` in five modules only:** safety 37, lists 23, drivers 20, banking 18, vendors 7. Other 25 completion JSON files: 0 false. **105 confirmed.**
- **`safety.json`:** 38 items, **36 PASS + 2 HOLD**, `pass_count: 38` (wrong), `M: 32` (wrong), `complete: true` (illegal vs HOLD). HOLD ids: `SAF-B08` (prod_verified **true**), `SAF-ORPH-05` (prod_verified **false**).
- **`lists.json`:** 23 items, `M: 18` (wrong), all 23 `prod_verified: false`.
- **`scenario.ap` (3) and `scenario.dispatch` (1) Required but undeclared** in `columns.shared.json`.
- **`claim`, `accident`, `policy`, `legal_matter` never Required** on any leaf in 29 modules. **Do not delete them** (never-delete law). **Bind** on insurance/safety/legal in Wave 0.
- **Customers zero-Required:** `md.statements`, `md.recurring_transactions`, `md.projects`, `md.late_fees`, `md.opportunities`, `md.conversations`. Owner decide: specify or honesty-drop. Silent pass is a defect.
- **Ledger defects A/B/C + $15,295.50 gross / $2,845.50 net.** INV-4 still **4** invoices. Sample JE headers **163**. Do not void INV-37/38/44/45. Do not “activate” duplicate-role twins.
- **Withdrawals in plan §7:** complete for Cursor’s list. Add: unscoped INV-14 mixed TRANSP+USMCA display_ids; INV-15 `INV-2026-00021` $0 shares load with 00023.
- **Monitor:** 10 detectors on `_system.reconciliation_findings`, `ledger.integrity_cron`, Ledger Health **no human close**, owner `force_ack` on critical. Triage 184 Samsara criticals or written accept.
- **LAW-6 no CPA. LAW-8 USMCA only.** TRANSP/TRK are not the operating bar.
- **Wave order 1→2→3 then 4.** Guards must **fail first**. Cash-flow/finance **last**.
- **Seats:** CC-1 Wave 2 only (GL). CC-2 guards+detectors (mod-4 ≡3, claim-before-write). CC-3 UI+stranded/roles guards. Cascade/Devin/Codex audit, no GL math, no `trigger_deploy`. Owner: branch protection + correcting entry + HOLDs.

## 2. Disagree / correct (do not follow the stale numbers)

| Plan said | Cursor on `origin/main` after #16832 |
|---|---|
| U14 903 leaves / 2,692 cells | **904 / 2,699** (`accounting` + `economics.invariants` = 7 C25–C31 cells) |
| U14 money cells ~240 | **U14 money cells = 217**. **240 is all 29 required.json modules**, not U14-only. U14 `gl_je` = **80**, not 98. |
| Matrix “32 columns” after C25–C31 + scenario.* | Shared already **32** (C25–C31 merged). Declaring `scenario.ap` + `scenario.dispatch` → **34**. Do not drop the four B9 columns. |
| Cursor never product code | **Already shipped** TB/P&L/BS/CF/register `is_sample_data` exclude (#16832). Remaining GL math = **CC-1**. |
| Wave 4 (~240 money leaves) **tomorrow** | **Not in the same calendar day as Wave 2 write.** Mechanism + INV-3 = $0.00 + detectors red-until-green **is** LAUNCH-SAFE. Walking 217–240 leaves with JE line proof is **days**, not hours. |
| insurance / legal / lists in Wave 4 money | **0 money Required cells** on insurance, legal, lists. Bind `claim`/`policy`/`accident`/`legal_matter` first or they cannot take FW-13. |
| Drop dead columns | **Forbidden.** Bind. |

## 3. LAUNCH-SAFE tomorrow (Cursor’s tighter 10)

Replace plan §10 item 8 (“all §6 money leaves walked”) with:

1. INV-3 AR/AP difference **$0.00** (after CC-1 + owner correcting entry).
2. INV-4 **0** rows.
3. Event-2 void reverse + unapplied-not-on-AR proven (INV-14 **USMCA-scoped**).
4. Reports exclude sample; rows remain.
5. Wave-1 guards failed-then-green.
6. `ledger.integrity_cron` + Ledger Health; ledger findings **self-close only**.
7. C25–C31 live (done). `scenario.ap`/`scenario.dispatch` declared.
8. **One** USMCA lifecycle slice with JE lines recorded — not 240 leaves.
9. Branch protection ON (owner).
10. `safety.json` / `lists.json` header vs array honesty.

**Not tomorrow:** 105 unverified, 2,450 chrome cells, period close, cash-flow certify, U14 CERTIFIED.

## 4. Wave 0 leftover (Cursor docs, not GL)

- Declare `scenario.ap`, `scenario.dispatch`.
- Bind B9 columns on insurance/safety/legal leaves that actually owe them.
- Fix `safety.json` pass_count/M; `lists.json` M; banking ranked-fail **status** field.
- LAW-5 self-closing findings into lockdown + a guard that forbids human resolve on `integration='ledger'`.

**If we agree on §1 + §3 and the corrections in §2, this is the plan.**
