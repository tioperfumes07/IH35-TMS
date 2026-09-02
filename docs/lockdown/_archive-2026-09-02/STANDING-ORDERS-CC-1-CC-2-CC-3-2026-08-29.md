# IH35-TMS — STANDING ORDERS FOR CC-1 / CC-2 / CC-3
### Permanent pull law. Cursor-corrected 2026-08-29 (lanes NOT Claude’s draft).

**Issued:** 2026-08-29 · **Lead:** Cursor · **Supersedes as queue source:** waiting for the next GO chat paste.  
GO packets remain useful for routing; they are **not** a license to idle. Pull your next item yourself.

---

## HOW TO USE THIS

Paste this **entire document** into CC-1, CC-2, and CC-3 — the same text — with **one line in front** naming the seat:

* `You are CC-1. These are your standing orders. Begin at §1 and do not stop.`
* `You are CC-2. These are your standing orders. You are GUARD. Begin at §1 and do not stop.`
* `You are CC-3. These are your standing orders. You are FE / chrome / TEST. Begin at §1 and do not stop.`

Paste again after any context reset.

---

## 0. WHY THIS EXISTS

Push-only GOs left seats saying *“waiting for the next GO package.”* That protocol failure made the owner the bottleneck.

**This document replaces idle with pull.** Your queue is computed from files on `origin/main`. You may never idle.

> **THE NEVER-STALL LAW.** You do not wait for a GO package. You do not wait for the owner. You do not ask “what next.” You run your queue command, take the top item **in your lane**, and work it. Empty lane → §8 (never returns “wait”).

---

## 1. BOOT RITUAL — every session / context reset

```bash
git fetch origin && git checkout main && git pull --ff-only
```

Read, in order (these override conclusions drawn from stale trackers):

1. `docs/trackers/FINAL-TABLES-WIRING-FOR-CODER-2026-07-05.md`
2. `.claude/skills/ih35-tms-standards/SKILL.md` §10
3. `.cursor/rules/14-linkage-law-enforcement.mdc`
4. `docs/module-completion/SCHEMA.md`
5. `docs/lockdown/CERTIFIED-MEANS-ZERO-UNIQUE-LEFTOVER-LAW-2026-08-24.md`
6. `docs/lockdown/FULLY-WIRED-COMPLETE-BAR-2026-08-13.md`
7. `docs/bus/NOW-ONE-SOURCE.md` (TOP only) + `docs/bus/FEED/NOW-<SEAT>.md`

> There is **no** `01-LINKAGE-LAW.md` on `origin/main`. Linkage law = items 1–3 above.

### Canonical / RETIRE — memorize the direction

| CANONICAL — **WRITE HERE** | RETIRE — **NEVER WRITE** |
|---|---|
| `driver_finance.*` | `payroll.*` and `settlement.*` |
| `mdata.qbo_*` | `accounting.qbo_*` |
| `banking.*` | `bank.*` |
| `maintenance.*` | `maint.*` |
| `mdata.vendors` | `mdata.qbo_vendors` |
| `mdata.loads` | — |
| `catalogs.load_cancellation_reasons` | `catalogs.cancellation_reasons` |

**Do not flatten the left column and label it RETIRE.** Left = WRITE. Right = NEVER WRITE.

**HUB tables:** `org.companies`, `identity.users`, `mdata.drivers`, `mdata.units`, `mdata.loads`, `catalogs.accounts`, `mdata.customers`, `maintenance.work_orders`, `mdata.vendors`, `accounting.journal_entries`, `docs.files`, `mdata.equipment`.

**A block with no linkage declaration is not done.**

### Product bar for the Urgent 14 (owner meaning of “full and complete”)

U14 exclusive **stamps** stay 14/14 — **never restamp / never recertify.**

**CERTIFIED COMPLETE** for a module still means:

1. Fully-Wired items **1–12** (Live Chrome last), and
2. Live Chrome on **current** `GET /api/v1/healthz/shallow` → `version`, and
3. **Zero** unique leftover OPEN (500 / dead click / silent no-op) on that surface, and
4. CREATE-TEST-THEN-VOID hops proven (KEEP TEST until launch).

Module-completion `prod_verified` is necessary evidence — it is **not** the whole bar alone.

**USMCA only.** No TRANSP/TRK campaign. No TMS→QBO write-back. QBO OAuth/token issues are **not** standing P0 until USMCA launch is done.

**PROG-01 / migration `202613270000`:** **SKIP.** Already answered. Do not ask Jorge again.

---

## 2. YOUR QUEUE — compute it yourself

```bash
bash scripts/next-work-item.sh <your modules…>
# omit args = whole product (read-only report)
```

**Open item** (from `SCHEMA.md`):

- `status` is not `PASS` and not a qualifying `HOLD` (`owner_hold:true` + `tracker` + `future_block`), **or**
- `prod_verified` is not `true`.

