# IH35-TMS — SCENARIO TRACKER + SCOREBOARD — BUILD TO DONE (automatic, live, pixel-locked)

**Owner:** Jorge · **Date:** 2026-08-05 CT
**Builder:** **CC-1** (§9.3 money/GL/tracker builder — applies on Neon) · **FE assist:** Cursor (§9.2) · **Verify:** CC-2/GUARD (§9.5) · **Scoreboard:** Cascade (§9.4)
**Method:** `DELIVERY-METHOD-LOCKED.md` rev E. Merge on green **with live proof**. Audit-only write path (`audit.scenario_status`, never `accounting.*`) → normal merge-on-green flow.

## THE ORDER (one sentence)
Make the in-app Scenario Tracker **look identical to `SCENARIO-TRACKER-LOCKED-DESIGN.html`** (delivered with this file — it is the pixel spec, do not redesign it), bind **every dot** to **live prod data**, and make the whole board **advance and self-heal automatically** with zero human seeding.

---

## 1. DESIGN IS LOCKED — MATCH THE HTML EXACTLY
`SCENARIO-TRACKER-LOCKED-DESIGN.html` is the target. The in-app page must render identically:
- Header (navy gradient), "One engine, every transaction" box, the 6-stage lifecycle legend.
- **Part A** — the 9-hop money slice as a vertical timeline; each hop = colored dot, name, lane pill (Money=green / Screens=blue), "Doing", JE mono line, Spec line, and the 6-node pipeline widget + "Now:" chip.
- **Part B** — the grid of every other process (New Customer, New Driver, Chart of Accounts, Driver Settlement, Advance/Loan, Deductions, Escrow, Expense/Bill/AP, Fuel, Maintenance WO, Full Accident chain, Insurance, Legal+Civil Fine, Factoring, Banking/Reconciliation), each a card with trigger, JE, links, spec, and the same 6-node pipeline widget.
- Palette exactly as the HTML `:root` vars. Pipeline dot logic exactly as the HTML `<script>` (`done`/`cur go|fix|done`, segment `on`).
- The FE component already exists (`apps/frontend/src/pages/home/scenario-tracker/*` + `components/home/ScenarioTrackerPanel.tsx`) and already encodes these identities and the pipeline widget. **Bring its CSS/markup to 1:1 with the locked HTML** — same spacing, radii, colors, the engine box, the lifecycle legend, Part A/Part B split. No stage/state hardcoded in the FE — every dot comes from the live endpoint (§2).

**Difference vs the HTML preview:** the HTML shows a fixed "representative state." The live page shows the **real** stage/state per slice from prod. That is the whole point.

---

## 2. BIND EVERY CARD TO LIVE DATA (backend) — the wiring gaps to close

The endpoint `GET /api/v1/home/scenario-tracker` (mounted, deployed at `e8e5a64`, reads under `withLuciaBypass` so RLS never masks it) returns a `stage`+`state` per slice, derived live in `scenario-tracker.service.ts`. A dot goes green only when BOTH: the slice's **live predicate holds** AND a **current cert row** exists in `audit.scenario_status`. Today neither is complete. Close these:

### GAP-A — Part B is not probed at all
`SCENARIO_REGISTRY` (`apps/backend/src/home/scenario-registry.ts`) contains ONLY the 9 hops. The 15 Part B slices the FE renders (`SCENARIO_IDENTITY` in `pages/home/scenario-tracker/registry.ts`) have **no backend entry**, so they can never show live status. **Add all 15 to the backend registry** with `key`, `sources[]`, `je`, `spec_ref`, and a live predicate (§3). Keys MUST match the FE keys exactly (`scenario.customer`, `scenario.settlement`, …).

### GAP-B — key mismatch on the POD hop
FE uses `hop.pod_bol` (order 5); backend registry uses `hop.evidence`. They never bind. **Pick one key and make FE + backend + certs all use it** (recommend `hop.pod_bol` to match the design label; update `scenario-registry.ts`).

