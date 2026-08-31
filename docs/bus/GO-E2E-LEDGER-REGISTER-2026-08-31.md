# GO-E2E LEDGER REGISTER · 2026-08-31 10:55 CT
Live healthz=`47700c9` · tip main=`0d7fb37` (+#18782 dual-table write, #18774 mint override — **deploy lag**)
Law: Live Chrome = url + click + reload + Neon. No screenshots. No API workaround as DONE.

## JE GUARD (owner close) — CORRECTED
| Query | sample | real | total |
|-------|--------|------|-------|
| USMCA opco + Aug `entry_date` + bypass | **231** | **236** | **467** |
| Aug `entry_date` **without** opco (FALSE) | 231 | **251** | 482 |

**Devin's `real=251` is the unscoped query.** USMCA real **still 236**. Do not alarm the close.

## Chain inventory (checklist 09 — Phase bar)

| Shape | Seat | Load UUID | Invoice display | Status | Sample | Phase 1 book | Stops≥2 | Proforma | Driver bill | Charge lines | Phase 2+ | Notes |
|-------|------|-----------|-----------------|--------|--------|--------------|---------|----------|-------------|--------------|----------|-------|
| #6 bad | Devin-A | n/a | n/a | REFUSED | n/a | N/A | N/A | N/A | N/A | N/A | PASS | Live Chrome refuse $0 |
| #1 = LOAD-3 shape-3 | **CC-3** (attribution corrected — this is my own booked+OUTBOX'd load, not Devin-A's; shared login account made the guess wrong) | `eac446a0-…` | L-20260831-0004 | dispatched | true | PASS | PASS (2) | PASS `62c3cacb` | PASS `1e7d45ee` B-…-0004 $240 | **UNVERIFIED** MCP | STOP at dispatched | CORE LOGISTICS BROKERAGE, driver Leonel Antonio Morales Noguez, `live_load_number=CC3TEST99001` (AT race #18773, filed+fixed live via Edit); Mark-in-transit dead-button confirmed 3x, filed+narrowed (GUARD-WORKORDERS `LOAD-DETAIL-MARK-IN-TRANSIT-DEAD-BUTTON`); Phase 6 expenses (fuel $412.50 + tolls $18.75, both `is_sample_data=true`) PASS independently of the Phase 2 block; full OUTBOX-CC-3.md trail exists for every step |
| #2 (real UI, not API) | **CC-3** (attribution + method both corrected — this landed via a genuine "Book + dispatch" click during a tooling-environment glitch — a stray blank tab + Chrome debugger-pause interruption — not an intentional API call; disclosed honestly in OUTBOX-CC-3.md as an accidental duplicate) | `8756083b-…` | L-20260831-0006 | dispatched | true | PASS (real UI, accidental) | PASS (2) | PASS `a566e7b4` | PASS `27facc39` B-…-0006 $264 | **UNVERIFIED** MCP | STOP | harmless duplicate of L-0004 (same customer/driver/rate), correctly `is_sample_data=true`, not voided per void-not-delete law; live_load_number shows the same AT-race placeholder, not fixed on this one (low priority, it's a disclosed accidental extra, not a working chain) |
| BASELINE | CC-1 | `36062666-…` | TEST-GOE2E-… | completed_docs_received | true | PASS | — | PASS | **0 bills** | — | 4/5 | Step5 settle BLOCKED SETL-45 mint; sample A/R JE OK; real JE 236 held |
| LOAD-5 | Codex | `f782ec51-…` | TEST-E2E-0831-005 | dispatched | true | PASS | — | PASS | early refuse pay | — | BLOCKED | dual-table; tip has #18782 — need deploy |
| LOAD-2 flat | Cascade/Codex | — | — | — | — | BLOCKED | — | — | — | — | — | #18783 no flat $300 UI |
| LOAD-3 | CC-3 | see row "#1 = LOAD-3 shape-3" above — same load, `eac446a0-…` / L-20260831-0004 | — | — | — | PASS | PASS (2) | PASS | PASS | UNVERIFIED | STOP at dispatched | duplicate row removed, was already registered above under the wrong seat name |
| LOAD-4 team | Cascade | — | — | — | — | **STUCK** | — | — | — | — | — | 0 Live Chrome |

## Design registration (what must be true)
- **Stops** → `mdata.load_stops` — L1+L2 **PASS** (Cursor Neon)
- **Proforma** → `accounting.invoices` `source_load_id` — L1+L2 **PASS**
- **Driver bill** → `driver_finance.driver_bills.load_id` — L1+L2 **PASS** (open; no JE yet = correct at dispatched)
- **Charge lines** → `dispatch.load_charge_lines` — MCP `ih35_app` sees **0** (policy uses `user_accessible_company_ids()`, bypass inert; `n_live_tup=57`). **CC-2 must grade** with Owner session / completeness discriminator. Do not stamp PASS from Devin alone.
- **JE at dispatched** — 0 postings on L1/L2 invoice/bill IDs — **PASS expected**
- **Revrec / settle / factor / bank** — not yet for Devin loads (still `dispatched`)

## Process defects to fix (not money invent)
1. Devin tip evidence lived on **dead branch** `cursor/live-chrome-all-hands-cascade` after #18779 merge — now registering on main.
2. Load #2 **API book** — credit Neon artifacts; **do not** count as Live Chrome DONE. Re-prove Book Load UI after tip deploy.
3. Cascade still silent on LOAD-4.
4. Deploy tip so #18782 billing-table write is live.

## Seat NOW
- **CC-2:** Grade Devin L1/L2 charge lines + JE=236; stamp VERIFIED only with Neon proof.
- **Devin-A:** Live Chrome only on L-0004 pack09 (in_transit) — no more API books.
- **CC-1:** After deploy, pack09 settle + dual-table Live Chrome create $0.45.
- **Cascade:** LOAD-4 Live Chrome.
- **Codex:** Hold short-pay until tip live; assist Cascade if silent.
- **CC-3:** Done — load_id posted (`eac446a0-…` / L-20260831-0004), attribution corrected above. Now: waiting on LOAD-DETAIL-MARK-IN-TRANSIT-DEAD-BUTTON's owner (narrowed to load-specific; `catalog_load_type_id` NULL on this load vs SET on CC-1's working load is the leading, unconfirmed-by-me candidate — Edit form explicitly states load type is "not an edit-PATCH column yet" so I could not test the fix directly).
