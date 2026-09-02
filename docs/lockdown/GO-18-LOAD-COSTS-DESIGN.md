# GO-18 — Load Costs design (download)

**Date:** 2026-09-01  
**HTML twin (open in browser / download):** `docs/lockdown/GO-18-LOAD-COSTS-DESIGN.html`  
**Lineage map:** `docs/lockdown/GO-18-LOAD-COSTS-AND-LINEAGE-MAP.md`  
**Complete software map (git):** `docs/lockdown/IH35-SOFTWARE-MAP/INDEX.html`  
**Seat pastes:** `docs/bus/PASTE-ALL-SEATS-GO-18-LOAD-COSTS-2026-09-01.md`

USMCA only. Same endpoints as Accounting chrome. No parallel load ledger. NO-SEAT prod money.

---

## 1. Load Costs tab (13th tab on load detail)

Today `LoadDetailDrawer` tabs (12, Customs hidden on domestic):

1. Overview  
2. Stops  
3. Driver Pay  
4. Documents  
5. Factoring  
6. Customs (cross-border only)  
7. Cargo Sensors  
8. Settlement  
9. Geofence Timeline  
10. Assignment History  
11. Audit  
12. Pre-Settlement  

**Costs is the 13th.** English label **Costs**. Never `load_costs`. **Implemented on 2026-09-02:** the drawer mounts the combined read model and explicit Expense-or-Bill entry choice; production Chrome proof remains required after deployment.

### What the tab shows

| Region | Content |
|--------|---------|
| **Header** | Load number · customer · driver/truck/trailer Linked or Not set (same honesty as GO-17). |
| **Approximate margin** | Typed linehaul − linked costs − estimated driver pay. Label **Approximate · before settlement**. |
| **Add cost** | Primary **+ Create**. First question: **Expense** (paid now) or **Bill** (vendor invoice). **No default.** Then the **same** Accounting `ParityDrawer` (Record Expense / Vendor Bill), with load/driver/unit/trailer **pre-filled from this load**, still editable. |
| **Lines table** | Date · Type (Expense/Bill) · Vendor · Category/GL · Amount · Driver · Truck · Trailer · Load (this) · JE · Bank match · Status. Every id is EntityLink both ways. |
| **Empty** | Honest: “No costs on this load yet.” Empty TMS is expected. |

### 30-day bill economics

When the operator chooses **Bill**:

- `bill_date` = today (editable).  
- `due_date` = **bill_date + 30 days** unless the operator picks payment terms from the canonical terms catalog.  
- Never silent Net 0. Never invent a second AP calendar.  
- Lines carry `load_id`. After CC-1 schema: `load_required` from `accounting.line_category_load_required` (diesel/toll/lumper/… fail-closed like expenses).

When the operator chooses **Expense**: paid-now path; bank account required; load/vendor/driver/truck/trailer already exist on the expense writer.

---

## 2. Costs Board home

Accounting sub-nav leaf at `/accounting/load-costs` (owner correction 2026-09-02). It composes the canonical load, expense, and bill readers; it is not a dispatch write surface.

**Not** a second load page. Rows are loads with cost activity or gaps. Click → load detail **Costs** tab.

Suggested columns: Load # · Customer · Booked · Approx margin · Costs $ · Unlinked count · Unpaid bills · Driver · Truck.

The first shipped slice provides the sortable/exportable load register, paid-now vs owed split, approximate margin, unpaid-bill count, and a direct drill into the load's Costs tab. Missing-vendor / missing-load-required / unmatched-bank exception filters remain a subsequent read-model enhancement; they must not be faked from capped client lists.

---

## 3. Wiring rules (non-negotiable)

1. **Write the same posters.** `POST /api/v1/expenses` and existing create-bill service. No `dispatch.load_costs` table.  
2. **Same chrome.** Maintenance already must use Accounting `ParityDrawer` (blueprint additions 2026-07-16). Costs uses that pair.  
3. **Never silent Expense/Bill default.** Two explicit choices.  
4. **F+R:** load ↔ expense/bill ↔ JE (`source_transaction_id`) ↔ bank match. Memo-only = FAIL.  
5. **Expense path already has** load, vendor, driver, truck, trailer. Bill path must catch up (driver + trailer on header; `load_required` on lines).  
6. **Historical QBO import** stays `load_required=false`. Do not invent load FKs (owner ruling 2026-08-04).  
7. **GO-17 panel** later lists costs created from the load. Empty honest until then.  
8. **97.5% unmatched bank** — owner categorizes. No seat-authored GL rules.  
9. **Flags OFF** until owner says turn posting on. Reuse poster; no new GL math.  
10. **Plain English** (GO-16): Practical miles, Check ZIP, Approximate margin — never snake_case on screen.

---

## 4. Auto-link + bank match payoff

On create from Costs tab, stamp FKs from the open load. On Banking Match, if the txn already has load/vendor from a rule, still require operator confirm. Payoff: matching a bill payment or expense to a bank row **closes the Costs row “Bank match” cell** with the txn EntityLink — that is the payoff, not a second cash engine.

---

## 5. Seat order

| Seat | GO-18 | Still first |
|------|--------|-------------|
| CC-1 | Bill driver/trailer + `bill_lines.load_required` | Escrow $500.01 forensic. No zero. |
| CC-2 | Verify F+R after money PR | Grep #19428 before verify-static; escrow verify-live. |
| CC-3 | catalogs.locations / alias apply / ZIP ON CONFLICT | Check ZIP Option 1 execute (#19419). |
| Codex | Costs tab + Costs Board FE | Open #19423 / #19391 if still red. |
| Cascade | Unique FINDING only; cite gaps above | Stop stale Jorge-restore / ZIP AskQuestion. |
| Devin-A | Chrome Costs after ship | First-click Laredo→Denton on **12bfbd6**. |
| Cursor | This design + bus FORCE | No second deploy this hour. |

---

## 6. Owner-only (do not build past)

- Capitalize repair threshold ($2,500 vs $7,000) — CPA conflict.  
- Accessorials under Line Haul vs Sales of Product — CPA conflict.  
- Bank feed 97.5% unmatched categorization.  
- Any seat-created prod financial fixture (NO-SEAT law).
