**HONEST BUILT + LAUNCH (2026-08-14):** `docs/lockdown/HONEST-BUILT-LAUNCH-LAW-2026-08-14.md` — launch without Live Chrome = Fully-Wired 1–11 with leaf-specific Built only; seat lanes Cursor/CC-1/Codex; no `leafRe:.*` / `|.*` / word-blanket Built; no new scoreboard columns.

**USMCA ONLY UNTIL LAUNCH (2026-08-19):** `docs/lockdown/USMCA-ONLY-UNTIL-LAUNCH-LAW-2026-08-19.md` — only USMCA operating; no TRK/TRANSP work; QBO sync parked; 100% = Fully-Wired 1–12 on USMCA.

> **Model tiers (permanent):** [docs/specs/MODEL-TIER-POLICY.md](docs/specs/MODEL-TIER-POLICY.md) — Cursor mechanical=C, feature/scoreboard=B; money=A.

# IH35-TMS — Agent coordination

> **★★★★ OWNER LAW (2026-08-03, FINAL — reads above every other pointer in this file): NO HOLDS. NO
> `JORGE-APPROVED` LABEL.** Claude and all coders (Cursor / Cascade / Devin / Claude Coder) have **FULL Neon
> access and merge authority** — they merge on green in every lane, including financial/migrations, and
> apply migrations + flip posting flags themselves on Neon. The owner steers by **DECISION in chat**, never
> by a label or a merge click. Safeguard = **PROOF, not approval**. Canonical:
> `.cursor/rules/00-operating-method-LAW.mdc` (CI: `verify-no-approval-holds` / step 2218) (governance section) + `.windsurf/rules/00-operating-method-LAW.md`.
> Any older text below referencing `JORGE-APPROVED`, "Devin merges on green" as an exclusive role, "owner
> applies on Neon," or "STOP for owner approval" is **SUPERSEDED** by this line.

> **★★ SESSION BOOT:** [docs/specs/STANDING-SESSION-DIRECTIVE.md](docs/specs/STANDING-SESSION-DIRECTIVE.md) (§0–§10 · **§6 SEARCH BEFORE YOU ASK** · **§7 TEST WITH PLACEHOLDER NUMBERS** · **§10 FULLY WIRED**) +
> [docs/specs/OWNER-QUALITY-COMPACT.md](docs/specs/OWNER-QUALITY-COMPACT.md) (**ALL QUESTIONS HAVE BEEN ASKED AND ANSWERED** · Desktop `Claude.docx` permanized as `OWNER-QUALITY-COMPACT-Claude.docx`) +
> [docs/specs/DELIVERY-METHOD-LOCKED.md](docs/specs/DELIVERY-METHOD-LOCKED.md) +
> [docs/lockdown/FULLY-WIRED-COMPLETE-BAR-2026-08-13.md](docs/lockdown/FULLY-WIRED-COMPLETE-BAR-2026-08-13.md) — load every session.
> Presence ratchet: `verify-standing-directive-present` (step **2374**) · `verify-owner-quality-compact-present` (step **2380**) · `verify-cursor-pr-title-prefix` (step **2377** — every Cursor PR title **MUST** begin with `Cursor-`).

> **★★★ FULL SYSTEM AUDIT LAW (owner 2026-08-03 v3 — MANDATORY):** [docs/audit/IH35-FULL-SYSTEM-AUDIT-SPEC.md](docs/audit/IH35-FULL-SYSTEM-AUDIT-SPEC.md) — **"Complete" is NOT five layers.** Complete = **DoD A–E + VERIFY 1–8** PROD-VERIFIED per entity (live V2 picker+creator · V3 wiring · V4 deep linkage F+R). Cascade Always-On: `.windsurf/rules/ih35-deep-linkage-audit.md`. Cursor: Rule **31** (`.cursor/rules/31-full-system-audit-mandatory.mdc`). Ledger: [AUDIT-COVERAGE-LIVE.md](docs/audit/AUDIT-COVERAGE-LIVE.md) · run-log: [AUDIT-RUN-LOG.md](docs/audit/AUDIT-RUN-LOG.md). A code trace / count / CI-green is NOT proof. A guess is a defect.

