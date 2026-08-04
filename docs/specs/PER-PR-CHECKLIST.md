# IH35-TMS — PER-PR CHECKLIST (canonical, auto-loaded every session)

**Status: BINDING.** This is the single consolidated list of what must be audited and fixed in
**every** PR. It consolidates `docs/specs/DEFINITION-OF-DONE.md`,
`docs/trackers/FULL-AUDIT-LAW-AGREED-2026-07-22.md`, the Full Linkage Audit, Rule 16
(`.cursor/rules/16-fix-not-patch-evidence-law.mdc`) and Rule 17. **It does not replace or soften any
of them — on conflict the MORE PROTECTIVE reading wins.**

Scattered law is skipped law. That is why this file exists, why it is referenced from every
auto-loaded entry point, and why §3/§4 below are **machine-enforced** rather than trusted
(`scripts/verify-definition-of-done-evidence.mjs` + `.github/workflows/pr-evidence-block.yml`).

> **The one-line rule:** a change is DONE only when a hostile reviewer, using only the evidence in
> the PR, can confirm the defect is gone and nothing else broke — **without trusting the author.**
> CI-green is the floor, not the verdict. "Merged" is not done. "The API accepted it" is not done.

---

## 0 · Before writing a line

- [ ] `git fetch origin` → `git checkout main` → `git pull --ff-only` (the local clone lags routinely)
- [ ] Fresh branch per block (`feat/…`, `fix/…`, `chore/…`). **Never `git add -A`** — stage explicit paths
- [ ] Read the spec / approved screen **first**. Never build from a defect list
- [ ] Classify the lane. Financial cluster → proof gate (independent review + financial-agent pass + 18-key evidence), then merge on green yourself (§6 — OWNER LAW 2026-08-03, no hold)

## 1 · The five DONE layers — per module · per tab · per nested tab · per wizard

- [ ] **A — Active path.** Real registered route, mounted component, nav leaf exists. No
      `DUAL_PATH_OLD_ACTIVE`, no ComingSoon while a Live tab exists, no archived twin still mounted
- [ ] **B — Wizard depth.** Every rendered field is **controlled AND present in the submit payload**.
      A field that renders and is discarded on save is a defect, not a nicety
- [ ] **C — Law §9 linkage, FORWARD *and* REVERSE.** Canonical FKs both ways. **Memo-only links are
      FAIL** — a truncated uuid inside a name string, or a `jsonb` array of ids, is not a link.
      Reverse is the half that keeps getting skipped
- [ ] **D — Purpose → economics.** The purpose of the transaction decides which money object is
      created (settlement deduction vs expense vs bill vs escrow). Never a silent default
- [ ] **E — Evidence.** Live proof, or an explicit `UNVERIFIED — needs live check` naming the blocker

**Chrome-only, nested-`+ Create`-only, or docs-only NEVER closes a module.**

## 2 · The audit layers — run on every surface the PR touches

- [ ] **2.1 Visual / QBO chrome.** Money creators are right-side `ParityDrawer`, not a thin full page.
      No box-in-box. QBO calendar. Bill Date + Terms Net-30 auto-computes Due. Accounting money
      format. `+ Create` / `+ Book` — never `+ New` / `+ Add`. Nested create = drawer-on-drawer,
      never a centered modal on a money drawer
- [ ] **2.2 Universal picker law — all 7 clauses.** Real entity-scoped catalog behind it · inline
      `+ Add new …` as the **FIRST ROW INSIDE the dropdown** (never a button floating outside the
      box) · opens the QBO wizard for that exact entity · same locked wizard chrome · **writes the
      same canonical table the picker reads** · after save it appears, is selected, and survives
      reload · scoped to the current company (a USMCA create shows on USMCA)
- [ ] **2.3 Connectivity / wiring.** nav wired → route mounted → UI calls the real API → API writes
      **canonical** tables (never RETIRE ones) → same table read *and* written → entity-scoped →
      flags honest. Trace button → form → API → Neon row. *If the UI looks fine but Neon has 0 rows
      forever, that is a wiring FAIL, not a "PASS in code."*
- [ ] **2.4 Deep linkage chains** (as applicable) — claim · driver-at-fault · repair WO · expense ·
      bill + bill payment. Click every forward hop, click every reverse hop, confirm the FK in Neon
