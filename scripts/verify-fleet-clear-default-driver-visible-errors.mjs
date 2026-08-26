#!/usr/bin/env node
/** @matrix-built {"modules":["fleet"],"cols":["driver","connectivity","reverse_link"],"leaves":["unit.profile.driver_assign"],"task":"FLEET-F6639-CLEAR-DEFAULT-COMPARE-AND-LIFECYCLE","vertical":"class-sweep"} */
/** FLT-F6324 / FLEET-F6639 — Clear-default is visible, scoped, and compare-and-clear safe. */
import fs from "node:fs";

const FILE = "apps/frontend/src/components/vehicle-profile/DriverAssignmentSection.tsx";
const ROUTE = "apps/backend/src/mdata/unit-default-driver.routes.ts";
const source = fs.readFileSync(FILE, "utf8");
const route = fs.readFileSync(ROUTE, "utf8");

function audit(text, routeText = route) {
  const failures = [];
  const need = (condition, message) => { if (!condition) failures.push(message); };
  need(/disabled=\{!defaultDriver\?\.id \|\| clearDefault\.isPending\}/.test(text), "clear action must require a default and block duplicate submits");
  need(/loading=\{clearDefault\.isPending\}/.test(text), "clear action must expose pending state");
  need(/\{clearError \?[\s\S]{0,180}Couldn&apos;t clear default driver/.test(text), "clear failure state must be consumed");
  need(/Couldn&apos;t clear default driver/.test(text), "clear failure must name the failed action");
  need(/role="alert"/.test(text), "clear failure must be announced");
  need(/mutationFn:\s*\(input:\s*\{ unitId: string; companyId: string; driverId: string; generation: number \}\)[\s\S]{0,300}input\.unitId[\s\S]{0,160}input\.companyId[\s\S]{0,180}expected_driver_id: input\.driverId/.test(text), "clear snapshots unit company driver and generation");
  need(/queryKey:\s*\["unit-profile", input\.unitId, input\.companyId\]/.test(text), "clear refreshes submitted unit company cache");
  need(/actionGenerationRef\.current \+= 1;[\s\S]{0,100}setClearError\(null\);[\s\S]{0,100}clearDefault\.reset\(\);[\s\S]{0,80}\[companyId, unitId, defaultDriver\?\.id\]/.test(text), "clear retires action state on unit company or driver change");
  need(/input\.generation === actionGenerationRef\.current\) setClearError\(error\)/.test(text), "clear rejects stale error completion");
  need(/driverId: String\(defaultDriver\?\.id \?\? ""\),[\s\S]{0,80}generation: actionGenerationRef\.current/.test(text), "click snapshots visible default driver intent");
  const clearRoute = routeText.slice(routeText.indexOf('app.post("/api/v1/mdata/units/:id/drivers/clear-default"'));
  need(/clearDefaultSchema = z\.object\(\{ expected_driver_id: z\.string\(\)\.uuid\(\) \}\)/.test(routeText), "route requires expected driver id");
  need(/const body = clearDefaultSchema\.safeParse\(req\.body \?\? \{\}\);[\s\S]{0,140}!body\.success/.test(clearRoute), "clear route validates expected driver body");
  need(/const cleared = await client\.query\([\s\S]{0,300}AND driver_id = \$3::uuid[\s\S]{0,120}RETURNING id::text/.test(clearRoute), "route compare-and-clears expected active driver");
  need(/if \(!cleared\.rows\[0\]\) return \{ conflict: true as const \}/.test(clearRoute) && /reply\.code\(409\)\.send\(\{ error: "default_driver_changed" \}\)/.test(clearRoute), "route rejects changed default driver");
  need(/mdata\.unit\.default_driver_cleared[\s\S]{0,160}driver_id: body\.data\.expected_driver_id/.test(clearRoute), "audit stamps cleared driver identity");
  return failures;
}

const failures = audit(source);
if (failures.length) {
  console.error(`verify-fleet-clear-default-driver-visible-errors FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("!defaultDriver?.id || clearDefault.isPending", "clearDefault.isPending"),
    source.replace("loading={clearDefault.isPending}", "loading={false}"),
    source.replace("{clearError ?", "{false ?"),
    source.replace("Couldn&apos;t clear default driver", "Request failed"),
    source.replace('role="alert"', 'role="status"'),
    source.replace("expected_driver_id: input.driverId", "expected_driver_id: String(defaultDriver?.id)"),
    source.replace('["unit-profile", input.unitId, input.companyId]', '["unit-profile", unitId, companyId]'),
    source.replace("actionGenerationRef.current += 1;", "void actionGenerationRef.current;"),
    source.replace("input.generation === actionGenerationRef.current", "true"),
    source.replace("driverId: String(defaultDriver?.id ?? \"\")", 'driverId: ""'),
  ];
  for (const [index, mutation] of mutations.entries()) {
    if (mutation === source || audit(mutation).length === 0) throw new Error(`mutation ${index + 1} escaped`);
  }
  const routeMutations = [
    route.replace("expected_driver_id: z.string().uuid()", "expected_driver_id: z.string()"),
    route.replace("AND driver_id = $3::uuid", "AND driver_id IS NOT NULL"),
    route.replace("if (!cleared.rows[0]) return { conflict: true as const };", "void cleared;"),
    route.replace("driver_id: body.data.expected_driver_id", "driver_id: null"),
    route.replace("const body = clearDefaultSchema.safeParse(req.body ?? {});", "const body = setDefaultSchema.safeParse(req.body ?? {});"),
  ];
  for (const [index, mutation] of routeMutations.entries()) {
    if (mutation === route || audit(source, mutation).length === 0) throw new Error(`route mutation ${index + 1} escaped`);
  }
  console.log(`verify-fleet-clear-default-driver-visible-errors SELFTEST PASS — ${mutations.length + routeMutations.length} mutations detected`);
}

console.log("verify-fleet-clear-default-driver-visible-errors PASS — clear-default state and failures are visible");
