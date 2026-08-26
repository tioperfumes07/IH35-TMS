#!/bin/sh
# Refresh USMCA Live Chrome certify workbook from current healthz + matrix + GUARD-WORKORDERS.
# Checkmarks: docs/lockdown/usmca-live-chrome-checkoff.json (and any ☑ DONE already in the xlsx).
# Live Chrome leaf checks reset when healthz SHA changes.
set -e
cd "$(dirname "$0")/../.."
python3 scripts/ops/build-usmca-live-chrome-certify-xlsx.py
open -a "Microsoft Excel" "$HOME/Desktop/USMCA-LIVE-CHROME-CERTIFY-INVENTORY-2026-08-26.xlsx" 2>/dev/null || true
