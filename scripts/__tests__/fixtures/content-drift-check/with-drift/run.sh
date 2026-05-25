#!/usr/bin/env sh
echo "DRIFT: migration 0162_p6_t11196_qbo_sync_runs_and_bill_payment_mappings.sql declares view:views.ap_aging but object not present in schema" 1>&2
echo "FAIL: db-verify-critical-runtime --verify-content (missing=1)" 1>&2
exit 1
