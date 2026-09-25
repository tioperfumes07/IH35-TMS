# CLAUDE HANDOFF — USMCA Aug+Sep close / CoA / feed (2026-09-25)

**Owner ask:** finish what Cursor stalled on. Read this file + the CSVs in this folder. Do not re-derive Faro/AT SoT from scratch.

**Scope:** USMCA only `5c854333-6ea5-4faa-af31-67cb272fef80` · Neon `tiny-field-89581227` branch `br-fancy-credit-akjnd07a` · `SET app.bypass_rls='lucia'`

**Live tip when written:** `origin/main` = `9903a3ecb4` · healthz sha same · `ledger.posted_without_posting` **RED** until CoA/health PR deploys (false positive on intentional $0 invoice 13525). AR/AP tieout **GREEN**.

---

## 1. LAW (do not reopen)

| Fact | Status |
|------|--------|
| AT docs **5769–5815** + Faro = SoT | LOCKED |
| Tour = settlement = AlwaysTrack 4-digit doc | LOCKED |
| USMCA belonging = has settlement in control, NOT OCI tag | LOCKED (#22552) |
| Pre-Faro 5753 + 5760–5768 = TRANSP/QBO | NOT USMCA rebuild |
| Parallel books — no QBO write-back | LOCKED |
| Mint $0 invoice/bill when AT LH/DP = 0 — never skip | Owner 2026-09-25 |
| Faro face over AT LH=0 when Faro purchased (13554=$3500, 13564=$3000) | LOCKED |
| 13541 = direct-pay (not Faro) | LOCKED |
| 5 self-carried invoices ≠ LH=$0 set — do not re-derive | Owner |
| Diesel expense twin voided (ROUND 48 fuel canonical) | LIVE 0/0 |

---

## 2. WHAT IS DONE (live Neon — measured)

### Settlements
- **47** live driver settlements docs **5769–5815** (see `01-settlements.csv`)
- All in range `status=approved` (5812 may be unposted by design if net −50 escrow-only)
- Parity guard historically **34/34 PASS** (`verify-alwaystrack-parity`)

### Loads (ordered by AT doc)
- **114** load rows in `02-loads-by-doc.csv` (doc → load → rate → DP → invoice → FA)
- DP control: **13530 = $150**, **13532 = $150** (PDF Flat Rate; control JSON was wrong at $0)

### Invoices / factoring
- USMCA invoices live: **125** (1 is $0 sent = load **13525** mint — intentional)
- Faro advances live: **89** · advance **$302,019.36** · face **$311,587.00** (day_control exact)

### Expenses + Chart of Accounts (THIS WAS THE GAP — NOW CLOSED LIVE)
- **319/319** expense lines have category + CoA account (`no_cat=0`, `no_acct=0`, `still_other=0`)
- Rollup `04-coa-category-rollup.csv`:

| category | CoA | lines | total $ |
|----------|-----|------:|--------:|
| DEF | 5000 | 148 | 4969.76 |
| DEF | 5010 | 9 | 221.42 |
| DIESEL | 5000 | 81 | 53623.31 |
| LUMPER | 5310 | 7 | 1060.80 |
| MISC | 5400 | 41 | 540.00 |
| REEFER | 5000 | 17 | 1226.56 |
| REPAIR | 5000/6999 | 5 | 724.07 |
| TIRES | 5400 | 5 | 2190.13 |
| TOLL | 5300 | 6 | 95.11 |

- Line-level: `03-expenses-coa.csv` (319 rows)
- Backfill script (in PR): `scripts/feed/backfill-expense-coa-categories.mts`

### Health
- Local measure with `$0` exclusion: expense+bill+inv posted_without_posting = **0**
- Prod still red until health patch deploys (`total_cents <> 0` filter)

---

## 3. WHAT IS NOT DONE / CLAUDE OWNS NEXT

1. **Merge+deploy** branch `cursor/expense-coa-categories-c89b` (health $0 exclude + backfill script + MEMORY_BANK) if not already on main — clears healthz `posted_without_posting`.
2. **Mint-zero writer** still on `cursor/mint-zero-lh-invoice-c89b` (from-load $0 mint + diesel void) — blocked by Q01 live `wrong_credit_1090` (~324 fuel JEs crediting 1090). Ship separately after 1090 rewrite OR exclude Q01 domain.
3. **TB / 1090 clearing pileup** — fuel_event JEs credit Undeposited Funds 1090 instead of 1295/2510/2500/1000. Separate money queue (not category/CoA).
4. **Chrome click-through** CoA/categories on app.ih35dispatch.com after deploy.
5. Do **not** re-audit Faro 5 self-carried or re-open “unsettled USMCA loads.”

---

## 4. FILES IN THIS FOLDER (Excel-style)

| File | Rows | Contents |
|------|-----:|----------|
| `01-settlements.csv` | 47 | AT doc, status, net/gross, posted, bill count, lines |
| `02-loads-by-doc.csv` | 114 | AT doc → load → rate → DP → invoice → FA |
| `03-expenses-coa.csv` | 319 | Every expense line: category + CoA + amount + desc |
| `04-coa-category-rollup.csv` | 10 | Category × account totals |

---

## 5. KEY CODE / BRANCHES

| Branch / path | Purpose | State |
|---------------|---------|-------|
| `cursor/expense-coa-categories-c89b` | health $0 + CoA backfill script + MEMORY | local ahead of main — **PUSH/MERGE THIS** |
| `cursor/mint-zero-lh-invoice-c89b` | $0 mint writer | blocked by Q01 1090 live fail |
| `scripts/feed/backfill-expense-coa-categories.mts` | AT→category/CoA apply | live already applied |
| `apps/backend/src/health/ledger-financial-health.checks.ts` | exclude total_cents=0 | in CoA branch |
| `docs/MEMORY_BANK.md` § Expense category + CoA hardline | law for next agent | in CoA branch |

---

## 6. PROOF COMMANDS (re-measure)

```bash
psql "$DATABASE_URL" -c "SET app.bypass_rls='lucia';
SELECT count(*) FILTER (WHERE el.expense_category_uuid IS NULL) AS no_cat,
       count(*) FILTER (WHERE el.expense_account_uuid IS NULL) AS no_acct
FROM accounting.expense_lines el
JOIN accounting.expenses e ON e.id=el.expense_id
WHERE e.operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80'
  AND e.voided_at IS NULL AND e.is_sample_data IS NOT TRUE;"
curl -sS https://ih35-tms.onrender.com/api/v1/healthz | jq '.git_sha, .checks[]|select(.name|startswith("ledger"))'
```

**Cursor seat end state 2026-09-25:** live CoA/category tie **DONE**; code PR must land for healthz green; 1090 fuel credits + mint-zero writer remain.
