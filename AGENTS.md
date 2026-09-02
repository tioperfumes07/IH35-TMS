# IH35-TMS — Agent coordination (GO-20)

> **AUTOLOAD (2026-09-02 — only these are current law):**
> - `.cursor/rules/00-IH35-LAW.mdc` + `.cursor/rules/03-display-ids.mdc` — the **only** always-apply project rules
> - `claude/00-IH35-CURRENT-STATE-AND-LAW-READ-FIRST.md` — live state, traps, scope
> - `docs/lockdown/PROJECT-INSTRUCTIONS-2026-09-02.md` — owner law copy
> - **Queue:** [claude/GO-23-BUILD-SEQUENCE-STRICT-2026-09-02.md](claude/GO-23-BUILD-SEQUENCE-STRICT-2026-09-02.md) — **STRICT ORDER.** Waves in order; seats in a wave in parallel. Do not start a later wave while a row in your lane is open in an earlier one. A defect not on that board does not exist — never open a new register. `INBOX-<SEAT>.md` is the current row only; GO-23 decides the row. · bus index: `READ-AGENT-BUS.md`
> - **Cursor lead:** `docs/bus/INBOX-CURSOR.md` — coordinates seats; **does not** sweep `GUARD-WORKORDERS` / `Downloads/abb`
> - **Ship:** `node scripts/cursor-ship-preflight.mjs --body-file …` before push · PR title **`Cursor-`** prefix
> - **UI standard, LOCKED:** [docs/specs/GLOBAL-TYPE-SIZE-BASELINE.md](docs/specs/GLOBAL-TYPE-SIZE-BASELINE.md) (Claude + Jorge approved 2026-06-07) — body 12px - headers 11px/700/UPPERCASE/`#4B5563` - H1 22px/600 - page `#F7F8FA` - surface `#FFFFFF` - border 1px `#E5E7EB` - radius 4px - rail `#1B2333` - green `#16A34A` - **equal paired-field sizes** - **centered, sortable column headers**. Applies to ALL screens. No component may deviate without the owner's approval. **Open it before writing any size, colour, header or field width — never propose a new scale.** Guard: `scripts/verify-ui-design-system-ratchet.mjs`. **J1 closes at count zero this week (CC-2), not when the ratchet is green.**
> - **Model tiers:** mechanical=C, feature=B, money=A — [docs/specs/MODEL-TIER-POLICY.md](docs/specs/MODEL-TIER-POLICY.md)

> Merge on green + proof. No `JORGE-APPROVED`. **USMCA only.** Every USMCA row is REAL unless `is_sample_data=true`. Never POST Book Load. No seat financial fixtures. U14 closed — never recertify.

> **On-demand (not session queue):** DoD/evidence — [docs/specs/DEFINITION-OF-DONE.md](docs/specs/DEFINITION-OF-DONE.md) · PR checklist — [docs/specs/PER-PR-CHECKLIST.md](docs/specs/PER-PR-CHECKLIST.md) · architecture — [docs/specs/ARCHITECTURE-BLUEPRINT-2026-07-05.md](docs/specs/ARCHITECTURE-BLUEPRINT-2026-07-05.md)

---

<!-- HISTORY BELOW: pre-GO-20 autoload banner. Kept (never-delete). Do not treat as session queue. -->

<details>
<summary>Pre-2026-09-02 autoload block (superseded — expand only if needed)</summary>

**HONEST BUILT + LAUNCH (2026-08-14):** `docs/lockdown/HONEST-BUILT-LAUNCH-LAW-2026-08-14.md`

> **Model tiers (permanent):** [docs/specs/MODEL-TIER-POLICY.md](docs/specs/MODEL-TIER-POLICY.md)

> **★★★★ OWNER LAW (2026-08-03):** NO HOLDS. NO `JORGE-APPROVED`. Superseded by `00-IH35-LAW.mdc`.

> **★★ SESSION BOOT (SUPERSEDED):** STANDING-SESSION-DIRECTIVE · CREATE-TEST-THEN-VOID · URGENT 14 exclusive.

> **★★★ FULL SYSTEM AUDIT / AUDIT-COVERAGE / GUARD-WORKORDERS (SUPERSEDED as queue):** Use INBOX + GO-20.

> **★ Rule 25–37 ship law (on-demand):** `.cursor/rules/25-one-push-money-fail-fast.mdc` · `29-cursor-claude-parity-ship.mdc` · `36-claude-serial-ship-sequence.mdc` · `37-claim-merge-then-author.mdc` · `30-claude-green-evidence-format.mdc`

> **Rule #0 / Charter / Rule 16 / Architecture (on-demand):** QUALITY-STANDARD-LOCKED · CURSOR-OPERATING-CONSTITUTION · 16-fix-not-patch · ARCHITECTURE-BLUEPRINT

