#!/usr/bin/env node
import { readFileSync } from "node:fs";

const leaves = [
  { name: "parts", file: "apps/frontend/src/pages/maintenance/parts/PartsMasterDataPage.tsx", query: "partsQuery" },
  { name: "vehicles", file: "apps/frontend/src/pages/maintenance/vehicles/VehiclesMasterDataPage.tsx", query: "vehiclesQuery" },
  { name: "drivers", file: "apps/frontend/src/pages/maintenance/drivers/DriversMasterDataPage.tsx", query: "driversQuery" },
];

function failures(sources) {
  const out = [];
  for (const leaf of leaves) {
    const src = sources[leaf.name];
    const q = `${leaf.query}.isError`;
    const needs = [
      [new RegExp(`if \\(!${leaf.query}\\.isError\\) return;[\\s\\S]*setCreateOpen\\(false\\)[\\s\\S]*setEditing\\(null\\)[\\s\\S]*setCsvFile\\(null\\)[\\s\\S]*setVoiding\\(null\\)`), "failed read must close every retained write surface"],
      [new RegExp(`disabled=\\{${q}\\}[^>]*onClick=\\{\\(\\) => setCreateOpen\\(true\\)`), "Create must disable while the canonical list read is failed"],
      [new RegExp(`type="file"[\\s\\S]{0,140}disabled=\\{${q}(?: \\|\\|[^}]*)?\\}`), "CSV chooser must disable while the canonical list read is failed"],
      [new RegExp(`disabled=\\{${q} \\|\\|[^}]*!csvFile`), "CSV Import must disable while the canonical list read is failed"],
      [new RegExp(`disabled=\\{${q} \\|\\|[^}]*Mutation\\.isPending`), "Create/Save must include the failed-read gate"],
      [new RegExp(`if \\(!voiding \\|\\| ${q}\\) return;`), "Void submit must fail closed while the canonical list read is failed"],
      [new RegExp(`${leaf.query}\\.isError[\\s\\S]*<ListErrorState[\\s\\S]*${leaf.query}\\.refetch\\(\\)`), "failed read must expose exact Retry instead of a false empty list"],
    ];
    for (const [pattern, message] of needs) if (!pattern.test(src)) out.push(`${leaf.name}: ${message}`);
  }
  return out;
}

const sources = Object.fromEntries(leaves.map((leaf) => [leaf.name, readFileSync(leaf.file, "utf8")]));
const liveFailures = failures(sources);
if (!/kpisQuery\.isError[\s\S]*Couldn't load parts inventory summary[\s\S]*kpisQuery\.refetch\(\)/.test(sources.parts)) {
  liveFailures.push("parts: KPI read failure must replace false-zero summary with exact Retry");
}
if (liveFailures.length) {
  console.error(`verify-maint-master-data-read-recovery FAIL\n${liveFailures.join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [];
  for (const leaf of leaves) {
    const q = `${leaf.query}.isError`;
    mutations.push(
      [leaf.name, sources[leaf.name].replace(`disabled={${q}} onClick`, "disabled={false} onClick")],
      [leaf.name, sources[leaf.name].replace(`if (!voiding || ${q}) return;`, "if (!voiding) return;")],
    );
  }
  mutations.push(["parts", sources.parts.replace("kpisQuery.isError ? (", "false ? (")]);
  let caught = 0;
  for (const [name, mutated] of mutations) {
    const next = { ...sources, [name]: mutated };
    const nextFailures = failures(next);
    if (!/kpisQuery\.isError[\s\S]*Couldn't load parts inventory summary[\s\S]*kpisQuery\.refetch\(\)/.test(next.parts)) {
      nextFailures.push("parts KPI honesty missing");
    }
    if (nextFailures.length) caught += 1;
  }
  if (caught !== mutations.length) {
    console.error(`verify-maint-master-data-read-recovery --selftest FAIL (${caught}/${mutations.length})`);
    process.exit(1);
  }
  console.log(`verify-maint-master-data-read-recovery --selftest PASS (${caught}/${mutations.length} planted defects red)`);
  process.exit(0);
}

console.log("verify-maint-master-data-read-recovery PASS — parts, vehicles, and drivers fail write lifecycle closed on canonical read failure");
