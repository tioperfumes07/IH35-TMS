# IH35-TMS — LAW OF THE LAND (COMPLETE) — autoload every session, GUARD + coder

**This is the single consolidated governing reference. It loads at the start of every session (via the
`ih35-tms-standards` skill for GUARD/planning, and via `.cursor/rules/00-always-read-first` for the coder).
It does not replace the source files — on any conflict the source `.cursor/rule` / spec wins and the MORE
PROTECTIVE reading wins.** Live financial + legal-evidence data for a real carrier — every change is
production-affecting. §1 permissions override everything. When unsure, STOP and ask.

---

## §0 — SUPREME LAW: VERIFY EVERYTHING, NEVER GUESS (Rule 06/10)
Everything is verified against live evidence — no guessing, ever. Schema/columns/enums/tables → verify on the
Neon PROD branch `br-fancy-credit-akjnd07a` (`information_schema`/`pg_catalog`), NOT memory/migrations/docs;
**prod wins.** **RLS 0-count landmine:** `catalogs.*`, `mdata.*`, `accounting.*`, `banking.*`, `lib.*` are
FORCED-RLS — a `0` is not a verdict; re-run in the same txn after `SELECT set_config('app.bypass_rls','lucia',
true)`. **Classify scoping by opco VALUES + policy, never column presence** (the complaint_types/detail_types
lesson: a column can exist and be entirely NULL = shared-canonical). Ledgered ≠ effective; CI-green ≠ done;
merged ≠ done; deployed ≠ live until `/healthz/shallow` version == merge SHA. Cannot verify → say
**UNVERIFIED**, never guess. **Precedence:** FACTS → CI guard > prod-verified skill/reference > repo > memory;
**DECISIONS** (approvals, canonical picks, merges, flag intent) → the **OWNER** wins; a doc never overrides an
owner ruling.

---

## §1 — PERMISSIONS & MERGE GATES (override everything)
Merge to `main` = ship to prod; no second gate; green CI ≠ approval. **Self-merge OK:** pure frontend/docs/CI-
action bumps + non-financial backend touching none of the financial cluster / migrations / `accounting.*` /
`catalogs.*` / `mdata.*`. **Financial cluster: the builder never merges its own work — Devin merges on green**
(owner ruling 2026-07-29). **The `JORGE-APPROVED` label is NOT a merge gate** (owner rulings 2026-07-26 and
2026-07-29; `21-session-operating-decree`, `PRE-BLOCK-OWNER-QUESTIONS-LAW-2026-07-26`, and
`verify-hold-merge-gate.mjs` which has treated it as optional since 07-26). The owner does not review PRs;
asking for the label at merge time is itself a violation. A gate nobody operates is a control deficiency —
it records an approval that never ran. The controls that DO operate: builder≠merger, Rule 11's independent
reviewer≠builder, `ih35_app` cannot run DDL (owner applies on Neon), posting flags default OFF per entity,
and the 18-key evidence block (CI 1324/1430/1431). **Owner questions are settled BEFORE implementation,
never at merge.**
Prod DB access gated — ask every time; `ih35_app` CANNOT run DDL (owner applies on Neon; GUARD re-proves).
Prohibited outright (direct owner to do it): moving money/posting to prod without per-action OK, entering
credentials, changing access controls, permanently deleting data, submitting to any external financial system.
**Cursor builds; Claude merges; Cursor never merges (Rule 23). Builder never reviews/verifies its own work
(Rule 11).**

---

