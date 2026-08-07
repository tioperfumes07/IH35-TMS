# IH35-TMS — HOMEPAGE LIVE SCENARIO TRACKER — BUILD SPEC
**Author:** GUARD · **Date:** 2026-08-04 · **Basis:** live prod probes on `br-fancy-credit-akjnd07a` (verified, not inferred).
**Purpose:** make the End-to-End Scenario Tracker the program's **homepage**, wired to live data from load time in **Central time**, and **architecturally incapable of going stale** the way the old scoreboard does.

---

## 0. THE ONE LAW (this is the whole point)
**Status is DERIVED from live sources at request time. Status is NEVER stored and read back.**
Every dot on every pipeline (Spec → Built → Merged → Proof → Passed → Complete) is a **live predicate** evaluated when the page loads. A dot is green **only if its predicate is true right now**. There is no `scoreboard.json`, no committed snapshot, no build artifact anywhere in the read path. If the underlying data regresses, the board **downgrades itself on the next load** — it can only ever show the truth.

## 1. Root cause we are killing
The current in-app scoreboard reads `docs/audit/program-scoreboard.json` — a file generated once (last: 2026-08-03) by parsing a **markdown ledger**. A committed snapshot is stale the instant anything changes, and nothing regenerates it. **We do not repeat this pattern.** No snapshot file is permitted in the homepage read path. (If a cache is used at all, see §7 — it is a short TTL with a visible timestamp, never a committed file.)

## 2. Verified live sources (probed on prod 2026-08-04 — use these exact names)
| Source | Verified | Use |
|---|---|---|
| `driver_finance.driver_pay_rates` | PRESENT — `basis_type, rate_per_mile_cents, flat_per_load_cents, miles_basis, effective_from/to, is_test_data, is_active` | Assign-hop / settlement predicates |
| `driver_finance.driver_bills` | PRESENT — `load_id, gross_amount_cents, miles_basis, miles_basis_type, rate_per_mile_cents, status` | Assign-hop Passed predicate |
| `mdata.loads` | PRESENT — `miles_shortest, miles_practical, loaded_miles, driver_pay_rate_per_mile` | Book/deliver predicates (confirm canonical loads table per §9) |
| `lib.feature_flag_overrides` | PRESENT — `flag_key, operating_company_id, enabled, set_at` | Revenue-hop Merged predicate (per-entity) |
| `accounting.journal_entries` | PRESENT | GL / revenue Passed predicates |
| `accounting.invoices` | PRESENT | Invoice-hop predicate |
| `audit.audit_events` | PRESENT | open-defect check (Complete predicate) |
| `audit.scenario_status` | **ABSENT — must be built (§6)** | the live certification store for Proof/Passed/Complete |
| `dispatch.loads` | ABSENT — loads are in `mdata.loads` | do not read a non-existent table |

**Note:** the DB has many near-duplicate schemas (`bank`/`banking`, `maint`/`maintenance`, `settlement`/`settlements`, `mdata`/`master_data`, `factor`/`factoring`, `payroll`/`payroll_integration`). Probes must read the **canonical** one per §9 — never a RETIRE table.

## 3. The gap and the fix
Spec/Built/Merged can be derived from the **repo + a live existence probe** (does the table/column/flag actually exist on prod). Proof/Passed/Complete need a **queryable** source of GUARD verifications — which does not exist today (the ledger is markdown). **Build `audit.scenario_status`** (§6) as the append-only, WORM, live certification store. This replaces the markdown→JSON pipeline for the homepage.

## 4. Architecture (3 parts)
1. **Static registry** `apps/api/src/home/scenario-registry.ts` — the *identity* of each hop/scenario (key, title, lane, trigger, the JE text, spec ref, and its **probe function name**). Identity does not go stale, so it may be code. **No status lives here.**
2. **Live predicate library** `apps/api/src/home/probes/*.ts` — one probe per scenario. Each probe runs read-only SQL against canonical prod tables + reads `audit.v_scenario_status_current`, and returns the **highest stage whose predicate is true right now** plus `state` (`go`/`fix`/`done`) and the evidence string.
3. **Read endpoint + FE** (§7, §8) — the endpoint runs all probes on each call, stamps Central time, returns JSON; the homepage renders the design and auto-refreshes with a **staleness heartbeat**.