</details>

## Verify-step claims (TOOL-F03 — 2026-07-31)

Verify-step law (2026-08-04): **mod-4** Cursor EVEN · CC-1 ≡1 · CC-2 ≡3 + **claim-before-write** — reserve on `chore/claim-reserve*` + merge to main **before** authoring `NNNN-*.mjs` (Rule 37; `CLAIMED-REGEN` = registry tooling only) (Rule 25 bands file + step **2400**). Feature PRs must **not** edit `CLAIMED-NUMBERS.json` except allowlisted claim PRs. Do not renumber after collisions. Law: `docs/specs/VERIFY-STEP-MOD4-CLAIM-BEFORE-WRITE-LAW-2026-08-04.md`. Enforced by **1803** (lane-band) + **2400** (claimed-on-main) + **1906** (no feature CLAIMED edits).

## Dual lanes (SUPERSEDED 2026-09-02 — history only)

| Lane | Path | Role |
|------|------|------|
| A | `IH35-TMS` | Safety, Drivers, Lists, INFRA-1 |
| B | `IH35-TMS-agent2` | Dispatch, Maintenance, INFRA-2 |

## Never idle (SUPERSEDED — GO-20 queue is INBOX + GO-20)

Cursor rule: `.cursor/rules/dual-lane-never-idle.mdc` (`alwaysApply: false` since #19524)

**Continuous mode (Rule 32):** `.cursor/rules/32-continuous-mode-no-idle.mdc` (`alwaysApply: false`)

> **★ DELIVERY METHOD (reference):** [docs/specs/DELIVERY-METHOD-LOCKED.md](docs/specs/DELIVERY-METHOD-LOCKED.md)

**Primary queue (current):** `docs/bus/INBOX-<SEAT>.md` + `docs/lockdown/GO-20-EIGHT-FEATURES.txt`

**Retired queues (do not dispatch):** `docs/audit/GUARD-WORKORDERS.md` sweep rows · `/Users/jorgemunoz/Downloads/abb/`

**Done:** squash merge SHA on `origin/main`, branch deleted, CI green.

## Cursor rebase (no more hotfile conflicts)

**Always** sync with `node scripts/agent-sync-main.mjs` (not bare `git rebase origin/main`). It registers `merge=json-union` drivers first — CLAIMED-NUMBERS + `docs/module-completion/*.json` keyed by item id. Generated `module-completion.ts` is gitignored; frontend `typecheck`/`build`/`dev` regenerate it.

## If coordinator looks stale

Say: `agent is idle and stale` — or run `/loop 10m STATUS` from `docs/bus/INBOX-CURSOR.md` (GO-20 lead census). Do not dispatch from `Downloads/abb`.

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

## ★★ PERMANENT LAW — owner-locked 2026-08-05 (partially superseded by `00-IH35-LAW.mdc`)

**1. FINDINGS FLOW (queue superseded):** File cross-lane defects on the board when appropriate; **session queue** is INBOX + GO-20, not GUARD-WORKORDERS sweep. **The owner is NOT a message bus — ever, in any session.**

**2. LAW = ENFORCED GUARD, OR IT IS NOT LAW** (phased). Every NEW rule ships with a guard registered in
`docs/law/LAW.json`. `verify-law-registry.mjs` is a required check (<2s, existence-only) and fails the
build if a registered law's guard file is missing. Old rules migrate as a backlog class. Judgment rules
stay judgment.

**3. ROLES.** CC-1 = money / GL / WORM. CC-3 = mechanical / entity-scope / FE / CI-guards. CC-2 = GUARD,
**verify live, never build**. CASCADE = merger (direct merge API — auto-merge is broken on our rulesets,
community #190610).

**4. ENTITY + DATA LAW.** VOID = reversal; **nothing is deletable**. TRANSP / USMCA own **no assets
today**. ~~**ALL TMS-native data is TEST** — only the TRANSP QBO mirror is real.~~ **FALSE AS OF
2026-09-02 — do not act on the struck line above.** USMCA is live with real money: **every USMCA record
is REAL unless it carries `is_sample_data = true`**, and no seat writes test/sample/demo fixtures into
USMCA, including for proof. **RLS is NOT a backstop for
Owner sessions**: `org.user_accessible_company_ids()` returns EVERY active company when the role is Owner,
so **every unscoped read is load-bearing on its own predicate**.

**5. EVERY LOOP.** read board → **grep-verify the card against main** → build **ONE complete atomic block**
→ found another lane's defect? **write it to the board** → push → next. Never idle, never pause to
summarize, never half-edit.
