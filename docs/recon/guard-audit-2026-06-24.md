# CI Guard Audit — REAL vs NOMINAL vs UNKNOWN

**Date:** 2026-06-24
**Scope:** every `scripts/verify-*.{mjs,ts}` guard in `/Users/jorgemunoz/IH35-TMS-clean`, mapped to its npm name, the workflow that runs it, and whether that workflow is in the **required** status-check set.
**Mode:** READ-ONLY recon. No guard or code was edited.

---

## 0. TL;DR / why this matters

`verify:design-parity` was GREEN while the live Create-WO screen rendered the WRONG design. Root cause: it asserts **source-token presence** (a normalized substring `.includes()` over the component source) — it never renders, never reaches the DOM, never asserts the A–E structure. **That failure class is the rule, not the exception in this repo.**

Mechanical census of all **695** `verify-*` scripts:

| assertion mechanism | count | class |
|---|---|---|
| `readFileSync` + `.includes()` / `.match()` only (string presence over source) | **~650** | NOMINAL by construction |
| query a real Postgres (`new Pool/Client`, `pg`) | 20 | REAL **only if `DATABASE_URL` is set** (most skip-and-pass otherwise) |
| parse a structural pattern / AST-ish (`createSourceFile`, regex over SQL/route shape) | ~21 | REAL / structural |
| HTTP-smoke a running server (`fetch`, `inject`) | 8 | REAL |
| read a built artifact (`dist/`) | 6 | REAL (asserts compiled output) |
| render/mount the DOM (`@testing-library`, `render()`) | **0 (in scripts/)** | — DOM proof lives in **vitest** `*.test.tsx`, NOT in any guard script |

> Buckets overlap. The headline: **the overwhelming majority of guards can be GREEN while the guarded behavior is broken / unmounted / built-from-memory**, exactly like `verify:design-parity`. The handful of REAL guards are the DB-backed ones (when CI gives them a DB), the migration/SQL structural scanners, and the boot/HTTP smokes.

### Two structural weaknesses that amplify the risk

1. **`verify:arch-design` / `verify:design-parity` are NOT in the required check set.** They run ONLY in `locked-guards.yml` (`.github/workflows/locked-guards.yml:78`), and `locked-guards` is **absent** from `.github/branch-protection-config.json` `required_status_checks.contexts` (lines 12–23). The config's `required_checks_detail` claims (`branch-protection-config.json:38`) that `verify-architectural-design` runs inside `ci / build-typecheck` — **it does not** (`grep arch-design .github/workflows/ci.yml` → no match). So the design-parity guard is both NOMINAL *and* non-blocking.
2. **DB-backed guards skip-and-pass without `DATABASE_URL`.** e.g. `verify-rls-operating-company-scope.mjs:48` (`if (!connectionString) { ...; return; }`), `verify-coa-roles.mjs:66`, `verify-coa-canonical.mjs:174`, `verify-double-entry-balance-trigger.mjs:202`. They are REAL **inside `ci / build-typecheck`** (which spins up `postgres:16-alpine`, `ci.yml:38-55`, `DATABASE_URL` set) but degrade to static-only in `locked-guards.yml` / `premerge-gates.yml` (no DB service). Same guard name, different strength by workflow.

---

## 1. Required status checks (the gate that actually blocks merge)

From `.github/branch-protection-config.json` lines 12–23, the **only** checks that physically block a merge to `main`:

