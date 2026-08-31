#!/usr/bin/env bash
# Urgent-6 nine only. bash scripts/next-urgent6.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cat <<'EOF'
### URGENT-6 NINE — law docs/bus/URGENT6-NINE-THIS-SHIFT.md
Metric = N of 9 closed. Idle/"waiting on CC-1" = defect.

1 FACT-TIEOUT-01  CC-2     faro-factoring-statement.mjs — RUN + OBSERVED (EXPECTED frozen)
2 DISP-TIEOUT-01  Cascade  dispatch-delivered-revenue.mjs — FILL (stub)
3 SETL-TIEOUT-01  CC-1     settlement-pdf-5753.mjs — FILL (stub)
4 ACCT-TIEOUT-01  CC-1 $   accounting-trial-balance.mjs — FILL (stub)
5 VEND-TIEOUT-01  CC-3     vendors-ap-aging.mjs — DONE honest FAIL → do VEND-CERT-01
6 BANK-TIEOUT-01  Codex    bank-ledger-closing.mjs — FILL (stub)
7 VEND-CERT-01    CC-3     vendors.json cert
8 BANK-ECON-04    Codex    real recon
9 BANK-SURF-04    Codex    real recon

UNBLOCKERS: 016 Chrome · FAC-VOID-ENUM-2150 · JE-FUTURE-DATED (2nd money seat OK)
ILLEGAL: guard selftest PRs · docs/OUTBOX theater · bare next-work-item backlog
EOF
echo; echo "### stub sizes"
wc -l "$ROOT"/scripts/tieout/{faro-factoring-statement,dispatch-delivered-revenue,settlement-pdf-5753,accounting-trial-balance,vendors-ap-aging,bank-ledger-closing}.mjs
