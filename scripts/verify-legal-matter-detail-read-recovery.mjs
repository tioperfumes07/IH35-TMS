#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TARGET = "apps/frontend/src/pages/legal/matters/LegalMatterDetailPage.tsx";
const LABEL = "verify-legal-matter-detail-read-recovery";

export function audit(src) {
  const problems = [];
  if (!/detailQuery\.isError\s*\?\s*\([\s\S]{0,600}<ListErrorState/.test(src)) {
    problems.push("failed matter detail read does not render the shared error state");
  }
  if (!/title="Couldn't load legal matter"/.test(src)) problems.push("matter detail failure has no explicit title");
  if (!/onRetry=\{\(\) => void detailQuery\.refetch\(\)\}/.test(src)) problems.push("matter detail failure cannot refetch its exact query");
  if (/detailQuery\.isError \|\| !detailQuery\.data/.test(src)) problems.push("read failure is still conflated with not-found/access-denied");
  if (!/\) : !detailQuery\.data \? \([\s\S]{0,180}Matter not found or access denied\./.test(src)) {
    problems.push("honest successful no-data state is not kept separate");
  }
  return problems;
}

function selftest() {
  const good = `
    detailQuery.isError ? (
      <ListErrorState title="Couldn't load legal matter" onRetry={() => void detailQuery.refetch()} />
    ) : !detailQuery.data ? (
      <p>Matter not found or access denied.</p>
    ) : (<main />)
  `;
  const mutations = [
    ["shared error state", good.replace("<ListErrorState", "<p")],
    ["title", good.replace("Couldn't load legal matter", "Unavailable")],
    ["exact retry", good.replace("detailQuery.refetch()", "window.location.reload()")],
    ["error/data separation", good.replace("detailQuery.isError ?", "detailQuery.isError || !detailQuery.data ?")],
    ["not-found state", good.replace("Matter not found or access denied.", "No records")],
  ];
  const failures = [];
  if (audit(good).length) failures.push(`good fixture rejected: ${audit(good).join(" | ")}`);
  for (const [name, fixture] of mutations) if (!audit(fixture).length) failures.push(`${name} mutation escaped`);
  if (failures.length) {
    failures.forEach((failure) => console.error(`  ✗ ${LABEL}: ${failure}`));
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS — ${mutations.length} mutations detected`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const problems = audit(readFileSync(join(ROOT, TARGET), "utf8"));
  if (problems.length) {
    problems.forEach((problem) => console.error(`  ✗ ${LABEL}: ${problem}`));
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — legal matter read failure is recoverable and distinct from no-data`);
}