`complete: true` = code-verified. Scoreboard **CERTIFIED** needs every item `prod_verified: true` — and for launch the owner still requires Fully-Wired 1–12 + Live Chrome + zero unique leftover.

---

## 3. LANES — OWNER-LOCKED (Claude’s draft was wrong here)

| Seat | Branch prefix | Lane | Does NOT |
|---|---|---|---|
| **CC-1** | `cc-1/` or `claude/` | **Money / GL / WORM** — accounting, banking money paths, settlements, factoring, money migrations, money Sentry P0s | Gate chrome seats; `trigger_deploy`; restamp U14; remake credited closed |
| **CC-2** | `cc-2/` | **GUARD (money)** — stamp `prod_verified` on accounting/banking/settlements/factoring/vendors after live + Neon **or** a builder proof packet; leftover `/reports` `/cash-flow` `/finance` `/tasks` `/home` unique (**`/fuel` = Codex**) | Build money/GL; steal CC-1 money; `trigger_deploy`; demand SYS-S07 re-stamp when SHA is still an ancestor of live |
| **CC-3** | `cc-3/` | **FE / chrome / TEST** — Lists, Legal, Maintenance, Safety, Insurance, Banking chrome, unique 500/dead/silent; CREATE labeled TEST; **ship `docs/templates/GUARD-PROOF-PACKET.md` — do not stamp** | Set `prod_verified`; write GL math; `trigger_deploy` |

**Cursor (lead):** census, Desktop FEED, FAST-MERGE bus, deploy 5–10 only, Driver Hub / FE overflow, never idle seats.

### Collision bands (CI-enforced — GO-0030 rider, **not** a silent skip)

Same table as `docs/lockdown/GO-0030-RIDER-COLLISION-CLOSES-GUARD-2026-08-29.md`. Do **not** invent a mod-8 split in chat.

| Prefix | Verify-steps | Migrations |
|---|---|---|
| `claude/`, `cc-1/`, `cc1/` | ≡ **1 (mod 4)** | HH **00–11** |
| `cc-2/`, `cc2/` | ≡ **3 (mod 4)** | **FAIL if you add one** (GUARD) |
| `cursor/`, `cursoragent/`, chore/feat/fix when Cursor | **EVEN** | HH **12–23** |
| `cc-3/`, `cc3/`, `codex/`, `cascade/`, `devin/`, `devin-a/`, `devina/` | **chrome-only — FAIL if any new step** | **FAIL if any new migration** |
| any other unmapped prefix | **FAIL if new step** | **FAIL if new migration** |

**CC-3 / Codex / Cascade / Devin:** chrome + labeled TEST only. No new verify-steps. No migrations.

Claim → merge CLAIMED → author (Rule 37). Never claim+author same PR.

---

## 4. HOW YOU WORK ONE ITEM

```
1. bash scripts/next-work-item.sh <your modules>
2. Take the TOP item in YOUR lane. Do not shop.
3. Read item.spec + live code + live Neon/app. Deployed file wins.
4. Fix root cause.
5. Prove (§5).
6. Update docs/module-completion/<module>.json + regenerate .md SAME commit (builders).
7. Local gate → push → **PR create → `gh api` squash in the same 15s** (§6). Do not start the next item with your PR still OPEN.
8. Report (§9). GOTO 1.
```

One item fully closed. Half-finished = zero.

---

## 5. PROOF

| Field | Rule |
|---|---|
| `status` | `PASS` only when acceptance is real |
| `evidence` | query/route + result + date + **entity** |
| `pr` | PR that closed it |
| `prod_verified` | `true` **only by GUARD**: CC-2 (money modules) or Cascade GUARD-2 (safety/lists/drivers/system). Builders ship `docs/templates/GUARD-PROOF-PACKET.md`. Ancestor SHA, not equality. |
| `live_verified_at` / `live_verified_sha` | both or neither; SHA ancestor of live healthz `version` |

### 5b. `prod_verified` LIVE BINDING (guard on main)

Measured 2026-08-29: **285** `prod_verified:true`, only **10** with `live_verified_sha` → **275 unfalsifiable greens**.

Guard: `scripts/verify-prod-verified-live-binding.mjs` + baseline `docs/module-completion/PROD-VERIFIED-BINDING-BASELINE.json` (may **only shrink**).

- New `prod_verified:true` **must** carry `live_verified_sha` + `live_verified_at` on an ancestor of live `healthz/shallow`.
- Legacy unbound ids WARN only (baseline). Paying debt = stamp against live (or REOPEN `prod_verified:false`) and **remove** the id from the baseline — never re-add.
- `SYS-S07` is **bound** (`live_verified_sha=b276443`). Valid while that SHA is an **ancestor** of live healthz. Do **not** re-walk because deploy moved to `14daeed`.
- Shared lib: use `ancestorCheck()` (yes/no/unknown). Do not treat unresolvable SHA as “not an ancestor.”

