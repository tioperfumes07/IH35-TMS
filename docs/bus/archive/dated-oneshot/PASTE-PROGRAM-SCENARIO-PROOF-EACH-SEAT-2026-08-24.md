# PASTE TO EACH CODER — BEGIN NOW (owner 2026-08-24 15:16 CT)

**Shared law (every seat reads this first):** `docs/lockdown/PROGRAM-SCENARIO-MATRIX-CONNECTIVITY-PROOF-2026-08-24.md`  
**Complicated TESTs + printables:** `docs/lockdown/COMPLICATED-SCENARIO-BATTERY-AND-PRINTABLE-PROOF-2026-08-24.md`

**POSTING:** All USMCA postings are **LIVE**. All app flags are **ON** except **QuickBooks** and **Trucking / Transportation (TRANSP / TRK)**. Those stay OFF. No TMS→QBO write-back. Work only as **USMCA**.

**Create labeled TEST** through the live wizard. **Void at launch**, not now.

**Do not** restamp U14. Unique 500 / dead click / silent save / reverse-empty / missing JE = FINDING same turn.

**ACK line:**

```
SEAT | ACK | PROGRAM-SCENARIO-PROOF | NOW=/program | SHA=<healthz> | HOP=<key> | TABLE=<schema.table> | UUID=<id> | JE=<id> | FINDING=<id-or-none> | GO
```

---

## Cursor (9222) — paste

```
Cursor | GO | PROGRAM-SCENARIO-PROOF | POSTING=LIVE USMCA | QBO+TRANSP+TRK=OFF

git pull --ff-only origin main
Open /program. Run hops 1–9 on ONE labeled TEST load, then scenario.breakdown_relay (dead truck → replacement truck, same load). Print dispatch sheet + invoice letter (not SPA).
Open /program/matrix?module=dispatch and ?module=customers. Click Required leaves to live pages.

PROOF: mdata.loads UUID · assignment history unit swap · invoice customer_id+load_id · journal_entries balanced · payment drops Open.
Missing JE after save = FINDING (posting is ON). FAST-MERGE unique. Deploy 5–10 min AND 5–10 PRs. Never trigger QBO.
```

---

## CC-1 (9223) — paste

```
CC-1 | GO | PROGRAM-SCENARIO-PROOF | PORT=9223 | POSTING=LIVE

Hops 6–9 + scenarios coa, ap, factoring, banking, escrow, roadside_ap.
CREATE TEST invoice, bill, bill payment, expense, factor packet if empty.
Print invoice + proforma + bill letters (wrapPdfDocument, not SPA).
Prove accounting.invoices, accounting.bills, accounting.journal_entries + postings, banking match.
Matrix: ?module=accounting ?module=banking ?module=factoring
Never trigger_deploy. Never /425c. Never QBO write-back. Never TRANSP/TRK.
```

---

## CC-2 (9224) — paste

```
CC-2 | GO | PROGRAM-SCENARIO-PROOF | PORT=9224

After TESTs exist from hops, prove /reports /cash-flow /finance /tasks show THOSE rows (same UUID/dollars) AND Print letters. Fake $0 = FINDING.
Form 425C print = court form. Do not loop leftover /425c certify.
Matrix ?module=reports. CREATE TEST if a report has nothing to bind.
Never remake Close. Never trigger_deploy.
```

---

## CC-3 (9225) — paste

```
CC-3 | GO | PROGRAM-SCENARIO-PROOF | PORT=9225

/program + /program/matrix?module=lists + ?module=legal
Scenario legal + parts_receive. Print WO letter + inventory receive if Print exists.
Unique leftover chrome only (/help /system /inventory /users /docs /home).
Dead matrix cell / 500 / silent tab = FINDING. Never roadside remake. Never trigger_deploy.
```

---

## Codex (9226) — paste

```
Codex | GO | PROGRAM-SCENARIO-PROOF | PORT=9226 | POSTING=LIVE

Hops 2–5 on the TEST load + scenario.breakdown_relay (replacement truck) + trailer_swap + driver_onboarding, settlement, advance, deductions, escrow, fuel, maintenance, accident, insurance.
CREATE TEST driver/unit/WO/fuel/settlement. Prove unit-swap history + FKs both ways + settlement JE if money.
Print dispatch sheet + WO.
Matrix: ?module=drivers ?module=fleet ?module=safety ?module=fuel
Never restamp U14. Never QBO. Never TRANSP/TRK. Never trigger_deploy.
```

---

## Cascade — paste

```
Cascade | GO | PROGRAM-SCENARIO-PROOF | AUDIT ONLY | POSTING=LIVE

Live-walk all 9 hops on /program + breakdown/replacement-truck battery + money matrix (accounting banking factoring settlements).
CREATE TEST if a hop is empty. Prove invoice↔customer↔load, bill↔vendor, settlement↔driver, dead-unit≠live-unit, JE postings exist.
Print dispatch sheet + invoice letter.
FINDING if save with no ledger row (flags are ON). No product PRs. No U14 restamp. No QBO.
```

---

## Devin-A — paste

```
Devin-A | GO | PROGRAM-SCENARIO-PROOF | NOT PARKED | POSTING=LIVE

/program hop.book + scenario.customer. Matrix ?module=customers then dispatch.
CREATE labeled TEST customer + TEST invoice. Prove list Open = invoice Open = detail aging (draft is not A/R).
Then walk the TEST load as far as Book/assign. File FINDING if table/ledger miss.
No U14 restamp. No QBO. Void TESTs at launch, not now.
```

---

## Devin (if a second Devin seat)

Same as Devin-A. Read `docs/bus/INBOX-DEVIN-A.md`.