## 5. Stage predicates (how each dot is computed — examples, real column names)
Each probe returns `stage = max(satisfied)`. A higher stage requires all lower predicates.
- **Spec (1):** present in the registry → always true.
- **Built (2):** the scenario's code path exists (guarded by a repo check) — proxied at runtime by the Merged probe below; if the primitive isn't on prod yet it can't be Built-verified live, so Built shows only when Merged's objects exist in code but not yet applied.
- **Merged (3):** the migration is **applied on prod** — a live existence probe. Examples:
  - assign: `SELECT to_regclass('driver_finance.driver_pay_rates') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='driver_finance' AND table_name='driver_pay_rates' AND column_name='rate_per_mile_cents');` → **TRUE today**.
  - revenue: `SELECT enabled FROM lib.feature_flag_overrides WHERE flag_key='REVENUE_RECOGNITION_POST_ENABLED' AND operating_company_id = $entity;` → per-entity.
- **Proof (4):** a current cert row at stage `proof`/`fix` in `audit.v_scenario_status_current`, **or** live artifacts exist but no Passed cert yet. `state='fix'` when the cert row carries a fix flag or an open `audit.audit_events` defect is linked.
- **Passed (5):** a **current cert row** `stage='passed'` **AND** the live data predicate still holds. Example (assign): `EXISTS (SELECT 1 FROM driver_finance.driver_bills b WHERE b.rate_per_mile_cents IS NOT NULL AND b.gross_amount_cents <> (SELECT rate_total_cents FROM <canonical loads> l WHERE l.id=b.load_id))` — i.e. a bill priced from the rate, not the customer rate. If this stops being true, Passed **downgrades automatically**.
- **Complete (6):** Passed **AND** zero open defects for the scenario in `audit.audit_events` **AND** a cert row `stage='complete'`.

**Self-healing guarantee:** because Passed/Complete are gated by a live data predicate (not only the cert row), deleting or corrupting the underlying data flips the dot back on the next load. Green cannot outlive the truth.

## 6. Data model — `audit.scenario_status` (additive, WORM, RLS)
```sql
CREATE TABLE IF NOT EXISTS audit.scenario_status (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_key          text NOT NULL,                      -- 'hop.book','hop.assign','scenario.settlement',...
  operating_company_id  uuid,                               -- NULL = applies to all entities
  stage                 text NOT NULL CHECK (stage IN ('spec','built','merged','proof','passed','complete')),
  state                 text NOT NULL DEFAULT 'go' CHECK (state IN ('go','fix','done')),
  evidence              text NOT NULL,                      -- Neon proof / PR# / live-click note (NOT NULL — no blank green)
  verified_by           text NOT NULL,                      -- 'GUARD' | 'CASCADE' | 'CI-PROBE'
  verified_at           timestamptz NOT NULL DEFAULT now(),
  is_current            boolean NOT NULL DEFAULT true,
  is_test_data          boolean NOT NULL DEFAULT false,
  superseded_by         uuid REFERENCES audit.scenario_status(id)
);
CREATE INDEX IF NOT EXISTS scenario_status_key_idx ON audit.scenario_status (scenario_key, operating_company_id) WHERE is_current;
ALTER TABLE audit.scenario_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.scenario_status FORCE ROW LEVEL SECURITY;
-- tenant policy on operating_company_id (NULL row visible to all tenants); grants to ih35_app.
```
- **WORM:** no `UPDATE`/`DELETE` of evidence. Transitions happen only through a `SECURITY DEFINER` function `audit.set_scenario_status(scenario_key, entity, stage, state, evidence, verified_by)` that (a) inserts the new current row, (b) flips the prior current row `is_current=false, superseded_by=<new id>`. Corrections **supersede**, never overwrite. This is the same void-not-delete rule the ledger uses.
- **View** `audit.v_scenario_status_current`: `SELECT DISTINCT ON (scenario_key, operating_company_id) * ... WHERE is_current ORDER BY scenario_key, operating_company_id, verified_at DESC`.
- Writers: **GUARD** (live-verified → passed/complete) and **Cascade** (proof/fix from the ledger). CI probes may write `merged` rows. Coders/CI never write `passed` — only a live verifier does.

