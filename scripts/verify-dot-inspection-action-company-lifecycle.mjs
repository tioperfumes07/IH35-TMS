#!/usr/bin/env node
/** @matrix-built {"modules":["safety"],"cols":["unit","connectivity","qbo_chrome"],"leaves":["dot_inspections.list"],"task":"SAFETY-F6618-DOT-OOS-CONFIRM-LIFECYCLE","vertical":"class-sweep"} */
import fs from "node:fs";

const source = fs.readFileSync("apps/frontend/src/pages/safety/tabs/DOTInspectionsTab.tsx", "utf8");
const backendSource = fs.readFileSync("apps/backend/src/routes/safety/dot-inspections.ts", "utf8");

function inspect(value, backend = backendSource) {
  const failures = [];
  const createStart = backend.indexOf('app.post("/api/v1/safety/dot-inspections"');
  const createEnd = backend.indexOf('app.post("/api/v1/safety/dot-inspections/:id/upload-pdf"', createStart);
  const createBackend = createStart >= 0 && createEnd > createStart ? backend.slice(createStart, createEnd) : "";
  const checks = [
    [/companyGenerationRef = useRef\(0\)/, "missing company generation"],
    [/createDotInspection\(input\.companyId, input\.payload\)/, "create uses mutable company/form"],
    [/driver_id: form\.driver_id \|\| undefined[\s\S]*unit_id: form\.unit_id \|\| undefined[\s\S]*trailer_id: form\.trailer_id \|\| undefined/, "create does not snapshot driver/unit/trailer FKs"],
    [/voidDotInspection\(input\.companyId, input\.id, input\.reason\)/, "void uses mutable company"],
    [/uploadDotInspectionPdf\(input\.companyId, input\.id, input\.file\)/, "upload uses mutable company"],
    [/followUpDotInspectionEvent\(input\.id, input\.companyId, input\.state\)/, "follow-up uses mutable company"],
    [/input\.generation !== companyGenerationRef\.current/g, "stale successes are not rejected"],
    [/companyGenerationRef\.current \+= 1[\s\S]*createMutation\.reset\(\)[\s\S]*voidMutation\.reset\(\)[\s\S]*uploadMutation\.reset\(\)[\s\S]*followUpMutation\.reset\(\)/, "company switch leaves stale actions"],
    [/createMutation\.variables\?\.generation === companyGenerationRef\.current/, "stale create error can leak"],
    [/followUpMutation\.variables\?\.generation === companyGenerationRef\.current/, "stale follow-up error can leak"],
    [/uploadMutation\.variables\?\.generation === companyGenerationRef\.current/, "stale upload error can leak"],
    [/<EntityPicker[\s\S]*kind="unit"[\s\S]*operatingCompanyId=\{companyId\}/, "unit picker is not canonical/scoped"],
    [/<EntityPicker[\s\S]*kind="trailer"[\s\S]*operatingCompanyId=\{companyId\}/, "trailer picker is not canonical/scoped"],
    [/kind="work_order"[\s\S]*auto_spawned_wo_id/, "spawned work-order reverse drill is missing"],
    [/const \[pendingOosCreate, setPendingOosCreate\] = useState<CreateInput \| null>\(null\)/, "OOS confirmation does not retain immutable create input"],
    [/if \(input\.payload\.outcome === "OOS"\) setPendingOosCreate\(input\);[\s\S]*else createMutation\.mutate\(input\)/, "OOS submit does not route the immutable input through confirmation"],
    [/<ConfirmModal[\s\S]*title="Create out-of-service inspection\?"[\s\S]*createMutation\.mutateAsync\(pendingOosCreate\)/, "OOS create does not use canonical confirmation chrome"],
    [/setPendingOosCreate\(null\)[\s\S]*setForm\(emptyInspectionForm\(trailerIdFromUrl\)\)[\s\S]*\[companyId\]/, "company switch leaves pending OOS confirmation"],
  ];
  for (const [pattern, message] of checks) {
    const matches = value.match(pattern);
    if (!matches || (message === "stale successes are not rejected" && matches.length < 4)) failures.push(message);
  }
  for (const event of ["oos_spawned_wo", "created", "updated", "voided"]) {
    const pattern = new RegExp(`"safety\\.dot_inspection\\.${event}",[\\s\\S]{0,260}operating_company_id: query\\.data\\.operating_company_id`);
    if (!pattern.test(backend)) failures.push(`${event} audit must identify the operating company`);
  }
  if (!createBackend) failures.push("mounted DOT inspection creator block is missing");
  if (!/withCompany\(user\.uuid, user\.role, query\.data\.operating_company_id, async \(client\) =>/.test(createBackend)) {
    failures.push("mounted DOT inspection creator must use the company-scoped transaction wrapper");
  }
  if (/client\.query\(["'`](?:BEGIN|COMMIT|ROLLBACK)["'`]\)/.test(createBackend)) {
    failures.push("mounted DOT inspection creator must not own nested transaction control");
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    "companyGenerationRef = useRef(0)",
    "createDotInspection(input.companyId, input.payload)",
    "voidDotInspection(input.companyId, input.id, input.reason)",
    "uploadDotInspectionPdf(input.companyId, input.id, input.file)",
    "followUpDotInspectionEvent(input.id, input.companyId, input.state)",
  ];
  for (const token of mutations) {
    if (!source.includes(token)) throw new Error(`fixture missing ${token}`);
    if (inspect(source.split(token).join("REMOVED_BY_SELFTEST")).length === 0) throw new Error(`missed ${token}`);
  }
  for (const token of ["setPendingOosCreate(input)", 'title="Create out-of-service inspection?"', "createMutation.mutateAsync(pendingOosCreate)"]) {
    if (!source.includes(token)) throw new Error(`fixture missing ${token}`);
    if (inspect(source.split(token).join("REMOVED_BY_SELFTEST")).length === 0) throw new Error(`missed ${token}`);
  }
  if (source.includes("window.confirm")) throw new Error("native confirm remains");
  for (const event of ["oos_spawned_wo", "created", "updated", "voided"]) {
    const eventBlock = new RegExp(`("safety\\.dot_inspection\\.${event}",[\\s\\S]{0,260})operating_company_id: query\\.data\\.operating_company_id,`);
    const mutatedBackend = backendSource.replace(eventBlock, "$1");
    if (mutatedBackend === backendSource || inspect(source, mutatedBackend).length === 0) throw new Error(`missed ${event} audit mutation`);
  }
  const createNeedle = "const payload = await withCompany(user.uuid, user.role, query.data.operating_company_id, async (client) => {";
  for (const control of ["BEGIN", "COMMIT", "ROLLBACK"]) {
    const mutatedBackend = backendSource.replace(createNeedle, `${createNeedle}\n      await client.query("${control}");`);
    if (mutatedBackend === backendSource || inspect(source, mutatedBackend).length === 0) throw new Error(`missed nested ${control} mutation`);
  }
  console.log(`verify-dot-inspection-action-company-lifecycle --selftest PASS (${mutations.length + 7}/${mutations.length + 7})`);
} else {
  const failures = inspect(source);
  if (failures.length) {
    failures.forEach((failure) => console.error(` - ${failure}`));
    process.exit(1);
  }
  console.log("verify-dot-inspection-action-company-lifecycle PASS — actions are company-stable with canonical linkage");
}
