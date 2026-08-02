# IH35-TMS — Agent coordination

> **★★★★ BEFORE ANY AUDIT WORK — READ [docs/audit/AUDIT-LAW-PERMANENT.md](docs/audit/AUDIT-LAW-PERMANENT.md) FIRST.**
> It defines the binding method, layer order (C→B→A→D→E), evidence requirements, and anti-patterns.
> A screenshot is NOT a Layer-E pass. "Complete" = 30/30 certified only. GUARD is the only gate to VERIFIED.

> **★★★ BEFORE ANY BLOCK — READ [docs/audit/AUDIT-COVERAGE-LIVE.md](docs/audit/AUDIT-COVERAGE-LIVE.md).**
> It is the single source of truth for what is actually broken. **Your work list = its rows where
> `Verdict = FAIL` and `Status = OPEN` in your lane.** Do not invent a work list, do not work from a stale
> tracker, and do not re-audit what already has a row. `git pull --ff-only origin main` before you write to it.
> **Column ownership is strict — never edit another role's column:** CASCADE owns Module/Layer/Entity/Verdict/
> Evidence/Date/Auditor (appends new rows only) · CODER/CURSOR own Status + Block/PR on rows in their own lane
> (only `FIXED (PR #)`) · **only GUARD writes `VERIFIED`**. Append-only: never delete a row; supersede by adding
> a new dated row and marking the old one `SUPERSEDED`. A row with no `Evidence` is not a finding.
> Rows marked `Owner-gate? = YES` need an owner DECISION — a coder never self-answers one.

> **★★★ THEN READ [docs/audit/GUARD-WORKORDERS.md](docs/audit/GUARD-WORKORDERS.md)** — the GUARD fix board: your lane's OPEN items, the fix
> requirement + standard for each, and GUARD status. Pull the top OPEN item in your lane; do not idle.

> **Consolidated index:** docs/specs/LAW-OF-THE-LAND-COMPLETE-2026-07-25.md — the complete 24-rule + 18-key-gate map (source .cursor/rule wins on conflict).

> **★ DEFINITION OF DONE (owner-agreed, BINDING — read before you call anything done):** [docs/specs/DEFINITION-OF-DONE.md](docs/specs/DEFINITION-OF-DONE.md) — five DONE layers (DOD-A…E) + evidence. **CI-green is the floor, not the verdict.**
>
> **★ EVERY PR AUDIT CHECKLIST (Claude-consolidated, BINDING, every session):** [docs/specs/EVERY-PR-AUDIT-CHECKLIST.md](docs/specs/EVERY-PR-AUDIT-CHECKLIST.md) — FINDING · LANE · DOD-A…E · **VERIFY-1…8** · **MODULE_PROGRESS** · MIGRATE · Rule 16. Money commits missing these keys **FAIL** commit-msg + verify-step **1430** (`verify-no-money-theater`). Rule **23** bans EntityLink/honesty theater. Rule **24** — module DONE = **N of M** checklist items in [docs/module-completion/](docs/module-completion/) (CI **1431**). Also enforced by verify-step **1324**.
>
> **★ Rule 25 — ONE PUSH / FAIL-FAST (permanent):** [`.cursor/rules/25-one-push-money-fail-fast.mdc`](.cursor/rules/25-one-push-money-fail-fast.mdc) — `scripts/money-pr-local-gate.mjs` is the **first** husky `branch:precheck-push` step (DoD + money-theater in seconds). Amend no longer skips checks on empty staged. **One push** after local PASS; never rebase/force-push while `build-typecheck` is running. CI: verify-step **1702** (`verify-money-pr-local-gate`).
>
> **★ Rule 29 — CURSOR = CLAUDE SHIP PARITY (permanent):** [`.cursor/rules/29-cursor-claude-parity-ship.mdc`](.cursor/rules/29-cursor-claude-parity-ship.mdc) — before **every** push run `node scripts/money-pr-local-gate.mjs` (DoD + theater + migration HH band + EVEN verify-step + no CLAIMED-NUMBERS edit + EntityLink adoption). **Never** `git commit --no-verify` / `git push --no-verify`. One labelled commit; PR body is not enough. CI: verify-step **1998** (`verify-cursor-claude-parity-ship`).
> **★★ PER-PR CHECKLIST (read FIRST, every PR):** [docs/specs/PER-PR-CHECKLIST.md](docs/specs/PER-PR-CHECKLIST.md) — the single consolidated list of everything audited and fixed in **every** PR: the 5 DONE layers, the 8 audit layers (QBO chrome · universal picker law · connectivity/wiring · deep forward+reverse linkage chains · catalogs/entity scope · CPA-grade economics · tab/design law · security/RLS), the required evidence block, the guard rules, the verification traps, the merge gates, and the migration rules. Consolidated because **scattered law is skipped law**. Enforced by `.github/workflows/pr-evidence-block.yml` (PR body) + `scripts/verify-definition-of-done-evidence.mjs` (commits) + always-apply `.cursor/rules/23-per-pr-checklist.mdc`.

> **Rule #0 (LOCKED):** Before any work, read [docs/specs/QUALITY-STANDARD-LOCKED.md](docs/specs/QUALITY-STANDARD-LOCKED.md) — the first standing quality law; it supersedes other docs on hardline conflict.

