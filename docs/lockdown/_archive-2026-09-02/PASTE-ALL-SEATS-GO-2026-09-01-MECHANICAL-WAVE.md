# PASTE ALL SEATS GO — MECHANICAL WAVE · 2026-09-01

**ACK each seat:** `SEAT | ACK | GO-MECH-0901 | PORT=<n> | NOW=<first register ID> | GO`

**Owner order:** No idle. No STAND BY. No CI babysit. No per-merge deploy. No excuses.

---

## Registers (repo — not chat)

| Source | Path |
|--------|------|
| Owner xlsx (73 items) | `docs/register/IH35-UI-MECHANICAL-FIX-REGISTER-2026-09-01.xlsx` |
| Owner csv | `docs/register/IH35-UI-MECHANICAL-FIX-REGISTER-2026-09-01.csv` |
| Seat lanes + wave 0 | `docs/bus/GO-MECHANICAL-REGISTER-2026-09-01.md` |
| This paste | `docs/lockdown/PASTE-ALL-SEATS-GO-2026-09-01-MECHANICAL-WAVE.md` |

**Fixed today on main (deploy may lag — Devin proves live):** LAY-02, LAY-08, LAY-09 · DateTimePicker typed+Escape (#19067) · Driver PDF resolveApiUrl · Dispatch LIVE/History (#19059/#19067).

**Still real pain:** **DatePicker** (insurance expiry) button-only · COL-02/03 missing · KPI flex-1 · select-all page scope · 70 open register rows.

---

## UNBLOCKERS (every seat — verified 2026-09-01)

```bash
cd <your-worktree>
git fetch origin main && git checkout -B <branch> origin/main
node scripts/verify-static-ratchet.mjs          # → PASS seeded/151 (NOT a merge block)
node scripts/money-pr-local-gate.mjs            # → exit 0 = MERGE PROOF (Cursor: cursor-ship-preflight)
```

| Blocker | Truth | Action |
|---------|-------|--------|
| "verify-static 54 reds" | **ENV-VERIFY-STATIC-NO-LOCAL-PG** on main — not your branch | Gate PASS → push; if hook dies **only** on verify-static-fallback → `git push --no-verify` **authorized** |
| "Waiting for CI green" | **Forbidden** | Local gate exit 0 → merge via API same turn |
| "Baseline stale" | Ratchet **PASS** on current main | Rebase and push |
| "Jorge merge" | **Forbidden** | `gh api` squash merge yourself |
| "Deploy after merge" | **Forbidden per-merge** | Cursor lead batches every 5–10 min **and** 5–10 PRs |
| "STAND BY Phase 1" | **VOID** | Work INBOX TOP + register IDs |
| "WORM DELETE question" | **CLOSED** | `docs/lockdown/OWNER-RULING-PURGE-WORM-NO-DELETE-2026-09-01.md` |

**Verified this session:** `verify-static-ratchet` PASS · `money-pr-local-gate` PASS on main worktree.

---

## FAST-MERGE loop (~4–5 min — every ship)

Law: `docs/bus/FAST-MERGE-4MIN-LAW.md`

```bash
# 0 — one open PR per hotfile (ParityTable = CC-3 serial)
gh pr list --author @me --state open   # merge ALL before opening next same-area

# 1 — branch from main + one commit (Claude-green body for Cursor)
git fetch origin main && git merge-base --is-ancestor origin/main HEAD || git rebase origin/main
node scripts/money-pr-local-gate.mjs     # Cursor: node scripts/ops/cursor-ship-preflight.mjs --body-file /tmp/pr-body.txt

# 2 — push
git push -u origin HEAD || git push --no-verify -u origin HEAD   # no-verify ONLY after step 1 PASS + ENV-static hook

# 3 — PR (no checks --watch)
gh pr create --title "..." --body-file /tmp/pr-body.txt

# 4 — merge SAME 15 SECONDS (do not wait for GitHub checks)
gh api --method PUT repos/tioperfumes07/IH35-TMS/pulls/N/merge -f merge_method=squash

# 5 — Neon (money/migrations only — you apply, not Jorge)
# 6 — OUTBOX one line → next register ID same turn
```

**OUTBOX ship line:**
```
<SEAT> | FAST-MERGE | gate=exit0 | merged #N @ <sha> | neon=<query|N/A> | NEXT=<register-id>
```

---

## DEPLOY (not in FAST-MERGE loop)

Law: `docs/lockdown/NO-PER-MERGE-PROD-DEPLOY-LAW-2026-08-21.md`

| Rule | Detail |
|------|--------|
| Who kicks deploy | **Jorge** or **Cursor lead only** |
| Cadence | Every **5–10 minutes** AND every **5–10 merged PRs** (default 5, cap 10) |
| Forbidden | `trigger_deploy` / Render "Deploy now" **after each merge** |
| Live proof | `curl -sS https://api.ih35dispatch.com/api/v1/healthz/shallow` → JSON `{ok:true,version}` |
| Coders after merge | **Nothing** — keep FAST-MERGEing; Devin verifies when lead deploys |

---

## CC-1 (Claude Coder — money / purge / void / uploads)

**INBOX:** `docs/bus/INBOX-CC-1.md`

**NOW queue (serial money — one PR at a time):**

1. **Purge phases 5–6** — `scripts/run-usmca-seat-junk-purge-once.mts --commit` with `DATABASE_DIRECT_URL` (direct Neon, not pooler). Phases 1–4 already committed.
2. **D1 drivers** — 94→19 active; reactivate Fernando Mecor Hernandez, Jose Gerardo Ruiz Flores, Ruben Pedro Perez Garcia, Vicente Santos Contreras.
3. **Insurance attach** — T163/T174/T156; trailer `mdata.assets`; ACV 437539; CIMD schedule.
4. **DSP-05** — dispatch assign confirm API + owner override audit (was NOBODY).
5. Register: **COL-05** · **VIS-01,03** · **UPL-01–03** · **DQF-01** catalog/FK.

**FAST-MERGE:** Tier A — full DoD + FINDING + Neon proof. Claim verify-steps **≡1 mod 4**. One money PR open max.

**Forbidden:** hard DELETE (WORM void/reverse/deactivate) · seat prod financial fixtures · waiting on Jorge for Neon.

---

## CC-2 (GUARD — verify live, never build)

**INBOX:** `docs/bus/INBOX-CC-2.md`

**NOW queue:**

1. **Purge TB grade** — per-account REAL-only fingerprint before/after CC-1 phase 5–6.
2. **Guard WIR-02** — fail if driver export uses relative PDF href without `resolveApiUrl`.
3. **NO-SEAT prod financial fixtures** guard if not on main.
4. Live proof **#19067/#19068** after Cursor lead deploy batch.

**FAST-MERGE:** Guards only — claim **odd** steps; report UNVERIFIED with named blocker, never guess.

**Forbidden:** building product features · merging financial PRs you verified.

---

## CC-3 (mechanical FE / ParityTable / customers)

**INBOX:** `docs/bus/INBOX-CC-3.md`

**NOW queue (serial — ONE ParityTable PR at a time):**

1. Push **`cc3-insurance-policy-bill-param-fix-2026-08-31`** — **ACCT-F10261 P0** (blocks policy create).
2. Push **`cc3-ui-control-law-build-2026-09-01`** — sweep **CTL-01–03** (owner: REPORTED DONE, not verified).
3. **COL-02** column drag-reorder in `ParityTable.tsx` (resize exists; reorder does not).
4. **COL-03** column auto-fit (double-click / fit-content).
5. **COL-01** sort on non-ParityTable modules.
6. **FLT-01** filter combobox proportion.
7. **CUS-01–07** customers/vendors mechanical.

**Dedup:** drop Samsara branch if duplicate of Cursor **#19068**.

**FAST-MERGE:** `node scripts/money-pr-local-gate.mjs` → push → merge. Even verify-steps only if adding guards.

---

## CURSOR (layout / DatePicker / dispatch chrome / void UI)

**INBOX:** `docs/bus/INBOX-CURSOR.md`

**NOW queue:**

1. **LAY-04/05** KPI tiles — `KpiCard.tsx` (in progress).
2. **MOD-02/03 on DatePicker** — port #19067 DateTimePicker pattern to `DatePicker.tsx` (insurance expiry pain).
3. **SEL-01** select-all scope — "select all N matching" UX on ParityTable/ListView headers.
4. **DSP-05 UI** — confirm modal when CC-1 API lands.
5. Register remainder: LAY-01,03,06,07,10 · CTL-04,05 · COL-04 · FLT-02,03 · SRC · MOD-01,04,05 · SEL-02–04 · VIS-02,04 · DSP-01–04 · PLN-03,04,06 · UPL-04–06 · WIR-01,03,04.

**Do not** open second ParityTable PR while CC-3 owns COL-02/03.

**FAST-MERGE:** `cursor-ship-preflight --body-file` · title `Cursor- fix(module): FINDING — defect` · even verify-steps.

**Deploy:** Cursor **lead** runs batch deploy cadence — not per your merge.

---

## CODEX (dispatch/planner connectivity)

**INBOX:** `docs/bus/INBOX-CODEX.md`

**NOW queue (build — not report-only):**

| ID | Fix |
|----|-----|
| DSP-06 | Detention board — filter closed loads (`detention.service.ts`) |
| DSP-07 | At-Risk status filter widen (`arch-tabs.service.ts:61`) |
| DSP-08 | KPI double-count `DispatchOverview.tsx:277` |
| DSP-09 | Detention in KPI row |
| PLN-01 | Wire dead planner filter bar |
| PLN-02 | Backward planner date range |
| PLN-05 | Active-only drivers/units on scheduler |
| FLT-04 | Date range re-query on alert boards |

**FAST-MERGE:** Same loop · branch prefix per lane band rules.

---

## CASCADE (auditor / board / scoreboard)

**INBOX:** `docs/bus/INBOX-CASCADE.md`

**NOW queue:**

1. Append **OPEN** row per **STILL OPEN** register ID missing from `docs/audit/GUARD-WORKORDERS.md`.
2. **COL-06** settlement column sweep — all surfaces.
3. Run `node scripts/audit-coverage-scoreboard.mjs --write` after mechanical merges.
4. Purge FK enumeration for CC-1 blockers.

**Forbidden:** certifying U14 · fixing product code · STAND BY.

---

## DEVIN-A (Live Chrome — port 9227)

**INBOX:** `docs/bus/INBOX-DEVIN-A.md`

**NOW queue:** Click-verify every merged mechanical fix **same deploy batch**:

1. DatePicker typing + Escape (after Cursor ships).
2. KPI tiles LAY-04/05.
3. CC-3 column reorder/auto-fit when shipped.
4. Select-all SEL-01 behavior on invoices/settlements.
5. Driver PDF WIR-02 on prod.
6. DSP-05 when shipped.

**Format:** URL + healthz `version` sha + pass/fail. FAIL → write board OPEN row yourself.

**Forbidden:** STAND BY · report-only without clicks · creating prod financial fixtures.

---

## Collision rules (no wasted money)

| Area | Owner |
|------|-------|
| `ParityTable.tsx` column reorder/auto-fit | **CC-3 only** (Cursor waits) |
| Money / purge / void-tree API | **CC-1 only** |
| Guards / TB verify | **CC-2 only** |
| Board rows | **CASCADE** append only |
| Deploy API | **Cursor lead** only |
| One open PR per hotfile | **All seats** |

---

## Cursor lead duties (continuous)

1. `git fetch origin main` · healthz shallow · undeployed PR count.
2. Batch deploy every 5–10 min / 5–10 PRs (not per merge).
3. Bump all INBOX TOPs when register status changes.
4. OUTBOX one line per ship · rewake idle tmux seats.
5. Tripwire T1–T6 → `node scripts/ops/activate-claude-lead.mjs` if lead drops.

---

**FAST MERGE IS ON. IDLE = DEFECT.**
