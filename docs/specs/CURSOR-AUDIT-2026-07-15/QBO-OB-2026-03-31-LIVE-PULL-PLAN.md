# QBO Opening Balances — Live Pull Plan (as_of 2026-03-31)

> **HOLD LANGUAGE SUPERSEDED — OWNER LAW 2026-08-03 / owner directive 2026-08-06.** There are NO holds and no approval gate. All owner questions are asked-and-answered. Coders build, apply on Neon, and MERGE ON GREEN with proof. Any "build-and-hold", "Jorge merges", "never self-merge" or "wait for approval" wording below is HISTORICAL RECORD ONLY and must not be followed.

**Status:** DESIGN / PREVIEW ONLY — build-and-ship.  
**This PR:** design/spec markdown only. **Does not** implement JE posting, flag flips, Neon writes, or QBO write-back.

> **Owner lock (Ch.11 fresh-start):** opening balances = QBO Balance Sheet / Trial Balance **as of 2026-03-31** per entity; TMS parallel live posting + daily TMS↔QBO reconcile from **2026-04-01**. Supersedes stale 06/30 / 07/01 draft dates. Canonical companions: `docs/specs/OPENING-BALANCE-IMPORT-AND-CUTOVER-2026-07-16.md`, `docs/lockdown/00_LOCKED_DECISIONS.md` §8.9, `docs/specs/qbo-parity/OPENING-BALANCE-TIEOUT-CEREMONY-2026-07-04.md`.

---

## 1. Locked parameters