> **★★★ BEFORE ANY BLOCK — READ [docs/audit/AUDIT-COVERAGE-LIVE.md](docs/audit/AUDIT-COVERAGE-LIVE.md).**
> It is the single source of truth for what is actually broken. **Your work list = its rows where
> `Verdict = FAIL` and `Status = OPEN` in your lane.** Do not invent a work list, do not work from a stale
> tracker, and do not re-audit what already has a row. `git pull --ff-only origin main` before you write to it.
> **Column ownership is strict — never edit another role's column:** CASCADE owns Module/Layer/Entity/Verdict/
> Evidence/Date/Auditor (appends new rows only) · CODER/CURSOR own Status + Block/PR on rows in their own lane
> (only `FIXED (PR #)`) · **only GUARD writes `VERIFIED`**. Append-only: never delete a row; supersede by adding
> a new dated row and marking the old one `SUPERSEDED`. A row with no `Evidence` is not a finding.
> Rows marked `Owner-gate? = YES` need an owner DECISION — a coder never self-answers one.
> **`Module` must be a `SIDEBAR_ITEM_IDS` id** (optional ` · subtag`). **Scoreboard is generated** — after row edits run
> `node scripts/audit-coverage-scoreboard.mjs --write`. Progress query: `node scripts/audit-coverage-scoreboard.mjs`
> (CI: verify-step **2014** fails if Scoreboard ≠ Findings).

> **★★★ THEN READ [docs/audit/GUARD-WORKORDERS.md](docs/audit/GUARD-WORKORDERS.md)** — the GUARD fix board: your lane's OPEN items, the fix
> requirement + standard for each, and GUARD status. Pull the top OPEN item in your lane; do not idle.

> **★★★ FINDINGS TRIPLE-LOCK (owner 2026-08-11 — PERMANENT):** [docs/audit/FINDINGS-TRIPLE-LOCK-LAW.md](docs/audit/FINDINGS-TRIPLE-LOCK-LAW.md) —
> every finding = board OPEN + register ☐ + Desktop routing row + OUTBOX same turn; FIXED = five proofs same
> turn as merge. **Chat-only or "already fixed" without main grep = unfixed.** Never skip cross-lane without filing.

> **Consolidated index:** docs/specs/LAW-OF-THE-LAND-COMPLETE-2026-07-25.md — the complete 24-rule + 18-key-gate map (source .cursor/rule wins on conflict).

> **★ DEFINITION OF DONE (owner-agreed, BINDING — read before you call anything done):** [docs/specs/DEFINITION-OF-DONE.md](docs/specs/DEFINITION-OF-DONE.md) — five DONE layers (DOD-A…E) + evidence. **CI-green is the floor, not the verdict.**
>
> **★ EVERY PR AUDIT CHECKLIST (Claude-consolidated, BINDING, every session):** [docs/specs/EVERY-PR-AUDIT-CHECKLIST.md](docs/specs/EVERY-PR-AUDIT-CHECKLIST.md) — FINDING · LANE · DOD-A…E · **VERIFY-1…8** · **MODULE_PROGRESS** · MIGRATE · Rule 16. Money commits missing these keys **FAIL** commit-msg + verify-step **1430** (`verify-no-money-theater`). Rule **23** bans EntityLink/honesty theater. Rule **24** — module DONE = **N of M** checklist items in [docs/module-completion/](docs/module-completion/) (CI **1431**). Also enforced by verify-step **1324**.
>
> **★ Rule 25 — ONE PUSH / FAIL-FAST (permanent):** [`.cursor/rules/25-one-push-money-fail-fast.mdc`](.cursor/rules/25-one-push-money-fail-fast.mdc) — `scripts/money-pr-local-gate.mjs` is the **first** husky `branch:precheck-push` step (DoD + money-theater in seconds). Amend no longer skips checks on empty staged. **One push** after local PASS; never rebase/force-push while `build-typecheck` is running. CI: verify-step **1702** (`verify-money-pr-local-gate`).
>
> **★ Rule 29 — CURSOR = CLAUDE SHIP PARITY (permanent):** [`.cursor/rules/29-cursor-claude-parity-ship.mdc`](.cursor/rules/29-cursor-claude-parity-ship.mdc) — before **every** push run `node scripts/money-pr-local-gate.mjs` (DoD + theater + migration HH band + EVEN verify-step + no CLAIMED-NUMBERS edit + EntityLink adoption). **Never** `git commit --no-verify` / `git push --no-verify`. One labelled commit; PR body is not enough. CI: verify-step **1998** (`verify-cursor-claude-parity-ship`).
>
> **★ Rule 36 — CLAUDE SERIAL SHIP SEQUENCE (permanent — owner 2026-08-05):** [`.cursor/rules/36-claude-serial-ship-sequence.mdc`](.cursor/rules/36-claude-serial-ship-sequence.mdc) — Cursor ships like Claude: tip `origin/main` + one FINDING commit + Claude title/body + max **1** open CLAIMED/verify-step PR + `cursor-ship-preflight` fails if behind main. Mirror: [docs/specs/CLAUDE-SERIAL-SHIP-RULE-36.md](docs/specs/CLAUDE-SERIAL-SHIP-RULE-36.md). Delivery §9.2.1 rev G.
>
> **★ Rule 37 — CLAIM → MERGE → AUTHOR (permanent — owner 2026-08-05):** [`.cursor/rules/37-claim-merge-then-author.mdc`](.cursor/rules/37-claim-merge-then-author.mdc) — never author `verify-steps/NNNN-*.mjs` until `NNNN` is on `origin/main`; never claim+guard same PR; `money-pr-local-gate` runs `verify-verify-step-claimed-on-main`. Law: `docs/specs/VERIFY-STEP-MOD4-CLAIM-BEFORE-WRITE-LAW-2026-08-04.md`.