| required context | workflow / job | nature |
|---|---|---|
| `required-checks / required-checks-gate` | `required-checks.yml` | config-integrity only (asserts branch-protection-config + CODEOWNERS exist, mandatory contexts listed) — does **not** run the verify suite |
| `ci / build-typecheck` | `ci.yml` `build-typecheck` | **the big one** — runs ~250 guards + tsc + frontend/PWA build + vitest coverage + boot smokes, WITH a live Postgres |
| `ci / verify-branch-fresh` | `ci.yml` `verify-branch-fresh` | branch is not behind base |
| `perf-budget-check / perf-audit` | `perf-budget-check.yml` | bundle perf budget |
| `security-checks / security-audit` | `security-checks.yml` | secret/dep scan |
| `premerge-gates / rls-migration-scan` | `premerge-gates.yml` | **REAL** structural SQL scan (see below) |
| `premerge-gates / typescript-strict-null` | `premerge-gates.yml` | tsconfig strict + `tsc --noEmit` |
| `premerge-gates / migration-role-validation` | `premerge-gates.yml` | GRANT-role allowlist scan |
| `pass-8-smoke-verify / pass-8` | `pass-8-smoke-verify.yml` | smoke |
| `pr-preview-smoke / PR Preview Smoke` | `pr-preview-smoke.yml` | polls Render preview, runs `smoke.sh` |

**`hold-merge-gate` and `locked-guards` are NOT in this list.** Everything in `locked-guards.yml` (≈120 guards incl. `verify:arch-design`, `verify:design-parity`, `verify:dispatch-*`, `verify:sidebar-items-locked`, `verify:multi-entity-separation`) can be red without blocking merge unless `locked-guards` was added as a required context out-of-band in the GitHub UI (the committed config does not include it — drift to flag to Jorge).

---

## 2. Required-set guards — classification

| guard | script | npm name | runs-in | required? | class | note |
|---|---|---|---|---|---|---|
| RLS migration scan | `scripts/verify-rls-migration-scan.mjs` | `verify:rls-migration-scan` | premerge-gates | **YES** | **REAL** | parses every NEW `db/migrations/*.sql` for `CREATE TABLE … operating_company_id` and asserts `ENABLE ROW LEVEL SECURITY` appears (`:1-40`, baseline=406). A real table missing RLS goes red — a stray string can't satisfy it. |
| migration role validation | `scripts/verify-migration-no-unknown-roles.mjs` | `verify:migration-no-unknown-roles` | premerge-gates | **YES** | **REAL** | scans `GRANT … TO <role>` against an allowlist; structural. |
| ts strict-null config | `scripts/verify-ts-strict-null.mjs` | `verify:ts-strict-null` | premerge-gates | **YES** | **REAL** | config guard + the job then runs `npx tsc --noEmit` (compiler is the real assertion). |
| branch fresh | `scripts/verify-branch-fresh.mjs` | `verify:branch-fresh` | ci | **YES** | **REAL** | git ancestry. |
| pre-commit chain | `scripts/verify-pre-commit.mjs` | `verify:pre-commit` | ci/build-typecheck | **YES** | mixed | a meta-runner; strength = strength of what it chains. |
| ci policy applied | `scripts/verify-ci-policy-applied.mjs` | `verify:ci-policy-applied` | required-checks | **YES** | **REAL** | queries GitHub API for applied protection (or config baseline). |
| RLS op-company scope | `scripts/verify-rls-operating-company-scope.mjs` | `verify:rls-operating-company-scope` | ci/build-typecheck | YES (via ci) | **REAL in ci** / NOMINAL elsewhere | `:48` skips live-DB assertion if no `DATABASE_URL`; ci provides one so it's REAL there. |
| no cross-carrier leak | `scripts/verify-no-cross-carrier-data-leak.mjs` | `verify:no-cross-carrier-data-leak` | ci/build-typecheck | YES (via ci) | **REAL in ci** | `:14` skips without DB; ci inserts TRANSP+USMCA fixtures and asserts isolation → REAL with DB. |
| migration application consistency | `scripts/verify-migration-application-consistency.mjs` | `verify:migration-application-consistency` | ci | YES (via ci) | **REAL** | applies migrations to the CI Postgres. |
| boot api smoke | `ci:boot-api-smoke` | `ci:boot-api-smoke` | ci/build-typecheck | YES (via ci) | **REAL** | boots compiled `dist/index.js`, hits `/api/v1/health`. |
| boot aggregate smoke | `ci:boot-aggregate-smoke` | — | ci/build-typecheck | YES (via ci) | **REAL** | boots + asserts aggregate envelope. |
| accounting endpoints smoke | `smoke:accounting` | — | ci/build-typecheck | YES (via ci) | **REAL** | hits 12 endpoints (JSON+XLSX). |

