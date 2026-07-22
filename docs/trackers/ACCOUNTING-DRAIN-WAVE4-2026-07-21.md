> **STALE — NOT EVIDENCE OF PROGRESS (banner added 2026-07-22).**
> `CLAUDE-CODER-MERGE-SEQUENCE-2026-07-21.md` listed this PR under **NEVER merge (close as
> theater)** — it restates STALE tables and contains no wiring. It was merged anyway by the
> Claude Code verifier lane in a green-CI sweep that did not read that file first. See the
> **RECONCILIATION — 2026-07-22** section there for the full accounting.
> Living scoreboard is `TRUE-CONNECTIVITY-MASTER` + the FAIL-honest E2E audits, not this file.

# ACCOUNTING DRAIN — WAVE 4 verify (2026-07-21)

**Base:** `origin/main` @ `cbd52a1bd`  
**Worktree:** `/private/tmp/ih35-acct-drain-w4-verify-*`  
**Scope:** next 12 residual ACCOUNTING pending items **not** claimed by open PRs  
`#3132/#3138/#3140/#3143–#3147/#3151–#3153/#3129/#3127/#3128/#3133/#3116/#3120/#3149`  
(+ hard bans `#3123/#3124/#3141/#3149` and already-open accounting PRs in `#3116–#3153`).

After Waves 1–3 (~30 GAP dispositions), the remaining unclaimed accounting pending set is the
**17 NEEDS-OWNER + 3 NEEDS-PROD** rows. This wave dispositions **12** of them.

Owner rulings locked for this drain: reserve/holdback accounts owner-manual forever;  
`accounting.chart_of_accounts_roles` is PRIMARY; no inventing GL accounts; financial = HOLD;  
Rule 17 for new guards; no package.json / CI workflow edits.

| # | block_id | verdict | evidence (repo @ cbd52a1bd + Neon doc #3117) | follow-up PR |
|---|---|---|---|---|
| 1 | `CHAIN-04-bill-payment-tieout` | **REAL FIX + residual HOLD** | Static guard `verify-bill-payment-posting-uses-resolver.mjs` + advisory tie-out `verify-chain-04-bill-payment-bank-tieout.mjs` exist but were **package.json-only orphans** (no verify-step). Poster/flag/`ledger_account_id` bank leg already on main. **Part 2b** accept-bill write path still DESIGN HOLD (`CHAIN-04-BANK-TIEOUT-PROOF.md`). | fix PR (this wave) wires steps **1212/1213** |
| 2 | `CHAIN-06-invoice-ar-chain-proof` | **COVERED + residual HOLD** | Code fix + verify-steps **920–922** already on main (`CHAIN-06-STATUS-2026-07-21.md`). `FACTORING_GL_POSTING_ENABLED` still owner-gated; live customer-pay→AR money proof = owner/GUARD. | none (do not re-wire) |
| 3 | `0007-pattern-5-split-brain-engines` | **HOLD** | Neon `#3117`: parallel escrow schema in `accounting.*` + `driver_finance.*` confirmed; **zero data rows** either side. Designate canonical escrow store **before** first live posting. | companion design HOLD |
| 4 | `0243-flag-live-all-9-gl-flags-on_DONE` | **STALE** | Neon `#3117` verdict **BUILT-LIVE** — all 9 GL posting flags ON for TRANSP/TRK/USMCA. Pile `NEEDS-PROD` is obsolete. | tracker decrement |
| 5 | `usmca-banking-ingestion-dedup` | **STALE + SKIP (misfile)** | Neon `#3117` **BUILT-LIVE** (ingestion live, zero dup collisions). Accounting-pile misfile — banking surface. | refile → banking; tracker decrement |
| 6 | `AF-1-entity-coa-fix` | **HOLD (ACTION-ONLY)** | Held migration `202606272100_af1_catalogs_accounts_per_entity.sql` in `.held-migrations.json`. Owner Neon-apply + ledger-backfill only — builder does not apply. | owner Neon ceremony |
| 7 | `AF-4-ap-bills-migration` | **HOLD** | Owner ruling ANSWERED (import ~$1.18M A/P **after** STMT-2 opening balances). Financial-cluster import path — not a UI/guard-only fix. | after STMT-2 + owner OK |
| 8 | `0091-d1-2` | **HOLD** | Ruling: `mdata.vendors` canonical; `mdata.qbo_vendors` = mirror. Both tables still live-written. Repoint WO/expense/CC pickers = financial/catalogs linkage — no invent. | vendor-resolver financial PR (owner-gated) |
| 9 | `0473-1-1-default-revenue-account-unmapped-line` | **COVERED (fail-loud) + HOLD (policy)** | Invoice poster already hard-fails `INVOICE_LINE_REVENUE_UNRESOLVED` / `invoice_line_revenue_account_mapping_missing` — **no catch-all invent**. CoA roles PRIMARY. Residual owner Q only if catch-all is desired (would violate current fail-loud law). | owner: confirm keep hard-fail |
| 10 | `0473-1-6-wo-void-reversal-grain` | **HOLD** | Whole-bill void/reversal path built under `WO_VOID_ENABLED` (default OFF). Owner must confirm whole-bill grain vs line-level partial. | owner/CPA grain ruling |
| 11 | `0519-at2-no-db-enforced-sod` | **HOLD** | App-layer maker≠checker exists (recon resolve). DB-enforced `approved_by ≠ posted_by` trigger on JE = open owner Q — schema touch → financial HOLD. | owner: app vs DB SOD |
| 12 | `0251-gap2-vendor-gl-linkage` | **STALE (column) + HOLD (policy)** | `mdata.vendors.default_expense_account_id` exists + API accepts it (`vendors.routes.ts`). Residual: population completeness + CoA-roles discipline for expense default — owner policy, no invent GL. | owner mapping pass |

## Not reopened this wave (still unclaimed NEEDS-OWNER — next wave)

`0242-no-auto-customer-charge-on-cancellation`, `0251-gap3-vendor-invoice-linkage`, `0473-1-8-tk-transp-lease-asc842`,  
`dip-mor-pre-post-petition-ap-split`, `factoring-asc860-cpa-control-test-open`,  
`flow2-customer-chargeback-driver-expense`, `ifta-sales-tax-booking-location-confirm`,  
`usmca-unhide-entity-switcher`.

## Discipline

- Docs-only in this PR. Builder **does not merge**.
- No schema / CoA seed / PUBLIC grants / package.json / CI workflow edits.
- UNVERIFIED: live Neon re-read of AF-1 apply state (builder does not Neon-apply); live CHAIN-04 tie-out row counts.