> **★ Rule 30 — CLAUDE-GREEN EVIDENCE FORMAT (permanent):** [`.cursor/rules/30-claude-green-evidence-format.mdc`](.cursor/rules/30-claude-green-evidence-format.mdc) — FINDING-first body/commit (template [docs/templates/CLAUDE-GREEN-PR-BODY.md](docs/templates/CLAUDE-GREEN-PR-BODY.md)); `LIVE PROOF: … exit 0` (not `UNVERIFIED browser`); one commit on `origin/main` (never stack / never soft-reset); run `node scripts/cursor-pr-body-gate.mjs --body-file …` before `gh pr create|edit`. Gate suite + CI verify-step **2088**.
> **★★ PER-PR CHECKLIST (read FIRST, every PR):** [docs/specs/PER-PR-CHECKLIST.md](docs/specs/PER-PR-CHECKLIST.md) — the single consolidated list of everything audited and fixed in **every** PR: the 5 DONE layers, the 8 audit layers (QBO chrome · universal picker law · connectivity/wiring · deep forward+reverse linkage chains · catalogs/entity scope · CPA-grade economics · tab/design law · security/RLS), the required evidence block, the guard rules, the verification traps, the merge gates, and the migration rules. Consolidated because **scattered law is skipped law**. Enforced by `.github/workflows/pr-evidence-block.yml` (PR body) + `scripts/verify-definition-of-done-evidence.mjs` (commits) + always-apply `.cursor/rules/23-per-pr-checklist.mdc`.

> **Rule #0 (LOCKED):** Before any work, read [docs/specs/QUALITY-STANDARD-LOCKED.md](docs/specs/QUALITY-STANDARD-LOCKED.md) — the first standing quality law; it supersedes other docs on hardline conflict.

> **Cursor permanent charter:** [docs/specs/CURSOR-OPERATING-CONSTITUTION.md](docs/specs/CURSOR-OPERATING-CONSTITUTION.md) — applies to every Cursor session/agent; when instructions conflict, the more conservative / more protective reading wins. Enforced by always-apply `.cursor/rules/00`–`07` + `10`–`18`.

> **Rule 16 (owner law):** [`.cursor/rules/16-fix-not-patch-evidence-law.mdc`](.cursor/rules/16-fix-not-patch-evidence-law.mdc) — fix root cause, never patch, never defer without written tracker entry, evidence before done. Skill: `.claude/skills/ih35-evidence-before-done`. Template: `docs/templates/ACCEPTANCE-EVIDENCE-BLOCK.md`. Session hook: `.cursor/hooks/session-evidence-law.sh`.

