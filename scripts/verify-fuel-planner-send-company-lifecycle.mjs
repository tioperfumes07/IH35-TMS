#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/frontend/src/pages/fuel/FuelPlannerHome.tsx";
const source = fs.readFileSync(file, "utf8");

function failures(text = source) {
  const missing = [];
  const need = (pattern, label) => {
    if (!pattern.test(text)) missing.push(label);
  };
  need(/const actionGenerationRef = useRef\(0\)/, "action generation");
  need(/useEffect\(\(\) => \{[\s\S]{0,220}?actionGenerationRef\.current \+= 1;[\s\S]{0,220}?\}, \[companyId\]\)/, "company transition generation");
  need(/mutationFn: \(input: \{ routeId: string; companyId: string; generation: number \}\) =>\s*sendFuelRecommendationToDriver\(input\.routeId, input\.companyId\)/, "immutable send input");
  need(/onSuccess: \([^,]+, input\) => \{\s*if \(input\.generation !== actionGenerationRef\.current\) return;/, "stale success rejection");
  need(/onError: \(error, input\)[\s\S]{0,120}input\.generation === actionGenerationRef\.current/, "stale error rejection");
  need(/invalidateQueries\(\{\s*queryKey: \["fuel", "planner", "active-routes", input\.companyId\],?\s*\}\)/, "company-wide active-route refresh");
  need(/queryKey: \["fuel", "planner", "recommendation-detail", input\.companyId, input\.routeId\],[\s\S]{0,60}exact: true/, "exact recommendation refresh");
  need(/sendRecommendationMutation\.mutate\(\{[\s\S]{0,180}routeId: activeRoute\.id,[\s\S]{0,80}companyId,[\s\S]{0,80}generation: actionGenerationRef\.current/, "caller snapshot");
  return missing;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("actionGenerationRef.current += 1;", "void actionGenerationRef.current;"),
    source.replace("input.routeId, input.companyId", "activeRoute.id, companyId"),
    source.replace("input.generation !== actionGenerationRef.current", "false"),
    source.replace("input.generation === actionGenerationRef.current", "true"),
    source.replace('queryKey: ["fuel", "planner", "active-routes", input.companyId]', 'queryKey: ["fuel", "planner", "active-routes"]'),
    source.replace('queryKey: ["fuel", "planner", "recommendation-detail", input.companyId, input.routeId]', 'queryKey: ["fuel", "planner", "recommendation-detail"]'),
    source.replace("generation: actionGenerationRef.current", "generation: 0"),
  ];
  const escaped = mutations.filter((mutation) => failures(mutation).length === 0);
  if (escaped.length) {
    console.error(`verify-fuel-planner-send-company-lifecycle selftest FAIL — ${escaped.length}/7 mutations escaped`);
    process.exit(1);
  }
  console.log("verify-fuel-planner-send-company-lifecycle selftest PASS — 7/7 mutations detected");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-fuel-planner-send-company-lifecycle FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-fuel-planner-send-company-lifecycle PASS — send-to-driver is isolated to submitted route/company lifecycle");
