# ACCIDENT + INSURANCE CLAIM WEB — GOLD LINKAGE MODEL (owner 2026-08-23)

**This is the basis of full TMS linkage.** Jorge’s standing example: one accident is not a Safety row. It is a **web** that must exist **forward and reverse** across the product, with **money terminus on the GL** when economics exist.

**Auditors (Cascade / Devin / Devin-A): AUDIT ONLY. Do not fix. Do not code. Do not open product PRs.** Fill this web in the module report. Cursor / CC repair later.

Canonical companions: `docs/audit/IH35-FULL-SYSTEM-AUDIT-SPEC.md` §B9 (insurance claim model) · VERIFY **V4** · matrix C01–C24 · Fully-Wired 4–5 + 3 (money) + 10 (RLS).

---

## 0. Intensity bar (no “clicked around”)

For **every CERTIFIED module you own**, you must answer, with live SHA + URL or Neon:

1. **Security** — USMCA-only rows; FORCE RLS; Owner-session leak (`org.user_accessible_company_ids()` returns **all** companies — unscoped reads are load-bearing); no cross-entity claim/load/driver; void not delete; rate-limit on auth routes you touch; no secrets in UI.
2. **Wiring / connectivity** — nav → route → API → **canonical** table (not RETIRE). A 200 with empty wrong table = FAIL. Route string in `EntityLink` is not proof.
3. **Linkage double-sided** — every FK you name: click **from** this record **to** the hub, then **from** the hub **back**. Missing reverse panel = FAIL for that hop.
4. **Picker law** — combobox: catalog + `+ Add new` **first row** + same creator + same table + selected after save + survives reload + USMCA.
5. **GL / economics** — if this hop moves money: **does it post to GL?** Header + lines. Balanced JE via **existing poster** (no new GL math). Flag ON or OFF (honest). **No TMS→QBO write-back.** Cap insurance recovery at recorded loss (do not invent gain). Historical QBO import / pre-dispatch `load_id` NULL = **expected**, not a defect (`LOAD-LINKAGE-PRE-OPERATIONAL`).
6. **Extent report** — not a yes/no. List **every live edge** you proved, and **every edge that is missing / dead / silent / UNVERIFIED**.

Empty TMS tables are **expected**. CREATE-TEST-THEN-VOID: use **existing** labeled TEST if one exists. **Do not remake** Close / Book Load / proven TESTs. If a hop needs a TEST and none exists, say `UNVERIFIED — no TEST row; recommend Cursor create labeled TEST` — **you do not create product data unless Jorge already ordered CREATE-TEST on that hop** (audit seats: prefer existing TEST; do not invent production money).

---

## 1. The gold web (every node + reverse)

Walk this graph on **live USMCA**. For **your** module, prove how **this module participates**. Nodes you do not own still get an honest line: `TOUCHES | N/A-this-module | MISSING | DEAD | SILENT | UNVERIFIED`.

| Hop | Node (what Jorge named) | Canonical (verify `to_regclass`, not RETIRE) | Forward you must see | Reverse you must click |
|-----|-------------------------|-----------------------------------------------|----------------------|------------------------|
| H01 | **Accident** | `safety.accident_reports` (or live name on prod) | driver, unit, trailer, load, location, at-fault, police report | Driver / unit / load / claim / WO show this accident |
| H02 | **Load** | `mdata.loads` / dispatch canonical | customer, driver, unit, trailer | Load profile shows accident + claim + repair |
| H03 | **Customer** | `mdata.customers` | shipper/consignee on load | Customer shows load + claim (cargo) if owed |
| H04 | **Vendor** | `mdata.vendors` | insurer, repair shop, tow, attorney | Vendor shows bills + WOs + claims |
| H05 | **Driver** | `mdata.drivers` | assignment, HOS, settlement | Driver shows accident, claim, deductible, escrow/salary deduct |
| H06 | **Truck / unit** | `mdata.units` (owner/lease — **no** `operating_company_id` on units) | | Unit profile: accidents, claims, WOs, legal, expenses |
| H07 | **Trailer** | equipment/trailer canonical (`mdata.equipment` vs units — **do not** use unit_id for trailers) | | Trailer profile: same reverse set; `legal.matters.equipment_id` if lawsuits |
| H08 | **Police report** | attachment / safety field — prove stored + linked to accident | | Accident detail opens the report; claim sees it |
| H09 | **Insurance claim** | `insurance.claim` | policy, accident, load, driver, unit, trailer, vendor/insurer | `GET …/claims/:id/graph` (or live equivalent) returns WOs, bills, legal, deductions |
| H10 | **Policy** | `insurance.policy` | units, driver, vendor insurer | Policy shows claims + COI |
| H11 | **Deductible** | claim economics | amount, who pays | |
| H12 | **Driver responsible?** | boolean/decision on claim or accident | | Settlement / escrow UI shows the decision |
| H13 | **At fault?** | | | Legal + claim + safety agree (no conflicting silent defaults) |
| H14 | **Salary deduct vs escrow** | `driver_finance.*` (not RETIRE payroll) | deduction line **or** escrow liability | Settlement reverse + banking driver-escrow tile |
| H15 | **Repair** | `maintenance.work_orders` + insurance_claim_id | vendor, unit, claim | WO → claim → accident; unit reverse |
| H16 | **Lawsuit / legal matter** | `legal.matters` `insurance.lawsuit` | `insurance_claim_id` | Claim graph + legal list + unit/driver reverse (**you do not steal `/legal` U14 OPEN** — hop **from claim/safety/unit** only) |
| H17 | **AP bill / repair invoice** | `accounting.bills` | vendor, WO, claim, GL lines | Bill → vendor; claim → bills[] |
| H18 | **Expense** | `accounting.expenses` | if deductible/out-of-pocket posted as expense | |
| H19 | **GL / JE** | `accounting.journal_entries` + postings | **balanced** DR=CR; poster reused; flag | Register → source document |
| H20 | **Bank** | `banking.*` | payment/match if money left the bank | Match ↔ bill/expense; recon Accept on **existing** TEST only |
| H21 | **Settlement** | driver settlement | deduction for deductible/at-fault | Settlement shows claim/accident |
| H22 | **Recovery / insurer payment** | claim recovery posting | **capped at recorded loss**; not fake income | |

