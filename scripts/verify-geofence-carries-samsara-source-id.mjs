#!/usr/bin/env node
import { runSourceGuard } from "./samsara-address-import-guard-lib.mjs";

runSourceGuard({
  label: "verify-geofence-carries-samsara-source-id",
  required: [
    "source, samsara_address_id, external_source, external_ref",
    "'samsara_import',$5,'samsara',$5",
    "location_ref_id=EXCLUDED.location_ref_id",
    "samsara_address_id=EXCLUDED.samsara_address_id",
  ],
  selftestToken: "samsara_address_id=EXCLUDED.samsara_address_id",
});