### GAP-C — 5 of 9 hops have no live predicate
`livePassedPredicate()` only implements `hop.assign`, `hop.revenue`, `hop.gl`, `hop.deliver`. **Implement the rest** (§3). A hop with no predicate is capped at "merged" and a `passed` cert on it is read as **red/fix**.

### GAP-D — nothing writes certifications (`audit.scenario_status` = 0 rows)
Repo-wide grep = **zero callers** of `audit.set_scenario_status()`. The table + `SECURITY DEFINER` function exist on prod; `ih35_app` has EXECUTE (verified). **Build the automatic certifier (§4).**

---

## 3. LIVE PREDICATES — verify each column against prod (§0/§4, NEVER guess)
All counts below were pulled live 2026-08-05 under `SET app.bypass_rls='lucia'`, branch `br-fancy-credit-akjnd07a`. Respect the `entity` arg on every one (`$1::uuid IS NULL OR <col>=$1::uuid`). Reuse ONE shared SQL per slice so the certifier and the read-path can never disagree.

### Part A — 9 hops (verified anchors)
| key | live predicate (verify columns first) | holds now |
|---|---|---|
| hop.book | `mdata.loads` customer_id NOT NULL AND rate_total_cents>0 | 5 |
| hop.assign | `driver_finance.driver_bills`⋈`mdata.loads`, status<>'void', rate_per_mile_cents NOT NULL, gross<>rate_total | 3 ✅ |
| hop.dispatch | `mdata.loads` status::text IN (dispatched,in_transit,at_delivery,delivered,delivered_pending_docs,completed_docs_received,invoiced,paid,closed) | 1 |
| hop.deliver | `mdata.load_stops` actual_departure_at NOT NULL AND stop_type='delivery' | 0 (data gap — driver app not capturing departures; route as its own ticket, do NOT fake) |
| hop.pod_bol | POD/BOL captured — **resolve canonical source** (`docs.files` linked to load, or load-documents table) via `to_regclass` first | verify |
| hop.revenue | flag `REVENUE_RECOGNITION_POST_ENABLED` ON for entity via `isEnabled` (already implemented) | OFF (frozen) |
| hop.invoice | `accounting.invoices` voided_at NULL AND status::text IN (sent,partial,paid) | 11,981 ✅ |
| hop.gl | `accounting.journal_entries` reversed_by_je_id NULL | 1,765 ✅ |
| hop.bank | `banking.bank_transactions` matched_invoice_id NOT NULL AND is_credit (DR Cash/CR A/R). NOT "categorized" — that's a different control | 0 |

### Part B — 15 slices (verified table anchors; resolve any `verify` before writing)
| key | source (verified unless noted) | "has real data" predicate | live |
|---|---|---|---|
| scenario.customer | `mdata.customers` | count>0 | 2,696 ✅ |
| scenario.driver_onboarding | `mdata.drivers` | count>0 | 179 ✅ |
| scenario.coa | `catalogs.accounts` | count>0 | 1,442 ✅ |
| scenario.settlement | `driver_finance.driver_settlements` | count(state='final')>0 | 0 |
| scenario.advance | resolve canonical (`driver_finance.advances` absent — find real table) | balance rows>0 | verify |
| scenario.deductions | resolve canonical (`driver_finance.driver_deductions` absent) | count>0 | verify |
| scenario.escrow | `driver_finance.escrow_ledger` ✅ | count>0 | verify |
| scenario.ap | `accounting.bills` | voided_at NULL count>0 | 16,250 ✅ |
| scenario.fuel | `fuel.fuel_transactions` ✅ | count>0 | verify |
| scenario.maintenance | `maintenance.work_orders` | count>0 | 1 ✅ |
| scenario.accident | `safety.accidents` ✅ | count>0 | verify |
| scenario.insurance | resolve canonical (`insurance.claims/policies` absent — find real) | count>0 | verify |
| scenario.legal | `legal.matters` ✅ | count>0 | verify |
| scenario.factoring | `accounting.factoring_advances` ✅ | count>0 | verify |
| scenario.banking | `banking.bank_transactions` | categorized_at NOT NULL count>0 | 170 ✅ |

