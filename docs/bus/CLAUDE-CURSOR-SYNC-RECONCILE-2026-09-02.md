# Claude ↔ Cursor sync reconcile — Jorge-facing


> **SUPERSEDED (2026-09-02 PM) on 5% net-pay floor + half-built count:** Sections below that say **owner-open** for the 5% floor or **8/10 half-built remain** are **STALE**. Locked answers: `docs/bus/OWNER-RULINGS-LOCKED-SYNC-2026-09-02.md` (CPA §9.2–§9.3 Accept/Edit + #19708 UI; **2 real table gaps** — workers_comp + cargo dispute namespace; fuel advance paths; USMCA blank except bank uncategorized Dec 2025+; ParityTable + Combobox only).

**Date:** 2026-09-02  
**Verified:** `origin/main be6f940d9b` · Neon `br-fancy-credit-akjnd07a` · USMCA only  
**Primary sources:** owner `THREE-WAY-RECONCILIATION-2026-09-02.md` + `IH35-PENDING-REGISTER-2026-09-02.xlsx` in Downloads seat-instructions folder

---

## Sync verdict: **NO — partially aligned, four production gaps named**

We are **in sync on law and sequence** (GO-22 first, never seat Book Load, fuel ≠ driver deduction, tour close geofence). We are **not in sync on “BUILT”** for four money/dispatch items where inventory says done and Neon/source say otherwise.

**Why not fully reconciled:** three independent inventories were written at different SHAs; main moved faster than hand re-verify. Claude’s THREE-WAY doc is the best current anchor; this file adds Cursor verification and xlsx row summary.

---

## Agreed facts (all seats)

| Fact | Proof |
|---|---|
| USMCA money spine unproven | 0 JEs · 0 settlements · 0 bills · 0 invoices |
| One real load | 13508 draft; no driver; no miles saved; 2 stops, 0 `location_id` |
| GO-22 settlement tour is #1 blocker | Every seat instruction + xlsx rows 13–22 |
| Miles **code** gate loosened (#19689) | `BookLoadModalV4.tsx:620` · `lane.fills` · audit-only `autofill_allowed` |
| 3,338 lane rows all have practical miles | Neon `catalogs.lane_mileage` |
| K2 + J1 open | 277 trapping picker importers (up from 268 baseline); 997 off-scale sizes |
| N1 expense from load | `LoadDetailDrawer` → `/accounting/expenses/new?load_id=` |
| A2 / A1 / GO-24 / capitalize import / accessorial parents | Source + Neon per MASTER-V2 |

---

## Disputes — who wins

| Topic | Inventory claim | Winner | Proof |
|---|---|---|---|
| Company settlement 5753 | BUILT | **Claude / Neon** — NOT BUILT | 0 `%company_settlement%` tables; view only |
| Bill driver on road repair | BUILT (#19459) | **Claude / Neon** — PARTIAL | `driver_id` yes · **`driver_uuid` N/A** (column is `driver_id`) |
| Driver bill = load # | PARTIAL / unknown | **Claude / file** — NOT DONE | `driver-bill-number.ts` → `B-` |
| Miles proved on 13508 | PROVED #19696 | **Claude / Neon** — NOT PROVED | `updated_at == created_at`; miles NULL |
| Bill **create** from load | NO entry (MASTER-V2 #32) | **Claude THREE-WAY** — BUILT | `BillsReverseSection.tsx:81` `bills/vendor?load_id=` |
| B1 AlwaysTrack | Mixed | **Owner / source** — OPEN | Line 1589 visible |
| B3 historical import reason | OPEN (MASTER-V2 #34) | **Claude THREE-WAY** — BUILT | `ReferenceSelect` :1627+ |
| Capitalize never called | OPEN (MASTER-V2 #50) | **Cursor inventory / source** — BUILT | `wo-ap-posting.service.ts:183` |
| 28 future-dated bank txns | PENDING | **Claude** — DONE | 0 future-dated rows |

---

## Answers a–d

### a) CPA / questionnaire / “the 5%” (~2h ago)

**Already closed in CPA / GO-19 (do not re-ask):**

1. **Cutover $0** — `cpa_answers.txt` L245: *“The balances are 0.”*
2. **Capitalize $7,000** — L300 A4-D6 + Jorge 2026-09-01 chat; never $7,500
3. **Company settlement grain** — Settlement 5753 PDF (period, many loads, $2,415.11)
4. **Accessorials parent 4200** — migration landed; children under 4200
5. **Escrow / samples / parallel books** — GO-19-02 closed
6. **Insurance samples** — reconciled GO-12 L14

**The 5% net-pay floor vs full loan deduction at tour close:** **not in CPA.** Owner packet records your **opinion**: full deduction first (`IH35-MASTER-INVENTORY-2026-09-02.md` #66). Seat law: implement **both policies behind config** — do not hardcode. #19708 merged automatic full recovery; xlsx row 16 marks **REOPENED** if you wanted a blocking owner decision pop-up. **Treat as owner-open until config switch exists and Chrome shows the pop-up you expect.**

### b) Ten remaining half-built (of original 13)

Claude’s “10” = 13 − 3 tables at write time. **Today: 8 remain** after 5 tables + 2 repoints:

**Still missing / deferred / blocked (8):**

1. `safety.workers_comp_claims` — build (GO-20 E)
2. `mdata.customer_health_scores` — DEFER; must say UNAVAILABLE
3. `fuel.recommended_stops` — DEFER; must say UNAVAILABLE
4. `fuel.route_recommendations` — unavailable chrome (reference: fuel planner)
5. `qbo.connections` — BLOCKED; delete health-deep
6. `banking.plaid_items` — BLOCKED; delete health-deep
7. `inventory.parts` — **done** (repoint, no new table)
8. `maintenance.labor_rates` — **done** (repoint, no new table)

**Built tables since MAP-FINDINGS (5):** drift alerts · predictive alerts · accident liabilities · cargo incidents · late-arrival aggregates.

**Chrome/UI for those tables:** still largely unproven — table ≠ done.

### c) “Consolidate the four table”

**Four table components**, not comboboxes (GO-05 / MASTER-V2 decision #84):

- **ParityTable** (canonical)
- **DataTable**
- **ResizableTable**
- **MobileOptimizedTable**

Pick one grid grammar (ParityTable) and retire or wrap the other three. Separate from **K2** (four combobox implementations).

### d) YES loosen miles gate — verify

**Already shipped.** Owner ruling matches code:

```619:620:apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx
    // GO-16 Rev C: fill whenever practical miles exist. autofill_allowed is audit-only.
    if (!lane.fills) return;
```

Indianapolis→Laredo lane has miles with `autofill_allowed=false` — still fills with Check ZIP warning. **13508 null miles = never saved through wizard after fix**, not a gate block. **CC-2 Chrome:** re-open 13508, confirm fill, type-over → “Operator entered”, save.

---

## Six decisions — CPA vs open

| # | Decision | CPA / closed doc | Still open? |
|---|---|---|---|
| 1 | Cutover $0 OB | **YES** — L245 | No |
| 2 | Capitalize $7,000 | **YES** — L300 | No (wire done; bind `fixed_asset_default` for ≥$7k posts) |
| 3 | Settlement 5753 grain | **YES** — PDF | Table build still **pending** |
| 4 | Accessorials 4200 | **YES** — ratified | No |
| 5 | Escrow / samples | **YES** — GO-19-02 | Purge/marks may remain (xlsx #7–8) |
| 6 | Insurance samples | **YES** — GO-12 | No |

**Plus owner-open (not CPA):** 5% vs full loan (#81) · four-table consolidation (#84) · build/remove for 8 half-built (#83).

---

## Corrected pending sequence NOW

| Order | Seat | NOW |
|---|---|---|
| 1 | CC-3 | B1 — remove AlwaysTrack |
| 2 | CC-2 | Chrome 13508 — miles + money chain |
| 3 | CC-1 | GO-22 — presettlement query, settlement #, tour close, loan config |
| 4 | CC-2 | J1 → 0 · K2 stop bleed |
| 5 | CC-3 | C1 UUID · prove location picker on real load |
| 6 | Cursor | Lead · deploy parity · bus only |

**Then Wave A money:** bills `driver_id` path · drop `B-` · company settlement **table** · Load Costs tab.

---

## Downloadable paths

| File | Path |
|---|---|
| Repo mirror (canonical) | `/tmp/ih35-noise-purge/docs/bus/THREE-WAY-RECONCILIATION-2026-09-02.md` |
| This Jorge summary | `/tmp/ih35-noise-purge/docs/bus/CLAUDE-CURSOR-SYNC-RECONCILE-2026-09-02.md` |
| Owner canonical (Downloads) | `/Users/jorgemunoz/Downloads/IH35-SEAT-INSTRUCTIONS-2026-09-02/THREE-WAY-RECONCILIATION-2026-09-02.md` |
| Owner xlsx (not in repo) | `/Users/jorgemunoz/Downloads/IH35-SEAT-INSTRUCTIONS-2026-09-02/IH35-PENDING-REGISTER-2026-09-02.xlsx` |

---

## xlsx summary (35 rows)

Sheet **IH35 PENDING REGISTER** — columns: # · ITEM · CATEGORY · LIVE STATE · STATUS · SEAT · EVIDENCE · WAVE.

**NOW wave:** rows 4–12 (13508 miles, K2 regression, B1, sample drivers, bank flags, Cascade corrections, 425C one-liner, 13508 driver/locations).

**Wave A (settlement/money):** rows 1–3, 13–22, 26 (company table, driver_uuid partial, B- prefix, GO-22 stack, 0 settlements).

**Wave B/C:** rows 27–35 (proforma, Load Costs, bank categorize, posting contract, J1, etc.).

Full cell text preserved in owner xlsx; not committed as binary.
