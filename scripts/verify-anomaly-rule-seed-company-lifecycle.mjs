#!/usr/bin/env node
import fs from "node:fs";

const source = fs.readFileSync("apps/frontend/src/pages/safety/anomaly/RuleEditor.tsx", "utf8");

function inspect(value) {
  const checks = [
    [/actionGenerationRef = useRef\(0\)/, "missing generation"],
    [/body: \{ operating_company_id: input\.companyId \}/, "seed uses mutable company"],
    [/input\.generation !== actionGenerationRef\.current/, "stale success is accepted"],
    [/queryKey: \["anomaly-rules", input\.companyId\]/, "wrong company query invalidated"],
    [/input\.generation === actionGenerationRef\.current/, "stale error is visible"],
    [/actionGenerationRef\.current \+= 1[\s\S]*seed\.reset\(\)/, "company transition does not reset seed"],
    [/seed\.mutate\(\{ companyId: operatingCompanyId, generation: actionGenerationRef\.current \}\)/, "click does not snapshot company"],
    [/disabled=\{seed\.isPending \|\| q\.isError\}/, "seed remains enabled while the canonical rules read is failed"],
    [/q\.isError \? \([\s\S]*ListErrorState[\s\S]*onRetry=\{\(\) => void q\.refetch\(\)\}[\s\S]*\) : \([\s\S]*<ul/, "failed rules read does not replace retained rows with exact Retry"],
  ];
  return checks.filter(([pattern]) => !pattern.test(value)).map(([, message]) => message);
}

if (process.argv.includes("--selftest")) {
  const tokens = [
    "actionGenerationRef = useRef(0)",
    "body: { operating_company_id: input.companyId }",
    "input.generation !== actionGenerationRef.current",
    "actionGenerationRef.current += 1",
    "seed.mutate({ companyId: operatingCompanyId, generation: actionGenerationRef.current })",
    "seed.isPending || q.isError",
    "onRetry={() => void q.refetch()}",
  ];
  for (const token of tokens) {
    if (!source.includes(token)) throw new Error(`fixture missing ${token}`);
    if (inspect(source.replace(token, "REMOVED_BY_SELFTEST")).length === 0) throw new Error(`missed ${token}`);
  }
  console.log(`verify-anomaly-rule-seed-company-lifecycle selftest PASS — ${tokens.length}/${tokens.length} planted defects red`);
} else {
  const failures = inspect(source);
  if (failures.length) {
    failures.forEach((failure) => console.error(` - ${failure}`));
    process.exit(1);
  }
  console.log("verify-anomaly-rule-seed-company-lifecycle PASS — seed is company-stable across transitions");
}