## 7. Endpoint contract — `GET /api/home/scenario-tracker`
- **Read-only.** On each call: run every probe (parallel, bounded), read `audit.v_scenario_status_current`, assemble the response. Optional in-memory cache **≤ 20s** only to protect the DB — **never a file, never longer**, and the response always carries its true build time.
- Response:
```json
{
  "generated_at_utc": "2026-08-04T20:42:11Z",
  "generated_at_ct": "2026-08-04 15:42:11 America/Chicago",
  "tz_label": "CT",
  "max_age_seconds": 20,
  "entity_scope": "TRANSP|USMCA|TRK|ALL",
  "hops": [ { "key":"hop.book","title":"Book the load","lane":"screens","stage":"merged","state":"go","evidence":"...","je":"...","spec_ref":"WIRE-01" }, ... ],
  "scenarios": [ { "key":"scenario.settlement", "...": "..." } ],
  "source_health": [ { "source":"driver_finance.driver_pay_rates","ok":true,"probed_at_ct":"..." } ]
}
```
- `generated_at_ct` uses `America/Chicago` (handles CST/CDT automatically; label "CT"). Never hardcode an offset.
- Per-entity via `?entity=`; default `ALL` shows the design with per-entity chips.

## 8. Frontend — the homepage (auto-load, never silently stale)
- Renders the delivered design (`ih35-scenario-tracker.html` v2): the 9-hop skeleton + the scenario grid, each with the 6-dot pipeline and "Now:" marker.
- **Auto-refresh:** poll the endpoint every **20s** (or SSE). Show **"Live as of 3:42 PM CT"** from `generated_at_ct`.
- **Staleness heartbeat (the anti-stale UI):** if `now − generated_at > 2 × max_age_seconds` **or** the fetch fails **or** any `source_health.ok=false`, show a **red "STALE — data is N min old / source X unreachable"** banner and grey the pipelines. **Never render old numbers as if current.** This is the board's own no-fake-green rule.
- No `localStorage`/`sessionStorage`. In-memory state only.

## 9. Canonical-table discipline (mandatory)
Probes read **canonical** tables only, per `docs/trackers/FINAL-TABLES-WIRING-FOR-CODER-2026-07-05.md` + `01-LINKAGE-LAW.md`. Never read a RETIRE table (`banking.*` use `bank.*`? — confirm direction in the law; `maint`/`maintenance`, `settlement`/`settlements`, `mdata`/`master_data`, `payroll`/`driver_finance`). **Confirm the canonical going-forward loads table** before wiring book/deliver probes — `mdata.loads` currently holds data but is on the RETIRE list; use whichever the linkage law names canonical, and if ambiguous, ask — do not guess.

## 10. Entity scope + RLS
All probes pass `operating_company_id` and run under RLS (`app.bypass_rls` only for the read service account per existing pattern). Per-entity results; a scenario with per-entity flags (revenue) shows a dot per entity.

## 11. Acceptance criteria — "fully functional on the first pass"
1. No file/snapshot in the read path (grep proves it); status comes only from live probes + `audit.v_scenario_status_current`.
2. `audit.scenario_status` applied on prod (additive migration, RLS FORCE, grants), verified by GUARD.
3. Endpoint returns `generated_at_ct` in America/Chicago and a per-source `source_health` on every call.
4. Kill-the-source test: take one probe's table offline / rename → its dot downgrades and the source_health flips — **no stale green** (proven live).
5. Regression test: delete a Passed scenario's underlying artifact → dot downgrades on next load.
6. Staleness test: block the endpoint → the UI shows the red STALE banner within `2 × max_age_seconds`, does not show old numbers.
7. Entity test: TRANSP and USMCA render independently and correctly.
8. GUARD writes the first real `passed` rows only after clicking the hop live and confirming Neon.

## 12. Why this cannot silently freeze
The old board could show green because green was a **stored fact** nobody refreshed. Here green is a **live predicate** recomputed every 20s, gated by real data, with a visible Central-time heartbeat and a red banner the moment data is stale or a source is unreachable. The board can be **wrong only by being visibly stale**, never by silently lying.

---
*Owns: CC-1 → `audit.scenario_status` + probe library + endpoint (Tier A, money/audit). Cursor → homepage FE + auto-refresh + staleness banner. GUARD → live verification + the first `passed` rows. Cascade → `proof`/`fix` rows from the ledger. Read alongside `STANDING-SESSION-DIRECTIVE.md` and `DELIVERY-METHOD-LOCKED.md`.*