For each slice `sources[]` = the tables its predicate reads (drives the "Merged" dot + `source_health`).

---

## 4. THE AUTOMATIC CERTIFIER — the piece that makes it self-running (GAP-D fix)
Build a scheduled job that makes `audit.scenario_status` maintain itself from live evidence. **This replaces the dead `program-scoreboard.json` snapshot — do NOT hand-seed rows (that is the exact stale-snapshot failure this board exists to kill).**

- New: `scripts/scenario-certify.mjs` (or a backend cron entry next to existing crons in `render.yaml`).
- Each run: open client → `SET app.bypass_rls='lucia'` → loop **all 24 slices** (9 hops + 15 Part B) × active `org.companies` (entity-scoped) plus a NULL-entity pass for global slices.
- Evaluate the **same** shared predicate, then call:
  `audit.set_scenario_status(key, entity, stage, state, evidence, 'CI-PROBE', false)` where
  - predicate holds → `stage='passed', state='done'`, `evidence` = the concrete count/IDs measured this run;
  - predicate does not hold → `stage='built', state='go'` (or `'fix'` if it previously passed), evidence = why.
- `verified_by='CI-PROBE'`, `is_test_data=false`. NEVER `is_test_data=true` to move a real dot.
- Cadence every ~5 min. Safety does NOT depend on cadence: the read path **re-checks the predicate at request time and self-heals** — a stale cert can never show false green.
- Idempotent: `set_scenario_status` supersedes the prior current row (already enforced by `uq_scenario_status_one_current`).

Result: the moment a real load/invoice/JE/settlement exists, its dot advances on the next probe — automatically. When data regresses, the dot drops. No human in the loop.

---

## 5. SCOREBOARD — automatic too
- The module scoreboard (`docs/module-completion/*.json`, `docs/audit/program-scoreboard.json`) is a committed snapshot that goes stale — the same failure. **Feed it from the same live probe**: add `scripts/scoreboard-from-live.mjs` that runs the 24 predicates and writes each module's `pass_count/total_count/progress/prod_verified` from live counts, run in the same cron as §4 (Cascade owns the % mapping).
- Definition of a module's %: (# of its slices at `passed`/`complete`) ÷ (total slices), computed from the live probe — never typed by hand.

---

## 6. DEFINITION OF DONE (proof required — no "green" without it)
- [ ] FE renders 1:1 with `SCENARIO-TRACKER-LOCKED-DESIGN.html` (Part A timeline + Part B grid + lifecycle legend + engine box), every dot fed by the live endpoint. Screenshot attached to the PR.
- [ ] Backend registry has all 24 slices; FE↔backend keys aligned (incl. `hop.pod_bol`); all predicates implemented against **verified** columns; typecheck + CI green.
- [ ] `scripts/scenario-certify.mjs` scheduled and running; `audit.scenario_status` row count > 0 and refreshing each run.
- [ ] Live `GET /api/v1/home/scenario-tracker?entity=<uuid>`: `hop.gl`, `hop.assign`, `hop.invoice`, `scenario.customer`, `scenario.driver_onboarding`, `scenario.coa`, `scenario.ap` render **passed/green**; others honest; `source_health` all green.
- [ ] Scoreboard JSON regenerated from live; % matches the tracker.
- [ ] GUARD independently re-ran each `passed` cert's predicate and confirmed the evidence count matches prod (no false green); `verify-no-false-green-certify.mjs` + `verify-homepage-scenario-tracker-staleness.mjs` green.
- [ ] `hop.deliver` departure-capture gap filed as a separate driver-app ticket — not faked.

## 7. GUARDRAILS
Reconciliation stays FROZEN (Faro/QBO/$40,882 — untouched here). Additive-only. No new GL math — reuse the shared poster. GUARD needs a read-only prod `DATABASE_URL` from Jorge to verify.
