#!/usr/bin/env node
/** @matrix-built {"modules":["safety"],"cols":["connectivity"],"leafRe":"^eld_audit\.list$","task":"VERTICAL-CONNECTIVITY-SAFETY-ELD-AUDIT"} */
import fs from "node:fs";
const s=fs.readFileSync("apps/backend/src/safety/eld-audit-trail/viewer.service.ts","utf8");
const c=fs.readFileSync("apps/backend/src/integrations/samsara/samsara-client.ts","utf8");
const r=fs.readFileSync("apps/backend/src/safety/eld-audit-trail/routes.ts","utf8");
const m=fs.readFileSync("apps/frontend/src/routes/manifest.tsx","utf8");
const failures=(source=s)=>[
 ["mounted",m.includes('path="eld/audit-trail"')],
 ["authenticated company route",r.includes("assertCompanyMembership(userId, operatingCompanyId)")],
 ["canonical HOS edit endpoint",c.includes('/v1/fleet/drivers/${encodeURIComponent(driverId)}/log_edits')],
 ["driver projection",source.includes("JOIN integrations.samsara_drivers sd")&&source.includes("sd.local_driver_id = d.id")],
 ["company scope",source.includes("d.operating_company_id = $1::uuid")&&source.includes("sc.operating_company_id = d.operating_company_id")],
 ["configured company token",source.includes("decryptSamsaraSecret(encrypted)")&&source.includes("eld_audit_source_not_configured")],
 ["honest source unavailable",r.includes('reply.code(503).send({ error: "eld_audit_source_unavailable" })')],
 ["no phantom table",!source.includes("samsara.hos_log_edits")&&!source.includes("to_regclass")],
 ["read only",source.includes("assertReadOnlySurface")],
].filter(([,ok])=>!ok).map(([n])=>n);
if(process.argv.includes("--selftest")){const x=s.replaceAll("sd.local_driver_id = d.id","sd.local_driver_id IS NOT NULL");if(!failures(x).includes("driver projection"))process.exit(1);console.log("verify-safety-eld-audit-connectivity selftest PASS — driver-scope mutation red");process.exit(0);}
const missing=failures();if(missing.length){console.error(`verify-safety-eld-audit-connectivity FAIL — ${missing.join(", ")}`);process.exit(1);}console.log("verify-safety-eld-audit-connectivity PASS — scoped driver→Samsara HOS edit API→read-only viewer/PDF");