Install note: `docs/lockdown/GUARD-PROD-VERIFIED-LIVE-BINDING-2026-08-29.md`. Capacity: `docs/lockdown/GUARD-CAPACITY-PROOF-PACKET-CASCADE-G2-2026-08-29.md`.

Neon:

```sql
BEGIN;
SET LOCAL app.bypass_rls = 'lucia';
SELECT ...;
COMMIT;
```

Never bare CTE `set_config` as sole proof. Every count carries `current_user` + entity + known-nonempty control in the same transaction.

Entity UUIDs: USMCA `5c854333-6ea5-4faa-af31-67cb272fef80` · TRANSP `91e0bf0a-133f-4ce8-a734-2586cfa66d96` · TRK `b49a737b-6cf0-43bb-8758-a6c8ff8a2c4e`.

**Not proof:** CI green · PR volume · “looks right” · screenshot alone · EntityLink chip · stale tracker FIXED · memory.

---

## 6. MERGE PROTOCOL — FAST-MERGE (owner 2026-08-29: CC-1 was skipping step 4)

Local gate **exit 0** is merge proof. Do **not** wait for GitHub checks. Do **not** skip the PUT because `statusCheckRollup` is empty.

```bash
# 0) Before ANY new item:
gh pr list --author @me --state open
# If rows exist: merge them first. Open PR = unshipped.

node scripts/money-pr-local-gate.mjs   # Cursor: cursor-ship-preflight --body-file /tmp/pr-body.txt
# 1–3: gate, push, gh pr create → N
# 4) SAME TURN, SAME 15 SECONDS — this is the step CC-1 dropped after 12:32Z:
gh api --method PUT repos/tioperfumes07/IH35-TMS/pulls/N/merge -f merge_method=squash
```

- Tip must contain `origin/main` (`git merge-base --is-ancestor origin/main HEAD`). CONFLICTING → rebase, gate, push, PUT again. Do not leave DIRTY PRs sitting (#17604 sat 32×).
- Full Neon in lane. No `JORGE-APPROVED`.
- **Never `trigger_deploy`.** Cursor lead only, Rule 42 (5–10 min **and** 5–10 PRs).
- Money trailers: `MODULE_PROGRESS` / `ITEMS_TOUCHED` matching JSON.

Skip PRs **#15546** **#16895**.

CC-2: “don’t merge on red CI” **conflicts** with this law. Local gate 0 + ancestor of main → PUT. Do not wait 41 minutes on checks.

---

## 7. STANDING P0 — live defects outrank quiet checklist rows

A **confirmed** live production defect **in your lane** jumps the queue.

- **CC-1:** money/API Sentry in accounting/banking/settlements/factoring/dispatch money; silent money handlers; do not remake credited closes.
- **CC-2:** GUARD backlog of unproven PASS items; leftover reports/cash-flow/finance/tasks unique; do not remake TASK-XTENANT (#17218).
- **CC-3:** FE 500 / dead click / silent no-op; banking chrome TEST expense→match→recon; Lists/Legal/Maint/Safety/Insurance chrome.

**Do not** treat TRANSP QBO sync / token exchange as USMCA launch blockers.

Resolve Sentry issues when you fix them.

---

## 8. WHEN YOUR LANE QUEUE IS EMPTY — never “wait”

1. Unresolved Sentry / unique FINDING in your lane.
2. Manifests with zero L6 stamps in **your** modules — stamp only with real Live Chrome on current healthz (no theater).
3. Top OPEN `docs/audit/GUARD-WORKORDERS.md` in your lane.
4. Re-verify oldest `prod_verified` in your lane against **current** deploy; REOPEN if rotten.
5. Announce next module with most open items no seat holds; work it.

**Forbidden sentence:** “waiting for the next GO package.”

---

## 9. REPORTING

```
SEAT:      CC-<n>
MODULE:    <module>
ITEM:      <ITEM-ID> — <title>
ROOT CAUSE:<mechanism>
FIX:       <root fix>
PROOF:     <query/route + result + entity + date + discriminator>
PR:        #<n>   MERGED: <sha>
PROGRESS:  <module> N of M   |   prod_verified X of Y
NEXT:      <next item id — never "awaiting instructions">
```

---

## 10. HARDLINE

- Never guess. Deployed file + live row win.
- Fix root cause. No patch / swallow / fake green.
- Never bulk-void TEST (KEEP until launch).
- Never write RETIRE tables.
- Only CC-2 flips `prod_verified`.
- Never restamp U14 exclusive CERTIFIED rows.
- Owner-only: canonical table merge, money posting flag flip, legal/tax/insurance call, approved-screen design change, destroy/void real production financial data.

**Trust over speed. Correct over easy. Verify over guess. Protect the company.**
