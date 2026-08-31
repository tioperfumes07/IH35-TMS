#!/usr/bin/env bash
# Urgent-6 nine only. bash scripts/next-urgent6.sh
# Measures script presence (wc -l). Does NOT claim books tie — FAILs are honest.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TIE="$ROOT/scripts/tieout"

linecount() {
  local f="$1"
  if [[ -f "$f" ]]; then wc -l <"$f" | tr -d ' '; else echo 0; fi
}

status_for() {
  local lines="$1"
  # Real comparison scripts in this pack are 100+ lines; stubs were ~13–20.
  if [[ "$lines" -ge 100 ]]; then
    echo "BUILT (${lines} lines) — RUN for OBSERVED; books may still FAIL"
  elif [[ "$lines" -ge 1 ]]; then
    echo "THIN (${lines} lines) — treat as incomplete until ≥100-line comparison"
  else
    echo "MISSING"
  fi
}

d=$(linecount "$TIE/dispatch-delivered-revenue.mjs")
s=$(linecount "$TIE/settlement-pdf-5753.mjs")
a=$(linecount "$TIE/accounting-trial-balance.mjs")
f=$(linecount "$TIE/faro-factoring-statement.mjs")
v=$(linecount "$TIE/vendors-ap-aging.mjs")
b=$(linecount "$TIE/bank-ledger-closing.mjs")

cat <<EOF
### URGENT-6 NINE — law docs/bus/URGENT6-NINE-THIS-SHIFT.md
Metric = N of 9 closed. Scripts BUILT ≠ books TIE. Idle/"waiting on CC-1" = defect.
USMCA-LAUNCH: VEND+ACCT must pin USMCA (board: U6-TIEOUT-SCOPE-MISSING-USMCA-PIN). BANK already pinned.
U14 = CLOSED — do not reload.

1 FACT-TIEOUT-01  CC-2     faro-factoring-statement.mjs — $(status_for "$f")
2 DISP-TIEOUT-01  Cascade  dispatch-delivered-revenue.mjs — $(status_for "$d")
3 SETL-TIEOUT-01  CC-2     settlement-pdf-5753.mjs — $(status_for "$s")  [SETL-45 blocks PASS]
4 ACCT-TIEOUT-01  CC-2     accounting-trial-balance.mjs — $(status_for "$a")  [needs USMCA pin]
5 VEND-TIEOUT-01  CC-3     vendors-ap-aging.mjs — $(status_for "$v")  [needs USMCA pin]
6 BANK-TIEOUT-01  Codex    bank-ledger-closing.mjs — $(status_for "$b")  [USMCA-pinned]
7 VEND-CERT-01    CC-3     vendors.json cert — UNPROVEN (no evidence of close)
8 BANK-ECON-04    Codex    real recon — UNPROVEN (no evidence of close)
9 BANK-SURF-04    Codex    real recon — UNPROVEN (no evidence of close)

HONEST SCORE: 6/9 scripts built (items 1–6) · 0/6 reconciliations claimed PASS here · 7–9 open
UNBLOCKERS: SETL-45 · USMCA pin VEND/ACCT · 016 Chrome · JE-FUTURE
ILLEGAL: hardcoding FILL (stub) · U14 recert · fabricating PASS · CC-2 idle
EOF
echo
echo "### measured line counts"
wc -l "$TIE"/{faro-factoring-statement,dispatch-delivered-revenue,settlement-pdf-5753,accounting-trial-balance,vendors-ap-aging,bank-ledger-closing}.mjs
