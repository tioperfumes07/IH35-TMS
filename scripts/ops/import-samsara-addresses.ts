#!/usr/bin/env tsx
import { importSamsaraAddresses } from "../../apps/backend/src/integrations/samsara/geofences/address-import.service.js";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const companyArg = args.find((arg) => arg.startsWith("--operating-company-id="));
const operatingCompanyId = companyArg?.split("=", 2)[1] ?? process.env.OPERATING_COMPANY_ID?.trim();
if (!operatingCompanyId) throw new Error("--operating-company-id=<uuid> is required");
if (args.includes("--dry-run") && apply) throw new Error("choose --dry-run or --apply, not both");

const result = await importSamsaraAddresses({ operatingCompanyId, apply });
console.log(JSON.stringify(result));