---

## 3. The exemplar — `verify:design-parity` (NOMINAL) and how to make it REAL

**Script:** `scripts/verify-design-parity.mjs` · **npm:** `verify:design-parity` · **runs-in:** chained at the tail of `verify:arch-design` (`package.json:534`, last entry), which runs ONLY in `locked-guards.yml:78` · **required?** **NO**.

### GAP (how it is green-but-broken)
Core check is `if (normalized.includes(token)) continue;` (`scripts/verify-design-parity.mjs:184`) where `normalized = norm(source)` is the **lowercased, alphanumeric-stripped concatenation of the component source files** (`:147`, `:180`). It only proves a design token (a label/column/section string) **exists somewhere in the source text**. A token can:
- live in a `return null` / never-true-conditional / collapsed branch (the script's own header admits this, `:18-25`),
- exist in the *wrong* SectionCard, *wrong* row, *wrong* order — the pre-#1426 Create-WO layout had the right field strings in the wrong structure and **passed**,
- be present while the whole modal is unmounted dead code.

The screen `"Create/Edit Work Order Wizard"` is **NOT in the `ENFORCED` set** (`:108-116`) — so even its token failures are printed as a non-fatal "backlog", never red. The only structural backstop is `STRUCTURAL_RENDER_TESTS` (`:129-138`), which merely asserts the test **file exists** — it does not run it and does not assert A–E placement.

### UPGRADE (what it must assert instead)
Re-point the Create-WO check from "token in source" to "**the LIVE-rendered A–E structure is in the DOM**", proven by a mounted render-test that the guard both (a) requires to exist AND (b) the CI vitest suite actually executes. Concretely, the structural anchors that already exist in the live component (`apps/frontend/src/pages/maintenance/components/CreateWorkOrderModal.tsx`):

- root wrapper `data-testid="create-wo-render-v5"` (`:538`)
- `<SectionCard badge="A" title="Work Order" …>` (`:549`)
- `<SectionCard badge="B" title="Repair detail (VMRS)" testid="wo-vmrs-repair-detail">` (`:604`)
- `<SectionCard badge="C" title="Parts & Labor" testid="wo-parts-labor">` (`:620`)
- `<SectionCard badge="D" title="Vendor invoice & payment" testid="wo-invoice-payment">` (`:638`)
- `<SectionCard badge="E" title="Documents" testid="wo-documents">` (`:699`)
- the `SectionCard` helper renders the badge node `<span …>{badge}</span>` (`:27`)

A render-test (sibling of the existing `CreateWOSectionRenderV5Header.test.tsx`, which already mounts and asserts header labels via `screen.getByText`) should mount the **full modal** and assert:
1. `screen.getByTestId("create-wo-render-v5")` is in the document (proves render-v5, not the pre-#1426 layout, mounted),
2. badges **A,B,C,D,E** each render in order — `screen.getAllByText(/^[A-E]$/)` maps to `["A","B","C","D","E"]`, AND
3. each section testid is present: `wo-vmrs-repair-detail`, `wo-parts-labor`, `wo-invoice-payment`, `wo-documents`, AND the header section `wo-renderv5-header`.

Then in `verify-design-parity.mjs`: add `"Create/Edit Work Order Wizard"` to `ENFORCED` (`:108`) and to `REQUIRE_STRUCTURAL_TESTS` (it already is, `:140`), and point its `STRUCTURAL_RENDER_TESTS` entry (`:135-137`) at the new full-modal render-test. Because `REQUIRE_STRUCTURAL_TESTS` forbids enforcing a complex screen without render-tests (`:198-201`), the guard now requires the structural proof to exist; the vitest run executes it. **Also re-point the gate workflow: move `verify:arch-design` (or at least `verify:design-parity`) into `ci.yml build-typecheck`, or add `locked-guards` to `required_status_checks.contexts` — otherwise it remains non-blocking.**

### RED → GREEN proof plan
- **Known-bad (must go RED):** check out the pre-#1426 Create-WO layout (no `data-testid="create-wo-render-v5"`, no A–E `SectionCard` badges). The new render-test's `getByTestId("create-wo-render-v5")` throws → vitest fails; and with the screen in `ENFORCED` + the structural-test mapping, `verify:design-parity` itself reports `[STRUCTURE]` / `[ENFORCED — REGRESSION]`. **Independently provable today:** temporarily rename the root testid in a scratch copy and run the render-test → it goes red.
- **Good (must stay GREEN):** current `CreateWorkOrderModal.tsx` (render-v5) — testid present, badges A–E present in order, all four section testids present → render-test passes → guard green.

> Note: `verify:design-parity`'s own header (`:18-25`) and the existing `CreateWOSectionRenderV5Header.test.tsx` show the pattern is already understood — it just hasn't been applied to the **full A–E modal** and the Create-WO screen hasn't been promoted to `ENFORCED`.

---

## 4. NOMINAL guards that protect something that matters — gap + upgrade + proof

> Selection criterion (per task): NOMINAL guards covering **design parity, money/GL, RLS, entity/operating_company_id scope, route mounting, palette/§7**. Each is a `readFileSync` + `.includes()` presence check unless noted.

### 4.1 `verify:arch-design` (locked UI surface) — `scripts/verify-architectural-design.ts`
- **npm:** `verify:arch-design` · **runs-in:** `locked-guards.yml:78` · **required?** NO · **class:** NOMINAL.
- **GAP:** asserts only that locked **routes / sidebar ids / sub-nav labels / named-section title strings** still *exist as tokens* in source (`extractRoutesFromApp` regex over `App.tsx`, `extractSubNavTabs` `label:"…"` regex, `extractNamedSections` `<PageHeader title="…">` regex — `:244-339`), and only FAILS on **removal** (additive-only, `verifyAgainstBaseline` `diffMissing`, `:405-443`). A route can be present in `App.tsx` but point at an unmounted/blank page; a `<PageHeader title="Book load">` string can exist while the section renders nothing; reordering, wrong-component, or broken render all pass. This is the same string-presence trap as design-parity (it even chains design-parity at its tail).
- **UPGRADE:** for the locked routes, assert they **resolve to a non-blank rendered page** (there is already `verify:routes-not-blank` / `verify:sidebar-route-resolution` — fold their DOM/structural proof into the locked-surface check, or require a smoke that each locked route returns 200 and renders a known testid). For named sections, back each with a render-test asserting the heading reaches the DOM.
- **PROOF:** known-bad = replace a locked page body with `return null` while keeping its `<Route>` and `<PageHeader title>` strings → current guard GREEN (bug), upgraded guard (route-renders-testid) RED. Good = real page → both green.

### 4.2 `verify:multi-entity-separation` — `scripts/verify-multi-entity-separation.mjs`
- **runs-in:** `locked-guards.yml:262` · **required?** NO · **class:** NOMINAL (string scan over source for entity-mixing patterns).
- **GAP:** entity isolation (TRANSP / TRK / USMCA, `operating_company_id` scoping) is the single most financially-loadbearing invariant in the repo, yet a source-grep can't prove a query is actually scoped at runtime — it can pass while a route reads cross-entity rows. (Contrast the REAL `verify:no-cross-carrier-data-leak`, which inserts both companies' fixtures and asserts isolation — but only with a DB.)
- **UPGRADE:** demote this to a hint and make the **DB-backed** `verify:no-cross-carrier-data-leak` + `verify:rls-operating-company-scope` the authority, and ensure they run **in a required, DB-having job** (they currently are REAL only inside `ci/build-typecheck`; confirm coverage for every entity-scoped table).
- **PROOF:** known-bad = a route that selects without an `operating_company_id` predicate → string guard green, the DB fixture guard red.

### 4.3 `verify:tenant-scope-on-routes` — `scripts/verify-tenant-scope-on-routes.mjs`
- **runs-in:** `locked-guards.yml:114` · **required?** NO · **class:** structural-NOMINAL (borderline REAL).
- **GAP:** finds routes that reference `operating_company_id` + read `req.query`/`req.body` and asserts the file `.includes("assertCompanyMembership(")` (`:23-29`). Tighter than pure presence, but a route can *contain* the call on a different code path than the unscoped query, or in a dead branch — green while the actual query is unscoped. Also only fires for files that already mention `operating_company_id`.
- **UPGRADE:** pair with a DB fixture test that calls the endpoint as company A and asserts company B's rows never return (the `no-cross-carrier-data-leak` pattern, per route).
- **PROOF:** known-bad = a scoped query removed but an unrelated `assertCompanyMembership(` left in the file → guard green, endpoint test red.

### 4.4 `verify:money-fields-use-moneyinput` — `scripts/verify-money-fields-use-moneyinput.mjs`
- **runs-in:** `locked-guards.yml:215` · **required?** NO · **class:** structural-NOMINAL (denylist scan).
- **GAP:** scans for raw `<input>` money fields not using the shared `MoneyInput` cents/dollars seam (`:27`, `:67`). Stronger than presence (it's a denylist), but it asserts a *component is used*, not that **cents math is correct** — a field can use `MoneyInput` and still post wrong cents to the GL.
- **UPGRADE:** keep as a UI-seam lint, but the real money correctness must be a DB/posting test (see 4.5).
- **PROOF:** known-bad = a new raw dollar `<input>` → guard red (this one DOES go red, good). It just doesn't cover GL correctness.

### 4.5 Money/GL posting guards — `verify:expense-gl-posting`, `verify:bill-resolver-single-source`, `verify:cc-payment-posts-to-qbo`, `verify:insurance-financial-writes`, `verify:allocation-integrity`, `verify:double-entry-balance-trigger`
- **runs-in:** mostly `ci/build-typecheck` (REAL-eligible) · **required?** YES via ci.
- **Mixed:** `verify:double-entry-balance-trigger.mjs` is **REAL** when DB present (`:201-204` requires `DATABASE_URL`, then asserts the CONSTRAINT TRIGGER actually rejects an unbalanced JE) — but it **hard-skips** without a DB, and its static half (`:57`, `:127-135`) is regex-over-SQL (NOMINAL). `verify:expense-gl-posting`, `verify:bill-resolver-single-source` are largely source-presence/contract scans (NOMINAL) — they assert "the resolver is the single source" by string, not by executing a posting and checking the ledger nets to zero.
- **GAP:** a posting code path can be refactored to post wrong amounts while the contract strings still exist.
- **UPGRADE:** add an executed posting test (insert a bill/expense → run the poster → assert `accounting.*` debits == credits and the expected accounts) gated by the CI DB; make it required.
- **PROOF:** known-bad = poster that drops the credit leg → ledger test red; string guard green.

### 4.6 `verify:samsara-webhook-route-mounted` / route-mounting family (`verify:*-routes-registered`, `verify:*-route-mounted`, `verify:no-orphan-routes`)
- **runs-in:** `locked-guards.yml` / `ci` · **required?** mostly NO (locked-guards).
- **`verify:samsara-webhook-route-mounted.mjs`** = NOMINAL: `indexSrc.includes("await registerSamsaraWebhookRoutes(app)")` (`:25`) — a literal-call presence check; green if the call sits in a dead/conditional branch.
- **`verify:no-orphan-routes.mjs`** = **structural/REAL-ish**: builds the set of every exported `register*Routes` and fails if any has **no call site anywhere** (with an explicit dead-code allowlist, `:29-31`). A string can't fake a whole-tree call-site sweep. Keep; it catches the "exported but never mounted → 404 in prod" class.
- **GAP (mounting):** "call exists in source" ≠ "endpoint answers 200 in prod". The merged-not-live landmine (DispatchList dead code) is exactly this.
- **UPGRADE:** the authority for "is it live" is the boot/HTTP smokes (`ci:boot-api-smoke`, `verify:all-list-pages-load-200`, `pr-preview-smoke`). Ensure each critical route is covered by a 200-smoke, not just a `.includes` of its register call.
- **PROOF:** known-bad = comment out the actual `app.register` while leaving the import → `samsara-webhook-route-mounted` green, a boot-smoke hitting the path red.

### 4.7 Palette / §7 guards — `verify:section7-palette-maintenance`, `verify:currency-format-guarded`, `verify:navy-page-subnav`
- **runs-in:** `ci` (palette-maintenance, `ci.yml:139`) / `locked-guards`.
- **`verify:section7-palette-maintenance.mjs`** = **REAL-structural**: scans every maintenance/fleet/dispatch file for a **denylist of forbidden hex codes** (`#185fa5`, `#2563eb`, indigos/violets/pinks, `:28-31`) and fails on any hit. A stray forbidden hex makes it red — that's an invariant, not presence. Keep. (Caveat: only covers the modules it scans; blue debt elsewhere — banking/accounting/lists/home/safety — is out of scope, per memory note section7-palette-guard-coverage.)
- **GAP:** §7 also forbids recoloring the navy sidebar, no green/yellow bands, no emoji in headers — those are partly covered by other guards but a Tailwind class like `bg-blue-600` (not a raw hex) can slip past a hex-only denylist.
- **UPGRADE:** extend the denylist to Tailwind blue/indigo/violet/pink utility classes, and extend scan coverage to the financial modules (noting recolor of financial pages must not be done autonomously — flag to Jorge).
- **PROOF:** known-bad raw hex `#2563eb` in a maintenance file → red (works today). Known-bad `className="bg-blue-600"` → currently green (gap).

### 4.8 Dispatch structural guards — `verify:dispatch-board-sections-and-columns`, `verify:dispatch-board-hos-columns`, `verify:predispatch-panel-mounted`, `verify:dispatch-card-unit-first`, `verify:bookload-section-b-hos`
- **runs-in:** `locked-guards.yml` · **required?** NO · **class:** NOMINAL (source-token scans of the dispatch board / BookLoad modal).
- **GAP:** the live board is `DispatchBoard.boardColumns`, and `DispatchList.tsx` is **unmounted dead code** (per memory merged-not-live-landmines). A guard that greps `DispatchList.tsx` or greps a column label string can be green while the live board shows something else — directly analogous to the design-parity miss.
- **UPGRADE:** back each with a render-test mounting the live board component and asserting the columns/HOS cells/section order in the DOM (the BookLoad modal already has `BookLoadStopsSection.test.tsx` + `DriverHosClocks.test.tsx` per the design-parity `STRUCTURAL_RENDER_TESTS` map — extend the same to the dispatch board).
- **PROOF:** known-bad = grep target points at dead `DispatchList.tsx` while live `DispatchBoard` drops a column → string guard green, board render-test red.

### 4.9 Other high-volume NOMINAL families (catalogued, same pattern)
All `readFileSync`+`includes` presence scans; green-but-broken risk = "string present, behavior absent/wrong-source". Notable ones touching the flagged domains:
- `verify:sidebar-items-locked`, `verify:sidebar-contract`, `verify:factoring-sidebar-nav` (nav presence, not render).
- `verify:no-internal-language-in-prod-ui`, `verify:no-internal-strings`, `verify:no-stub-strings`, `verify:no-prod-stubs` (denylist scans — these are actually decent: a forbidden string makes them red).
- `verify:canonical-schema-names`, `verify:canonical-audit-table-name`, `verify:backend-column-references`, `verify:referenced-tables-exist` (schema-name presence — catch the `ih35_app.*`/`finance.*` landmine class by denylist → REAL-leaning, but "table referenced exists in a migration file" ≠ "exists in prod DB").
- `verify:dispatch-load-patch-money-evidence-guard`, `verify:attachment-draft-reconcile` (money/evidence — source scans; the actual evidence-preservation must be a DB test).

---

## 5. UNKNOWN / needs-closer-read

| guard | why UNKNOWN | what to check |
|---|---|---|
| `verify:pre-commit` | meta-runner; strength = sum of chained guards | enumerate its chain; classify each link |
| `verify:e2e-critical-paths` | name implies real flow; mechanism not read | does it boot + drive endpoints, or grep a checklist file? |
| `verify:mobile-responsive-audit` / `verify:no-horizontal-overflow-at-1024` / `verify:responsive-pages-render-at-mobile` | "responsive" implies a render/measure | confirm they mount/measure (jsdom/puppeteer) vs. grep className breakpoints |
| `verify:all-list-pages-load-200`, `verify:no-flaky-endpoints-on-page-load`, `verify:qbo-sync-status-endpoints-return-200` | listed as HTTP-smoke (REAL) but need confirmation they hit a *running* server vs. assert route registration | read the fetch target / whether a server is booted in the same job |
| `verify:*-pdf-export-puppeteer` (vehicle/driver/trailer/emanifest) | name implies puppeteer render | confirm they actually launch puppeteer & assert PDF content vs. grep for a puppeteer import |
| the ~21 "AST-ish" cash-forecast/cash-eta guards | regex-over-source that may be structural enough to be REAL | read each: do they assert a firewall invariant (credit excluded, append-only) structurally, or just `.includes` a function name |

---

## 6. Counts

- Total `verify-*` scripts: **695**; npm `verify:*` entries: **548**.
- **REAL:** ~**35** (the 20 DB-backed *when CI provides a DB*, ~8 HTTP-smoke, ~6 dist-readers, the 3–4 structural SQL/route scanners — `rls-migration-scan`, `migration-no-unknown-roles`, `no-orphan-routes`, `section7-palette-maintenance`). Several are REAL only inside `ci/build-typecheck` and degrade to NOMINAL elsewhere.
- **NOMINAL:** ~**640** (every `readFileSync`+`.includes()`/`.match()` source-presence guard, incl. `verify:design-parity`, `verify:arch-design`, the dispatch/sidebar/nav/parity families).
- **UNKNOWN:** ~**20** (responsive/puppeteer/e2e/cash-forecast families + the `pre-commit` meta-runner — listed §5).

---

## 7. Top 5 most dangerous nominal guards (green-but-broken on something that matters)

1. **`verify:design-parity`** (`scripts/verify-design-parity.mjs:184`) — the proven miss; source-token, not rendered, Create-WO not `ENFORCED`, **and not a required check**. Fix per §3.
2. **`verify:arch-design` / locked-UI-surface** (`scripts/verify-architectural-design.ts`) — guards every locked route/nav/section by *string removal only*; a locked route can render blank/dead and pass; **not required**. §4.1.
3. **`verify:multi-entity-separation`** (`locked-guards.yml:262`) — entity isolation (the financial-safety crown jewel) asserted by source-grep, not runtime; the REAL DB version only runs in `ci`. §4.2.
4. **Dispatch board family** (`verify:dispatch-board-sections-and-columns`, `verify:dispatch-board-hos-columns`, `verify:predispatch-panel-mounted`) — same merged-not-live trap as design-parity (live board = `DispatchBoard`, `DispatchList.tsx` is dead code); source-token, no DOM proof, **not required**. §4.8.
5. **Money/GL contract guards** (`verify:expense-gl-posting`, `verify:bill-resolver-single-source`, `verify:dispatch-load-patch-money-evidence-guard`) — assert the posting/evidence *contract strings* exist, not that a posting actually nets debits==credits or that POD evidence survives; the only executed proof (`verify:double-entry-balance-trigger`) hard-skips without a DB. §4.5.

**Cross-cutting fix that dwarfs any single guard:** `locked-guards` is **not** a required status check and `verify:arch-design`/`verify:design-parity` are **not** in `ci/build-typecheck` — so the entire parity/nav/dispatch guard wall is advisory. Either add `locked-guards` to `branch-protection-config.json` `required_status_checks.contexts` or move the parity guards into a required job. This is a config drift to surface to Jorge (the committed `required_checks_detail:38` even *claims* arch-design runs in build-typecheck, which is false).