- [ ] **2.5 Catalogs / entity scope.** TRANSP **and** USMCA. Vendors include drivers-as-vendors.
      Units scoped by `owner_company_id OR currently_leased_to_company_id` (units have **NO**
      `operating_company_id`). No cross-entity leak. CoA roles need the company GUC — bypass alone
      can false-empty
- [ ] **2.6 Economics (CPA-grade).** Header **plus lines**, never header-only. Balanced JE when
      posting is ON. Correct control roles (A/P, A/R, Undeposited Funds). Flags honest. Parallel
      books — **no TMS→QBO write-back**
- [ ] **2.7 Tab / design law (Rule 05).** Every approved-nav leaf present; no silently missing tabs;
      no inventing tabs without updating the design doc in the same PR
- [ ] **2.8 Security / entity / RLS.** FORCE RLS with the correct GUC policy, `security_invoker=true`
      on views, grants for any new schema (0065 pattern) or it 500s at runtime

## 3 · The evidence block — REQUIRED in the PR body *and* the squash message

**Rule 30 (Claude-green — permanent):** use `docs/templates/CLAUDE-GREEN-PR-BODY.md`. Start with
`FINDING:` (no `## Summary` preamble). Identical labelled block in the **commit** and **PR body**.
Before `gh pr create|edit`: `node scripts/cursor-pr-body-gate.mjs --body-file …`. Never stack on
another open branch; never `git reset --soft origin/main` after main advanced.

```
FINDING:     ranked id
LANE:        NON-FINANCIAL | FINANCIAL-HOLD | …
ROOT CAUSE:  the actual mechanism, not the symptom
FIX:         what changed and why this is the root fix, not a patch
… DOD-A…E · VERIFY-1…8 · MODULE_PROGRESS · ITEMS_TOUCHED · MIGRATE …
GUARD:       scripts/verify-*.mjs + scripts/verify-steps/NNNN-*.mjs
LIVE PROOF:  command exit 0 / health sha / endpoint / row — or UNVERIFIED: <named blocker>
REMAINING:   what is still open, explicitly. "nothing" is a claim you must defend
```

A PR that changes app code and omits this block is **not reviewable and is not done**.
`LIVE PROOF` must name a real artifact — a sha, an endpoint, a row count, a screenshot path — or say
`UNVERIFIED: <blocker>`. Forbidden theater: bare `LIVE PROOF: UNVERIFIED browser`.
**The word "verified" on its own is not proof.**

## 4 · Guard rules — how a fix is made un-regressable

- [ ] **Every bug fix ships a static CI guard.** No guard = not done
- [ ] The guard **FAILS on the bug and PASSES on the fix** — prove both, by running its assertion
      against the pre-fix file from `main`
- [ ] `--selftest` must be **capable of failing**: run the real assertion against *mutated copies of
      real source*, one case per assertion, each deleting exactly what that assertion requires.
      Reject a case as inert if the mutation did not change the source. *A selftest comparing two
      string literals declared inside the script proves nothing*
- [ ] The selftest also asserts the **corrected shape is NOT flagged** — false positives burn trust
      as fast as misses
- [ ] **Wiring: `scripts/verify-steps/NNNN-*.mjs` ONLY.** Adding `verify:*` entries to
      `package.json` is FORBIDDEN and never executes. Never edit `locked-guards.yml` / `ci.yml` to pass
- [ ] **Never weaken a guard to go green.** If a fix trips a guard, check whether the GUARD is wrong
      first — guards have been found asserting the exact defect they exist to prevent. Ratchets may
      only tighten

## 5 · Verification discipline — the traps that have actually burned this repo

- [ ] **Prod wins.** Schema/columns/enums verified against the Neon prod branch — not migrations, not
      memory, not a doc, not another agent's "verified"
- [ ] **A 0 or empty result is NOT proof of absence — RE-RUN it.** RLS masks `accounting.*` /
      `catalogs.*` / `mdata.*` to 0. Include a **positive control** (assert a known non-zero count is
      visible) before trusting any count
- [ ] **A 200 is not proof of success.** The SPA origin returns `index.html` with HTTP 200 for unknown
      `/api` paths — check the **content-type**, not the status