| Parameter | Value |
|---|---|
| **as_of** | `2026-03-31` |
| **Parallel books / live TMS posting starts** | `2026-04-01` |
| **TRANSP QBO realm** | `123145885549599` (IH 35 Transportation LLC) — already connected |
| **TRK QBO realm** | `1432746210` — owner must confirm OAuth connection before TRK live pull |
| **USMCA** | ≈ 0 balances; TMS-authoritative; no QBO pull |
| **Accounting treatment for Ch.11 fresh-start line** | **ASC 470-60** (Troubled Debt Restructurings by Debtors) — **not ASC 852** (Reorganizations / fresh-start equity restatement). ASC 852 year-end / confirmation overlays remain separate CPA/counsel design items; they do **not** redefine this OB pull. |
| **Architecture** | Parallel TMS + QBO books; **no TMS→QBO write-back** (`QBO_JE_PUSH_ENABLED` / `QBO_ENTITY_PUSH_ENABLED` stay OFF; IMPORT-P0 / IMPORT-P0b) |
| **Hard dependency** | **[#2539](https://github.com/tioperfumes07/IH35-TMS/pull/2539)** — QBO dual-write collapse **Step-2** (`mdata.qbo_*` sync columns + repoint writers/readers off `accounting.qbo_*`). OB mapping must use **canonical `mdata.qbo_*`**, never RETIRE `accounting.qbo_*`. |

---

## 2. Why this plan exists

Today's OB importer is a **static 12/31/2024 historical clone preview** (`transp-2024-12-31-source.ts`). That anchor stays valid for the **historical QBO-clone tie-out** and must **not** be relabeled to 03/31/2026 (would falsify audit/court data).

The Ch.11 go-forward opening needs a **live** QBO Reports pull:

1. `qboReport("BalanceSheet" | "TrialBalance", …)` with report date **2026-03-31**
2. Snapshot (versioned, append-only, re-pullable while accountant cleanup is in flux)
3. Map QBO accounts → `catalogs.accounts` via **`mdata.qbo_accounts`** (post–Step-2 / #2539)
4. Assemble a **preview JE** (balanced, signed-actual) — owner/CPA notification
5. Owner posts + ties out; posting flags stay OFF until Neon/CPA ceremony

**Out of scope until owner greenlight:** any code that calls `createJournalEntry`, writes `accounting.journal_entries`, flips `*_GL_POSTING_ENABLED` / `OPENING_BALANCE_IMPORT_ENABLED` in prod, or pushes to QBO.

---

## 3. Repo paths — `rg` evidence (cite, do not reinvent)

Evidence captured on branch tip of `origin/main` (worktree `audit-fixes`, 2026-07-15).

### 3.1 Commands run

```bash
# Client + parsers
rg -n 'export async function qboReport|export function parseTrialBalance|export function parseGeneralLedger|export function chunkDateRangeMonthly|export function amountToCents' \
  apps/backend/src/integrations/qbo --glob '*.ts'

# Call sites of the Reports helper (note: definition uses generics, so this looks for qboReport()
rg -n 'qboReport\(' apps/backend --glob '*.ts'
# → no matches on origin/main — IMPORT-0 client exists; no production OB caller yet
```

### 3.2 Hits (line-anchored)

| Symbol | Path:line | Role |
|---|---|---|
| `qboReport` | `apps/backend/src/integrations/qbo/qbo-client.ts:237` | `export async function qboReport<T = QboReportResponse>(…)` — GET `{qboApiBase}/{realmId}/reports/{reportName}?…&minorversion=75` |
| URL / intent comments | `qbo-client.ts:179–181` | Generic `reportName` so TrialBalance / GeneralLedger today and JournalReport / ProfitAndLoss / **BalanceSheet** later need no client change |
| `amountToCents` | `apps/backend/src/integrations/qbo/qbo-report-parser.ts:37` | Exact-cents coercion (never `parseFloat`) |
| `parseTrialBalance` | `qbo-report-parser.ts:158` | Leaf accounts via ColData `id`; skips summary rows |
| `parseGeneralLedger` | `qbo-report-parser.ts:241` | GL parser (monthly chunking companion) |
| `chunkDateRangeMonthly` | `qbo-report-parser.ts:360` | ≤6-month chunk helper for report date ranges |
| Parser tests | `apps/backend/src/integrations/qbo/__tests__/qbo-report-parser.test.ts` | TB / nested / column-metadata fixtures |
| Write kill-switch | `apps/backend/src/integrations/qbo/qbo-write-disabled.ts` | Keep write path OFF for this workstream |

**Implication:** prefer **TrialBalance as of 2026-03-31** for the first live pull (`parseTrialBalance` ready). Add **BalanceSheet** pull + a `parseBalanceSheet` (not present yet) as a cross-check (Assets = Liabilities + Equity), not as the only source until that parser exists to the same exact-cents / ColTitle rules.

**Live pull shape (conceptual — not implemented here):**

```text
for realm in [TRANSP 123145885549599, TRK 1432746210]:
  tb = qboReport(ctx, "TrialBalance", {
        start_date: "2026-03-31",
        end_date: "2026-03-31",
        accounting_method: "Accrual",
      })
  bs = qboReport(ctx, "BalanceSheet", {
        date: "2026-03-31",
        accounting_method: "Accrual",
      })   # raw + future parser; cross-check only at first
  → parseTrialBalance(tb)
  → persist snapshot_version (design in OPENING-BALANCE-IMPORT-AND-CUTOVER)
  → preview JE only — zero rows to accounting.journal_entries
```

### 3.3 Existing opening-balance importer (historical preview — do not overwrite)

| Path | Role |
|---|---|
| `apps/backend/src/accounting/opening-balance-import/opening-balance-import.service.ts` | Preview-only JE assembly; **never** posts; flag `OPENING_BALANCE_IMPORT_ENABLED` |
| `apps/backend/src/accounting/opening-balance-import/opening-balance-import.routes.ts` | Preview API surface |
| `apps/backend/src/accounting/opening-balance-import/transp-2024-12-31-source.ts` | Static 12/31/2024 source lines — **historical clone only** |
| `apps/backend/src/accounting/opening-balance-import/__tests__/opening-balance-import.service.test.ts` | Preview unit tests |
| `db/migrations/202607140000_opening_balance_import_flag.sql` | Feature flag seed (default OFF) |
| `scripts/verify-opening-balance-source-ties-to-doc.mjs` | Guard: static source ties to transcribed doc |

**Preferred coexistence:** add a live source module / snapshot table **alongside** the 12/31/2024 historical source — never mutate historical cents to fake a 03/31 as_of.

### 3.4 Spec / ceremony companions

| Path | Role |
|---|---|
| `docs/specs/OPENING-BALANCE-IMPORT-AND-CUTOVER-2026-07-16.md` | Authoritative re-syncable OB + 04/01 cutover design |
| `docs/specs/qbo-parity/OPENING-BALANCE-TIEOUT-CEREMONY-2026-07-04.md` | Owner ceremony runbook (banner updated for 03/31 / 04/01) |
| `docs/specs/ACCOUNTING-ARCHITECTURE.md` | Parallel books; OBE → Retained Earnings clearing |
| `docs/lockdown/00_LOCKED_DECISIONS.md` §8 / §8.9 | Locked parallel-books + Ch.11 fresh-start dates |
| `docs/specs/CURSOR-AUDIT-2026-07-15/LIVE-RELAY-QBO-TRUTH-2026-07-16.md` | Live truth: OB importer still static; Step-2 unblocks live pull; ASC 470-60 callout |
| `docs/specs/QBO-CLONE-PROGRAM.md` | Notes reuse of IMPORT-0 `qboReport` |

### 3.5 Mapping dependency (#2539 Step-2)

After [#2539](https://github.com/tioperfumes07/IH35-TMS/pull/2539) merges and is GUARD-verified on prod:

- QBO account identity for OB lines resolves through **`mdata.qbo_accounts`** (`qbo_account_id` ↔ `catalogs.accounts`)
- Status/push routes repointed off `accounting.qbo_*` (RETIRE path)
- **Do not start live OB mapping against RETIRE tables**

---

## 4. ASC 470-60 (not ASC 852) — framing for this pull

- **ASC 470-60** governs troubled-debt / debtor restructuring presentation relevant to IH35's Ch.11 **operating fresh-start line** used for TMS OB as_of **2026-03-31** (also called out in `LIVE-RELAY-QBO-TRUTH-2026-07-16.md`).
- **ASC 852** (Reorganizations) fresh-start equity restatement / year-end overlays are **separate** CPA/counsel design tracks (tracker items naming `asc852`); they are **not** the accounting basis for inventing or rewriting this live QBO pull.
- Agents must **not** invent bankruptcy gain/loss JEs or ASC 852 equity resets as part of the OB live-pull pipeline. Accountant + counsel specify any plan-confirmation entries; software executes later under gated flags.

---

## 5. Owner ceremony steps (preview → post — owner-gated)

Nothing below is agent-executable for money. Sequence mirrors the locked cutover design + tie-out ceremony (`OPENING-BALANCE-TIEOUT-CEREMONY-2026-07-04.md` + cutover design).

1. **Merge & verify Step-2 (#2539)**  
   - `mdata.qbo_*` is canonical; GUARD confirms no new writes only to `accounting.qbo_*`.  
   - Mapping for OB lines uses `mdata.qbo_accounts` ↔ `catalogs.accounts`.

2. **Confirm realm connectivity**  
   - TRANSP `123145885549599` connected.  
   - TRK `1432746210` OAuth connected (owner action if not).

3. **Live pull (read-only)** as_of **2026-03-31**  
   - Trial Balance (primary) + Balance Sheet (cross-check) via existing `qboReport()`.  
   - Persist versioned snapshot (append-only); record `pulled_at`, realm, report basis (accrual, signed-actual).

4. **Map & preview JE**  
   - Map each leaf QBO line → TMS account via `mdata.qbo_*`.  
   - Surface **unmapped** lines — never guess.  
   - Assemble balanced **preview** JE dated **2026-03-31** (OBE plug / RE clearing per architecture).  
   - Historical 12/31/2024 preview remains untouched.

5. **Owner + CPA approve figures**  
   - Embezzlement cleanup may still move QBO numbers → **re-pull / new snapshot_version** allowed until owner locks.  
   - Unauthorized Expenses / other CPA-provisional lines: load as QBO presents unless CPA directs a separate reclass JE (not silent remap).

6. **Owner posts opening JE** (hand / approved path only)  
   - Agent never posts. Void-not-delete on corrections.  
   - Flags remain OFF until tie-out.

7. **Tie-out**  
   - TMS TB as_of 2026-03-31 == QBO snapshot leaf-level, signed, void-excluded.  
   - No dollar threshold on divergences.

8. **Per-entity parallel go-live from 2026-04-01**  
   - Only after that entity's OB is imported + tied.  
   - Flip internal `*_GL_POSTING_ENABLED` only via owner ceremony.  
   - **Leave OFF forever for this architecture:** `QBO_JE_PUSH_ENABLED`, `QBO_ENTITY_PUSH_ENABLED` (no TMS→QBO write-back).

9. **Daily reconcile post-04/01**  
   - Pre-04/01 drift vs QBO while cleanup continues = expected until lock.  
   - Post-04/01 divergences = real errors → page.

---

## 6. Explicit non-goals (this plan / next build slices)

| Non-goal | Why |
|---|---|
| JE posting implementation | Owner-entered; constitution §1.4 / CPA skill |
| Prod flag flips | Ceremony-gated after tie-out |
| TMS→QBO write-back | Parallel books lock |
| Relabeling `transp-2024-12-31-source.ts` to 03/31 | Falsifies historical clone |
| ASC 852 equity restatement automation | Separate CPA/counsel track — not this pull |
| Starting before #2539 Step-2 | Mapping would hit RETIRE / incomplete `mdata` sync |

---

## 7. Suggested next engineering slice (after this design PR + #2539)

1. Read-only live pull script/route: `qboReport` → snapshot JSON/table for TRANSP (then TRK).  
2. Preview JE builder parallel to `opening-balance-import.service.ts`, fed by live snapshot.  
3. Diff tool: snapshot_version N vs N−1.  
4. Hold all posting/flags until owner ceremony §5–§8.

---

## 8. Cross-refs (quick)

- Cutover design: `docs/specs/OPENING-BALANCE-IMPORT-AND-CUTOVER-2026-07-16.md`  
- Ceremony: `docs/specs/qbo-parity/OPENING-BALANCE-TIEOUT-CEREMONY-2026-07-04.md`  
- Locked dates: `docs/lockdown/00_LOCKED_DECISIONS.md` §8.9  
- Live audit note: `docs/specs/CURSOR-AUDIT-2026-07-15/LIVE-RELAY-QBO-TRUTH-2026-07-16.md`  
- Step-2 PR: https://github.com/tioperfumes07/IH35-TMS/pull/2539  
- CPA skill: `.claude/skills/ih35-accounting-decisions/SKILL.md` (agents never post OB solo)
