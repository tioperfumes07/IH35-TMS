#!/usr/bin/env node
import fs from "node:fs";

const backend = fs.readFileSync("apps/backend/src/safety/anomaly/routes.ts", "utf8");
const frontend = fs.readFileSync("apps/frontend/src/pages/safety/anomaly/AnomalyDashboard.tsx", "utf8");

function inspect(be, fe) {
  const failures = [];
  const checks = [
    [be, /app\.patch\("\/api\/safety\/anomaly\/alerts\/:uuid\/acknowledge"[\s\S]{0,400}companyQuery\.safeParse\(req\.body \?\? \{\}\)/, "ack body does not require company"],
    [be, /companyQuery\.extend\(\{ status:/, "resolve body does not require company"],
    [be, /setScopedCompanyContext\(client, user\.uuid, body\.data\.operating_company_id\)/g, "actions do not authorize submitted company"],
    [be, /WHERE uuid = \$1::uuid AND operating_company_id = \$3::uuid/, "ack update is not company scoped"],
    [be, /WHERE uuid = \$1::uuid AND operating_company_id = \$4::uuid/, "resolve update is not company scoped"],
    [be, /app\.patch\("\/api\/safety\/anomaly\/rules\/:uuid"[\s\S]{0,260}role\?\.toLowerCase\(\) !== "owner"/, "rule update is not Owner-only"],
    [be, /app\.patch\("\/api\/safety\/anomaly\/rules\/:uuid"[\s\S]{0,420}companyQuery\.extend/, "rule update body does not require company"],
    [be, /app\.patch\("\/api\/safety\/anomaly\/rules\/:uuid"[\s\S]{0,1000}setScopedCompanyContext\(client, user\.uuid, body\.data\.operating_company_id\)/, "rule update does not authorize submitted company"],
    [be, /WHERE uuid = \$1::uuid AND operating_company_id = \$5::uuid RETURNING \*/, "rule update is not company scoped"],
    [be, /safety\.anomaly_rule\.update[\s\S]{0,180}operating_company_id: body\.data\.operating_company_id/, "rule update lacks scoped audit"],
    [be, /safety\.anomaly_rule\.create[\s\S]{0,180}operating_company_id: body\.data\.operating_company_id/, "rule create lacks scoped audit"],
    [be, /safety\.anomaly_alert\.acknowledge[\s\S]{0,180}operating_company_id: body\.data\.operating_company_id/, "alert acknowledge lacks scoped audit"],
    [be, /safety\.anomaly_alert\.resolve[\s\S]{0,180}operating_company_id: body\.data\.operating_company_id/, "alert resolve lacks scoped audit"],
    [be, /app\.post\("\/api\/safety\/anomaly\/seed-defaults"[\s\S]{0,260}role\?\.toLowerCase\(\) !== "owner"/, "default-rule seed is not Owner-only"],
    [be, /safety\.anomaly_rules\.seed_defaults[\s\S]{0,160}operating_company_id: q\.data\.operating_company_id/, "default-rule seed lacks scoped audit"],
    [be, /JOIN safety\.anomaly_alert_rules r[\s\S]{0,160}r\.operating_company_id = a\.operating_company_id/, "alert reader does not bind the human rule label to the same company"],
    [be, /mdata\.resolve_driver_label_same_company\(a\.subject_uuid, a\.operating_company_id\)/, "alert reader does not resolve the canonical driver label"],
    [be, /FROM mdata\.units u[\s\S]{0,180}COALESCE\(u\.currently_leased_to_company_id, u\.owner_company_id\) = a\.operating_company_id/, "alert reader does not resolve the company-owned unit label"],
    [be, /FROM mdata\.loads l[\s\S]{0,160}l\.operating_company_id = a\.operating_company_id/, "alert reader does not resolve the company-scoped load label"],
    [be, /FROM geo\.geofences g[\s\S]{0,520}g\.operating_company_id = a\.operating_company_id/, "alert reader does not resolve the company-scoped geofence label"],
    [fe, /actionGenerationRef = useRef\(0\)/, "frontend lacks action generation"],
    [fe, /body: \{ operating_company_id: input\.companyId \}/, "ack omits submitted company"],
    [fe, /body: \{ operating_company_id: input\.companyId, status: "resolved", notes: input\.notes \}/, "resolve omits submitted company"],
    [fe, /input\.generation !== actionGenerationRef\.current/g, "stale successes are not rejected"],
    [fe, /queryKey: \["anomaly-alerts", input\.companyId, input\.severity\]/g, "submitted company/filter query is not refreshed"],
    [fe, /actionGenerationRef\.current \+= 1[\s\S]*ack\.reset\(\)[\s\S]*resolve\.reset\(\)/, "company transition does not reset actions"],
    [fe, /input\.generation === actionGenerationRef\.current/g, "stale errors are not rejected"],
    [fe, /LINKABLE_SUBJECT_KINDS = new Set<EntityKind>\(\["driver", "unit", "load", "geofence"\]\)/, "frontend lacks an explicit supported anomaly-subject registry"],
    [fe, /<EntityLink kind=\{kind\} id=\{id\} label=\{label\}/, "anomaly subjects do not drill through the shared EntityLink"],
    [fe, /id \? "Related record unavailable" : "No related record"/, "missing anomaly relationships are not rendered honestly"],
  ];
  for (const [source, pattern, message] of checks) {
    const matches = source.match(pattern);
    const needsTwo = /actions do not|stale successes|query is not|stale errors/.test(message);
    if (!matches || (needsTwo && matches.length < 2)) failures.push(message);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["be", "companyQuery.safeParse(req.body ?? {})"],
    ["be", "WHERE uuid = $1::uuid AND operating_company_id = $3::uuid"],
    ["be", "WHERE uuid = $1::uuid AND operating_company_id = $4::uuid"],
    ["be", 'role?.toLowerCase() !== "owner"'],
    ["be", "WHERE uuid = $1::uuid AND operating_company_id = $5::uuid RETURNING *"],
    ["be", '"safety.anomaly_rule.update"'],
    ["be", '"safety.anomaly_rule.create"'],
    ["be", '"safety.anomaly_alert.acknowledge"'],
    ["be", '"safety.anomaly_alert.resolve"'],
    ["be", '"safety.anomaly_rules.seed_defaults"'],
    ["be", "JOIN safety.anomaly_alert_rules r"],
    ["be", "mdata.resolve_driver_label_same_company(a.subject_uuid, a.operating_company_id)"],
    ["be", "FROM mdata.units u"],
    ["be", "FROM mdata.loads l"],
    ["be", "FROM geo.geofences g"],
    ["fe", "actionGenerationRef = useRef(0)"],
    ["fe", "body: { operating_company_id: input.companyId }"],
    ["fe", "actionGenerationRef.current += 1"],
    ["fe", 'LINKABLE_SUBJECT_KINDS = new Set<EntityKind>(["driver", "unit", "load", "geofence"])'],
    ["fe", '<EntityLink kind={kind} id={id} label={label}'],
  ];
  for (const [target, token] of mutations) {
    const source = target === "be" ? backend : frontend;
    if (!source.includes(token)) throw new Error(`fixture missing ${token}`);
    const bad = source.split(token).join("REMOVED_BY_SELFTEST");
    if (inspect(target === "be" ? bad : backend, target === "fe" ? bad : frontend).length === 0) throw new Error(`missed ${token}`);
  }
  console.log(`verify-anomaly-dashboard-action-company-scope selftest PASS — ${mutations.length}/${mutations.length} planted defects red`);
} else {
  const failures = inspect(backend, frontend);
  if (failures.length) {
    failures.forEach((failure) => console.error(` - ${failure}`));
    process.exit(1);
  }
  console.log("verify-anomaly-dashboard-action-company-scope PASS — Ack/Resolve are company-scoped and lifecycle-stable");
}