## §2 — THE 24 `.cursor/rules` (complete governing index — all always-apply)
- **00 always-read-first** — autoload; STEP-0 session law; RESPOND-BEFORE-CODING gate; locked invariants; DO-NOT list.
- **01 spec-sources** — source of truth = MASTER_BLUEPRINT_v3 + UNIFIED_BLUEPRINT_ADDITIONS + ARCHITECTURAL_DESIGN; precedence (arch-design wins tabs; additions win over blueprint; NEW-SPEC → ask).
- **02 respond-before-code** — post the spec-review acknowledgment (sources · screens · tab-count · deviations · NEW-SPEC) BEFORE any code; it is the audit gate.
- **03 display-ids** — server-generated only, never user-editable; WO `WO-{UNIT}-{TYPE}-{MM-DD-YYYY}-{NNNN}-{V5}`, 7 source types IS/ES/AC/ET/RT/IT/RS; L-/B-/S-/CA-/FA- formats locked.
- **04 locked-invariants** — `operating_company_id` RLS every table; views `security_invoker=true`; lockstep INSERT; append-only audit; void-not-delete; idempotent migrations; WF-012/017/038/044/050/053/064; 425C virtual banks excluded from bank totals; `+ Create`/`+ Book` only.
- **05 architectural-design-is-law** — tab count/name/purpose = `IH35_ARCHITECTURAL_DESIGN.md`; `verify:arch-design` CI gate; update design in the SAME commit if a tab changes; never invent/drop a tab.
- **06 quality-hardline-and-law** — trust>speed, correct>easy, verify>guess, protect-the-company; match/surpass QBO/NetSuite/McLeod/Alvys; false-empty rule; no fake-green; no "done" without proof.
- **07 never-delete-only-add (= §F.24)** — NEVER delete modules/tabs/surfaces/catalogs/columns/tables; archive/hide-flag/soft-delete only; additive migrations; retire = stop-write + REVOKE + deprecated comment, never DROP.
- **10 verification-and-neon-rls** — prod branch wins; RLS 0-count re-run under lucia; ledgered≠effective; deploy verified by SHA ancestry; owner applies DDL; GUARD re-proves with acceptance[] evidence.
- **11 multi-agent-orchestration** — planner → builder (one bounded change; ONE builder per migration lane) → **independent code-review agent** (different agent than builder; unresolved high-severity blocks the PR) → **financial/accounting agent VETO** on money → **GUARD** live-verify. ≥1 independent verifier per financial finding; loop-until-dry; builder never self-reviews.
- **12 model-tiering** — highest-capability model for money/schema/RLS/migration/linkage/review; mid for routine; fast for docs/bulk. Escalate the instant money/schema is touched; when in doubt, escalate.
- **13 financial-and-accounting-law** — financial cluster = build-and-HOLD, owner `JORGE-APPROVED` + owner Neon-apply; reuse the poster (no new GL math); parallel double-books, **QBO NEVER written** (reconcile-only, clone-once); flags default OFF until CPA sign-off + Neon tie-out; US GAAP/FASB ASC — Ch.11 = ASC 470-60 (NOT 852 fresh-start), 606 revenue, 842 leases; factoring = secured borrowing; cutover 04/01/2026, OB as-of 03/31 owner-entered.
- **14 linkage-law-enforcement (§10)** — declare per block: canonical target (`to_regclass`, never a RETIRE table) · hub matrix (org.companies, identity.users, mdata.drivers/units/loads/customers/vendors, catalogs.accounts, maintenance.work_orders, accounting.journal_entries) · both-way (forward+reverse) · entity scope (opco + FORCED RLS; cross-entity FK = defect) · deployed-SHA vs origin/main. A block with no linkage declaration is a defect. Guards G1–G4 (registry-complete, block-acceptance, guard-wired, canonical-table-writes).
- **15 research-mandate** — cite the standard a material recommendation matches (QBO/NetSuite/McLeod/Alvys; GAAP/ASC; FMCSA USDOT/HOS/DQ/Clearinghouse/IFTA/2290/425C; RLS/WORM/security_invoker/least-privilege).
- **16 fix-not-patch-evidence-law** — fix root cause; never patch/defer without owner-written tracker + future-block id; every bug fix ships a guard; reply shape ROOT CAUSE / FIX / GUARD / LIVE PROOF|UNVERIFIED / REMAINING.
- **17 no-guard-hotfile-thrash** — new guards via `scripts/verify-steps/NNN-*.mjs` ONLY; never edit `package.json` / `ci.yml` / `locked-guards.yml`.
- **18 pipeline-truth-and-throughput** — fail-closed step runner (`ctx.run` throws); single-domain frozen-scope PRs; one branch-bound manifest; never source repo `.env` in hooks; law files = governance-only owner-reviewed PR; done = shared evidence (commit+push+review+CI+merge/deploy).
- **19 owner-manual-reserve-accounts** — factoring reserve/holdback/retainage accounts in `catalogs.accounts` are OWNER-created manually in-app ONLY; no agent/migration/seed may create/import/reclassify/merge/deactivate them; leave the 11 QBO-clone reserve accounts exactly as-is.
- **21 full-system-no-partial-amnesia** — real OS-of-record bar; every module/tab links both ways; every money event economically complete; kill DUAL_PATH_OLD_ACTIVE; finish the MODULE under Full Audit Law before the next; M grows, never freeze to hide leaves; wave-slice ≠ module; chrome ≠ linkage.
- **22 session-boot-announce** — first reply of a new session opens with `NEW SESSION · rules autoloaded · tiered model in force`; tiered model (Rule 12) always in force.
- **23 no-money-theater-prs** — money PRs may not be EntityLink-only / banner-only / fake N-of-M; every money commit carries the 18 keys (§3); CI 1430 `verify-no-money-theater`; Cursor builds, Claude merges.
- **24 module-completion-n-of-m** — module COMPLETE only when `docs/module-completion/<module>.json` has N of M with `complete:true`; CI 1431; never claim complete from PR volume; `MODULE_PROGRESS: <module> N of M` on every money commit.
- **dual-lane-never-idle** — Lane A (Lists/Safety/Drivers) + Lane B (Dispatch/Maintenance) in parallel; single-domain; rebase on origin/main before PR; check migration tail for duplicate numbers; never idle/stale.