**Insurance graph (spec §B9 — execute, do not cite the paragraph):**  
claim → policy, driver, asset/unit, accident, load → legal matters, WOs, bills, driver liabilities, settlement deductions → `postSourceTransaction` → balanced JE.

**0 claims / 0 accidents on prod:** `UNVERIFIED — 0 rows; recommend labeled TEST accident+claim`. Do **not** call the web PASS. Do **not** invent FKs.

---

## 2. Per-module “how this seat uses the web”

| Seat | Module | You must prove on the gold web |
|------|--------|--------------------------------|
| Cascade | accounting | H17–H19 (bills/expenses/JE). Claim/WO/vendor/customer FKs on those docs. CoA → register → source. **Posts to GL?** yes/no + JE id or flag OFF. |
| Cascade | banking | H20. Escrow tile vs salary (H14). Match/recon on existing TEST. Virtual factor/escrow **excluded** from 425C main totals. |
| Cascade | settlements | H14, H21, H12. Deductible from salary vs escrow. Do not remake Close. |
| Cascade | factoring | If claim/load advances touch factor packet — full F+R; else honest N/A. No QBO write-back. |
| Cascade | dispatch | H02, H03, H05–H07. Load shows accident/claim if linked. Do not remake Book Load. Do not invent load FKs on import rows. |
| Devin | vendors | H04, H17, H15 vendor side. Insurer + shop as vendors. Reverse bills/WOs/claims. |
| Devin | maintenance | H15, H06–H07, H09. WO ↔ claim ↔ accident. Parts/inventory if owed (C18). |
| Devin | safety | H01, H08, H12, H13. Accident is the **root**. Reverse from driver/unit/load. |
| Devin | insurance | **Entire web H09–H22 as owner of the claim.** Graph endpoint. Deductible, at-fault, recovery cap, lawsuit **from claim UI** (do not occupy `/legal` hub). |

---

## 3. CONNECTIVITY EXTENT REPORT (required in every module OUTBOX)

Paste this block. Incomplete block = audit not finished (keep going — do not idle).

```
CONNECTIVITY-EXTENT | MODULE= | LIVE_SHA=
EDGES_PROVEN:   (hop → hop, URL both ways)
EDGES_MISSING:  (hop expected, no UI/API/FK)
EDGES_DEAD:     (click 404 / empty wrong tab)
EDGES_SILENT:   (click no-op)
GL_POSTS:       YES-balanced JE=<id> | FLAG-OFF | NO-poster | N/A-no-money | UNVERIFIED
MONEY_OBJECTS:  bill= expense= invoice= settlement_deduction= escrow= recovery=
SECURITY:       RLS= opco= owner-unscoped-read= cross-entity-leak=
PICKER:         first-row +Add new live= 
REVERSE:        hubs that show this record=
RECOMMEND:      who should fix (Cursor/CC-1 money / CC-3 FE) — not this seat
VERDICT:        AUDIT-PASS | FINDING | UNVERIFIED
```

---

## 4. Security checklist (every leaf)

- Query / UI scoped to USMCA `5c854333-6ea5-4faa-af31-67cb272fef80` (or live USMCA id after you verify — never TRANSP/TRK campaign).
- `0` on FORCE-RLS tables is not absence until completeness discriminator on **that** table (Rule 10).
- Owner role sees all companies — prove the **page** still filters opco.
- No delete of financial rows (void).
- Attachments (police report) not world-readable without auth.

---

## 5. Forbidden

- Recertify U14 1–6, 11–13.
- Steal `/lists` `/legal` `/customers` `/drivers` `/fleet`.
- Product code / FAST-MERGE of apps/.
- `trigger_deploy`.
- Remake Close / Book Load / proven TESTs.
- Calling CERTIFIED SHA from last week “complete” on a new healthz.
- GL “balanced by construction” without a live JE or honest FLAG-OFF.
- Inventing load/claim FKs.