- [ ] **Never trust a string-grep as a systemic check.** Grep misses variables. Test the endpoint
- [ ] **Pipes mask exit codes.** `cmd | tail; echo $?` reports `tail`'s status
- [ ] **Establish the baseline before blaming your change** — run the suite on `main` and compare
- [ ] **Deploy is verified by ancestry**, not string equality (`git merge-base --is-ancestor`)

## 6 · Merge gates — OWNER LAW (2026-08-03, FINAL): NO HOLDS, NO `JORGE-APPROVED`

- [ ] Merging to `main` **IS** the production-deploy decision. There is no second gate — including no
      owner-approval gate
- [ ] **Every coder merges on green itself, in every lane** — non-financial AND financial cluster /
      migrations / `accounting.*`/`catalogs.*`/`mdata.*`. See `.cursor/rules/00-operating-method-LAW.mdc`
- [ ] **Financial cluster proof gate (not an owner-approval gate):** independent code-review +
      financial-agent pass, the 18-key evidence block, migration firewall, apply on Neon yourself —
      then merge on green
- [ ] Opening balances are owner-entered only (retained — a data-accuracy control). Default env flags
      **OFF**. **Flag flips happen after the owner's DECISION in chat** ("turn it on"), executed and
      proven live by the coder — never a label, never a merge-time ask
- [ ] Prod DB access is verified **per connection** (right branch) — a correctness check, not a
      permission ask

## 7 · Migration PRs — additionally

- [ ] Number strictly above main's max, **re-checked at push time**; never reuse/collide
- [ ] Idempotent (`DO` blocks + `IF NOT EXISTS` / `ON CONFLICT`)
- [ ] **Dynamic `org.companies` resolution — NEVER hardcode a UUID** (a fresh-from-0001 CI DB seeds
      `gen_random_uuid()` companies, so a hardcoded id FK-fails)
- [ ] Per-entity seed **carries `deactivated_at`**, not just `is_active` (else half-deactivated rows
      read as active)
- [ ] `UNIQUE(operating_company_id, code)` · FORCE RLS · **REVOKE DELETE** · grants for new schemas
- [ ] void-not-delete; append-only audit; `CREATE OR REPLACE VIEW` columns **appended** only
- [ ] Validate on a **local throwaway DB** — confirm `host=localhost`. **Never** `ALLOW_PROD_MIGRATE=1`
- [ ] **NEVER edit a migration already applied on prod.** Two sanctioned forms only: (a) a
      checksum-override in the SAME PR, or (b) a forward migration. No third option
- [ ] Regenerate the pinned prod-ledger manifest whenever a migration is applied on prod
- [ ] Regenerate **up front**: schema-parity, orphan-FK inventory, entity-isolation baselines

## 8 · Honest reporting

- [ ] Report outcomes faithfully — if a step was skipped or a check failed, say so
- [ ] Cannot verify → write **`UNVERIFIED — needs live check`** and name the blocker. Never a guess
- [ ] Do not present a partial review as complete. If you covered 8 of 12, say 8 of 12
- [ ] Correcting your own earlier claim is **required**, not optional, when it would change a decision

---

## How this file is kept from being disregarded

1. **Auto-loaded** — referenced from `AGENTS.md`, `docs/CLAUDE.md`,
   `.claude/skills/ih35-tms-standards/SKILL.md`, and the always-apply Cursor rule
   `.cursor/rules/23-per-pr-checklist.mdc`
2. **Pre-filled** — `.github/pull_request_template.md` carries the §3 block, so the default path is
   the compliant one
3. **Enforced at commit time** — `scripts/check-commit-evidence.mjs` (husky `commit-msg` hook)
4. **Enforced in CI on what actually lands** — `.github/workflows/pr-evidence-block.yml` validates
   the **PR body**, and `scripts/verify-definition-of-done-evidence.mjs` (verify-step 1324)
   validates the commits. Both require **labelled lines** and a **real proof artifact** — not a bare
   keyword

**Cross-refs:** `docs/specs/DEFINITION-OF-DONE.md` · `docs/specs/QUALITY-STANDARD-LOCKED.md` ·
`docs/trackers/FULL-AUDIT-LAW-AGREED-2026-07-22.md` · `.cursor/rules/14-linkage-law-enforcement.mdc` ·
`.cursor/rules/16-fix-not-patch-evidence-law.mdc` · `.cursor/rules/17-no-guard-hotfile-thrash.mdc` ·
`AGENTS.md`.
