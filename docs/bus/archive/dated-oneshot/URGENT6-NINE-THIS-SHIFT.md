# URGENT-6 NINE — THIS SHIFT (owner-enforced)

**Metric = N of 9 closed.** Commits/hour is noise. Guard/docs/OUTBOX-only PRs = illegal (Cursor closes).

| # | Item | Primary | Also do if free (NEVER idle / NEVER “waiting on X”) |
|---|------|---------|-----------------------------------------------------|
| 1 | FACT-TIEOUT-01 | CC-2 | Re-run; OBSERVED; grade advances; EXPECTED face 9507500 frozen |
| 2 | DISP-TIEOUT-01 | Cascade | Fill `dispatch-delivered-revenue.mjs` now |
| 3 | SETL-TIEOUT-01 | **CC-2 fill** (was CC-1) | Fill `settlement-pdf-5753.mjs` — CC-1 stays on 016/JE |
| 4 | ACCT-TIEOUT-01 | **CC-2 fill** (was CC-1 $) | Fill `accounting-trial-balance.mjs` |
| 5 | VEND-TIEOUT-01 | CC-3 | DONE honest FAIL (#18434) → #7 |
| 6 | BANK-TIEOUT-01 | Codex | DONE honest FAIL (#18443); CC-2 confirmed (#18448) |
| 7 | VEND-CERT-01 | CC-3 | Fully-Wired 7–11 then cert — no early stamp |
| 8 | BANK-ECON-04 | Codex | Real USMCA recon — **no fabricate** statement/zero-diff |
| 9 | BANK-SURF-04 | Codex | Same — stay FAIL until ordinary zero-diff session |

## Unblockers (legal)
- **016** `$4200`→`$400` CM `unknown_pending_backup`→factor `$3800` · face **$95075** frozen
- **FAC-VOID-ENUM-2150** DONE (#18447) — 2150 net 0
- **JE-FUTURE:** lead closed — upper-bound going-forward + sample-label historical (see INBOX-CC-1)

## Queue
`bash scripts/next-urgent6.sh`

## Definitions (locked)
- Empty tie-out = FAIL. EXPECTED never moved to pass.
- BANK-ECON/SURF-04 need real recon — Codex correct to refuse fabrication.
- Deploy 5–10 Cursor-only. No seat waits. Skip #15546 #16895. No U14.
- CC-2: “nothing to act on” = **defect**. Fill SETL+ACCT now.