> **★ CONSOLIDATED ARCHITECTURE GUARDRAIL (read this too):** [docs/specs/ARCHITECTURE-BLUEPRINT-2026-07-05.md](docs/specs/ARCHITECTURE-BLUEPRINT-2026-07-05.md) is the current consolidated guardrail — the **Law of the Land** total-connectivity rule, the driver **Bill + BillPayment** settlement model, the **Faro** exact factoring terms, the auto-provisioned **driver accounts**, the **posting flags**, and the **per-build-block linkage checklist**. **Every build block (especially financial) conforms to it.** See the checklist reproduced at the bottom of this file.

## Verify-step claims (TOOL-F03 — 2026-07-31)

Verify-step law (2026-08-04): **mod-4** Cursor EVEN · CC-1 ≡1 · CC-2 ≡3 + **claim-before-write** — reserve on `chore/claim-reserve*` + merge to main **before** authoring `NNNN-*.mjs` (Rule 37; `CLAIMED-REGEN` = registry tooling only) (Rule 25 bands file + step **2400**). Feature PRs must **not** edit `CLAIMED-NUMBERS.json` except allowlisted claim PRs. Do not renumber after collisions. Law: `docs/specs/VERIFY-STEP-MOD4-CLAIM-BEFORE-WRITE-LAW-2026-08-04.md`. Enforced by **1803** (lane-band) + **2400** (claimed-on-main) + **1906** (no feature CLAIMED edits).

## Dual lanes (always parallel when queue has work)

| Lane | Path | Role |
|------|------|------|
| A | `IH35-TMS` | Safety, Drivers, Lists, INFRA-1 |
| B | `IH35-TMS-agent2` | Dispatch, Maintenance, INFRA-2 |

## Never idle

Cursor rule: `.cursor/rules/dual-lane-never-idle.mdc` (`alwaysApply: true`)

**Continuous mode (Rule 32):** `.cursor/rules/32-continuous-mode-no-idle.mdc` (`alwaysApply: true`) — never pause/idle after merge/PR/Neon/CI; always keep writing the next ranked FAIL.

> **★ DELIVERY METHOD (LOCKED 2026-08-04):** [docs/specs/DELIVERY-METHOD-LOCKED.md](docs/specs/DELIVERY-METHOD-LOCKED.md) — vertical money skeleton → certify modules under WIP≤3. Do not invent a fourth method. Do not restart the block pile as primary queue.

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

---

## ★★ PERMANENT LAW — owner-locked 2026-08-05 (supreme; applies to every agent, every session)

**1. FINDINGS FLOW AGENT → BOARD → AGENT, NEVER THROUGH THE OWNER.** Find a defect in another lane →
**WRITE an OPEN row into `docs/audit/GUARD-WORKORDERS.md` yourself and commit it**; the target coder pulls
it on their next loop. **The owner is NOT a message bus — ever, in any session.**

**2. LAW = ENFORCED GUARD, OR IT IS NOT LAW** (phased). Every NEW rule ships with a guard registered in
`docs/law/LAW.json`. `verify-law-registry.mjs` is a required check (<2s, existence-only) and fails the
build if a registered law's guard file is missing. Old rules migrate as a backlog class. Judgment rules
stay judgment.

**3. ROLES.** CC-1 = money / GL / WORM. CC-3 = mechanical / entity-scope / FE / CI-guards. CC-2 = GUARD,
**verify live, never build**. CASCADE = merger (direct merge API — auto-merge is broken on our rulesets,
community #190610).

**4. ENTITY + DATA LAW.** VOID = reversal; **nothing is deletable**. TRANSP / USMCA own **no assets
today**. **ALL TMS-native data is TEST** — only the TRANSP QBO mirror is real. **RLS is NOT a backstop for
Owner sessions**: `org.user_accessible_company_ids()` returns EVERY active company when the role is Owner,
so **every unscoped read is load-bearing on its own predicate**.

**5. EVERY LOOP.** read board → **grep-verify the card against main** → build **ONE complete atomic block**
→ found another lane's defect? **write it to the board** → push → next. Never idle, never pause to
summarize, never half-edit.
