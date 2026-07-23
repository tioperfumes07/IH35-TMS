# HANDOFF → next Claude coder (2026-07-23, end of Safety wave)

Read this top-to-bottom before touching anything. It is written to make you productive in ~10 minutes
without repeating the mistakes already paid for.

**Canonical law lives elsewhere and outranks this file.** This is the *state + hard-won lessons* handoff.
- `CLAUDE.md` (auto-loads) — permissions §1, schema landmines §4, product locks §7.
- `docs/specs/DEFINITION-OF-DONE.md` — **the** definition of done (written this session, now enforced).
- `docs/trackers/LANE-ASSIGNMENT-2026-07-23.md` — Cursor ↔ Claude split + reserved number ranges.
- `.claude/skills/ih35-tms-standards/SKILL.md` §0/§10 — verify-everything law + linkage law.

---

## 1. Who you are

**Owner-assigned role:** guard, verifier, and builder for the **safety lane onward**. Jorge (owner) is the
sole decision maker — **there is no CPA** (he said so explicitly 2026-07-23; stop deferring to one).

**Lane split (owner-directed):**
| | CURSOR | YOU (Claude) |
|---|---|---|
| Modules | accounting, banking | safety, lists, maintenance, insurance, legal, dispatch, settlements, factoring, vendors, customers, drivers, driver-hub, fleet, cash-flow, finance |
| Backend | `accounting/**`, `banking/**` | everything else |
| Frontend | `pages/accounting/**`, `pages/banking/**` | everything else |

**Never edit the other lane's files.** Post the file+line+change in your PR body instead.

**Reserved numbers:** verify-steps — you `1325–1399`, Cursor `1400–1499`. Migrations — you
`202607800000+`, Cursor `202607790000+`.

---

## 2. The laws that actually bite (in priority order)

1. **VERIFY EVERYTHING, NEVER GUESS.** Every fact needs live evidence produced *this session*. Schema →
   the Neon **prod** branch, not migrations, not memory, not another agent's "verified." When you can't
   verify, write **"UNVERIFIED — needs live check"** and name the blocker. Never a guess.
2. **§1 permission gates.** Merging to `main` **is** the production deploy. Self-merge only
   non-financial frontend/docs/backend-reads on green. **STOP** for: anything financial, ANY migration
   or schema change, any touch to `accounting.*`/`catalogs.*`/`mdata.*` schema-or-data, runtime dep bumps.
   Prod DB access is gated **per connection** — ask every time.
3. **Total connectivity (§9/§10).** Every record links **forward AND reverse**. A memo-only link (a uuid
   inside a string, a `jsonb` array of ids) is **FAIL**. Forward persistence without a reverse surface is
   **NOT DONE**.
4. **Definition of Done** — see §4 below. Enforced by a commit-msg hook + CI step 1324.
5. **Additive-only (§7).** Never delete/reorder modules/tabs/columns/routes. ARCHIVE, never DELETE.
   `+ Create`/`+ Book` vocab. Locked palette. No emoji in chrome.

---

## 3. The traps that already cost real time — do not re-learn these

**Measurement traps**
- **A `0` is not absence.** RLS masks `accounting.*`/`catalogs.*`/`mdata.*` to 0. Always re-run with scope
  proven. Include a *visibility sanity check* (assert a known non-zero count is visible) before trusting
  any count — this caught a bad measurement mid-build.
- **`mdata.drivers` RLS is identity-based** (`org.user_accessible_company_ids()`), NOT the
  `app.operating_company_id` GUC. A raw SQL session reads **0**; the app reads **82**. Verify driver
  counts through the **authenticated API**, not psql.
- **The two Neon MCP tools enforce RLS differently** (`run_sql` vs `run_sql_transaction`:
  `current_user=ih35_app` vs `session_user=neondb_owner`). A "cross-entity leak" seen in one may be a tool
  artifact. Settle entity-scope questions with an **authenticated API request**.