> **Cursor permanent charter:** [docs/specs/CURSOR-OPERATING-CONSTITUTION.md](docs/specs/CURSOR-OPERATING-CONSTITUTION.md) — applies to every Cursor session/agent; when instructions conflict, the more conservative / more protective reading wins. Enforced by always-apply `.cursor/rules/00`–`07` + `10`–`18`.

> **Rule 16 (owner law):** [`.cursor/rules/16-fix-not-patch-evidence-law.mdc`](.cursor/rules/16-fix-not-patch-evidence-law.mdc) — fix root cause, never patch, never defer without written tracker entry, evidence before done. Skill: `.claude/skills/ih35-evidence-before-done`. Template: `docs/templates/ACCEPTANCE-EVIDENCE-BLOCK.md`. Session hook: `.cursor/hooks/session-evidence-law.sh`.

> **★ CONSOLIDATED ARCHITECTURE GUARDRAIL (read this too):** [docs/specs/ARCHITECTURE-BLUEPRINT-2026-07-05.md](docs/specs/ARCHITECTURE-BLUEPRINT-2026-07-05.md) is the current consolidated guardrail — the **Law of the Land** total-connectivity rule, the driver **Bill + BillPayment** settlement model, the **Faro** exact factoring terms, the auto-provisioned **driver accounts**, the **posting flags**, and the **per-build-block linkage checklist**. **Every build block (especially financial) conforms to it.** See the checklist reproduced at the bottom of this file.

## Verify-step claims (TOOL-F03 — 2026-07-31)

Do **not** edit `scripts/verify-steps/CLAIMED-NUMBERS.json` in feature PRs. The `NNNN-*.mjs` filename is the claim (Cursor EVEN / Claude ODD). GitHub cannot run `merge=json-union` on that file — editing it is the conflict treadmill. Enforced by verify-step **1599** (uniqueness only) + **1906** (`verify-no-claimed-numbers-edits`).

## Dual lanes (always parallel when queue has work)

| Lane | Path | Role |
|------|------|------|
| A | `IH35-TMS` | Safety, Drivers, Lists, INFRA-1 |
| B | `IH35-TMS-agent2` | Dispatch, Maintenance, INFRA-2 |

## Never idle

Cursor rule: `.cursor/rules/dual-lane-never-idle.mdc` (`alwaysApply: true`)

Hook: `.cursor/hooks.json` → on **subagentStop**, injects follow-up to dispatch the top **OPEN** item in that
coder's lane from [docs/audit/GUARD-WORKORDERS.md](docs/audit/GUARD-WORKORDERS.md)
(Claude Coder = financial/migrations/posting; Cursor = frontend/UI/measurability). Fall back to abb only when
the GUARD board has no OPEN item for that lane.

**Primary queue:** `docs/audit/GUARD-WORKORDERS.md` (GUARD-maintained fix board)

**Fallback queue:** `/Users/jorgemunoz/Downloads/abb/00-TIER-2-3-DISPATCH-INDEX.txt`

**Done:** squash merge SHA on `origin/main`, branch deleted, CI green.

## Cursor rebase (no more hotfile conflicts)

**Always** sync with `node scripts/agent-sync-main.mjs` (not bare `git rebase origin/main`). It registers `merge=json-union` drivers first — CLAIMED-NUMBERS + `docs/module-completion/*.json` keyed by item id. Generated `module-completion.ts` is gitignored; frontend `typecheck`/`build`/`dev` regenerate it.

## If coordinator looks stale

Say: `agent is idle and stale` — or run `/loop 10m STATUS both lanes — abb queue, dispatch if idle`

## Canonical rules (tracked source of truth)

- **Sidebar / module count = 28 items**, defined in
  `apps/frontend/src/components/layout/sidebar-config.ts` → `SIDEBAR_ITEM_IDS`, enforced by
  `scripts/verify-sidebar-contract.mjs` (`LOCKED_ORDER`). The number **rendered** depends on role, and `eld`
  is a hidden stub. **Source of truth is the config array — never a hardcoded number.** (Supersedes any
  older "15 modules" / "23 items" claim in local `CLAUDE.md` or `docs/lockdown/00_LOCKED_DECISIONS.md`.)

## PER-BUILD-BLOCK LINKAGE CHECKLIST (GUARDRAIL)

Reproduced from §9 of [docs/specs/ARCHITECTURE-BLUEPRINT-2026-07-05.md](docs/specs/ARCHITECTURE-BLUEPRINT-2026-07-05.md)
(the blueprint is canonical if this ever drifts). Every build block — **especially financial** — must
satisfy ALL of these before it is "done", verified on **live data**, forward AND reverse:

- [ ] Every **money transaction** links to a **vendor OR customer** + the **GL account** (expense / bill / bill-payment / invoice / journal-entry / liability / asset) it posts to + an **audit** record.
- [ ] Every transaction links to its **load / dispatch** (where applicable) and the **driver / unit / asset** involved.
- [ ] Cross-module links present where relevant: **maintenance, safety, legal, insurance, customer, vendor** (e.g. a repair bill → unit + vendor + load (G18) + WO + expense acct + JE; a damage deduction → the claim → escrow liability; an insurance/legal event → the entity + its financial impact).
- [ ] **Forward + reverse** drill-through — no dead-end screen, no orphan row.
- [ ] **RLS** entity-scoped + **audit** on every table; verified on **live data**, not assumed.
- [ ] No orphaned created-but-unused id, no built-but-unwired poster / route, no unlinked sub-account.

**If any box is unchecked, the block is NOT done.**
