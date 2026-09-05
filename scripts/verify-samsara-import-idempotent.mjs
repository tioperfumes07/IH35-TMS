#!/usr/bin/env node
import { runSourceGuard } from "./samsara-address-import-guard-lib.mjs";

runSourceGuard({
  label: "verify-samsara-import-idempotent",
  required: [
    "pg_advisory_xact_lock",
    "ON CONFLICT (operating_company_id, samsara_address_id) DO UPDATE",
    "ON CONFLICT (operating_company_id, external_source, external_ref)",
    'mode: apply ? "apply" : "dry-run"',
    'SAMSARA_GEOFENCE_IMPORT_APPLY_APPROVED !== "flap proof started"',
  ],
  selftestToken: "ON CONFLICT (operating_company_id, samsara_address_id) DO UPDATE",
});