- **A `200` is not success.** The SPA origin returns `index.html` with **HTTP 200** for unknown `/api`
  paths → `res.ok` is true and `res.json()` throws. **Check content-type.** This was a 22-site bug (#3336).

**Tooling traps**
- **`tsc -b` incremental cache LIES.** It passed locally while CI's fresh build failed with 7 real
  TS18047 errors. **Delete `*.tsbuildinfo` before every typecheck.**
- **Pipes mask exit codes.** `cmd | tail; echo $?` reports `tail`'s status. Redirect to a file, capture `$?`.
- **`git checkout --theirs`** during a merge takes the WHOLE file from the other side, silently discarding
  your branch's work. Detect with an empty `git diff origin/main -- <file>`. Resolve hunk-by-hunk.
- **`git checkout -- .` destroys uncommitted work.** It ate a finished fix this session.
- **Guards can match their own explanatory comments.** Strip comments before structural checks — and note
  a naive block-comment strip can span a distant `/** … */` and eat real code (it deleted a real mount
  line from `index.ts`). Use line-comment-only stripping for large files.
- **`String.replace` hits the FIRST occurrence** — often a comment, which then gets stripped, neutralizing
  a selftest mutation into a false "not caught."

**Correction to an earlier claim:** `LANE-ASSIGNMENT` says a duplicate verify-step number = "lost guard."
**That is overstated for this runner.** `scripts/verify-pre-commit.mjs` does
`readdirSync(stepsDir).filter(...).sort()` — it globs **filenames**, so duplicate-numbered steps BOTH run.
main currently has a real duplicate (`1325-verify-banking-categorize-pickers.mjs` +
`1325-verify-safety-void-requires-reason.mjs` — Cursor used your range). No guard is lost; it is a
reservation violation + ordering ambiguity. Worth correcting in the lane doc, not worth a panic.

---

## 4. Definition of Done (the bar every change must clear)

**5 DONE layers** — per module, per tab, per wizard:
- **A Active path** — operators see the new design; route registered, component mounted.
- **B Wizard depth** — **every rendered field is controlled AND in the submit payload.** A field that
  renders and is discarded on save is a defect (found 7 such on the accident wizard).
- **C Linkage — forward AND REVERSE.** Memo-only = FAIL. Reverse is the half that keeps getting skipped.
- **D Purpose → economics** — the transaction's purpose decides which money object is created.
- **E Evidence** — live proof, or explicit UNVERIFIED with the blocker named.

**Guard rules (non-negotiable):** every fix ships a `scripts/verify-*.mjs` that **FAILS on the bug and
PASSES on the fix** (prove it by running the assertion against `git show main:<file>`). `--selftest` must
run real assertions against **mutated real source**, and must also assert the **corrected shape is NOT
flagged** (a guard produced 6 false positives this session). Wire via `scripts/verify-steps/NNNN-*.mjs`
**only** — adding `verify:*` to `package.json` is FORBIDDEN *and inert*.

**Every PR needs the Rule-16 evidence block:** ROOT CAUSE / FIX / GUARD / LIVE PROOF or UNVERIFIED /
REMAINING. Enforced by `.husky/commit-msg` + CI verify-step **1324** (which also asserts the hook still
exists). `--no-verify` skips the hook locally; **CI cannot be bypassed.**

---

## 5. Linkage / connectivity audit — where it actually stands

**Audit source:** `~/Desktop/IH35-CURSOR-AUDIT/modules/{safety,lists,maintenance,banking,accounting,factoring}.md`

### THE most important lesson about the audit
**The findings list is a starting point, NOT truth.** Measured this session on Safety:
- **3 of 6 "P0s" were FALSE** (F02/F03/F04) — all resting on one unchecked assumption ("held migration not
  applied on prod"); every column **exists** on prod.
- **The single worst defect appeared in NO finding** — `views.safety_dashboard_kpis` is a
  `SELECT … WHERE false` stub, so the whole Safety dashboard read 0 forever.
- **One finding was 2.4× understated** — SAF-F06 named 9 base-less fetches; the real count was **22 across
  20 files**.
- Some findings cite **stale line numbers / moved files**.

**Therefore: verify every finding against prod or the browser before acting. Label unverified ones.**

### Safety scorecard (44 findings)
- **~24 settled with evidence · 12 fixed**
- **REFUTED (4):** F02, F03, F04, F27
- **CONFIRMED + FIXED:** KPI stub, F06, F11, F13(guard), F14, F18, F24, F26, F32, F33 + F01/F05 (HOLD)
- **CONFIRMED, NOT BUILT:** **F16** (driver profile has no fines/complaints/D&A views),
  **F17** (unit/trailer profile has no safety section), F10, F19, F29
- **~20 still UNVERIFIED** (code-read only — treat as leads, not facts)

### Reverse-linkage state (the connectivity keystone)
`EntityLink` (`components/shared/EntityLink.tsx`) is the drill-through primitive. **SAF-F33 added 6 safety
kinds** (`accident`, `safety_fine`, `complaint`, `dot_inspection`, `escrow_record`, `permit`) — before
this, **no module could drill INTO any safety record.**
- `accident` + `safety_fine` **fully drill through** (the list page reads the `?id=` param and opens the
  record's drawer).
- The other 4 **navigate to their list page** (no drawer exists on those tabs). Row-highlight-on-param is
  the follow-up if those records ever become drill targets.
- Pattern to copy: query-param drill (`?accident_id=`) + the page honoring it, same as claim/lawsuit.

**Still missing (the remaining connectivity work):** the *profile* side. A driver's page shows no fines/
complaints/D&A (**F16**); a unit/trailer page shows no accidents/DOT inspections/DVIRs (**F17**).

---

## 6. Current state (verified 2026-07-23 ~16:30 CT)

**Live backend:** `17dd197`. **main HEAD:** `17dd19773`.

**Merged this session (Safety lane):** #3334 KPI wiring (live-verified: ACTIVE DRIVERS 82) · #3335
dispatch cancellation labels · #3336 22 base-less fetches + fabricated 2290 date · #3337 Definition of
Done + hook · #3339 void reason · #3340 creator pickers · #3341 fine-reduce block · #3352 migration
ranges · #3354 fines driver name · #3356 accidents names.

**Open — YOURS:**
| PR | What | Blocker |
|---|---|---|
| #3357 | SAF-F33 reverse EntityLink | green, self-merge on green |
| #3360 | SAF-F24 inline reason create | green, self-merge on green |
| **#3348** | SAF-F01 escrow forfeit | **HOLD** — owner applies migration `202607800000` on Neon, designates `damage_recovery`, flips `DRIVER_ESCROW_FORFEIT_GL_POSTING_ENABLED` |
| **#3353** | SAF-F05 accident fields | **HOLD** — owner applies migration `202607810000` on Neon |

**Open — CURSOR's (do not touch):** #3345 (drop global `UNIQUE(role_key)` — breaks 3 settlement-posting
DB tests), plus tracker-bot chores #3349/#3350/#3358/#3359.

**Owner money rulings already made — implement, never re-litigate:**
- Amending a source record that already has a **dependent money record** is **BLOCKED**, never silently
  cascaded. Name the dependent id + the remedy in the error. (From the fine→liability overcharge:
  reducing a converted $1,000 fine to $400 left the driver's liability at $1,000 → **$600 silent
  overcharge**. Fixed in #3341.)
- Forfeited escrow is a **recovery against a recorded loss, NEVER income** → credits `damage_recovery`
  (designated to the existing `QBO-1150040091 "Driver Accident Damages & Repairs"` — **reuse, don't mint**).

---

## 7. Known open defects you should NOT re-derive

- **`driver_finance.driver_liabilities` posts NO journal entry.** `convertFineToLiability` inserts a
  subledger row with no GL entry, so a driver's debt has no GL loss/receivable behind it. This makes the
  escrow-forfeit `damage_recovery` credit honest-but-incomplete. **Accounting-lane (Cursor) defect + owner
  ruling needed.**
- **`safety.civil_fines` has two conflicting CHECK constraints** — `fines_status_check` omits `'voided'`
  while `chk_civil_fines_status_voidable` includes it. Both must pass, so `status='voided'` is
  **unreachable**; voiding must use `voided_at`. Migration → owner-gated.
- **`catalogs.account_role_bindings`** is empty on prod and legacy; the PRIMARY role table is
  `accounting.chart_of_accounts_roles`. It still carries a **global `UNIQUE(role_key)`** with no entity
  column (Cursor's #3345 addresses it).
- **`cash_dip` / `driver_pay_expense` are undesignated** → settlement posting fails closed. This is a
  **sequenced dependency**, not a decision waiting on the owner: Cursor's widen-migration + Cost-of-Labor
  account must land → owner applies on Neon → owner designates → posting unblocks.
- **`safety.accident_reports`, `civil_fines`, `safety_events`, all escrow tables: 0 rows on prod.** Their
  zeros are CORRECT, not defects. Do not report them as bugs.
- **USMCA is a future carrier** — its zeros are expected. Always confirm which entity is selected before
  calling a `0` a defect.

---

## 8. Do this next (in order)

1. **Self-merge #3357 and #3360** once green (non-financial, your authority).
2. **SAF-F16** — add a Safety reverse section to the driver profile (`/drivers/:id`): civil + internal
   fines, complaints, drug & alcohol. Reuse the `?driver_id=`-scoped reads that already exist
   (`/api/v1/safety/fines?subject_driver_id=`). Guard + DoD as always.
3. **SAF-F17** — add a Safety reverse section to unit/trailer profiles (`/fleet/units/:id`,
   `/fleet/trailers/:id`): accidents, DOT inspections, DVIRs, incidents, interchanges. **Remember
   `mdata.units` has NO `operating_company_id`** — scope by `owner_company_id OR
   currently_leased_to_company_id`.
4. **Then** work the ~20 UNVERIFIED Safety findings — prod/browser-verify each **before** building.
5. **Then** the next module in the owner-locked sequence: **Lists** (26 findings), then Maintenance (27).

**Working rhythm the owner wants:** deliver, don't ask; keep momentum; self-merge non-financial on green;
STOP and surface for anything financial/migration. He values honesty about what is NOT verified far more
than a confident-sounding claim. Central Time. Never suggest breaks.

---

## 9. Live-audit access (how to actually verify)

- **Browser:** Chrome MCP. There are multiple Chrome instances — if `auth/me` 401s you are on the wrong
  one; use `switch_browser` and have Jorge click Connect in the window where he's signed in.
  **Never enter credentials yourself** — that limit holds regardless of tool authorization.
- **Prod app:** `https://app.ih35dispatch.com` · **API:** `https://api.ih35dispatch.com`
- **Health:** `GET /api/v1/healthz/shallow` → `{version:<short sha>}`. A **frontend-only** PR does NOT move
  this sha — verify frontend deploys with a **bundle canary** instead (fetch `/`, grab the
  `/assets/index-*.js` hash, grep for a string the PR removed).
- **Deploy is verified by ANCESTRY, not sha equality** — the live sha may be newer and still contain your
  merge. Use `git merge-base --is-ancestor <merge-sha> <live-sha>`.
- **Neon prod branch:** project `tiny-field-89581227`, branch `br-fancy-credit-akjnd07a`, db `neondb`.
  **Gated — ask before every connection.**
- **Local migration validation (safe):** `createdb throwaway && DATABASE_DIRECT_URL= DATABASE_URL=postgres://<you>@localhost/throwaway npm run db:migrate`
  then `dropdb`. **Never** set `ALLOW_PROD_MIGRATE=1`. Plain `npm run db:migrate` can silently hit PROD.
