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
 ["Samsara driver company scope",source.includes("sd.operating_company_id = $1::uuid")],
 ["Samsara config company scope",source.includes("sc.operating_company_id = $1::uuid")],
 ["driver company scope",source.includes("d.operating_company_id = $1::uuid")],
 ["authorized driver company scope",source.includes("eld_audit_driver_dca.company_id = $1::uuid")&&source.includes("eld_audit_driver_dca.is_authorized = true")&&source.includes("eld_audit_driver_dca.deactivated_at IS NULL")],
 ["configured company token",source.includes("decryptSamsaraSecret(encrypted)")&&source.includes("eld_audit_source_not_configured")],
 ["honest source unavailable",r.includes('reply.code(503).send({ error: "eld_audit_source_unavailable" })')],
 ["no phantom table",!source.includes("samsara.hos_log_edits")&&!source.includes("to_regclass")],
 ["read only",source.includes("assertReadOnlySurface")],
].filter(([,ok])=>!ok).map(([n])=>n);
if(process.argv.includes("--selftest")){
 const cases=[
  ["driver projection",s.replaceAll("sd.local_driver_id = d.id","sd.local_driver_id IS NOT NULL")],
  ["Samsara driver company scope",s.replaceAll("sd.operating_company_id = $1::uuid","sd.operating_company_id IS NOT NULL")],
  ["Samsara config company scope",s.replaceAll("sc.operating_company_id = $1::uuid","sc.operating_company_id IS NOT NULL")],
  ["driver company scope",s.replaceAll("d.operating_company_id = $1::uuid","d.operating_company_id IS NOT NULL")],
  ["authorized driver company scope",s.replaceAll("eld_audit_driver_dca.company_id = $1::uuid","eld_audit_driver_dca.company_id IS NOT NULL")],
  ["authorized driver company scope",s.replaceAll("eld_audit_driver_dca.is_authorized = true","eld_audit_driver_dca.is_authorized IS NOT NULL")],
  ["authorized driver company scope",s.replaceAll("eld_audit_driver_dca.deactivated_at IS NULL","eld_audit_driver_dca.deactivated_at IS NOT NULL")],
 ];
 for(const [expected,mutated] of cases){if(!failures(mutated).includes(expected)){console.error(`verify-safety-eld-audit-connectivity selftest FAIL — mutation stayed green: ${expected}`);process.exit(1);}}
 console.log(`verify-safety-eld-audit-connectivity selftest PASS — ${cases.length}/${cases.length} planted company/projection defects rejected`);process.exit(0);
}
const missing=failures();if(missing.length){console.error(`verify-safety-eld-audit-connectivity FAIL — ${missing.join(", ")}`);process.exit(1);}console.log("verify-safety-eld-audit-connectivity PASS — scoped driver→Samsara HOS edit API→read-only viewer/PDF");
