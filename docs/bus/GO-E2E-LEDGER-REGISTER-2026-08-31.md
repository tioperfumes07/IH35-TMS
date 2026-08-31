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
| #1 UI book | Devin-A / race | `eac446a0-…` | L-20260831-0004 | dispatched | true | PASS | PASS (2) | PASS `62c3cacb` | PASS `1e7d45ee` B-…-0004 $240 | **UNVERIFIED** MCP | STOP at dispatched | `live_load_number=CC3TEST99001` (AT race #18773); Mark-in-transit dead on this load |
| #2 API book | Devin-A | `8756083b-…` | L-20260831-0006 | dispatched | true | **FAIL law** (API) | PASS (2) | PASS `a566e7b4` | PASS `27facc39` B-…-0006 $264 | **UNVERIFIED** MCP | STOP | API workaround ≠ Live Chrome DONE; Owner DOT override used |
| BASELINE | CC-1 | `36062666-…` | TEST-GOE2E-… | completed_docs_received | true | PASS | — | PASS | **0 bills** | — | 4/5 | Step5 settle BLOCKED SETL-45 mint; sample A/R JE OK; real JE 236 held |
| LOAD-5 | Codex | `f782ec51-…` | TEST-E2E-0831-005 | dispatched | true | PASS | — | PASS | early refuse pay | — | BLOCKED | dual-table; tip has #18782 — need deploy |
| LOAD-2 flat | Cascade/Codex | — | — | — | — | BLOCKED | — | — | — | — | — | #18783 no flat $300 UI |
| LOAD-3 | CC-3 | TBD | — | — | — | WORKING | — | — | — | — | — | post load_id |
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
- **CC-3:** OUTBOX load_id for LOAD-3.