---

## §3 — THE 18-KEY MONEY-PR GIT GATE (Rule 23/24; CI 1430/1431/1324 fail closed)
`FINDING` · `LANE` · `DOD-A`…`E` (active-path · wizard-depth · linkage F+R · purpose→economics · evidence) ·
`VERIFY-1`…`8` (QBO-chrome · 7-clause picker law · connectivity-to-canonical · deep-linkage · entity-scope
TRANSP+USMCA · CPA-economics · tab law · RLS) · `MODULE_PROGRESS: <module> N of M` · `ITEMS_TOUCHED` ·
`MIGRATE` · `ROOT CAUSE`/`FIX`/`GUARD`/`LIVE PROOF`/`REMAINING`. Values: `PASS`·`N/A`·`FAIL`·`UNVERIFIED—reason`.
One ranked finding per PR.

## §4 — SPEC SOURCE-OF-TRUTH DOCS (Rule 00/01)
CURSOR-OPERATING-CONSTITUTION · DEFINITION-OF-DONE · EVERY-PR-AUDIT-CHECKLIST · QUALITY-STANDARD-LOCKED ·
ARCHITECTURE-BLUEPRINT-2026-07-05 (total connectivity) · IH35_MASTER_BLUEPRINT_v3_FULL · IH35_UNIFIED_BLUEPRINT_
ADDITIONS · IH35_ARCHITECTURAL_DESIGN · docs/lockdown/00_LOCKED_DECISIONS · FULL-SYSTEM-AUDIT-AND-WIRING-MASTER-
PLAN-2026-07-22 · FINAL-TABLES-WIRING-FOR-CODER-2026-07-05 (§10 linkage / canonical map) · Desktop FULL-AUDIT-
LAW-AGREED / PERMANENT-FIX-FULL-AUDIT-AGENT / MODULE-COMPLETION-N-OF-M-LAW · skills ih35-tms-standards +
ih35-evidence-before-done · IH35-TMS-MASTER-RULES §F.24.

## §5 — RETIRE → CANONICAL (never write/FK the left)
`driver_finance.*` canonical (RETIRE `payroll.*`/`settlement.*`) · `mdata.qbo_*` canonical mirror, read-only
for projections which WRITE `accounting.*` (RETIRE `accounting.qbo_*`) · `banking.*` (RETIRE `bank.*`) ·
`maintenance.*` (RETIRE `maint.*`) · `mdata.vendors` AP-truth (WO picker stop writing `mdata.qbo_vendors`) ·
`mdata.loads` · cancellation reasons = `catalogs.load_cancellation_reasons` per owner ruling A (archive legacy
`catalogs.cancellation_reasons`, never drop).
